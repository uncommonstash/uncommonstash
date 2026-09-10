import {
  ANALYTICS_PROTOCOL_VERSION,
  isAnalyticsIn,
  isAnalyticsOut,
} from "./analytics.protocol";

const source = {
  table: "PLAccountingOperator_Aggregate_RootNodeEnergy",
  schema: "root-node-energy-v1",
  rawUnit: "uWh",
  mWhPerRawUnit: 0.001,
} as const;

describe("analytics protocol guards", () => {
  it("accepts valid init and query messages", () => {
    expect(
      isAnalyticsIn({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/init",
        id: 1,
        powerlog: new ArrayBuffer(8),
        apps: [
          {
            name: "Maps",
            bundleId: "com.apple.Maps",
            energy: 1,
            foregroundSec: 2,
            backgroundSec: 3,
          },
        ],
        endTime: 1000,
        batteryWindowEndTime: 1000,
      }),
    ).toBe(true);
    expect(
      isAnalyticsIn({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/detail",
        id: 3,
        bundleId: "com.apple.Maps",
        startMs: 100,
        endMs: 200,
      }),
    ).toBe(true);
    expect(
      isAnalyticsIn({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/query",
        id: 2,
        startMs: 100,
        endMs: 200,
      }),
    ).toBe(true);
  });

  it("rejects malformed messages", () => {
    expect(isAnalyticsIn(null)).toBe(false);
    expect(isAnalyticsIn({ v: 2, kind: "analytics/query" })).toBe(false);
    expect(
      isAnalyticsIn({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/init",
        id: 1,
        powerlog: [],
        apps: [],
        endTime: 1,
      }),
    ).toBe(false);
    expect(
      isAnalyticsIn({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/query",
        id: 1,
        startMs: 20,
        endMs: 10,
      }),
    ).toBe(false);
  });

  it("accepts output and rejects unknown kinds", () => {
    expect(
      isAnalyticsOut({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/ready",
        id: 1,
        minMs: 1,
        maxMs: 2,
        source,
      }),
    ).toBe(true);
    expect(
      isAnalyticsOut({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/detail-result",
        id: 2,
        requestedRange: { startMs: 1, endMs: 2 },
        effectiveRange: { startMs: 1, endMs: 2 },
        detail: null,
      }),
    ).toBe(true);
    expect(
      isAnalyticsOut({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/error",
        id: 1,
        message: "bad",
      }),
    ).toBe(true);
    expect(
      isAnalyticsOut({
        v: ANALYTICS_PROTOCOL_VERSION,
        kind: "analytics/unknown",
        id: 1,
      }),
    ).toBe(false);
  });
});
