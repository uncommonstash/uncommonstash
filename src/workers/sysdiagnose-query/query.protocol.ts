export const SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION = 3 as const;

export interface QueryRange {
  startMs: number;
  endMs: number;
}

export interface AppIdentity {
  bundleId: string;
  name: string;
}

export interface QuerySource {
  id: "root-node-energy-hourly" | "app-runtime-hourly";
  table:
    | "PLAccountingOperator_Aggregate_RootNodeEnergy"
    | "PLAppTimeService_Aggregate_AppRunTime";
  interval: "end-stamped-hourly";
  clock: "monotonic-plus-system-offset";
  rawUnit: "uWh" | "seconds";
  displayUnit: "mWh" | "minutes";
  displayScale: number;
}

export type SysdiagnoseQueryPlan =
  | { kind: "root-node-component-totals"; range: QueryRange }
  | {
      kind: "app-energy-attribution";
      range: QueryRange;
      apps: AppIdentity[];
    }
  | { kind: "app-runtime"; range: QueryRange; apps: AppIdentity[] };

export interface QueryAggregation {
  operation: "sum";
  input: "Energy" | "ScreenOnTime" | "BackgroundTime";
  groupBy: string[];
}

export interface QueryProvenance {
  source: QuerySource;
  requestedRange: QueryRange;
  effectiveRange: QueryRange | null;
  coverage: QueryRange[];
  aggregation: QueryAggregation[];
}

export interface NodeIdentity {
  id: number;
  name: string;
  isPermanent: boolean;
}

export interface ComponentTotalRow {
  interval: QueryRange;
  rootNode: NodeIdentity;
  rawEnergy: number;
}

export interface AppEnergyAttributionRow {
  interval: QueryRange;
  rootNode: NodeIdentity;
  consumerNode: NodeIdentity;
  rawEnergy: number;
}

export interface AppRuntimeRow {
  interval: QueryRange;
  bundleId: string;
  foregroundSec: number;
  backgroundSec: number;
}

export type SysdiagnoseQueryRow =
  | ComponentTotalRow
  | AppEnergyAttributionRow
  | AppRuntimeRow;

export interface SysdiagnoseQueryInit {
  v: typeof SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION;
  kind: "query/init";
  id: number;
  powerlog: ArrayBuffer;
}

export interface SysdiagnoseQueryRequest {
  v: typeof SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION;
  kind: "query/run";
  id: number;
  plan: SysdiagnoseQueryPlan;
}

export type SysdiagnoseQueryIn = SysdiagnoseQueryInit | SysdiagnoseQueryRequest;

export interface SysdiagnoseQueryCatalog {
  v: typeof SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION;
  kind: "query/catalog";
  id: number;
  sources: QuerySource[];
  tables: Array<{ name: string; columns: string[] }>;
}

export interface SysdiagnoseQueryResult {
  v: typeof SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION;
  kind: "query/result";
  id: number;
  plan: SysdiagnoseQueryPlan;
  provenance: QueryProvenance;
  rows: SysdiagnoseQueryRow[];
}

export interface SysdiagnoseQueryError {
  v: typeof SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION;
  kind: "query/error";
  id: number;
  code:
    | "invalid-request"
    | "missing-table"
    | "unsupported-schema"
    | "missing-time-calibration"
    | "query-failed";
  message: string;
}

export type SysdiagnoseQueryOut =
  | SysdiagnoseQueryCatalog
  | SysdiagnoseQueryResult
  | SysdiagnoseQueryError;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRange(value: unknown): value is QueryRange {
  return (
    isRecord(value) &&
    isNumber(value["startMs"]) &&
    isNumber(value["endMs"]) &&
    value["endMs"] >= value["startMs"]
  );
}

function isApps(value: unknown): value is AppIdentity[] {
  return (
    Array.isArray(value) &&
    value.every(
      (app) =>
        isRecord(app) &&
        typeof app["bundleId"] === "string" &&
        typeof app["name"] === "string",
    )
  );
}

export function isSysdiagnoseQueryPlan(
  value: unknown,
): value is SysdiagnoseQueryPlan {
  if (!isRecord(value) || !isRange(value["range"])) return false;
  return (
    value["kind"] === "root-node-component-totals" ||
    ((value["kind"] === "app-energy-attribution" ||
      value["kind"] === "app-runtime") &&
      isApps(value["apps"]))
  );
}

export function isSysdiagnoseQueryIn(
  value: unknown,
): value is SysdiagnoseQueryIn {
  if (
    !isRecord(value) ||
    value["v"] !== SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION ||
    typeof value["id"] !== "number"
  )
    return false;
  if (value["kind"] === "query/init")
    return value["powerlog"] instanceof ArrayBuffer;
  return value["kind"] === "query/run" && isSysdiagnoseQueryPlan(value["plan"]);
}

export function isSysdiagnoseQueryOut(
  value: unknown,
): value is SysdiagnoseQueryOut {
  return (
    isRecord(value) &&
    value["v"] === SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION &&
    typeof value["id"] === "number" &&
    (value["kind"] === "query/catalog" ||
      value["kind"] === "query/result" ||
      value["kind"] === "query/error")
  );
}
