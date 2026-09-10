import { extractDirectPowerlog } from "./extraction";
import type { PowerlogQueryRows } from "./powerlog";

describe("worker Powerlog extraction", () => {
  it("extracts a direct app total and root timeline from raw SQL rows", () => {
    const queryRows: PowerlogQueryRows = (sql) => {
      if (sql.includes("PLStorageOperator_EventForward_TimeOffset")) {
        return [{ monotonicSec: 10_000, systemSec: 1_700_000_000 }];
      }
      if (sql.includes("rootEnergy.NodeID = rootEnergy.RootNodeID")) {
        return [
          {
            component: "CPU",
            endSec: 13_600,
            intervalSec: 3_600,
            rawEnergy: 5_000_000,
          },
        ];
      }
      if (sql.includes("PLAccountingOperator_Aggregate_RootNodeEnergy")) {
        return [
          {
            appKey: "com.facebook.stellaapp",
            component: "CPU",
            endSec: 13_600,
            intervalSec: 3_600,
            rawEnergy: 4_350_330,
          },
        ];
      }
      if (sql.includes("PLAppTimeService_Aggregate_AppRunTime")) {
        return [
          {
            appKey: "com.facebook.stellaapp",
            endSec: 13_600,
            intervalSec: 3_600,
            foregroundSec: 137,
            backgroundSec: 4,
          },
        ];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    };
    const snapshot = extractDirectPowerlog(queryRows, [
      {
        name: "Meta AI",
        bundleId: "com.facebook.stellaapp",
        energy: 0,
        foregroundSec: 0,
        backgroundSec: 0,
      },
    ]);
    expect(snapshot.deviceIntervals).toEqual([
      expect.objectContaining({ energy: 5000, component: "CPU" }),
    ]);
    expect(snapshot.appIntervals).toEqual([
      expect.objectContaining({
        energy: 4350.33,
        key: "com.facebook.stellaapp",
      }),
    ]);
    expect(snapshot.runtimeIntervals).toEqual([
      expect.objectContaining({ foregroundSec: 137, backgroundSec: 4 }),
    ]);
  });
});
