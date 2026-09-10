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
      <div className="space-y-6">
        <div className="flex justify-end">
          <div
            role="group"
            aria-label="Battery view"
            className="inline-flex items-center gap-1 rounded-md border p-0.5"
          >
            <Button
              size="sm"
              variant={view === "battery" ? "secondary" : "plain"}
              onClick={() => setView("battery")}
            >
              Battery overview
            </Button>
            <Button
              size="sm"
              variant={view === "energy" ? "secondary" : "plain"}
              onClick={() => setView("energy")}
            >
              Energy overview
            </Button>
          </div>
        </div>
        {view === "battery" ? (
          <BatteryOverview battery={battery} />
        ) : (
          <EnergyOverview battery={battery} />
        )}
      </div>
    </QueryStoreProvider>
  );
}
