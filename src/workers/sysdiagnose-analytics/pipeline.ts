import type { BatteryApp } from "@/pages/sysdiagnose/lib";
import type { AnalyticsAppRow } from "./analytics.protocol";

export interface PowerlogAggregate {
  key: string;
  rawEnergy: number;
  activitySec: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keep plist's calibrated daily mWh as the source of truth, then use
 * interval-level Powerlog activity to allocate it into a selected window.
 * This avoids presenting coalition energy units as if they were the UI's
 * calibrated app-energy values.
 */
export function allocateAppsToRange(
  apps: BatteryApp[],
  full: PowerlogAggregate[],
  selected: PowerlogAggregate[],
): AnalyticsAppRow[] {
  const fullByKey = new Map(full.map((row) => [row.key, row]));
  const selectedByKey = new Map(selected.map((row) => [row.key, row]));
  return apps
    .map((app) => {
      const fullRow = fullByKey.get(app.bundleId) ?? fullByKey.get(app.name);
      const selectedRow =
        selectedByKey.get(app.bundleId) ?? selectedByKey.get(app.name);
      const fullActivity = fullRow?.rawEnergy ?? fullRow?.activitySec ?? 0;
      const selectedActivity =
        selectedRow?.rawEnergy ?? selectedRow?.activitySec ?? 0;
      const activityShare =
        fullActivity > 0 ? clamp(selectedActivity / fullActivity, 0, 1) : 0;
      return {
        ...app,
        energy: app.energy * activityShare,
        foregroundSec: app.foregroundSec * activityShare,
        backgroundSec: app.backgroundSec * activityShare,
        activityShare,
      };
    })
    .filter((app) => app.activityShare > 0)
    .sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name));
}

export function normalizePowerlogRows(
  rows: Array<Record<string, unknown>>,
): PowerlogAggregate[] {
  return rows.flatMap((row) => {
    const key = typeof row["key"] === "string" ? row["key"] : "";
    const rawEnergy = Number(row["rawEnergy"]);
    const activitySec = Number(row["activitySec"]);
    if (!key || !Number.isFinite(rawEnergy) || !Number.isFinite(activitySec)) {
      return [];
    }
    return [
      {
        key,
        rawEnergy: Math.max(0, rawEnergy),
        activitySec: Math.max(0, activitySec),
      },
    ];
  });
}
