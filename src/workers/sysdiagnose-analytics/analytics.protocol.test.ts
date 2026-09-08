import { isAnalyticsIn, isAnalyticsOut } from "./analytics.protocol";

describe("analytics protocol guards", () => {
  it("accepts valid init and query messages", () => {
    expect(
      isAnalyticsIn({
        v: 1,
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
      }),
    ).toBe(true);
    expect(
      isAnalyticsIn({
        v: 1,
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
        v: 1,
        kind: "analytics/init",
        id: 1,
        powerlog: [],
        apps: [],
        endTime: 1,
      }),
    ).toBe(false);
    expect(
      isAnalyticsIn({
        v: 1,
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
        v: 1,
        kind: "analytics/ready",
        id: 1,
        minMs: 1,
        maxMs: 2,
      }),
    ).toBe(true);
    expect(
      isAnalyticsOut({ v: 1, kind: "analytics/error", id: 1, message: "bad" }),
    ).toBe(true);
    expect(isAnalyticsOut({ v: 1, kind: "analytics/unknown", id: 1 })).toBe(
      false,
    );
  });
});
