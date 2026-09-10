import {
  isSysdiagnoseQueryIn,
  isSysdiagnoseQueryPlan,
  SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
} from "./query.protocol";

describe("sysdiagnose query protocol", () => {
  it("accepts only the catalogued query plans", () => {
    expect(
      isSysdiagnoseQueryPlan({
        kind: "root-node-component-totals",
        range: { startMs: 1, endMs: 2 },
      }),
    ).toBe(true);
    expect(
      isSysdiagnoseQueryPlan({
        kind: "app-energy-attribution",
        range: { startMs: 1, endMs: 2 },
        apps: [{ bundleId: "com.example.app", name: "Example" }],
      }),
    ).toBe(true);
    expect(
      isSysdiagnoseQueryPlan({
        kind: "arbitrary-sql",
        sql: "DROP TABLE Nodes",
        range: { startMs: 1, endMs: 2 },
      }),
    ).toBe(false);
    expect(
      isSysdiagnoseQueryPlan({
        kind: "app-runtime",
        range: { startMs: 2, endMs: 1 },
        apps: [],
      }),
    ).toBe(false);
  });

  it("guards worker input and requires a transferable Powerlog buffer for init", () => {
    expect(
      isSysdiagnoseQueryIn({
        v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
        kind: "query/init",
        id: 1,
        powerlog: new ArrayBuffer(4),
      }),
    ).toBe(true);
    expect(
      isSysdiagnoseQueryIn({
        v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION - 1,
        kind: "query/init",
        id: 1,
        powerlog: new ArrayBuffer(4),
      }),
    ).toBe(false);
    expect(
      isSysdiagnoseQueryIn({
        v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
        kind: "query/run",
        id: 1,
        plan: {
          kind: "root-node-component-totals",
          range: { startMs: 3, endMs: 1 },
        },
      }),
    ).toBe(false);
  });
});
