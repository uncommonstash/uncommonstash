import { normalizePowerlogRows, type PowerlogAggregate } from "./pipeline";

export type PowerlogQueryRows = (
  sql: string,
  bind: Array<number | string>,
) => Array<Record<string, unknown>>;

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
