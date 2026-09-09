import type { BatteryApp } from "@/pages/sysdiagnose/lib";

export const ANALYTICS_PROTOCOL_VERSION = 1 as const;

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

export interface AnalyticsDetailMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/detail";
  id: number;
  bundleId: string;
  startMs: number;
  endMs: number;
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
}

export interface AnalyticsAppRow extends BatteryApp {
  activityShare: number;
}

export interface AnalyticsResultMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/result";
  id: number;
  startMs: number;
  endMs: number;
  apps: AnalyticsAppRow[];
  timeline: AnalyticsEnergyPoint[];
  appSeries: Record<string, AnalyticsAppSeriesPoint[]>;
}

export interface AnalyticsEnergyPoint {
  ts: number;
  energy: number;
  components: Record<string, number>;
}

export interface AnalyticsAppSeriesPoint {
  ts: number;
  energy: number;
}

export interface AnalyticsComponent {
  key: string;
  energy: number;
}

export interface AnalyticsDetailPoint {
  ts: number;
  energy: number;
  foregroundSec: number;
  components: Record<string, number>;
}

export interface AnalyticsDetail {
  app: AnalyticsAppRow;
  components: AnalyticsComponent[];
  points: AnalyticsDetailPoint[];
  sourceRange: {
    startMs: number;
    endMs: number;
  };
  sourceRangeIsPartial: boolean;
}

export interface AnalyticsDetailResultMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/detail-result";
  id: number;
  startMs: number;
  endMs: number;
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

function isAnalyticsAppRow(value: unknown): boolean {
  if (!isRecord(value) || !isBatteryApp(value)) return false;
  return isFiniteNumber(value["activityShare"]);
}

function isAnalyticsDetail(value: unknown): value is AnalyticsDetail {
  if (!isRecord(value) || !isAnalyticsAppRow(value["app"])) return false;
  const components = value["components"];
  const points = value["points"];
  return (
    Array.isArray(components) &&
    components.every(
      (component) =>
        isRecord(component) &&
        typeof component["key"] === "string" &&
        isFiniteNumber(component["energy"]),
    ) &&
    Array.isArray(points) &&
    points.every(
      (point) =>
        isRecord(point) &&
        isFiniteNumber(point["ts"]) &&
        isFiniteNumber(point["energy"]) &&
        isFiniteNumber(point["foregroundSec"]) &&
        isRecord(point["components"]) &&
        Object.values(point["components"]).every(isFiniteNumber),
    ) &&
    isRecord(value["sourceRange"]) &&
    isFiniteNumber(value["sourceRange"]["startMs"]) &&
    isFiniteNumber(value["sourceRange"]["endMs"]) &&
    typeof value["sourceRangeIsPartial"] === "boolean"
  );
}

export function isAnalyticsIn(value: unknown): value is AnalyticsIn {
  if (!isRecord(value) || value["v"] !== ANALYTICS_PROTOCOL_VERSION) {
    return false;
  }
  if (
    value["kind"] === "analytics/init" &&
    typeof value["id"] === "number" &&
    value["powerlog"] instanceof ArrayBuffer &&
    Array.isArray(value["apps"]) &&
    value["apps"].every(isBatteryApp) &&
    isFiniteNumber(value["endTime"]) &&
    isFiniteNumber(value["batteryWindowEndTime"])
  ) {
    return true;
  }
  return (
    (value["kind"] === "analytics/query" &&
      typeof value["id"] === "number" &&
      isFiniteNumber(value["startMs"]) &&
      isFiniteNumber(value["endMs"]) &&
      value["endMs"] >= value["startMs"]) ||
    (value["kind"] === "analytics/detail" &&
      typeof value["id"] === "number" &&
      typeof value["bundleId"] === "string" &&
      isFiniteNumber(value["startMs"]) &&
      isFiniteNumber(value["endMs"]) &&
      value["endMs"] >= value["startMs"])
  );
}

export function isAnalyticsOut(value: unknown): value is AnalyticsOut {
  if (!isRecord(value) || value["v"] !== ANALYTICS_PROTOCOL_VERSION) {
    return false;
  }
  if (value["kind"] === "analytics/error") {
    return (
      typeof value["id"] === "number" && typeof value["message"] === "string"
    );
  }
  if (value["kind"] === "analytics/ready") {
    return (
      typeof value["id"] === "number" &&
      isFiniteNumber(value["minMs"]) &&
      isFiniteNumber(value["maxMs"])
    );
  }
  if (value["kind"] === "analytics/detail-result") {
    return (
      typeof value["id"] === "number" &&
      isFiniteNumber(value["startMs"]) &&
      isFiniteNumber(value["endMs"]) &&
      (value["detail"] === null || isAnalyticsDetail(value["detail"]))
    );
  }
  if (value["kind"] !== "analytics/result") return false;
  const timeline = value["timeline"];
  const appSeries = value["appSeries"];
  return (
    typeof value["id"] === "number" &&
    isFiniteNumber(value["startMs"]) &&
    isFiniteNumber(value["endMs"]) &&
    Array.isArray(value["apps"]) &&
    value["apps"].every(isAnalyticsAppRow) &&
    Array.isArray(timeline) &&
    timeline.every(
      (point) =>
        isRecord(point) &&
        isFiniteNumber(point["ts"]) &&
        isFiniteNumber(point["energy"]) &&
        isRecord(point["components"]) &&
        Object.values(point["components"]).every(isFiniteNumber),
    ) &&
    isRecord(appSeries) &&
    Object.values(appSeries).every(
      (points) =>
        Array.isArray(points) &&
        points.every(
          (point) =>
            isRecord(point) &&
            isFiniteNumber(point["ts"]) &&
            isFiniteNumber(point["energy"]),
        ),
    )
  );
}
