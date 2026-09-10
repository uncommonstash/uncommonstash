/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import type { BatteryApp } from "@/pages/sysdiagnose/lib";
import {
  ANALYTICS_PROTOCOL_VERSION,
  type AnalyticsDetailResultMsg,
  type AnalyticsIn,
  type AnalyticsReadyMsg,
  type AnalyticsResultMsg,
  type AnalyticsSource,
  isAnalyticsIn,
} from "./analytics.protocol";
import { extractDirectPowerlog } from "./extraction";
import {
  buildDirectAnalytics,
  buildDirectDetail,
  type DirectEnergyInterval,
  type DirectRuntimeInterval,
  POWERLOG_MWH_PER_RAW_UNIT,
} from "./pipeline";

type Sqlite = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Database = InstanceType<Sqlite["oo1"]["DB"]>;

const SOURCE: AnalyticsSource = {
  table: "PLAccountingOperator_Aggregate_RootNodeEnergy",
  schema: "root-node-energy-v1",
  rawUnit: "uWh",
  mWhPerRawUnit: POWERLOG_MWH_PER_RAW_UNIT,
};

let sqlite: Sqlite | null = null;
let db: Database | null = null;
let appMetadata: BatteryApp[] = [];
let deviceIntervals: DirectEnergyInterval[] = [];
let appIntervals: DirectEnergyInterval[] = [];
let runtimeIntervals: DirectRuntimeInterval[] = [];
let sourceCoverage: { startMs: number; endMs: number } | null = null;

function queryRows(
  sql: string,
  bind: Array<number | string>,
): Array<Record<string, unknown>> {
  if (!db) throw new Error("analytics database is not initialized");
  return db.exec({
    sql,
    bind,
    rowMode: "object",
    returnValue: "resultRows",
  }) as Array<Record<string, unknown>>;
}

function requireTable(name: string) {
  const present = queryRows(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  );
  if (present.length === 0)
    throw new Error(`unsupported Powerlog schema: missing ${name}`);
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
  if (result !== sqlite.capi.SQLITE_OK)
    throw new Error(`could not open Powerlog database (${result})`);

  requireTable("PLStorageOperator_EventForward_TimeOffset");
  requireTable("PLAccountingOperator_Aggregate_RootNodeEnergy");
  requireTable("PLAccountingOperator_EventNone_Nodes");
  requireTable("PLAppTimeService_Aggregate_AppRunTime");
  appMetadata = msg.apps;
  const extracted = extractDirectPowerlog(queryRows, appMetadata);
  deviceIntervals = extracted.deviceIntervals;
  appIntervals = extracted.appIntervals;
  runtimeIntervals = extracted.runtimeIntervals;
  sourceCoverage = extracted.sourceCoverage;
  const out: AnalyticsReadyMsg = {
    v: ANALYTICS_PROTOCOL_VERSION,
    kind: "analytics/ready",
    id: msg.id,
    minMs: sourceCoverage.startMs,
    maxMs: sourceCoverage.endMs,
    source: SOURCE,
  };
  postMessage(out);
}

function currentCoverage() {
  if (!sourceCoverage)
    throw new Error("analytics Powerlog has not been initialized");
  return sourceCoverage;
}

function query(msg: Extract<AnalyticsIn, { kind: "analytics/query" }>) {
  const requestedRange = { startMs: msg.startMs, endMs: msg.endMs };
  const result = buildDirectAnalytics(
    appMetadata,
    deviceIntervals,
    appIntervals,
    runtimeIntervals,
    requestedRange,
  );
  const effective = result.effectiveRange;
  const coverage = currentCoverage();
  const availability = !effective
    ? {
        state: "unavailable" as const,
        reason: "No complete Powerlog aggregate overlaps this range.",
      }
    : effective.startMs !== requestedRange.startMs ||
        effective.endMs !== requestedRange.endMs ||
        requestedRange.startMs < coverage.startMs ||
        requestedRange.endMs > coverage.endMs
      ? {
          state: "partial" as const,
          reason: "Showing complete overlapping Powerlog hourly aggregates.",
        }
      : { state: "available" as const };
  const out: AnalyticsResultMsg = {
    v: ANALYTICS_PROTOCOL_VERSION,
    kind: "analytics/result",
    id: msg.id,
    requestedRange,
    effectiveRange: effective,
    sourceCoverage: coverage,
    availability,
    source: SOURCE,
    apps: result.apps,
    timeline: result.timeline,
    appSeries: result.appSeries,
  };
  postMessage(out);
}

function queryDetail(msg: Extract<AnalyticsIn, { kind: "analytics/detail" }>) {
  const requestedRange = { startMs: msg.startMs, endMs: msg.endMs };
  const result = buildDirectAnalytics(
    appMetadata,
    deviceIntervals,
    appIntervals,
    runtimeIntervals,
    requestedRange,
  );
  const app =
    result.apps.find(
      (candidate) =>
        candidate.bundleId === msg.bundleId || candidate.name === msg.bundleId,
    ) ?? null;
  const effectiveRange = result.effectiveRange;
  const detail =
    app && effectiveRange
      ? buildDirectDetail(
          app,
          appIntervals.filter(
            (interval) =>
              interval.key === (app.bundleId || app.name) &&
              interval.endMs > effectiveRange.startMs &&
              interval.startMs < effectiveRange.endMs,
          ),
          runtimeIntervals.filter(
            (interval) =>
              interval.key === (app.bundleId || app.name) &&
              interval.endMs > effectiveRange.startMs &&
              interval.startMs < effectiveRange.endMs,
          ),
          effectiveRange,
        )
      : null;
  const out: AnalyticsDetailResultMsg = {
    v: ANALYTICS_PROTOCOL_VERSION,
    kind: "analytics/detail-result",
    id: msg.id,
    requestedRange,
    effectiveRange,
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
      v: ANALYTICS_PROTOCOL_VERSION,
      kind: "analytics/error",
      id: msg.id,
      message: error instanceof Error ? error.message : "analytics failed",
    });
  }
}

onmessage = (event: MessageEvent<unknown>) => {
  if (!isAnalyticsIn(event.data)) {
    postMessage({
      v: ANALYTICS_PROTOCOL_VERSION,
      kind: "analytics/error",
      id: -1,
      message: "unknown analytics message",
    });
    return;
  }
  void handle(event.data);
};
