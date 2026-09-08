/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import type { BatteryApp } from "@/pages/sysdiagnose/lib";
import {
  type AnalyticsIn,
  type AnalyticsReadyMsg,
  type AnalyticsResultMsg,
  isAnalyticsIn,
} from "./analytics.protocol";
import {
  allocateAppsToRange,
  normalizePowerlogRows,
  type PowerlogAggregate,
} from "./pipeline";

type Sqlite = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Database = InstanceType<Sqlite["oo1"]["DB"]>;

let sqlite: Sqlite | null = null;
let db: Database | null = null;
let apps: BatteryApp[] = [];
let endTimeMs = 0;
let databaseOffsetMs = 0;
let databaseMinMs = 0;
let databaseMaxMs = 0;

function queryRows(
  sql: string,
  bind: number[],
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
  const out: AnalyticsReadyMsg = {
    v: 1,
    kind: "analytics/ready",
    id: msg.id,
    minMs: databaseMinMs,
    maxMs: databaseMaxMs,
  };
  postMessage(out);
}

function query(msg: Extract<AnalyticsIn, { kind: "analytics/query" }>) {
  const startMs = Math.max(databaseMinMs, Math.min(msg.startMs, databaseMaxMs));
  const endMs = Math.max(startMs, Math.min(msg.endMs, databaseMaxMs));
  const toPowerlogSeconds = (wallMs: number) =>
    (wallMs - databaseOffsetMs) / 1000;
  const full = queryAggregates(
    toPowerlogSeconds(databaseMinMs),
    toPowerlogSeconds(databaseMaxMs),
  );
  const selected = queryAggregates(
    toPowerlogSeconds(startMs),
    toPowerlogSeconds(endMs),
  );
  const out: AnalyticsResultMsg = {
    v: 1,
    kind: "analytics/result",
    id: msg.id,
    startMs,
    endMs,
    apps: allocateAppsToRange(apps, full, selected),
  };
  postMessage(out);
}

async function handle(msg: AnalyticsIn) {
  try {
    if (msg.kind === "analytics/init") await init(msg);
    else query(msg);
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
