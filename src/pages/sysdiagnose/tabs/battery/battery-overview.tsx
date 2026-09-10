import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { AppIdentity } from "@/workers/sysdiagnose-query/query.protocol";
import type { BatteryPlistData } from "../../lib";
import { AppTable } from "./components/app-table";
import { BatteryChart } from "./components/battery-chart";
import { isAppEnergyAttributionRow, isAppRuntimeRow } from "./query-row-guards";
import { usePowerlogQuery, useQueryStore } from "./query-store";

export function BatteryOverview({ battery }: { battery: BatteryPlistData }) {
  const { state, setRange } = useQueryStore();
  const fullRange = useMemo(
    () => ({
      startMs: battery.points[0]?.ts ?? state.range.startMs,
      endMs: battery.points.at(-1)?.ts ?? state.range.endMs,
    }),
    [battery.points, state.range.endMs, state.range.startMs],
  );
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
  const failure =
    energy.state === "error"
      ? energy.message
      : runtime.state === "error"
        ? runtime.message
        : null;
  const isFullRange =
    state.range.startMs === fullRange.startMs &&
    state.range.endMs === fullRange.endMs;
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <section className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">
              Battery level from Battery UI
            </h2>
            <p className="text-xs text-muted-foreground">
              Curve and app roster source: BatteryUISysdiagnose.plist. Drag
              across the curve to query a range.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRange(fullRange)}
            disabled={isFullRange}
          >
            Reset range
          </Button>
        </div>
        <BatteryChart
          points={battery.points}
          selectedRange={state.range}
          onRangeChange={setRange}
        />
      </section>
      {failure ? (
        <p className="text-sm text-destructive">{failure}</p>
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
