import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  AppEnergyAttributionRow,
  AppIdentity,
  AppRuntimeRow,
  QueryProvenance,
} from "@/workers/sysdiagnose-query/query.protocol";
import { AppIcon } from "./app-icon";
import { SourceStatus } from "./source-status";

function formatInterval({
  startMs,
  endMs,
}: {
  startMs: number;
  endMs: number;
}) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startMs))}–${formatter.format(
    new Date(endMs),
  )}`;
}

function DirectRowsEmpty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm text-muted-foreground">{children}</p>;
}

export function AppDetailSheet({
  app,
  artworkUrl,
  energyRows,
  runtimeRows,
  energyProvenance,
  runtimeProvenance,
  onOpenChange,
}: {
  app: AppIdentity | null;
  artworkUrl?: string;
  energyRows: AppEnergyAttributionRow[];
  runtimeRows: AppRuntimeRow[];
  energyProvenance?: QueryProvenance;
  runtimeProvenance?: QueryProvenance;
  onOpenChange: (open: boolean) => void;
}) {
  const appEnergyRows = app
    ? energyRows.filter((row) => row.consumerNode.name === app.bundleId)
    : [];
  const appRuntimeRows = app
    ? runtimeRows.filter((row) => row.bundleId === app.bundleId)
    : [];

  return (
    <Sheet open={Boolean(app)} onOpenChange={onOpenChange}>
      {app ? (
        <SheetContent className="gap-6 overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <div className="flex items-center gap-3 pr-8">
              <AppIcon
                name={app.name}
                bundleId={app.bundleId}
                artworkUrl={artworkUrl}
              />
              <div>
                <SheetTitle>{app.name}</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {app.bundleId}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              Direct Powerlog attribution records
            </h3>
            <SourceStatus provenance={energyProvenance} />
            {appEnergyRows.length === 0 ? (
              <DirectRowsEmpty>
                No attribution source rows for this app in the selected range.
              </DirectRowsEmpty>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Interval</th>
                      <th className="px-3 py-2 font-medium">Root node</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Raw energy (uWh)
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Energy (mWh)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {appEnergyRows.map((row) => (
                      <tr
                        key={`${row.interval.startMs}-${row.interval.endMs}-${row.rootNode.id}`}
                        className="border-b last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {formatInterval(row.interval)}
                        </td>
                        <td className="px-3 py-2">
                          {row.rootNode.name}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            #{row.rootNode.id}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.rawEnergy.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {(row.rawEnergy * 0.001).toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Direct AppRunTime records</h3>
            <SourceStatus provenance={runtimeProvenance} />
            {appRuntimeRows.length === 0 ? (
              <DirectRowsEmpty>
                No runtime source rows for this app in the selected range.
              </DirectRowsEmpty>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Interval</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Foreground (s)
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Background (s)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {appRuntimeRows.map((row) => (
                      <tr
                        key={`${row.interval.startMs}-${row.interval.endMs}`}
                        className="border-b last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {formatInterval(row.interval)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.foregroundSec.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.backgroundSec.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
