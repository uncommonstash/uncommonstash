import {
  queryPowerlogTimeOffsets,
  queryRawAppEnergy,
  queryRawAppRuntime,
  queryRawDeviceEnergy,
} from "./powerlog";

describe("Powerlog SQL adapters", () => {
  it("qualifies root/node columns and extracts end-stamped direct records", () => {
    const calls: string[] = [];
    const query = (sql: string) => {
      calls.push(sql);
      return [
        {
          component: "CPU",
          endSec: 7_200,
          intervalSec: 3_600,
          rawEnergy: 12_000,
        },
      ];
    };
    expect(queryRawDeviceEnergy(query)).toEqual([
      {
        key: "__device__",
        component: "CPU",
        startSec: 3_600,
        endSec: 7_200,
        rawEnergy: 12_000,
      },
    ]);
    expect(calls[0]).toContain("rootEnergy.NodeID = rootEnergy.RootNodeID");
    expect(calls[0]).toContain("rootEnergy.timestamp");
  });

  it("extracts app component and direct foreground/background runtime records", () => {
    let invocation = 0;
    const query = () => {
      invocation += 1;
      return invocation === 1
        ? [
            {
              appKey: "com.example.app",
              component: "DisplayDynamic",
              endSec: 7_200,
              intervalSec: 3_600,
              rawEnergy: 50_000,
            },
          ]
        : [
            {
              appKey: "com.example.app",
              endSec: 7_200,
              intervalSec: 3_600,
              foregroundSec: 12,
              backgroundSec: 34,
            },
          ];
    };
    expect(queryRawAppEnergy(query, ["com.example.app"])[0]).toEqual(
      expect.objectContaining({ startSec: 3_600, rawEnergy: 50_000 }),
    );
    expect(queryRawAppRuntime(query, ["com.example.app"])[0]).toEqual(
      expect.objectContaining({
        startSec: 3_600,
        foregroundSec: 12,
        backgroundSec: 34,
      }),
    );
  });

  it("loads ordered TimeOffset records", () => {
    expect(
      queryPowerlogTimeOffsets(() => [
        { monotonicSec: 10, systemSec: 100 },
        { monotonicSec: 20, systemSec: 200 },
      ]),
    ).toEqual([
      { monotonicSec: 10, systemSec: 100 },
      { monotonicSec: 20, systemSec: 200 },
    ]);
  });
});
