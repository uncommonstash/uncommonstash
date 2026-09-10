import type {
  AppEnergyAttributionRow,
  AppRuntimeRow,
  ComponentTotalRow,
  NodeIdentity,
  QueryAggregation,
  QueryProvenance,
  QueryRange,
  QuerySource,
  SysdiagnoseQueryPlan,
  SysdiagnoseQueryRow,
} from "./query.protocol";

export type QueryRows = (
  sql: string,
  bind: Array<number | string>,
) => Array<Record<string, unknown>>;

const HOURLY_SECONDS = 3600;
const CALIBRATED_INTERVAL = `
  AND energy.timestamp - energy.timeInterval >= (
    SELECT MIN(timestamp) FROM PLStorageOperator_EventForward_TimeOffset
  )`;
const CALIBRATED_RUNTIME_INTERVAL = `
  AND timestamp - timeInterval >= (
    SELECT MIN(timestamp) FROM PLStorageOperator_EventForward_TimeOffset
  )`;

export const ROOT_NODE_ENERGY_SOURCE: QuerySource = {
  id: "root-node-energy-hourly",
  table: "PLAccountingOperator_Aggregate_RootNodeEnergy",
  interval: "end-stamped-hourly",
  clock: "monotonic-plus-system-offset",
  rawUnit: "uWh",
  displayUnit: "mWh",
  displayScale: 0.001,
};

export const APP_RUNTIME_SOURCE: QuerySource = {
  id: "app-runtime-hourly",
  table: "PLAppTimeService_Aggregate_AppRunTime",
  interval: "end-stamped-hourly",
  clock: "monotonic-plus-system-offset",
  rawUnit: "seconds",
  displayUnit: "minutes",
  displayScale: 1 / 60,
};

interface Offset {
  monotonicSec: number;
  systemSec: number;
}

function numberField(row: Record<string, unknown>, field: string): number {
  const value = Number(row[field]);
  if (!Number.isFinite(value)) throw new Error(`invalid ${field}`);
  return value;
}

function textField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || !value) throw new Error(`invalid ${field}`);
  return value;
}

function node(row: Record<string, unknown>, prefix: "root" | "consumer"): NodeIdentity {
  return {
    id: numberField(row, `${prefix}NodeId`),
    name: textField(row, `${prefix}NodeName`),
    isPermanent: Boolean(numberField(row, `${prefix}NodePermanent`)),
  };
}

export function createTimeNormalizer(queryRows: QueryRows) {
  const offsets = queryRows(
    `SELECT timestamp AS monotonicSec, "system" AS systemSec
       FROM PLStorageOperator_EventForward_TimeOffset
      WHERE "system" IS NOT NULL
      ORDER BY timestamp ASC`,
    [],
  ).map((row) => ({
    monotonicSec: numberField(row, "monotonicSec"),
    systemSec: numberField(row, "systemSec"),
  } satisfies Offset));
  if (offsets.length === 0) throw new Error("missing TimeOffset calibration");
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index - 1].monotonicSec >= offsets[index].monotonicSec) {
      throw new Error("invalid TimeOffset calibration ordering");
    }
  }
  const offsetAt = (timestamp: number) => {
    let selected: Offset | undefined;
    for (const offset of offsets) {
      if (offset.monotonicSec > timestamp) break;
      selected = offset;
    }
    if (!selected) throw new Error("record predates TimeOffset calibration");
    return selected;
  };
  return (timestamp: number) => (timestamp + offsetAt(timestamp).systemSec) * 1000;
}

function overlaps(interval: QueryRange, range: QueryRange) {
  return interval.endMs > range.startMs && interval.startMs < range.endMs;
}

function coverage(rows: Array<{ interval: QueryRange }>): QueryRange[] {
  const sorted = [...rows]
    .map((row) => row.interval)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const segments: QueryRange[] = [];
  for (const interval of sorted) {
    const previous = segments.at(-1);
    if (!previous || interval.startMs > previous.endMs) {
      segments.push({ ...interval });
    } else {
      previous.endMs = Math.max(previous.endMs, interval.endMs);
    }
  }
  return segments;
}

function effectiveRange(rows: Array<{ interval: QueryRange }>): QueryRange | null {
  if (rows.length === 0) return null;
  return {
    startMs: Math.min(...rows.map((row) => row.interval.startMs)),
    endMs: Math.max(...rows.map((row) => row.interval.endMs)),
  };
}

function rejectDuplicateRows(rows: SysdiagnoseQueryRow[]) {
  const identities = new Set<string>();
  for (const row of rows) {
    const identity = "rootNode" in row
      ? "consumerNode" in row
        ? `${row.interval.startMs}:${row.interval.endMs}:${row.rootNode.id}:${row.consumerNode.id}`
        : `${row.interval.startMs}:${row.interval.endMs}:${row.rootNode.id}`
      : `${row.interval.startMs}:${row.interval.endMs}:${row.bundleId}`;
    if (identities.has(identity)) throw new Error(`duplicate source result: ${identity}`);
    identities.add(identity);
  }
  return rows;
}

function interval(
  row: Record<string, unknown>,
  normalize: (timestamp: number) => number,
): QueryRange {
  const endSec = numberField(row, "endSec");
  const intervalSec = numberField(row, "intervalSec");
  const startMs = normalize(endSec - intervalSec);
  const endMs = normalize(endSec);
  if (endMs <= startMs) throw new Error("invalid source interval");
  return { startMs, endMs };
}

function provenance(
  source: QuerySource,
  plan: SysdiagnoseQueryPlan,
  returnedRows: Array<{ interval: QueryRange }>,
  sourceRows: Array<{ interval: QueryRange }>,
  aggregation: QueryAggregation[],
): QueryProvenance {
  return {
    source,
    requestedRange: plan.range,
    effectiveRange: effectiveRange(returnedRows),
    coverage: coverage(sourceRows),
    aggregation,
  };
}

export function executeQueryPlan(
  queryRows: QueryRows,
  plan: SysdiagnoseQueryPlan,
): { provenance: QueryProvenance; rows: SysdiagnoseQueryRow[] } {
  const normalize = createTimeNormalizer(queryRows);
  if (plan.kind === "root-node-component-totals") {
    const all = queryRows(
      `SELECT energy.timestamp AS endSec, energy.timeInterval AS intervalSec,
              energy.RootNodeID AS rootNodeId, root.Name AS rootNodeName,
              root.IsPermanent AS rootNodePermanent, SUM(energy.Energy) AS rawEnergy
         FROM PLAccountingOperator_Aggregate_RootNodeEnergy AS energy
         JOIN PLAccountingOperator_EventNone_Nodes AS root ON root.ID = energy.RootNodeID
        WHERE energy.timeInterval = ? ${CALIBRATED_INTERVAL}
        GROUP BY energy.timestamp, energy.timeInterval, energy.RootNodeID,
                 root.Name, root.IsPermanent
        ORDER BY energy.timestamp ASC, energy.RootNodeID ASC`,
      [HOURLY_SECONDS],
    ).map((row): ComponentTotalRow => ({
      interval: interval(row, normalize),
      rootNode: node(row, "root"),
      rawEnergy: numberField(row, "rawEnergy"),
    }));
    const rows = rejectDuplicateRows(all.filter((row) => overlaps(row.interval, plan.range)));
    return {
      rows,
      provenance: provenance(ROOT_NODE_ENERGY_SOURCE, plan, rows, all, [
        { operation: "sum", input: "Energy", groupBy: ["interval", "RootNodeID"] },
      ]),
    };
  }
  const apps = [...new Set(plan.apps.map((app) => app.bundleId).filter(Boolean))];
  if (apps.length === 0) {
    const source = plan.kind === "app-runtime" ? APP_RUNTIME_SOURCE : ROOT_NODE_ENERGY_SOURCE;
    return { rows: [], provenance: provenance(source, plan, [], [], []) };
  }
  const placeholders = apps.map(() => "?").join(",");
  if (plan.kind === "app-energy-attribution") {
    const all = queryRows(
      `SELECT energy.timestamp AS endSec, energy.timeInterval AS intervalSec,
              energy.RootNodeID AS rootNodeId, root.Name AS rootNodeName,
              root.IsPermanent AS rootNodePermanent, energy.NodeID AS consumerNodeId,
              consumer.Name AS consumerNodeName, consumer.IsPermanent AS consumerNodePermanent,
              SUM(energy.Energy) AS rawEnergy
         FROM PLAccountingOperator_Aggregate_RootNodeEnergy AS energy
         JOIN PLAccountingOperator_EventNone_Nodes AS root ON root.ID = energy.RootNodeID
         JOIN PLAccountingOperator_EventNone_Nodes AS consumer ON consumer.ID = energy.NodeID
        WHERE consumer.Name IN (${placeholders}) AND energy.timeInterval = ? ${CALIBRATED_INTERVAL}
        GROUP BY energy.timestamp, energy.timeInterval, energy.RootNodeID, energy.NodeID,
                 root.Name, root.IsPermanent, consumer.Name, consumer.IsPermanent
        ORDER BY energy.timestamp ASC, consumer.Name ASC, energy.RootNodeID ASC`,
      [...apps, HOURLY_SECONDS],
    ).map((row): AppEnergyAttributionRow => ({
      interval: interval(row, normalize),
      rootNode: node(row, "root"),
      consumerNode: node(row, "consumer"),
      rawEnergy: numberField(row, "rawEnergy"),
    }));
    const rows = rejectDuplicateRows(all.filter((row) => overlaps(row.interval, plan.range)));
    return {
      rows,
      provenance: provenance(ROOT_NODE_ENERGY_SOURCE, plan, rows, all, [
        { operation: "sum", input: "Energy", groupBy: ["interval", "RootNodeID", "NodeID"] },
      ]),
    };
  }
  const all = queryRows(
    `SELECT timestamp AS endSec, timeInterval AS intervalSec, BundleID AS bundleId,
            SUM(COALESCE(ScreenOnTime, 0)) AS foregroundSec,
            SUM(COALESCE(BackgroundTime, 0)) AS backgroundSec
       FROM PLAppTimeService_Aggregate_AppRunTime
      WHERE BundleID IN (${placeholders}) AND timeInterval = ? ${CALIBRATED_RUNTIME_INTERVAL}
      GROUP BY timestamp, timeInterval, BundleID
      ORDER BY timestamp ASC, BundleID ASC`,
    [...apps, HOURLY_SECONDS],
  ).map((row): AppRuntimeRow => ({
    interval: interval(row, normalize),
    bundleId: textField(row, "bundleId"),
    foregroundSec: numberField(row, "foregroundSec"),
    backgroundSec: numberField(row, "backgroundSec"),
  }));
  const rows = rejectDuplicateRows(all.filter((row) => overlaps(row.interval, plan.range)));
  return {
    rows,
    provenance: provenance(APP_RUNTIME_SOURCE, plan, rows, all, [
      { operation: "sum", input: "ScreenOnTime", groupBy: ["interval", "BundleID"] },
      { operation: "sum", input: "BackgroundTime", groupBy: ["interval", "BundleID"] },
    ]),
  };
}
