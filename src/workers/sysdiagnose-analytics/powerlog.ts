import {
  POWERLOG_INTERVAL_SECONDS,
  type RawEnergyInterval,
  type RawRuntimeInterval,
  type TimeOffset,
} from "./pipeline";

export type PowerlogQueryRows = (
  sql: string,
  bind: Array<number | string>,
) => Array<Record<string, unknown>>;

function numberField(row: Record<string, unknown>, field: string): number {
  const value = Number(row[field]);
  if (!Number.isFinite(value))
    throw new Error(`Powerlog returned invalid ${field}`);
  return value;
}

function textField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || !value)
    throw new Error(`Powerlog returned invalid ${field}`);
  return value;
}

export function queryPowerlogTimeOffsets(
  queryRows: PowerlogQueryRows,
): TimeOffset[] {
  const rows = queryRows(
    `SELECT timestamp AS monotonicSec, "system" AS systemSec
       FROM PLStorageOperator_EventForward_TimeOffset
      WHERE "system" IS NOT NULL
      ORDER BY timestamp ASC`,
    [],
  );
  return rows.map((row) => ({
    monotonicSec: numberField(row, "monotonicSec"),
    systemSec: numberField(row, "systemSec"),
  }));
}

/** Device-wide components: only root self records are disjoint. */
export function queryRawDeviceEnergy(
  queryRows: PowerlogQueryRows,
): RawEnergyInterval[] {
  const rows = queryRows(
    `SELECT rootNode.Name AS component, rootEnergy.timestamp AS endSec,
            rootEnergy.timeInterval AS intervalSec, rootEnergy.Energy AS rawEnergy
       FROM PLAccountingOperator_Aggregate_RootNodeEnergy AS rootEnergy
       JOIN PLAccountingOperator_EventNone_Nodes AS rootNode
         ON rootNode.ID = rootEnergy.RootNodeID
      WHERE rootEnergy.NodeID = rootEnergy.RootNodeID
        AND rootEnergy.timeInterval = ?
      ORDER BY rootEnergy.timestamp ASC, rootEnergy.RootNodeID ASC`,
    [POWERLOG_INTERVAL_SECONDS],
  );
  return rows.map((row) => {
    const endSec = numberField(row, "endSec");
    const intervalSec = numberField(row, "intervalSec");
    return {
      key: "__device__",
      component: textField(row, "component"),
      startSec: endSec - intervalSec,
      endSec,
      rawEnergy: numberField(row, "rawEnergy"),
    };
  });
}

/** App child nodes are attributed once per top-level component. */
export function queryRawAppEnergy(
  queryRows: PowerlogQueryRows,
  appKeys: string[],
): RawEnergyInterval[] {
  if (appKeys.length === 0) return [];
  const placeholders = appKeys.map(() => "?").join(",");
  const rows = queryRows(
    `SELECT appNode.Name AS appKey, rootNode.Name AS component,
            rootEnergy.timestamp AS endSec, rootEnergy.timeInterval AS intervalSec,
            rootEnergy.Energy AS rawEnergy
       FROM PLAccountingOperator_Aggregate_RootNodeEnergy AS rootEnergy
       JOIN PLAccountingOperator_EventNone_Nodes AS appNode
         ON appNode.ID = rootEnergy.NodeID
       JOIN PLAccountingOperator_EventNone_Nodes AS rootNode
         ON rootNode.ID = rootEnergy.RootNodeID
      WHERE appNode.Name IN (${placeholders})
        AND rootEnergy.NodeID != rootEnergy.RootNodeID
        AND rootEnergy.timeInterval = ?
      ORDER BY rootEnergy.timestamp ASC, appNode.Name ASC, rootEnergy.RootNodeID ASC`,
    [...appKeys, POWERLOG_INTERVAL_SECONDS],
  );
  return rows.map((row) => {
    const endSec = numberField(row, "endSec");
    const intervalSec = numberField(row, "intervalSec");
    return {
      key: textField(row, "appKey"),
      component: textField(row, "component"),
      startSec: endSec - intervalSec,
      endSec,
      rawEnergy: numberField(row, "rawEnergy"),
    };
  });
}

export function queryRawAppRuntime(
  queryRows: PowerlogQueryRows,
  appKeys: string[],
): RawRuntimeInterval[] {
  if (appKeys.length === 0) return [];
  const placeholders = appKeys.map(() => "?").join(",");
  const rows = queryRows(
    `SELECT BundleID AS appKey, timestamp AS endSec, timeInterval AS intervalSec,
            COALESCE(ScreenOnTime, 0) AS foregroundSec,
            COALESCE(BackgroundTime, 0) AS backgroundSec
       FROM PLAppTimeService_Aggregate_AppRunTime
      WHERE BundleID IN (${placeholders})
        AND timeInterval = ?
      ORDER BY timestamp ASC, BundleID ASC`,
    [...appKeys, POWERLOG_INTERVAL_SECONDS],
  );
  return rows.map((row) => {
    const endSec = numberField(row, "endSec");
    const intervalSec = numberField(row, "intervalSec");
    return {
      key: textField(row, "appKey"),
      startSec: endSec - intervalSec,
      endSec,
      foregroundSec: numberField(row, "foregroundSec"),
      backgroundSec: numberField(row, "backgroundSec"),
    };
  });
}
