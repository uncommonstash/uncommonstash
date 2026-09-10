import type { BatteryApp } from "@/pages/sysdiagnose/lib";
import {
  coverageOf,
  createTimeNormalizer,
  type DirectEnergyInterval,
  type DirectRuntimeInterval,
  normalizeEnergyIntervals,
  normalizeRuntimeIntervals,
} from "./pipeline";
import {
  type PowerlogQueryRows,
  queryPowerlogTimeOffsets,
  queryRawAppEnergy,
  queryRawAppRuntime,
  queryRawDeviceEnergy,
} from "./powerlog";

export interface DirectPowerlogSnapshot {
  deviceIntervals: DirectEnergyInterval[];
  appIntervals: DirectEnergyInterval[];
  runtimeIntervals: DirectRuntimeInterval[];
  sourceCoverage: { startMs: number; endMs: number };
}

/** The worker's extraction boundary; kept pure so SQL results are testable. */
export function extractDirectPowerlog(
  queryRows: PowerlogQueryRows,
  apps: BatteryApp[],
): DirectPowerlogSnapshot {
  const normalizer = createTimeNormalizer(queryPowerlogTimeOffsets(queryRows));
  const appKeys = [
    ...new Set(apps.map((app) => app.bundleId || app.name).filter(Boolean)),
  ];
  // Old aggregate history may survive after its earliest TimeOffset has been
  // pruned. It has no defensible wall-clock placement, so it is excluded from
  // the calibrated coverage rather than poisoning newer records.
  const hasTimeCalibration = (event: { startSec: number }) =>
    event.startSec >= normalizer.minMonotonicSec;
  const deviceIntervals = normalizeEnergyIntervals(
    queryRawDeviceEnergy(queryRows).filter(hasTimeCalibration),
    normalizer.toWallMs,
  );
  const sourceCoverage = coverageOf(deviceIntervals);
  if (!sourceCoverage)
    throw new Error("Powerlog contains no hourly RootNodeEnergy records");
  return {
    deviceIntervals,
    appIntervals: normalizeEnergyIntervals(
      queryRawAppEnergy(queryRows, appKeys).filter(hasTimeCalibration),
      normalizer.toWallMs,
    ),
    runtimeIntervals: normalizeRuntimeIntervals(
      queryRawAppRuntime(queryRows, appKeys).filter(hasTimeCalibration),
      normalizer.toWallMs,
    ),
    sourceCoverage,
  };
}
