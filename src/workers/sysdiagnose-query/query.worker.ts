/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import {
  SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
  type SysdiagnoseQueryIn,
  type SysdiagnoseQueryOut,
  isSysdiagnoseQueryIn,
} from "./query.protocol";
import { APP_RUNTIME_SOURCE, executeQueryPlan, ROOT_NODE_ENERGY_SOURCE, type QueryRows } from "./query.sql";

type Sqlite = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Database = InstanceType<Sqlite["oo1"]["DB"]>;

let sqlite: Sqlite | null = null;
let db: Database | null = null;

const queryRows: QueryRows = (sql, bind) => {
  if (!db) throw new Error("query worker is not initialized");
  return db.exec({ sql, bind, rowMode: "object", returnValue: "resultRows" }) as Array<Record<string, unknown>>;
};

function requireTable(name: string) {
  const rows = queryRows("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
  if (rows.length === 0) throw new Error(`missing table: ${name}`);
}

function tableCatalog(name: string) {
  requireTable(name);
  const columns = queryRows(`PRAGMA table_info("${name}")`, []).map((row) => {
    const column = row.name;
    if (typeof column !== "string") throw new Error(`invalid catalog for ${name}`);
    return column;
  });
  return { name, columns };
}

async function initialize(powerlog: ArrayBuffer) {
  const initSQLite = sqlite3InitModule as unknown as (options: { locateFile: () => string }) => Promise<Sqlite>;
  sqlite = await initSQLite({ locateFile: () => sqliteWasmUrl });
  db?.close();
  db = new sqlite.oo1.DB(":memory:", "rw");
  const bytes = new Uint8Array(powerlog);
  const pointer = sqlite.wasm.allocFromTypedArray(bytes);
  const dbPointer = db.pointer;
  if (dbPointer === undefined) throw new Error("could not access query database");
  const result = sqlite.capi.sqlite3_deserialize(
    dbPointer,
    "main",
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_READONLY,
  );
  if (result !== sqlite.capi.SQLITE_OK) throw new Error(`could not open Powerlog database (${result})`);
  for (const table of REQUIRED_TABLES) requireTable(table);
}

const REQUIRED_TABLES = [
  "PLStorageOperator_EventForward_TimeOffset",
  "PLAccountingOperator_Aggregate_RootNodeEnergy",
  "PLAccountingOperator_EventNone_Nodes",
  "PLAppTimeService_Aggregate_AppRunTime",
] as const;

function error(id: number, message: string): SysdiagnoseQueryOut {
  const code = message.includes("missing table")
    ? "missing-table"
    : message.includes("TimeOffset") || message.includes("calibration")
      ? "missing-time-calibration"
      : "query-failed";
  return { v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION, kind: "query/error", id, code, message };
}

async function handle(message: SysdiagnoseQueryIn) {
  try {
    if (message.kind === "query/init") {
      await initialize(message.powerlog);
      postMessage({
        v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
        kind: "query/catalog",
        id: message.id,
        sources: [ROOT_NODE_ENERGY_SOURCE, APP_RUNTIME_SOURCE],
        tables: REQUIRED_TABLES.map(tableCatalog),
      } satisfies SysdiagnoseQueryOut);
      return;
    }
    const result = executeQueryPlan(queryRows, message.plan);
    postMessage({
      v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
      kind: "query/result",
      id: message.id,
      plan: message.plan,
      ...result,
    } satisfies SysdiagnoseQueryOut);
  } catch (cause) {
    postMessage(error(message.id, cause instanceof Error ? cause.message : "query failed"));
  }
}

onmessage = (event: MessageEvent<unknown>) => {
  if (!isSysdiagnoseQueryIn(event.data)) {
    postMessage({ v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION, kind: "query/error", id: -1, code: "invalid-request", message: "invalid query request" } satisfies SysdiagnoseQueryOut);
    return;
  }
  void handle(event.data);
};
