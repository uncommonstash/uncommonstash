import type { BatteryApp } from "@/pages/sysdiagnose/lib";
import type {
  AnalyticsAppRow,
  AnalyticsAppSeriesPoint,
  AnalyticsComponent,
  AnalyticsDetail,
  AnalyticsDetailPoint,
  AnalyticsEnergyPoint,
} from "./analytics.protocol";

export interface PowerlogAggregate {
  key: string;
  rawEnergy: number;
  activitySec: number;
}

export interface PowerlogEnergyEvent {
  rootId: number;
  timestamp: number;
  startOffset: number;
  endOffset: number;
  energy: number;
}

export interface PowerlogAppEnergyEvent extends PowerlogEnergyEvent {
  appKey: string;
}

export interface PowerlogRuntimeEvent {
  timestamp: number;
  durationSec: number;
  foregroundSec: number;
}

export interface PowerlogNode {
  id: number;
  name: string;
}

export interface AnalyticsEnergyTimeline {
  timeline: AnalyticsEnergyPoint[];
  appSeries: Record<string, AnalyticsAppSeriesPoint[]>;
}

const ENERGY_BUCKET_SECONDS = 15 * 60;
const OTHER_COMPONENT_KEY = "Other";

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
      const fullEnergy = fullRow?.rawEnergy ?? 0;
      const selectedEnergy = selectedRow?.rawEnergy ?? 0;
      const fullRuntime = fullRow?.activitySec ?? 0;
      const selectedRuntime = selectedRow?.activitySec ?? 0;
      const energyShare =
        fullEnergy > 0
          ? clamp(selectedEnergy / fullEnergy, 0, 1)
          : fullRuntime > 0
            ? clamp(selectedRuntime / fullRuntime, 0, 1)
            : 0;
      const runtimeShare =
        fullRuntime > 0
          ? clamp(selectedRuntime / fullRuntime, 0, 1)
          : energyShare;
      return {
        ...app,
        energy: app.energy * energyShare,
        foregroundSec: app.foregroundSec * runtimeShare,
        backgroundSec: app.backgroundSec * runtimeShare,
        components: app.components
          ? Object.fromEntries(
              Object.entries(app.components).map(([key, energy]) => [
                key,
                energy * energyShare,
              ]),
            )
          : undefined,
        activityShare: energyShare,
      };
    })
    .filter((app) => app.activityShare > 0)
    .sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name));
}

function eventBounds(event: PowerlogEnergyEvent): [number, number] | null {
  const start = event.timestamp + event.startOffset / 1_000_000;
  const end = event.timestamp + event.endOffset / 1_000_000;
  return end > start ? [start, end] : null;
}

interface RawDetailData {
  components: Map<string, number>;
  buckets: Map<number, Map<string, number>>;
}

function collectForegroundBuckets(
  events: PowerlogRuntimeEvent[],
  startSec: number,
  endSec: number,
  bucketOriginSec: number,
): Map<number, number> {
  const buckets = new Map<number, number>();
  for (const event of events) {
    const duration = Math.max(0.001, event.durationSec);
    const eventStart = event.timestamp;
    const eventEnd = eventStart + duration;
    const clippedStart = Math.max(startSec, eventStart);
    const clippedEnd = Math.min(endSec, eventEnd);
    if (clippedEnd <= clippedStart) continue;
    const foregroundSec = clamp(event.foregroundSec, 0, duration);
    let cursor = clippedStart;
    while (cursor < clippedEnd) {
      const bucketStart =
        bucketOriginSec +
        Math.floor((cursor - bucketOriginSec) / ENERGY_BUCKET_SECONDS) *
          ENERGY_BUCKET_SECONDS;
      const bucketEnd = Math.min(
        clippedEnd,
        bucketStart + ENERGY_BUCKET_SECONDS,
      );
      const value = foregroundSec * ((bucketEnd - cursor) / duration);
      buckets.set(
        bucketStart,
        Math.min(
          ENERGY_BUCKET_SECONDS,
          (buckets.get(bucketStart) ?? 0) + value,
        ),
      );
      cursor = bucketEnd;
    }
  }
  return buckets;
}

function collectDetailData(
  events: PowerlogEnergyEvent[],
  nodes: Map<number, string>,
  startSec: number,
  endSec: number,
  bucketOriginSec: number,
): RawDetailData {
  const components = new Map<string, number>();
  const buckets = new Map<number, Map<string, number>>();
  for (const event of events) {
    const bounds = eventBounds(event);
    if (!bounds) continue;
    const [eventStart, eventEnd] = bounds;
    const clippedStart = Math.max(startSec, eventStart);
    const clippedEnd = Math.min(endSec, eventEnd);
    if (clippedEnd <= clippedStart) continue;
    const duration = eventEnd - eventStart;
    const component = nodes.get(event.rootId) ?? `Root ${event.rootId}`;
    const add = (bucket: Map<string, number>, value: number) => {
      bucket.set(component, (bucket.get(component) ?? 0) + value);
    };
    let cursor = clippedStart;
    while (cursor < clippedEnd) {
      const bucketStart =
        bucketOriginSec +
        Math.floor((cursor - bucketOriginSec) / ENERGY_BUCKET_SECONDS) *
          ENERGY_BUCKET_SECONDS;
      const bucketEnd = Math.min(
        clippedEnd,
        bucketStart + ENERGY_BUCKET_SECONDS,
      );
      const value =
        Math.max(0, event.energy) * ((bucketEnd - cursor) / duration);
      const bucket = buckets.get(bucketStart) ?? new Map<string, number>();
      add(bucket, value);
      buckets.set(bucketStart, bucket);
      components.set(component, (components.get(component) ?? 0) + value);
      cursor = bucketEnd;
    }
  }
  return { components, buckets };
}

export function buildAppDetail(
  app: AnalyticsAppRow,
  selectedEvents: PowerlogEnergyEvent[],
  selectedForegroundEvents: PowerlogRuntimeEvent[],
  nodes: PowerlogNode[],
  selectedStartSec: number,
  selectedEndSec: number,
  wallOffsetMs: number,
): AnalyticsDetail {
  const nodeMap = new Map(nodes.map((node) => [node.id, node.name]));
  const selected = collectDetailData(
    selectedEvents,
    nodeMap,
    selectedStartSec,
    selectedEndSec,
    selectedStartSec,
  );
  const foregroundBuckets = collectForegroundBuckets(
    selectedForegroundEvents,
    selectedStartSec,
    selectedEndSec,
    selectedStartSec,
  );

  const plistComponents = Object.entries(app.components ?? {}).filter(
    ([key, energy]) =>
      !key.startsWith("Foreground-") && key !== "Foreground" && energy > 0.01,
  );
  const componentTargets = plistComponents
    .filter(([key]) => (selected.components.get(key) ?? 0) > 0)
    .map(([key, energy]) => ({ key, energy }));
  const targetTotal = componentTargets.reduce(
    (sum, component) => sum + component.energy,
    0,
  );
  const targetScale =
    targetTotal > app.energy && targetTotal > 0 ? app.energy / targetTotal : 1;
  const components: AnalyticsComponent[] = componentTargets
    .map((component) => ({
      key: component.key,
      energy: component.energy * targetScale,
    }))
    .sort((a, b) => b.energy - a.energy);
  const componentTotal = components.reduce(
    (sum, component) => sum + component.energy,
    0,
  );
  const unallocatedEnergy = Math.max(0, app.energy - componentTotal);
  if (unallocatedEnergy > 0.01) {
    components.push({
      key: OTHER_COMPONENT_KEY,
      energy: unallocatedEnergy,
    });
  }
  const rawTotal = [...selected.components.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const bucketStarts: number[] = [];
  for (
    let bucketStart = selectedStartSec;
    bucketStart < selectedEndSec;
    bucketStart += ENERGY_BUCKET_SECONDS
  ) {
    bucketStarts.push(bucketStart);
  }
  const points: AnalyticsDetailPoint[] = bucketStarts.map(
    (bucketStart): AnalyticsDetailPoint => {
      const rawComponents =
        selected.buckets.get(bucketStart) ?? new Map<string, number>();
      const pointComponents: Record<string, number> = {};
      for (const component of components) {
        if (component.key === OTHER_COMPONENT_KEY) continue;
        const rawComponentTotal = selected.components.get(component.key) ?? 0;
        const energy =
          rawComponentTotal > 0
            ? component.energy *
              ((rawComponents.get(component.key) ?? 0) / rawComponentTotal)
            : 0;
        if (energy > 0.01) pointComponents[component.key] = energy;
      }
      const pointComponentEnergy = Object.values(pointComponents).reduce(
        (sum, value) => sum + value,
        0,
      );
      const pointRawTotal = [...rawComponents.values()].reduce(
        (sum, value) => sum + value,
        0,
      );
      const pointUnallocatedEnergy =
        unallocatedEnergy * (pointRawTotal / Math.max(0.001, rawTotal));
      if (pointUnallocatedEnergy > 0.01) {
        pointComponents[OTHER_COMPONENT_KEY] = pointUnallocatedEnergy;
      }
      const pointEnergy = pointComponentEnergy + pointUnallocatedEnergy;
      return {
        ts: wallOffsetMs + bucketStart * 1000,
        foregroundSec: foregroundBuckets.get(bucketStart) ?? 0,
        energy: pointEnergy,
        components: pointComponents,
      };
    },
  );
  return {
    app,
    components,
    points: rawTotal > 0 ? points : [],
    sourceRange: {
      startMs: wallOffsetMs + selectedStartSec * 1000,
      endMs: wallOffsetMs + selectedEndSec * 1000,
    },
    sourceRangeIsPartial: false,
  };
}

export function buildEnergyTimeline(
  apps: AnalyticsAppRow[],
  events: PowerlogAppEnergyEvent[],
  nodes: PowerlogNode[],
  selectedStartSec: number,
  selectedEndSec: number,
  wallOffsetMs: number,
): AnalyticsEnergyTimeline {
  const eventsByApp = new Map<string, PowerlogEnergyEvent[]>();
  for (const event of events) {
    const appEvents = eventsByApp.get(event.appKey) ?? [];
    appEvents.push(event);
    eventsByApp.set(event.appKey, appEvents);
  }
  const byTimestamp = new Map<number, AnalyticsEnergyPoint>();
  const appSeries: Record<string, AnalyticsAppSeriesPoint[]> = {};
  for (const app of apps) {
    const appKey = app.bundleId || app.name;
    const appEvents =
      eventsByApp.get(app.bundleId) ?? eventsByApp.get(app.name) ?? [];
    if (appEvents.length === 0) continue;
    const detail = buildAppDetail(
      app,
      appEvents,
      [],
      nodes,
      selectedStartSec,
      selectedEndSec,
      wallOffsetMs,
    );
    appSeries[appKey] = detail.points.map((point) => ({
      ts: point.ts,
      energy: point.energy,
    }));
    for (const point of detail.points) {
      const current = byTimestamp.get(point.ts) ?? {
        ts: point.ts,
        energy: 0,
        components: {},
      };
      current.energy += point.energy;
      for (const [key, value] of Object.entries(point.components)) {
        current.components[key] = (current.components[key] ?? 0) + value;
      }
      byTimestamp.set(point.ts, current);
    }
  }
  return {
    timeline: [...byTimestamp.values()].sort((a, b) => a.ts - b.ts),
    appSeries,
  };
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
