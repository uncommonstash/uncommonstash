import {
  allocateAppsToRange,
  buildAppDetail,
  buildEnergyTimeline,
  isFullBatteryWindow,
  normalizePowerlogRows,
} from "./pipeline";

describe("analytics pipeline", () => {
  it("keeps the calibrated app list for the requested battery window when Powerlog ends early", () => {
    const batteryWindowEnd = 1_700_000_000_000;
    expect(
      isFullBatteryWindow(
        batteryWindowEnd - 24 * 60 * 60 * 1000,
        batteryWindowEnd,
        batteryWindowEnd,
      ),
    ).toBe(true);
    // The worker may clamp this to Powerlog's earlier end, but the original
    // request still represents the complete Battery UI window.
    expect(
      isFullBatteryWindow(
        batteryWindowEnd - 24 * 60 * 60 * 1000,
        batteryWindowEnd - 6 * 60 * 60 * 1000,
        batteryWindowEnd,
      ),
    ).toBe(false);
  });

  it("allocates calibrated daily app energy by interval activity", () => {
    const rows = allocateAppsToRange(
      [
        {
          name: "Maps",
          bundleId: "com.apple.Maps",
          energy: 100,
          foregroundSec: 60,
          backgroundSec: 30,
        },
        {
          name: "Mail",
          bundleId: "com.apple.mobilemail",
          energy: 50,
          foregroundSec: 20,
          backgroundSec: 10,
        },
      ],
      [
        { key: "com.apple.Maps", rawEnergy: 10, activitySec: 100 },
        { key: "com.apple.mobilemail", rawEnergy: 5, activitySec: 20 },
      ],
      [{ key: "com.apple.Maps", rawEnergy: 4, activitySec: 20 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].energy).toBe(40);
    expect(rows[0].foregroundSec).toBe(12);
  });

  it("drops invalid sqlite rows", () => {
    expect(
      normalizePowerlogRows([
        { key: "Maps", rawEnergy: 10, activitySec: 2 },
        { key: "", rawEnergy: 5, activitySec: 1 },
        { key: "Mail", rawEnergy: "nope", activitySec: 1 },
      ]),
    ).toEqual([{ key: "Maps", rawEnergy: 10, activitySec: 2 }]);
  });

  it("calibrates selected component events into mWh buckets", () => {
    const fullApp = {
      name: "Maps",
      bundleId: "com.apple.Maps",
      energy: 100,
      foregroundSec: 120,
      backgroundSec: 60,
      components: {
        CPU: 60,
        DisplayDynamic: 40,
        "Foreground-CPU": 12,
      },
      activityShare: 1,
    };
    const selectedApp = {
      ...fullApp,
      energy: 50,
      foregroundSec: 60,
      backgroundSec: 30,
      components: {
        CPU: 30,
        DisplayDynamic: 20,
        "Foreground-CPU": 6,
      },
      activityShare: 0.5,
    };
    const detail = buildAppDetail(
      selectedApp,
      [
        {
          rootId: 1,
          timestamp: 600,
          startOffset: 0,
          endOffset: 900e6,
          energy: 2.5,
        },
        {
          rootId: 2,
          timestamp: 600,
          startOffset: 0,
          endOffset: 900e6,
          energy: 5,
        },
        {
          rootId: 1,
          timestamp: 1500,
          startOffset: 0,
          endOffset: 900e6,
          energy: 2.5,
        },
        {
          rootId: 2,
          timestamp: 1500,
          startOffset: 0,
          endOffset: 900e6,
          energy: 5,
        },
      ],
      [
        { timestamp: 600, durationSec: 900, foregroundSec: 450 },
        { timestamp: 1500, durationSec: 900, foregroundSec: 900 },
      ],
      [
        { id: 1, name: "CPU" },
        { id: 2, name: "DisplayDynamic" },
      ],
      600,
      3300,
      1_700_000_000_000,
    );
    expect(detail.app.energy).toBe(50);
    expect(detail.components).toEqual([
      { key: "CPU", energy: 30 },
      { key: "DisplayDynamic", energy: 20 },
    ]);
    expect(detail.points).toHaveLength(3);
    expect(detail.points[0].energy).toBeCloseTo(25);
    expect(detail.points[0].foregroundSec).toBe(450);
    expect(detail.points[1].foregroundSec).toBe(900);
    expect(detail.points[0].ts).toBe(1_700_000_600_000);
    expect(detail.points[2].energy).toBe(0);
    expect(
      detail.components.reduce((sum, component) => sum + component.energy, 0),
    ).toBeCloseTo(detail.app.energy);
    expect(
      detail.points.reduce((sum, point) => sum + point.energy, 0),
    ).toBeCloseTo(detail.app.energy);
  });

  it("splits interval energy across buckets and exposes the remainder", () => {
    const app = {
      name: "Maps",
      bundleId: "com.apple.Maps",
      energy: 30,
      foregroundSec: 0,
      backgroundSec: 0,
      components: { CPU: 18 },
      activityShare: 1,
    };
    const detail = buildAppDetail(
      app,
      [
        {
          rootId: 1,
          timestamp: 1200,
          startOffset: 0,
          endOffset: 1800e6,
          energy: 3,
        },
        {
          rootId: 1,
          timestamp: 3000,
          startOffset: 0,
          endOffset: 0,
          energy: 99,
        },
      ],
      [],
      [{ id: 1, name: "CPU" }],
      600,
      3300,
      1_700_000_000_000,
    );
    expect(detail.components).toEqual([
      { key: "CPU", energy: 18 },
      { key: "Other", energy: 12 },
    ]);
    expect(detail.points.map((point) => point.energy)).toEqual([5, 15, 10]);
    expect(detail.points[0].components).toEqual({ CPU: 3, Other: 2 });
    expect(detail.points[1].components).toEqual({ CPU: 9, Other: 6 });
    expect(detail.points[2].components).toEqual({ CPU: 6, Other: 4 });
    expect(
      detail.components.reduce((sum, component) => sum + component.energy, 0),
    ).toBeCloseTo(detail.app.energy);
    expect(
      detail.points.reduce((sum, point) => sum + point.energy, 0),
    ).toBeCloseTo(detail.app.energy);
  });

  it("builds the main timeline and app overlay from the same calibrated buckets", () => {
    const apps = [
      {
        name: "Maps",
        bundleId: "com.apple.Maps",
        energy: 30,
        foregroundSec: 0,
        backgroundSec: 0,
        components: { CPU: 18, DisplayDynamic: 12 },
        activityShare: 1,
      },
      {
        name: "Mail",
        bundleId: "com.apple.mobilemail",
        energy: 10,
        foregroundSec: 0,
        backgroundSec: 0,
        components: { CPU: 10, DisplayDynamic: 0 },
        activityShare: 1,
      },
    ];
    const result = buildEnergyTimeline(
      apps,
      [
        {
          appKey: "com.apple.Maps",
          rootId: 1,
          timestamp: 600,
          startOffset: 0,
          endOffset: 900e6,
          energy: 3,
        },
        {
          appKey: "com.apple.Maps",
          rootId: 2,
          timestamp: 600,
          startOffset: 0,
          endOffset: 900e6,
          energy: 2,
        },
        {
          appKey: "com.apple.mobilemail",
          rootId: 1,
          timestamp: 600,
          startOffset: 0,
          endOffset: 900e6,
          energy: 1,
        },
      ],
      [
        { id: 1, name: "CPU" },
        { id: 2, name: "DisplayDynamic" },
      ],
      600,
      1500,
      1_700_000_000_000,
    );
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0].energy).toBeCloseTo(40);
    expect(result.timeline[0].components).toEqual({
      CPU: 28,
      DisplayDynamic: 12,
    });
    expect(result.appSeries["com.apple.Maps"][0].energy).toBeCloseTo(30);
    expect(result.appSeries["com.apple.mobilemail"][0].energy).toBeCloseTo(10);
  });
});
