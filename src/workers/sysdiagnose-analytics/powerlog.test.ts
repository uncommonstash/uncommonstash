import {
  buildRootEnergyEventsQuery,
  queryCoalitionAggregates,
  queryPowerlogSystemOffset,
} from "./powerlog";

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe("Powerlog coalition extraction", () => {
  it("normalizes randomized app intervals and clips them to the requested range", () => {
    const random = seededRandom(0x5eed);
    const rows = Array.from({ length: 40 }, (_, index) => ({
      key: `com.example.app${index}`,
      rawEnergy: Math.round(500 + random() * 50_000),
      activitySec: Math.round(1 + random() * 86_400),
    }));
    const calls: Array<{ sql: string; bind: Array<number | string> }> = [];
    const extracted = queryCoalitionAggregates(
      (sql, bind) => {
        calls.push({ sql, bind });
        return [...rows, { key: "", rawEnergy: 100, activitySec: 10 }];
      },
      1_000,
      5_000,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(
      "PLCoalitionAgent_EventInterval_CoalitionInterval",
    );
    expect(calls[0].sql).toContain("timestampEnd > ? AND timestamp < ?");
    expect(calls[0].bind).toEqual([5_000, 1_000, 5_000, 1_000, 1_000, 5_000]);
    expect(extracted).toEqual(rows);
  });

  it("uses the TimeOffset calibration and end-stamped root energy intervals", () => {
    const rootQuery = buildRootEnergyEventsQuery(
      ["com.apple.mobilesafari", "com.apple.Maps"],
      1_000,
      5_000,
    );
    expect(rootQuery.sql).toContain(
      "rootEnergy.timestamp - rootEnergy.timeInterval AS timestamp",
    );
    expect(rootQuery.sql).toContain("rootEnergy.timestamp > ?");
    expect(rootQuery.sql).toContain(
      "rootEnergy.timestamp - rootEnergy.timeInterval < ?",
    );
    expect(rootQuery.bind).toEqual([
      "com.apple.mobilesafari",
      "com.apple.Maps",
      1_000,
      5_000,
    ]);

    const offset = queryPowerlogSystemOffset((sql) => {
      expect(sql).toContain("PLStorageOperator_EventForward_TimeOffset");
      return [{ systemOffset: 1_729_127_236.72 }];
    });
    expect(offset).toBe(1_729_127_236.72);
    expect(queryPowerlogSystemOffset(() => [])).toBeNull();
  });
});
