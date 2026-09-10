import * as HoverCard from "@radix-ui/react-hover-card";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AppEnergyAttributionRow,
  AppIdentity,
  AppRuntimeRow,
} from "@/workers/sysdiagnose-query/query.protocol";
import { AppDetailSheet } from "./app-detail-sheet";
import { AppIcon, useAppIcons } from "./app-icon";

export function AppTable({
  apps,
  energyRows,
  runtimeRows,
}: {
  apps: AppIdentity[];
  energyRows: AppEnergyAttributionRow[];
  runtimeRows: AppRuntimeRow[];
}) {
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const appIcons = useAppIcons(apps.map((app) => app.bundleId));
  const energy = new Map<string, number>();
  for (const row of energyRows)
    energy.set(
      row.consumerNode.name,
      (energy.get(row.consumerNode.name) ?? 0) + row.rawEnergy,
    );
  const runtime = new Map<string, AppRuntimeRow>();
  for (const row of runtimeRows) {
    const previous = runtime.get(row.bundleId);
    runtime.set(row.bundleId, {
      ...row,
      foregroundSec: (previous?.foregroundSec ?? 0) + row.foregroundSec,
      backgroundSec: (previous?.backgroundSec ?? 0) + row.backgroundSec,
    });
  }
  const rows = apps
    .map((app) => ({
      app,
      rawEnergy: energy.get(app.bundleId),
      runtime: runtime.get(app.bundleId),
    }))
    .filter((row) => row.rawEnergy !== undefined || row.runtime)
    .sort((left, right) => {
      const energyOrder = (right.rawEnergy ?? 0) - (left.rawEnergy ?? 0);
      if (energyOrder) return energyOrder;

      const leftRuntime =
        (left.runtime?.foregroundSec ?? 0) + (left.runtime?.backgroundSec ?? 0);
      const rightRuntime =
        (right.runtime?.foregroundSec ?? 0) +
        (right.runtime?.backgroundSec ?? 0);
      return (
        rightRuntime - leftRuntime ||
        left.app.name.localeCompare(right.app.name)
      );
    });
  const selectedApp =
    apps.find((app) => app.bundleId === selectedBundleId) ?? null;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0">
        <h3 className="text-base font-semibold">App attribution and runtime</h3>
      </div>
      <ScrollArea
        type="always"
        data-testid="app-table-scroll"
        className="min-h-0 flex-1"
      >
        <Table aria-label="Powerlog app attribution summary">
          <TableCaption className="sr-only">
            Apps sorted by direct Powerlog energy descending, then total
            runtime.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-0">App</TableHead>
              <TableHead className="text-right" aria-sort="descending">
                Energy (mWh)
              </TableHead>
              <TableHead className="text-right">Foreground (min)</TableHead>
              <TableHead className="pr-0 text-right">
                Background (min)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No Powerlog app rows in this range.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ app, rawEnergy, runtime: times }) => (
                <TableRow
                  key={app.bundleId}
                  tabIndex={0}
                  aria-label={`View ${app.name} Powerlog records`}
                  aria-selected={selectedBundleId === app.bundleId}
                  className="cursor-pointer aria-selected:bg-muted/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => setSelectedBundleId(app.bundleId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedBundleId(app.bundleId);
                    }
                  }}
                >
                  <TableCell className="pl-0">
                    <div className="flex items-center gap-2">
                      <AppIcon
                        name={app.name}
                        bundleId={app.bundleId}
                        artworkUrl={appIcons[app.bundleId] || undefined}
                      />
                      <div>
                        <HoverCard.Root openDelay={200} closeDelay={100}>
                          <HoverCard.Trigger asChild>
                            <span className="cursor-default font-medium underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">
                              {app.name}
                            </span>
                          </HoverCard.Trigger>
                          <HoverCard.Portal>
                            <HoverCard.Content
                              role="tooltip"
                              side="top"
                              sideOffset={6}
                              className="z-50 rounded-md border bg-popover px-2.5 py-1.5 font-mono text-[11px] text-popover-foreground shadow-md"
                            >
                              {app.bundleId}
                              <HoverCard.Arrow className="fill-border" />
                            </HoverCard.Content>
                          </HoverCard.Portal>
                        </HoverCard.Root>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rawEnergy === undefined
                      ? "—"
                      : `${(rawEnergy * 0.001).toFixed(2)} mWh`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {times
                      ? `${(times.foregroundSec / 60).toFixed(0)} min`
                      : "—"}
                  </TableCell>
                  <TableCell className="pr-0 text-right tabular-nums">
                    {times
                      ? `${(times.backgroundSec / 60).toFixed(0)} min`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>
      <AppDetailSheet
        app={selectedApp}
        artworkUrl={
          selectedApp ? appIcons[selectedApp.bundleId] || undefined : undefined
        }
        energyRows={energyRows}
        runtimeRows={runtimeRows}
        onOpenChange={(open) => {
          if (!open) setSelectedBundleId(null);
        }}
      />
    </section>
  );
}
