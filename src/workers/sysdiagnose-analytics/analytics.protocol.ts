import type { BatteryApp } from "@/pages/sysdiagnose/lib";

/** Version 2 makes Powerlog provenance explicit. */
export const ANALYTICS_PROTOCOL_VERSION = 2 as const;

export interface AnalyticsRange {
  startMs: number;
  endMs: number;
}

export type AnalyticsAvailability =
  | { state: "available" }
  | { state: "partial"; reason: string }
  | { state: "unavailable"; reason: string };

export interface AnalyticsSource {
  table: "PLAccountingOperator_Aggregate_RootNodeEnergy";
  schema: "root-node-energy-v1";
  rawUnit: "uWh";
  mWhPerRawUnit: number;
}

export interface AnalyticsInitMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/init";
  id: number;
  powerlog: ArrayBuffer;
  apps: BatteryApp[];
  endTime: number;
  batteryWindowEndTime: number;
}

export interface AnalyticsQueryMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/query";
  id: number;
  startMs: number;
  endMs: number;
}

export interface AnalyticsDetailMsg extends Omit<AnalyticsQueryMsg, "kind"> {
  kind: "analytics/detail";
  bundleId: string;
}

export type AnalyticsIn =
  | AnalyticsInitMsg
  | AnalyticsQueryMsg
  | AnalyticsDetailMsg;

export interface AnalyticsReadyMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/ready";
  id: number;
  minMs: number;
  maxMs: number;
  source: AnalyticsSource;
}

export interface AnalyticsAppRow extends BatteryApp {
  /** Direct rows always represent a complete source aggregate. */
  activityShare: number;
}

/** A source aggregate, never an interpolated bucket. */
export interface AnalyticsEnergyPoint {
  /** Start-time convenience for legacy chart consumers; interval bounds are authoritative. */
  ts: number;
  startMs: number;
  endMs: number;
  rawEnergy: number;
  energy: number;
  components: Record<string, number>;
}

export interface AnalyticsAppSeriesPoint {
  ts: number;
  startMs: number;
  endMs: number;
  rawEnergy: number;
  energy: number;
}

export interface AnalyticsResultMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/result";
  id: number;
  requestedRange: AnalyticsRange;
  effectiveRange: AnalyticsRange | null;
  sourceCoverage: AnalyticsRange;
  availability: AnalyticsAvailability;
  source: AnalyticsSource;
  apps: AnalyticsAppRow[];
  timeline: AnalyticsEnergyPoint[];
  appSeries: Record<string, AnalyticsAppSeriesPoint[]>;
}

export interface AnalyticsComponent {
  key: string;
  energy: number;
}

export interface AnalyticsDetailPoint {
  ts: number;
  startMs: number;
  endMs: number;
  energy: number;
  foregroundSec: number;
  components: Record<string, number>;
}

export interface AnalyticsDetail {
  app: AnalyticsAppRow;
  components: AnalyticsComponent[];
  points: AnalyticsDetailPoint[];
  sourceRange: AnalyticsRange;
  sourceRangeIsPartial: boolean;
}

export interface AnalyticsDetailResultMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/detail-result";
  id: number;
  requestedRange: AnalyticsRange;
  effectiveRange: AnalyticsRange | null;
  detail: AnalyticsDetail | null;
}

export interface AnalyticsErrorMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/error";
  id: number;
  message: string;
}

export type AnalyticsOut =
  | AnalyticsReadyMsg
  | AnalyticsResultMsg
  | AnalyticsDetailResultMsg
  | AnalyticsErrorMsg;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function isRange(value: unknown): value is AnalyticsRange {
  return (
    isRecord(value) &&
    isFiniteNumber(value["startMs"]) &&
    isFiniteNumber(value["endMs"]) &&
    value["endMs"] >= value["startMs"]
  );
}
function isBatteryApp(value: unknown): value is BatteryApp {
  if (!isRecord(value)) return false;
  const components = value["components"];
  return (
    typeof value["name"] === "string" &&
    typeof value["bundleId"] === "string" &&
    isFiniteNumber(value["energy"]) &&
    isFiniteNumber(value["foregroundSec"]) &&
    isFiniteNumber(value["backgroundSec"]) &&
    (components === undefined ||
      (isRecord(components) && Object.values(components).every(isFiniteNumber)))
  );
}
function isEnergyPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRange(value) &&
    isFiniteNumber(value["ts"]) &&
    isFiniteNumber(value["rawEnergy"]) &&
    isFiniteNumber(value["energy"]) &&
    isRecord(value["components"]) &&
    Object.values(value["components"]).every(isFiniteNumber)
  );
}
function isSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    value["table"] === "PLAccountingOperator_Aggregate_RootNodeEnergy" &&
    value["schema"] === "root-node-energy-v1" &&
    value["rawUnit"] === "uWh" &&
    isFiniteNumber(value["mWhPerRawUnit"])
  );
}

export function isAnalyticsIn(value: unknown): value is AnalyticsIn {
  if (!isRecord(value) || value["v"] !== ANALYTICS_PROTOCOL_VERSION)
    return false;
  if (value["kind"] === "analytics/init")
    return (
      typeof value["id"] === "number" &&
      value["powerlog"] instanceof ArrayBuffer &&
      Array.isArray(value["apps"]) &&
      value["apps"].every(isBatteryApp) &&
      isFiniteNumber(value["endTime"]) &&
      isFiniteNumber(value["batteryWindowEndTime"])
    );
  return (
    (value["kind"] === "analytics/query" &&
      typeof value["id"] === "number" &&
      isRange(value)) ||
    (value["kind"] === "analytics/detail" &&
      typeof value["id"] === "number" &&
      typeof value["bundleId"] === "string" &&
      isRange(value))
  );
}

export function isAnalyticsOut(value: unknown): value is AnalyticsOut {
  if (!isRecord(value) || value["v"] !== ANALYTICS_PROTOCOL_VERSION)
    return false;
  if (value["kind"] === "analytics/error")
    return (
      typeof value["id"] === "number" && typeof value["message"] === "string"
    );
  if (value["kind"] === "analytics/ready")
    return (
      typeof value["id"] === "number" &&
      isRange({ startMs: value["minMs"], endMs: value["maxMs"] }) &&
      isSource(value["source"])
    );
  if (value["kind"] === "analytics/detail-result")
    return (
      typeof value["id"] === "number" &&
      isRange(value["requestedRange"]) &&
      (value["effectiveRange"] === null || isRange(value["effectiveRange"]))
    );
  if (value["kind"] !== "analytics/result") return false;
  return (
    typeof value["id"] === "number" &&
    isRange(value["requestedRange"]) &&
    (value["effectiveRange"] === null || isRange(value["effectiveRange"])) &&
    isRange(value["sourceCoverage"]) &&
    isSource(value["source"]) &&
    Array.isArray(value["apps"]) &&
    value["apps"].every(
      (app) =>
        isBatteryApp(app) &&
        isRecord(app) &&
        isFiniteNumber(app["activityShare"]),
    ) &&
    Array.isArray(value["timeline"]) &&
    value["timeline"].every(isEnergyPoint) &&
    isRecord(value["appSeries"])
  );
}
