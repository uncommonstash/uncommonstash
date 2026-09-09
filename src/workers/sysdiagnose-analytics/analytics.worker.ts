/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import type { BatteryApp } from "@/pages/sysdiagnose/lib";
import {
  type AnalyticsDetailResultMsg,
  type AnalyticsIn,
  type AnalyticsReadyMsg,
  type AnalyticsResultMsg,
  isAnalyticsIn,
} from "./analytics.protocol";
import {
  allocateAppsToRange,
  BATTERY_UI_WINDOW_MS,
  buildAppDetail,
  buildEnergyTimeline,
  isFullBatteryWindow,
  normalizePowerlogRows,
  type PowerlogAggregate,
  type PowerlogAppEnergyEvent,
  type PowerlogEnergyEvent,
  type PowerlogNode,
  type PowerlogRuntimeEvent,
} from "./pipeline";

type Sqlite = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Database = InstanceType<Sqlite["oo1"]["DB"]>;

let sqlite: Sqlite | null = null;
let db: Database | null = null;
let apps: BatteryApp[] = [];
let endTimeMs = 0;
let batteryWindowEndTimeMs = 0;
let databaseOffsetMs = 0;
let databaseMinMs = 0;
let databaseMaxMs = 0;
let analysisMinMs = 0;
let analysisMaxMs = 0;

function queryRows(
  sql: string,
  bind: Array<number | string>,
): Array<Record<string, unknown>> {
  if (!db) throw new Error("analytics database is not initialized");
  const rows = db.exec({
    sql,
    bind,
    rowMode: "object",
    returnValue: "resultRows",
  });
  return rows as Array<Record<string, unknown>>;
}

function queryEnergyEvents(
  nodeIds: number[],
  start: number,
  end: number,
): PowerlogEnergyEvent[] {
  if (nodeIds.length === 0) return [];
  const placeholders = nodeIds.map(() => "?").join(",");
  const rows = queryRows(
    `
      SELECT DISTINCT
        RootNodeID AS rootId,
        timestamp,
        StartOffset AS startOffset,
        EndOffset AS endOffset,
        Energy AS energy
      FROM PLAccountingOperator_EventInterval_EnergyEstimateEvents
      WHERE NodeID IN (${placeholders})
        AND timestamp + EndOffset / 1000000.0 > ?
        AND timestamp + StartOffset / 1000000.0 < ?
        AND EndOffset > StartOffset
    `,
    [...nodeIds, start, end],
  );
  return rows.flatMap((row) => {
    const rootId = Number(row["rootId"]);
    const timestamp = Number(row["timestamp"]);
    const startOffset = Number(row["startOffset"]);
    const endOffset = Number(row["endOffset"]);
    const energy = Number(row["energy"]);
    return [rootId, timestamp, startOffset, endOffset, energy].every(
      Number.isFinite,
    )
      ? [{ rootId, timestamp, startOffset, endOffset, energy }]
      : [];
  });
}

function queryRootEnergyEvents(
  bundleId: string,
  start: number,
  end: number,
): PowerlogEnergyEvent[] | null {
  if (!bundleId) return null;
  if (!hasTable("PLAccountingOperator_Aggregate_RootNodeEnergy")) {
    return null;
  }
  try {
    const rows = queryRows(
      `
        SELECT
          RootNodeID AS rootId,
          timestamp,
          0 AS startOffset,
          timeInterval * 1000000.0 AS endOffset,
          MAX(Energy) AS energy
        FROM PLAccountingOperator_Aggregate_RootNodeEnergy
        JOIN PLAccountingOperator_EventNone_Nodes AS appNode
          ON appNode.ID = NodeID
        WHERE appNode.Name = ?
          AND timeInterval = 3600
          AND timestamp + timeInterval > ?
          AND timestamp < ?
        GROUP BY NodeID, RootNodeID, timestamp, timeInterval
      `,
      [bundleId, start, end],
    );
    const events = rows.flatMap((row) => {
      const rootId = Number(row["rootId"]);
      const timestamp = Number(row["timestamp"]);
      const startOffset = Number(row["startOffset"]);
      const endOffset = Number(row["endOffset"]);
      const energy = Number(row["energy"]);
      return [rootId, timestamp, startOffset, endOffset, energy].every(
        Number.isFinite,
      )
        ? [{ rootId, timestamp, startOffset, endOffset, energy }]
        : [];
    });
    return events;
  } catch {
    return null;
  }
}

function queryRootEnergyEventsForApps(
  apps: BatteryApp[],
  start: number,
  end: number,
): PowerlogAppEnergyEvent[] | null {
  if (!hasTable("PLAccountingOperator_Aggregate_RootNodeEnergy")) {
    return null;
  }
  const appKeys = [
    ...new Set(apps.flatMap((app) => [app.bundleId, app.name]).filter(Boolean)),
  ];
  if (appKeys.length === 0) return [];
  const placeholders = appKeys.map(() => "?").join(",");
  try {
    const rows = queryRows(
      `
        SELECT
          appNode.Name AS appKey,
          RootNodeID AS rootId,
          timestamp,
          0 AS startOffset,
          timeInterval * 1000000.0 AS endOffset,
          MAX(Energy) AS energy
        FROM PLAccountingOperator_Aggregate_RootNodeEnergy
        JOIN PLAccountingOperator_EventNone_Nodes AS appNode
          ON appNode.ID = NodeID
        WHERE appNode.Name IN (${placeholders})
          AND timeInterval = 3600
          AND timestamp + timeInterval > ?
          AND timestamp < ?
        GROUP BY appNode.Name, NodeID, RootNodeID, timestamp, timeInterval
      `,
      [...appKeys, start, end],
    );
    return rows.flatMap((row) => {
      const appKey = typeof row["appKey"] === "string" ? row["appKey"] : "";
      const rootId = Number(row["rootId"]);
      const timestamp = Number(row["timestamp"]);
      const startOffset = Number(row["startOffset"]);
      const endOffset = Number(row["endOffset"]);
      const energy = Number(row["energy"]);
      return appKey &&
        [rootId, timestamp, startOffset, endOffset, energy].every(
          Number.isFinite,
        )
        ? [{ appKey, rootId, timestamp, startOffset, endOffset, energy }]
        : [];
    });
  } catch {
    return null;
  }
}

function queryNodes(nodeIds: number[]): PowerlogNode[] {
  if (nodeIds.length === 0) return [];
  const placeholders = nodeIds.map(() => "?").join(",");
  return queryRows(
    `SELECT ID AS id, Name AS name FROM PLAccountingOperator_EventNone_Nodes WHERE ID IN (${placeholders})`,
    nodeIds,
  ).flatMap((row) => {
    const id = Number(row["id"]);
    const name = typeof row["name"] === "string" ? row["name"] : "";
    return Number.isFinite(id) && name ? [{ id, name }] : [];
  });
}

function hasTable(name: string): boolean {
  return (
    queryRows(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
      [name],
    ).length > 0
  );
}

function queryForegroundEvents(
  bundleId: string,
  start: number,
  end: number,
): PowerlogRuntimeEvent[] {
  if (!bundleId || !hasTable("PLAppTimeService_Aggregate_AppRunTime")) {
    return [];
  }
  try {
    const rows = queryRows(
      `
        SELECT
          -- Aggregate rows are stamped at the interval end; ScreenOnPluggedInTime
          -- is a subset of ScreenOnTime, so adding it would double count.
          timestamp - timeInterval AS timestamp,
          MAX(timeInterval) AS durationSec,
          MAX(COALESCE(ScreenOnTime, 0)) AS foregroundSec
        FROM PLAppTimeService_Aggregate_AppRunTime
        WHERE BundleID = ?
          AND timeInterval = 3600
          AND timestamp > ?
          AND timestamp - timeInterval < ?
        GROUP BY timestamp
      `,
      [bundleId, start, end],
    );
    return rows.flatMap((row) => {
      const timestamp = Number(row["timestamp"]);
      const durationSec = Number(row["durationSec"]);
      const foregroundSec = Number(row["foregroundSec"]);
      return [timestamp, durationSec, foregroundSec].every(Number.isFinite)
        ? [
            {
              timestamp,
              durationSec: Math.max(0, durationSec),
              foregroundSec: Math.max(0, foregroundSec),
            },
          ]
        : [];
    });
  } catch {
    return [];
  }
}

function queryAggregates(start: number, end: number): PowerlogAggregate[] {
  const rows = queryRows(
    `
      SELECT
        COALESCE(NULLIF(BundleId, ''), LaunchdName) AS key,
        SUM(
          COALESCE(energy, 0) *
          CASE
            WHEN timestampEnd > timestamp THEN
              MAX(0, MIN(timestampEnd, ?) - MAX(timestamp, ?)) /
              (timestampEnd - timestamp)
            ELSE 0
          END
        ) AS rawEnergy,
        SUM(
          CASE
            WHEN timestampEnd > timestamp THEN
              MAX(0, MIN(timestampEnd, ?) - MAX(timestamp, ?))
            ELSE 0
          END
        ) AS activitySec
      FROM PLCoalitionAgent_EventInterval_CoalitionInterval
      WHERE timestampEnd > ? AND timestamp < ?
      GROUP BY COALESCE(NULLIF(BundleId, ''), LaunchdName)
    `,
    [end, start, end, start, start, end],
  );
  return normalizePowerlogRows(rows);
}

function queryRootAggregates(
  start: number,
  end: number,
): PowerlogAggregate[] | null {
  if (!hasTable("PLAccountingOperator_Aggregate_RootNodeEnergy")) {
    return null;
  }
  try {
    const rows = queryRows(
      `
        WITH hourly AS (
          SELECT
            NodeID,
            RootNodeID,
            timestamp,
            timeInterval,
            MAX(Energy) AS energy
          FROM PLAccountingOperator_Aggregate_RootNodeEnergy
          WHERE timeInterval = 3600
            AND timestamp + timeInterval > ?
            AND timestamp < ?
          GROUP BY NodeID, RootNodeID, timestamp, timeInterval
        )
        SELECT
          appNode.Name AS key,
          SUM(
            COALESCE(hourly.energy, 0) *
            MAX(0, MIN(hourly.timestamp + hourly.timeInterval, ?) -
              MAX(hourly.timestamp, ?)) /
            hourly.timeInterval
          ) AS rawEnergy,
          SUM(
            MAX(0, MIN(hourly.timestamp + hourly.timeInterval, ?) -
              MAX(hourly.timestamp, ?))
          ) AS activitySec
        FROM hourly
        JOIN PLAccountingOperator_EventNone_Nodes AS appNode
          ON appNode.ID = hourly.NodeID
        GROUP BY appNode.Name
      `,
      [end, start, end, start, end, start],
    );
    return normalizePowerlogRows(rows);
  } catch {
    return null;
  }
}

async function init(msg: Extract<AnalyticsIn, { kind: "analytics/init" }>) {
  const initSQLite = sqlite3InitModule as unknown as (options: {
    locateFile: () => string;
  }) => Promise<Sqlite>;
  sqlite = await initSQLite({ locateFile: () => sqliteWasmUrl });
  db?.close();
  db = new sqlite.oo1.DB(":memory:", "rw");
  const data = new Uint8Array(msg.powerlog);
  const ptr = sqlite.wasm.allocFromTypedArray(data);
  const dbPointer = db.pointer;
  if (dbPointer === undefined)
    throw new Error("could not access analytics database");
  const result = sqlite.capi.sqlite3_deserialize(
    dbPointer,
    "main",
    ptr,
    data.byteLength,
    data.byteLength,
    sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite.capi.SQLITE_DESERIALIZE_READONLY,
  );
  if (result !== sqlite.capi.SQLITE_OK) {
    throw new Error(`could not open Powerlog database (${result})`);
  }
  apps = msg.apps;
  endTimeMs = msg.endTime;
  batteryWindowEndTimeMs = msg.batteryWindowEndTime;
  const bounds = queryRows(
    `
      SELECT
        MIN(timestamp) AS minTimestamp,
        MAX(timestampEnd) AS maxTimestamp
      FROM PLCoalitionAgent_EventInterval_CoalitionInterval
    `,
    [],
  )[0];
  const minTimestamp = Number(bounds?.["minTimestamp"]);
  const maxTimestamp = Number(bounds?.["maxTimestamp"]);
  if (!Number.isFinite(minTimestamp) || !Number.isFinite(maxTimestamp)) {
    throw new Error("Powerlog has no coalition interval timestamps");
  }
  databaseOffsetMs = endTimeMs - maxTimestamp * 1000;
  databaseMinMs = minTimestamp * 1000 + databaseOffsetMs;
  databaseMaxMs = maxTimestamp * 1000 + databaseOffsetMs;
  analysisMinMs = Math.max(databaseMinMs, endTimeMs - BATTERY_UI_WINDOW_MS);
  analysisMaxMs = Math.min(databaseMaxMs, endTimeMs);
  if (analysisMaxMs <= analysisMinMs) {
    analysisMinMs = databaseMinMs;
    analysisMaxMs = databaseMaxMs;
  }
  const out: AnalyticsReadyMsg = {
    v: 1,
    kind: "analytics/ready",
    id: msg.id,
    minMs: analysisMinMs,
    maxMs: analysisMaxMs,
  };
  postMessage(out);
}

function query(msg: Extract<AnalyticsIn, { kind: "analytics/query" }>) {
  const startMs = Math.max(analysisMinMs, Math.min(msg.startMs, analysisMaxMs));
  const endMs = Math.max(startMs, Math.min(msg.endMs, analysisMaxMs));
  const toPowerlogSeconds = (wallMs: number) =>
    (wallMs - databaseOffsetMs) / 1000;
  const fullStartSec = toPowerlogSeconds(analysisMinMs);
  const fullEndSec = toPowerlogSeconds(analysisMaxMs);
  const full =
    queryRootAggregates(fullStartSec, fullEndSec) ??
    queryAggregates(fullStartSec, fullEndSec);
  const selectedStartSec = toPowerlogSeconds(startMs);
  const selectedEndSec = toPowerlogSeconds(endMs);
  const selected =
    queryRootAggregates(selectedStartSec, selectedEndSec) ??
    queryAggregates(selectedStartSec, selectedEndSec);
  const isBatteryWindow = isFullBatteryWindow(
    msg.startMs,
    msg.endMs,
    batteryWindowEndTimeMs,
  );
  const rangeApps = isBatteryWindow
    ? apps.map((app) => ({ ...app, activityShare: 1 }))
    : allocateAppsToRange(apps, full, selected);
  const sourceRangeIsPartial = startMs > msg.startMs || endMs < msg.endMs;
  const timelineEvents = sourceRangeIsPartial
    ? []
    : (queryRootEnergyEventsForApps(apps, selectedStartSec, selectedEndSec) ??
      []);
  const timelineNodes = queryNodes([
    ...new Set(timelineEvents.map((event) => event.rootId)),
  ]);
  const timeline = sourceRangeIsPartial
    ? { timeline: [], appSeries: {} }
    : buildEnergyTimeline(
        rangeApps,
        timelineEvents,
        timelineNodes,
        selectedStartSec,
        selectedEndSec,
        databaseOffsetMs,
      );
  const out: AnalyticsResultMsg = {
    v: 1,
    kind: "analytics/result",
    id: msg.id,
    startMs,
    endMs,
    apps: rangeApps,
    timeline: timeline.timeline,
    appSeries: timeline.appSeries,
  };
  postMessage(out);
}

function queryDetail(msg: Extract<AnalyticsIn, { kind: "analytics/detail" }>) {
  const startMs = Math.max(analysisMinMs, Math.min(msg.startMs, analysisMaxMs));
  const endMs = Math.max(startMs, Math.min(msg.endMs, analysisMaxMs));
  const toPowerlogSeconds = (wallMs: number) =>
    (wallMs - databaseOffsetMs) / 1000;
  const fullStartSec = toPowerlogSeconds(analysisMinMs);
  const fullEndSec = toPowerlogSeconds(analysisMaxMs);
  const selectedStartSec = toPowerlogSeconds(startMs);
  const selectedEndSec = toPowerlogSeconds(endMs);
  const full =
    queryRootAggregates(fullStartSec, fullEndSec) ??
    queryAggregates(fullStartSec, fullEndSec);
  const selected =
    queryRootAggregates(selectedStartSec, selectedEndSec) ??
    queryAggregates(selectedStartSec, selectedEndSec);
  const isBatteryWindow = isFullBatteryWindow(
    msg.startMs,
    msg.endMs,
    batteryWindowEndTimeMs,
  );
  const rangeApps = isBatteryWindow
    ? apps.map((candidate) => ({ ...candidate, activityShare: 1 }))
    : allocateAppsToRange(apps, full, selected);
  const app =
    rangeApps.find(
      (candidate) =>
        candidate.bundleId === msg.bundleId || candidate.name === msg.bundleId,
    ) ?? null;
  let detail = null;
  if (app) {
    const nodeRows = queryRows(
      "SELECT ID AS id FROM PLAccountingOperator_EventNone_Nodes WHERE Name = ? OR Name LIKE ?",
      [msg.bundleId, `${msg.bundleId}.%`],
    );
    const nodeIds = nodeRows.flatMap((row) => {
      const id = Number(row["id"]);
      return Number.isFinite(id) ? [id] : [];
    });
    const selectedEvents =
      queryRootEnergyEvents(msg.bundleId, selectedStartSec, selectedEndSec) ??
      queryEnergyEvents(nodeIds, selectedStartSec, selectedEndSec);
    const selectedForegroundEvents = queryForegroundEvents(
      msg.bundleId,
      selectedStartSec,
      selectedEndSec,
    );
    const rootIds = [...new Set(selectedEvents.map((event) => event.rootId))];
    detail = buildAppDetail(
      app,
      selectedEvents,
      selectedForegroundEvents,
      queryNodes(rootIds),
      selectedStartSec,
      selectedEndSec,
      databaseOffsetMs,
    );
    const sourceRangeIsPartial = startMs > msg.startMs || endMs < msg.endMs;
    detail = {
      ...detail,
      points: sourceRangeIsPartial ? [] : detail.points,
      sourceRange: { startMs, endMs },
      sourceRangeIsPartial,
    };
  }
  const out: AnalyticsDetailResultMsg = {
    v: 1,
    kind: "analytics/detail-result",
    id: msg.id,
    startMs,
    endMs,
    detail,
  };
  postMessage(out);
}

async function handle(msg: AnalyticsIn) {
  try {
    if (msg.kind === "analytics/init") await init(msg);
    else if (msg.kind === "analytics/query") query(msg);
    else queryDetail(msg);
  } catch (error) {
    postMessage({
      v: 1,
      kind: "analytics/error",
      id: msg.id,
      message: error instanceof Error ? error.message : "analytics failed",
    });
  }
}

onmessage = (event: MessageEvent<unknown>) => {
  if (!isAnalyticsIn(event.data)) {
    postMessage({
      v: 1,
      kind: "analytics/error",
      id: -1,
      message: "unknown analytics message",
    });
    return;
  }
  void handle(event.data);
};
