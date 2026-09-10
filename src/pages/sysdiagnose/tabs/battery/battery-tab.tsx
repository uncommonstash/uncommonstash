import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ArchiveEntry, BatteryPlistData } from "../../lib";
import { BatteryOverview } from "./battery-overview";
import { EnergyOverview } from "./energy-overview";
import { QueryStoreProvider } from "./query-store";

export function BatteryTab({
  battery,
  powerlog,
}: {
  battery: BatteryPlistData | null;
  powerlog: ArchiveEntry | null;
}) {
  const [view, setView] = useState<"battery" | "energy">("battery");
  const initialRange = useMemo(
    () => ({
      startMs: battery?.points[0]?.ts ?? 0,
      endMs: battery?.points.at(-1)?.ts ?? 1,
    }),
    [battery],
  );
  if (!battery)
    return (
      <p className="py-10 text-sm text-muted-foreground">
        BatteryUISysdiagnose.plist was not found in this archive.
      </p>
    );
  return (
    <QueryStoreProvider
      powerlog={powerlog?.data ?? null}
      initialRange={initialRange}
    >
      <div className="flex h-full min-h-0 flex-col gap-6">
        <div className="flex shrink-0 justify-end">
          <div
            role="group"
            aria-label="Battery view"
            className="inline-flex items-center gap-1 rounded-md border p-0.5"
          >
            <Button
              size="sm"
              variant={view === "battery" ? "default" : "plain"}
              onClick={() => setView("battery")}
              aria-pressed={view === "battery"}
            >
              Battery
            </Button>
            <Button
              size="sm"
              variant={view === "energy" ? "default" : "plain"}
              onClick={() => setView("energy")}
              aria-pressed={view === "energy"}
            >
              Energy
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {view === "battery" ? (
            <BatteryOverview battery={battery} />
          ) : (
            <EnergyOverview battery={battery} />
          )}
        </div>
      </div>
    </QueryStoreProvider>
  );
}
