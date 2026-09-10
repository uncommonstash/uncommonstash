import { useMemo } from "react";
import type { AppIdentity } from "@/workers/sysdiagnose-query/query.protocol";
import type { BatteryPlistData } from "../../lib";
import { AppTable } from "./components/app-table";
import { BatteryChart } from "./components/battery-chart";
import { isAppEnergyAttributionRow, isAppRuntimeRow } from "./query-row-guards";
import { usePowerlogQuery, useQueryStore } from "./query-store";

export function BatteryOverview({ battery }: { battery: BatteryPlistData }) {
  const { state, setRange } = useQueryStore();
  const apps = useMemo<AppIdentity[]>(
    () =>
      battery.apps
        .filter((app) => Boolean(app.bundleId))
        .map((app) => ({ bundleId: app.bundleId, name: app.name })),
    [battery.apps],
  );
  const energy = usePowerlogQuery(
    useMemo(
      () => ({
        kind: "app-energy-attribution" as const,
        range: state.range,
        apps,
      }),
      [apps, state.range],
    ),
  );
  const runtime = usePowerlogQuery(
    useMemo(
      () => ({ kind: "app-runtime" as const, range: state.range, apps }),
      [apps, state.range],
    ),
  );
  const failure = energy.state === "error" || runtime.state === "error";
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <section className="shrink-0 space-y-2 px-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold">
            Battery level from Battery UI
          </h2>
        </div>
        <BatteryChart
          points={battery.points}
          selectedRange={state.range}
          onRangeChange={setRange}
        />
      </section>
      {failure ? (
        <p className="text-sm text-destructive">
          App activity data is unavailable.
        </p>
      ) : (
        <AppTable
          apps={apps}
          energyRows={
            energy.state === "ready"
              ? energy.result.rows.filter(isAppEnergyAttributionRow)
              : []
          }
          runtimeRows={
            runtime.state === "ready"
              ? runtime.result.rows.filter(isAppRuntimeRow)
              : []
          }
        />
      )}
    </div>
  );
}
