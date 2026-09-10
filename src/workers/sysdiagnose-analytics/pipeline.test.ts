import {
  buildDirectAnalytics,
  createTimeNormalizer,
  expandToSourceIntervals,
  normalizeEnergyIntervals,
  POWERLOG_MWH_PER_RAW_UNIT,
} from "./pipeline";

describe("direct Powerlog pipeline", () => {
  const start = 100_000;
  const offsets = [
    { monotonicSec: start, systemSec: 1_700_000_000 },
    // Models a new offset written after a wall-clock change.
    { monotonicSec: start + 7_200, systemSec: 1_700_003_600 },
  ];

  it("uses the offset in force for each endpoint", () => {
    const normalizer = createTimeNormalizer(offsets);
    expect(normalizer.toWallMs(start + 3_600)).toBe(
      (start + 3_600 + 1_700_000_000) * 1000,
    );
    expect(normalizer.toWallMs(start + 7_200)).toBe(
      (start + 7_200 + 1_700_003_600) * 1000,
    );
    expect(() => normalizer.toWallMs(start - 1)).toThrow(
      "predates TimeOffset coverage",
    );
  });

  it("converts uWh to mWh and rejects duplicate hourly rows", () => {
    const normalizer = createTimeNormalizer(offsets);
    const raw = [
      {
        key: "com.example.app",
        component: "CPU",
        startSec: start,
        endSec: start + 3_600,
        rawEnergy: 4_350_330,
      },
    ];
    expect(
      normalizeEnergyIntervals(raw, normalizer.toWallMs)[0].energy,
    ).toBeCloseTo(4350.33);
    expect(POWERLOG_MWH_PER_RAW_UNIT).toBe(0.001);
    expect(() =>
      normalizeEnergyIntervals([...raw, ...raw], normalizer.toWallMs),
    ).toThrow("duplicate");
  });

  it("expands a partial request to complete source intervals", () => {
    const normalizer = createTimeNormalizer(offsets);
    const intervals = normalizeEnergyIntervals(
      [
        {
          key: "device",
          component: "CPU",
          startSec: start,
          endSec: start + 3_600,
          rawEnergy: 1_000,
        },
        {
          key: "device",
          component: "CPU",
          startSec: start + 3_600,
          endSec: start + 7_200,
          rawEnergy: 2_000,
        },
      ],
      normalizer.toWallMs,
    );
    const selected = expandToSourceIntervals(intervals, {
      startMs: normalizer.toWallMs(start + 300),
      endMs: normalizer.toWallMs(start + 4_000),
    });
    expect(selected.intervals).toHaveLength(2);
    expect(selected.effectiveRange).toEqual({
      startMs: intervals[0].startMs,
      endMs: intervals[1].endMs,
    });
  });

  it("uses direct app components and runtime, not Battery UI totals", () => {
    const normalizer = createTimeNormalizer(offsets);
    const device = normalizeEnergyIntervals(
      [
        {
          key: "device",
          component: "CPU",
          startSec: start,
          endSec: start + 3_600,
          rawEnergy: 20_000,
        },
      ],
      normalizer.toWallMs,
    );
    const app = normalizeEnergyIntervals(
      [
        {
          key: "com.example.app",
          component: "CPU",
          startSec: start,
          endSec: start + 3_600,
          rawEnergy: 4_350_330,
        },
      ],
      normalizer.toWallMs,
    );
    const result = buildDirectAnalytics(
      [
        {
          name: "Example",
          bundleId: "com.example.app",
          energy: 1,
          foregroundSec: 1,
          backgroundSec: 1,
        },
      ],
      device,
      app,
      [
        {
          key: "com.example.app",
          startMs: app[0].startMs,
          endMs: app[0].endMs,
          foregroundSec: 17,
          backgroundSec: 23,
        },
      ],
      { startMs: app[0].startMs + 1, endMs: app[0].endMs - 1 },
    );
    expect(result.apps).toEqual([
      expect.objectContaining({
        energy: 4350.33,
        foregroundSec: 17,
        backgroundSec: 23,
        components: { CPU: 4350.33 },
      }),
    ]);
    expect(result.timeline[0]).toEqual(
      expect.objectContaining({
        rawEnergy: 20_000,
        energy: 20,
        components: { CPU: 20 },
      }),
    );
  });
});
