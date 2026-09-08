import { allocateAppsToRange, normalizePowerlogRows } from "./pipeline";

describe("analytics pipeline", () => {
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
      [{ key: "com.apple.Maps", rawEnergy: 4, activitySec: 40 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].energy).toBe(40);
    expect(rows[0].foregroundSec).toBe(24);
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
});
