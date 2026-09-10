import { useMemo } from "react";
import type { AppIdentity } from "@/workers/sysdiagnose-query/query.protocol";
import type { BatteryPlistData } from "../../lib";
import { AppTable } from "./components/app-table";
import { ComponentTotalsChart } from "./components/component-totals-chart";
import {
  isAppEnergyAttributionRow,
  isAppRuntimeRow,
  isComponentTotalRow,
} from "./query-row-guards";
import { usePowerlogQuery, useQueryStore } from "./query-store";

export function EnergyOverview({ battery }: { battery: BatteryPlistData }) {
  const { state } = useQueryStore();
  const apps = useMemo<AppIdentity[]>(
    () =>
      battery.apps
        .filter((app) => Boolean(app.bundleId))
        .map((app) => ({ bundleId: app.bundleId, name: app.name })),
    [battery.apps],
  );
  const components = usePowerlogQuery(
    useMemo(
      () => ({
        kind: "root-node-component-totals" as const,
        range: state.range,
      }),
      [state.range],
    ),
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
      {components.state === "error" ? (
        <p className="text-sm text-destructive">
          Energy component data is unavailable.
        </p>
      ) : (
        <ComponentTotalsChart
          rows={
            components.state === "ready"
              ? components.result.rows.filter(isComponentTotalRow)
              : []
          }
          provenance={
            components.state === "ready"
              ? components.result.provenance
              : undefined
          }
        />
      )}
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
