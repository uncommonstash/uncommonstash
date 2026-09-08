import type { BatteryApp } from "@/pages/sysdiagnose/lib";

export const ANALYTICS_PROTOCOL_VERSION = 1 as const;

export interface AnalyticsInitMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/init";
  id: number;
  powerlog: ArrayBuffer;
  apps: BatteryApp[];
  endTime: number;
}

export interface AnalyticsQueryMsg {
  v: typeof ANALYTICS_PROTOCOL_VERSION;
  kind: "analytics/query";
  id: number;
  startMs: number;
  endMs: number;
}

export type AnalyticsIn = AnalyticsInitMsg | AnalyticsQueryMsg;

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
  | AnalyticsErrorMsg;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBatteryApp(value: unknown): value is BatteryApp {
  if (!isRecord(value)) return false;
  return (
    typeof value["name"] === "string" &&
    typeof value["bundleId"] === "string" &&
    isFiniteNumber(value["energy"]) &&
    isFiniteNumber(value["foregroundSec"]) &&
    isFiniteNumber(value["backgroundSec"])
  );
}

function isAnalyticsAppRow(value: unknown): boolean {
  if (!isRecord(value) || !isBatteryApp(value)) return false;
  return isFiniteNumber(value["activityShare"]);
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
    isFiniteNumber(value["endTime"])
  ) {
    return true;
  }
  return (
    value["kind"] === "analytics/query" &&
    typeof value["id"] === "number" &&
    isFiniteNumber(value["startMs"]) &&
    isFiniteNumber(value["endMs"]) &&
    value["endMs"] >= value["startMs"]
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
  if (value["kind"] !== "analytics/result") return false;
  return (
    typeof value["id"] === "number" &&
    isFiniteNumber(value["startMs"]) &&
    isFiniteNumber(value["endMs"]) &&
    Array.isArray(value["apps"]) &&
    value["apps"].every(isAnalyticsAppRow)
  );
}
