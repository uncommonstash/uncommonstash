import type { BatteryApp } from "@/pages/sysdiagnose/lib";
import type {
  AnalyticsAppRow,
  AnalyticsAppSeriesPoint,
  AnalyticsComponent,
  AnalyticsDetail,
  AnalyticsDetailPoint,
  AnalyticsEnergyPoint,
  AnalyticsRange,
} from "./analytics.protocol";

/** RootNodeEnergy stores micro-watt-hours on the iOS schema we support. */
export const POWERLOG_MWH_PER_RAW_UNIT = 0.001;
export const POWERLOG_INTERVAL_SECONDS = 3600;

export interface TimeOffset {
  monotonicSec: number;
  systemSec: number;
}

export interface RawEnergyInterval {
  key: string;
  component: string;
  startSec: number;
  endSec: number;
  rawEnergy: number;
}

export interface RawRuntimeInterval {
  key: string;
  startSec: number;
  endSec: number;
  foregroundSec: number;
  backgroundSec: number;
}

export interface DirectEnergyInterval {
  key: string;
  component: string;
  startMs: number;
  endMs: number;
  rawEnergy: number;
  energy: number;
}

export interface DirectRuntimeInterval {
  key: string;
  startMs: number;
  endMs: number;
  foregroundSec: number;
  backgroundSec: number;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`invalid ${label}`);
  return value;
}

/**
 * Powerlog timestamps are monotonic. The table is a piecewise conversion to
 * wall time: an event uses the newest offset written at or before itself.
 */
export function createTimeNormalizer(offsets: TimeOffset[]) {
  const ordered = [...offsets].sort((a, b) => a.monotonicSec - b.monotonicSec);
  if (ordered.length === 0)
    throw new Error("Powerlog has no TimeOffset records");
  for (let index = 0; index < ordered.length; index += 1) {
    finite(ordered[index].monotonicSec, "TimeOffset timestamp");
    finite(ordered[index].systemSec, "TimeOffset system offset");
    if (
      index > 0 &&
      ordered[index - 1].monotonicSec >= ordered[index].monotonicSec
    ) {
      throw new Error(
        "Powerlog TimeOffset timestamps are not strictly ordered",
      );
    }
  }
  const offsetAt = (monotonicSec: number): TimeOffset => {
    let low = 0;
    let high = ordered.length - 1;
    if (monotonicSec < ordered[0].monotonicSec) {
      throw new Error("Powerlog event predates TimeOffset coverage");
    }
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (ordered[mid].monotonicSec <= monotonicSec) low = mid;
      else high = mid - 1;
    }
    return ordered[low];
  };
  return {
    offsets: ordered,
    minMonotonicSec: ordered[0].monotonicSec,
    toWallMs(monotonicSec: number): number {
      return (
        (finite(monotonicSec, "Powerlog timestamp") +
          offsetAt(monotonicSec).systemSec) *
        1000
      );
    },
  };
}

export function normalizeEnergyIntervals(
  raw: RawEnergyInterval[],
  toWallMs: (monotonicSec: number) => number,
): DirectEnergyInterval[] {
  const seen = new Set<string>();
  return raw.map((event) => {
    const startMs = toWallMs(event.startSec);
    const endMs = toWallMs(event.endSec);
    const rawEnergy = finite(event.rawEnergy, "RootNodeEnergy value");
    if (!event.key || !event.component || endMs <= startMs || rawEnergy < 0) {
      throw new Error("invalid RootNodeEnergy interval");
    }
    const identity = `${event.key}\u0000${event.component}\u0000${event.startSec}\u0000${event.endSec}`;
    if (seen.has(identity))
      throw new Error("duplicate RootNodeEnergy interval");
    seen.add(identity);
    return {
      key: event.key,
      component: event.component,
      startMs,
      endMs,
      rawEnergy,
      energy: rawEnergy * POWERLOG_MWH_PER_RAW_UNIT,
    };
  });
}

export function normalizeRuntimeIntervals(
  raw: RawRuntimeInterval[],
  toWallMs: (monotonicSec: number) => number,
): DirectRuntimeInterval[] {
  return raw.flatMap((event) => {
    const startMs = toWallMs(event.startSec);
    const endMs = toWallMs(event.endSec);
    if (!event.key || endMs <= startMs)
      throw new Error("invalid AppRunTime interval");
    return [
      {
        key: event.key,
        startMs,
        endMs,
        foregroundSec: Math.max(
          0,
          finite(event.foregroundSec, "foreground runtime"),
        ),
        backgroundSec: Math.max(
          0,
          finite(event.backgroundSec, "background runtime"),
        ),
      },
    ];
  });
}

function overlaps(interval: AnalyticsRange, range: AnalyticsRange): boolean {
  return interval.endMs > range.startMs && interval.startMs < range.endMs;
}

export function coverageOf(
  intervals: Array<Pick<DirectEnergyInterval, "startMs" | "endMs">>,
): AnalyticsRange | null {
  if (intervals.length === 0) return null;
  return {
    startMs: Math.min(...intervals.map((interval) => interval.startMs)),
    endMs: Math.max(...intervals.map((interval) => interval.endMs)),
  };
}

/** Include full source records rather than prorating an hourly aggregate. */
export function expandToSourceIntervals<
  T extends Pick<DirectEnergyInterval, "startMs" | "endMs">,
>(
  intervals: T[],
  requestedRange: AnalyticsRange,
): { intervals: T[]; effectiveRange: AnalyticsRange | null } {
  const selected = intervals.filter((interval) =>
    overlaps(interval, requestedRange),
  );
  return { intervals: selected, effectiveRange: coverageOf(selected) };
}

function groupEnergyPoints(
  intervals: DirectEnergyInterval[],
): AnalyticsEnergyPoint[] {
  const points = new Map<string, AnalyticsEnergyPoint>();
  for (const interval of intervals) {
    const key = `${interval.startMs}:${interval.endMs}`;
    const point = points.get(key) ?? {
      ts: interval.startMs,
      startMs: interval.startMs,
      endMs: interval.endMs,
      rawEnergy: 0,
      energy: 0,
      components: {},
    };
    point.rawEnergy += interval.rawEnergy;
    point.energy += interval.energy;
    point.components[interval.component] =
      (point.components[interval.component] ?? 0) + interval.energy;
    points.set(key, point);
  }
  return [...points.values()].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );
}

function appSeriesFor(
  intervals: DirectEnergyInterval[],
): AnalyticsAppSeriesPoint[] {
  const grouped = new Map<string, AnalyticsAppSeriesPoint>();
  for (const interval of intervals) {
    const key = `${interval.startMs}:${interval.endMs}`;
    const point = grouped.get(key) ?? {
      ts: interval.startMs,
      startMs: interval.startMs,
      endMs: interval.endMs,
      rawEnergy: 0,
      energy: 0,
    };
    point.rawEnergy += interval.rawEnergy;
    point.energy += interval.energy;
    grouped.set(key, point);
  }
  return [...grouped.values()].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );
}

export interface DirectAnalyticsResult {
  effectiveRange: AnalyticsRange | null;
  timeline: AnalyticsEnergyPoint[];
  apps: AnalyticsAppRow[];
  appSeries: Record<string, AnalyticsAppSeriesPoint[]>;
}

/**
 * Metadata comes from Battery UI only. Every numeric value comes from the
 * direct RootNodeEnergy/AppRunTime intervals supplied here.
 */
export function buildDirectAnalytics(
  appMetadata: BatteryApp[],
  deviceIntervals: DirectEnergyInterval[],
  appIntervals: DirectEnergyInterval[],
  runtimeIntervals: DirectRuntimeInterval[],
  requestedRange: AnalyticsRange,
): DirectAnalyticsResult {
  const selectedDevice = expandToSourceIntervals(
    deviceIntervals,
    requestedRange,
  );
  if (!selectedDevice.effectiveRange) {
    return { effectiveRange: null, timeline: [], apps: [], appSeries: {} };
  }
  const effectiveRange = selectedDevice.effectiveRange;
  const selectedApp = appIntervals.filter((interval) =>
    overlaps(interval, effectiveRange),
  );
  const selectedRuntime = runtimeIntervals.filter((interval) =>
    overlaps(interval, effectiveRange),
  );
  const intervalsByApp = new Map<string, DirectEnergyInterval[]>();
  for (const interval of selectedApp) {
    const entries = intervalsByApp.get(interval.key) ?? [];
    entries.push(interval);
    intervalsByApp.set(interval.key, entries);
  }
  const runtimeByApp = new Map<string, DirectRuntimeInterval[]>();
  for (const interval of selectedRuntime) {
    const entries = runtimeByApp.get(interval.key) ?? [];
    entries.push(interval);
    runtimeByApp.set(interval.key, entries);
  }
  const appSeries: Record<string, AnalyticsAppSeriesPoint[]> = {};
  const apps = appMetadata
    .flatMap((metadata) => {
      const key = metadata.bundleId || metadata.name;
      const source = intervalsByApp.get(key) ?? [];
      if (source.length === 0) return [];
      const components: Record<string, number> = {};
      let energy = 0;
      for (const interval of source) {
        energy += interval.energy;
        components[interval.component] =
          (components[interval.component] ?? 0) + interval.energy;
      }
      const runtime = runtimeByApp.get(key) ?? [];
      appSeries[key] = appSeriesFor(source);
      return [
        {
          ...metadata,
          energy,
          foregroundSec: runtime.reduce(
            (sum, interval) => sum + interval.foregroundSec,
            0,
          ),
          backgroundSec: runtime.reduce(
            (sum, interval) => sum + interval.backgroundSec,
            0,
          ),
          components,
          activityShare: 1,
        } satisfies AnalyticsAppRow,
      ];
    })
    .sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name));
  return {
    effectiveRange,
    timeline: groupEnergyPoints(selectedDevice.intervals),
    apps,
    appSeries,
  };
}

export function buildDirectDetail(
  app: AnalyticsAppRow,
  intervals: DirectEnergyInterval[],
  runtime: DirectRuntimeInterval[],
  sourceRange: AnalyticsRange,
): AnalyticsDetail {
  const points = appSeriesFor(intervals).map((point): AnalyticsDetailPoint => {
    const matching = intervals.filter(
      (interval) =>
        interval.startMs === point.startMs && interval.endMs === point.endMs,
    );
    const components: Record<string, number> = {};
    for (const interval of matching)
      components[interval.component] =
        (components[interval.component] ?? 0) + interval.energy;
    const matchingRuntime = runtime.filter(
      (entry) => entry.startMs === point.startMs && entry.endMs === point.endMs,
    );
    return {
      ...point,
      foregroundSec: matchingRuntime.reduce(
        (sum, entry) => sum + entry.foregroundSec,
        0,
      ),
      components,
    };
  });
  const components: AnalyticsComponent[] = Object.entries(app.components ?? {})
    .map(([key, energy]) => ({ key, energy }))
    .sort((a, b) => b.energy - a.energy);
  return { app, components, points, sourceRange, sourceRangeIsPartial: false };
}
