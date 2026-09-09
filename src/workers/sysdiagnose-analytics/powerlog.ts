import { normalizePowerlogRows, type PowerlogAggregate } from "./pipeline";

export type PowerlogQueryRows = (
  sql: string,
  bind: Array<number | string>,
) => Array<Record<string, unknown>>;

export interface PowerlogSqlQuery {
  sql: string;
  bind: Array<number | string>;
}

/**
 * RootNodeEnergy is an aggregate whose timestamp marks the interval end. The
 * returned timestamp is deliberately its start so pipeline event bounds are
 * [timestamp, timestamp + timeInterval].
 */
export function buildRootEnergyEventsQuery(
  appKeys: string[],
  start: number,
  end: number,
): PowerlogSqlQuery {
  const placeholders = appKeys.map(() => "?").join(",");
  return {
    sql: `
      SELECT
        appNode.Name AS appKey,
        rootEnergy.RootNodeID AS rootId,
        rootEnergy.timestamp - rootEnergy.timeInterval AS timestamp,
        0 AS startOffset,
        rootEnergy.timeInterval * 1000000.0 AS endOffset,
        MAX(rootEnergy.Energy) AS energy
      FROM PLAccountingOperator_Aggregate_RootNodeEnergy AS rootEnergy
      JOIN PLAccountingOperator_EventNone_Nodes AS appNode
        ON appNode.ID = rootEnergy.NodeID
      WHERE appNode.Name IN (${placeholders})
        AND rootEnergy.timeInterval = 3600
        AND rootEnergy.timestamp > ?
        AND rootEnergy.timestamp - rootEnergy.timeInterval < ?
      GROUP BY appNode.Name, rootEnergy.NodeID, rootEnergy.RootNodeID, rootEnergy.timestamp, rootEnergy.timeInterval
    `,
    bind: [...appKeys, start, end],
  };
}

/**
 * Powerlog stores a device-relative timestamp. The TimeOffset table is the
 * database's own wall-clock calibration and is more precise than anchoring to
 * the sysdiagnose filename. Older archives omit this table, so callers retain
 * a capture-time fallback.
 */
export function queryPowerlogSystemOffset(
  queryRows: PowerlogQueryRows,
): number | null {
  try {
    const row = queryRows(
      `
        SELECT "system" AS systemOffset
        FROM PLStorageOperator_EventForward_TimeOffset
        WHERE "system" IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1
      `,
      [],
    )[0];
    const offset = Number(row?.["systemOffset"]);
    return Number.isFinite(offset) ? offset : null;
  } catch {
    return null;
  }
}

/**
 * Reads app-keyed coalition intervals. Unlike root-node energy aggregates,
 * CoalitionInterval has the bundle ID on every row and is therefore the
 * stable source for allocating Battery UI totals to a time range.
 */
export function queryCoalitionAggregates(
  queryRows: PowerlogQueryRows,
  start: number,
  end: number,
): PowerlogAggregate[] {
  const rows = queryRows(
    `
      SELECT
        COALESCE(NULLIF(BundleId, ''), LaunchdName) AS key,
        SUM(
          COALESCE(energy, 0) *
          CASE
            WHEN timestampEnd > timestamp THEN
              MAX(0, MIN(timestampEnd, ?) - MAX(timestamp, ?)) /
              (timestampEnd - timestamp)
            ELSE 0
          END
        ) AS rawEnergy,
        SUM(
          CASE
            WHEN timestampEnd > timestamp THEN
              MAX(0, MIN(timestampEnd, ?) - MAX(timestamp, ?))
            ELSE 0
          END
        ) AS activitySec
      FROM PLCoalitionAgent_EventInterval_CoalitionInterval
      WHERE timestampEnd > ? AND timestamp < ?
      GROUP BY COALESCE(NULLIF(BundleId, ''), LaunchdName)
    `,
    [end, start, end, start, start, end],
  );
  return normalizePowerlogRows(rows);
}
