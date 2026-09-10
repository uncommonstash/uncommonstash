import { createTimeNormalizer, executeQueryPlan, type QueryRows } from "./query.sql";

const offsets = [
  { monotonicSec: 100, systemSec: 1_000 },
  { monotonicSec: 8_200, systemSec: 1_001 },
];

function rows(sql: string): Array<Record<string, unknown>> {
  if (sql.includes("TimeOffset")) return offsets;
  if (sql.includes("consumerNodeId")) return [{ endSec: 8_300, intervalSec: 3_600, rootNodeId: 9, rootNodeName: "CPU", rootNodePermanent: 1, consumerNodeId: 2, consumerNodeName: "com.example.app", consumerNodePermanent: 0, rawEnergy: 75 }];
  if (sql.includes("BundleID AS bundleId")) return [{ endSec: 8_300, intervalSec: 3_600, bundleId: "com.example.app", foregroundSec: 120, backgroundSec: 30 }];
  return [
    { endSec: 8_300, intervalSec: 3_600, rootNodeId: 9, rootNodeName: "CPU", rootNodePermanent: 1, rawEnergy: 100 },
    { endSec: 11_900, intervalSec: 3_600, rootNodeId: 9, rootNodeName: "CPU", rootNodePermanent: 1, rawEnergy: 200 },
    { endSec: 19_100, intervalSec: 3_600, rootNodeId: 10, rootNodeName: "Display", rootNodePermanent: 1, rawEnergy: 300 },
  ];
}

const queryRows: QueryRows = (sql) => rows(sql);

describe("Powerlog query SQL", () => {
  it("normalizes each interval endpoint using the applicable TimeOffset", () => {
    const normalize = createTimeNormalizer(queryRows);
    expect(normalize(4_700)).toBe(5_700_000);
    expect(normalize(8_300)).toBe(9_301_000);
  });

  it("returns RootNodeID component totals, node identity, coverage gaps, and full overlapping intervals", () => {
    const result = executeQueryPlan(queryRows, { kind: "root-node-component-totals", range: { startMs: 8_000_000, endMs: 9_000_000 } });
    expect(result.rows).toEqual([{ interval: { startMs: 5_700_000, endMs: 9_301_000 }, rootNode: { id: 9, name: "CPU", isPermanent: true }, rawEnergy: 100 }]);
    expect(result.provenance.effectiveRange).toEqual({ startMs: 5_700_000, endMs: 9_301_000 });
    expect(result.provenance.coverage).toHaveLength(2);
    expect(result.provenance.aggregation).toEqual([{ operation: "sum", input: "Energy", groupBy: ["interval", "RootNodeID"] }]);
  });

  it("preserves consumer and root identities for app attribution and source seconds for runtime", () => {
    const plan = { range: { startMs: 8_000_000, endMs: 9_000_000 }, apps: [{ bundleId: "com.example.app", name: "Example" }] };
    const attribution = executeQueryPlan(queryRows, { kind: "app-energy-attribution", ...plan });
    expect(attribution.rows[0]).toMatchObject({ rawEnergy: 75, rootNode: { id: 9, name: "CPU", isPermanent: true }, consumerNode: { id: 2, name: "com.example.app", isPermanent: false } });
    const runtime = executeQueryPlan(queryRows, { kind: "app-runtime", ...plan });
    expect(runtime.rows[0]).toMatchObject({ bundleId: "com.example.app", foregroundSec: 120, backgroundSec: 30 });
  });

  it("rejects a duplicate typed query result instead of silently shaping it", () => {
    const duplicate: QueryRows = (sql) => sql.includes("TimeOffset") ? offsets : sql.includes("consumerNodeId") || sql.includes("BundleID AS bundleId") ? [] : [
      { endSec: 8_300, intervalSec: 3_600, rootNodeId: 9, rootNodeName: "CPU", rootNodePermanent: 1, rawEnergy: 100 },
      { endSec: 8_300, intervalSec: 3_600, rootNodeId: 9, rootNodeName: "CPU", rootNodePermanent: 1, rawEnergy: 100 },
    ];
    expect(() => executeQueryPlan(duplicate, { kind: "root-node-component-totals", range: { startMs: 0, endMs: 10_000_000 } })).toThrow("duplicate source result");
  });
});
