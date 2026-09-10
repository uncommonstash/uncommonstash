import { useMemo } from "react";
import type { BatteryPlistData } from "../../lib";
import type { AppIdentity, ComponentTotalRow } from "@/workers/sysdiagnose-query/query.protocol";
import { usePowerlogQuery, useQueryStore } from "./query-store";
import { AppTable } from "./components/app-table";
import { ComponentTotalsChart } from "./components/component-totals-chart";

export function EnergyOverview({ battery }: { battery: BatteryPlistData }) {
  const { state } = useQueryStore();
  const apps = useMemo<AppIdentity[]>(() => battery.apps.filter((app) => Boolean(app.bundleId)).map((app) => ({ bundleId: app.bundleId, name: app.name })), [battery.apps]);
  const components = usePowerlogQuery(useMemo(() => ({ kind: "root-node-component-totals" as const, range: state.range }), [state.range]));
  const energy = usePowerlogQuery(useMemo(() => ({ kind: "app-energy-attribution" as const, range: state.range, apps }), [apps, state.range]));
  const runtime = usePowerlogQuery(useMemo(() => ({ kind: "app-runtime" as const, range: state.range, apps }), [apps, state.range]));
  const failure = energy.state === "error" ? energy.message : runtime.state === "error" ? runtime.message : null;
  return <div className="space-y-10">{components.state === "error" ? <p className="text-sm text-destructive">{components.message}</p> : <ComponentTotalsChart rows={components.state === "ready" ? components.result.rows.filter((row): row is ComponentTotalRow => "rootNode" in row && !("consumerNode" in row)) : []} provenance={components.state === "ready" ? components.result.provenance : undefined} />}{failure ? <p className="text-sm text-destructive">{failure}</p> : <AppTable apps={apps} energyRows={energy.state === "ready" ? energy.result.rows.filter((row): row is import("@/workers/sysdiagnose-query/query.protocol").AppEnergyAttributionRow => "consumerNode" in row) : []} runtimeRows={runtime.state === "ready" ? runtime.result.rows.filter((row): row is import("@/workers/sysdiagnose-query/query.protocol").AppRuntimeRow => "bundleId" in row) : []} energyProvenance={energy.state === "ready" ? energy.result.provenance : undefined} runtimeProvenance={runtime.state === "ready" ? runtime.result.provenance : undefined} />}</div>;
}
