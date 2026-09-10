import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { FsckRun, StorageVolume } from "./storage-data";

export function VolumeDetailSheet({
  volume,
  checks,
  onOpenChange,
}: {
  volume: StorageVolume | null;
  checks: FsckRun[];
  onOpenChange: (open: boolean) => void;
}) {
  const orderedChecks = [...checks].reverse();
  return (
    <Sheet open={Boolean(volume)} onOpenChange={onOpenChange}>
      {volume ? (
        <SheetContent className="gap-6 overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle className="break-all font-mono text-base">
              {volume.filesystem}
            </SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {volume.mountPoint}
            </SheetDescription>
          </SheetHeader>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Filesystem checks</h3>
            {orderedChecks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No fsck_apfs checks in this archive match this mounted volume.
              </p>
            ) : (
              <div className="space-y-2">
                {orderedChecks.map((check) => (
                  <details key={check.raw} className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm">
                      <span
                        className={
                          check.status === "ok"
                            ? "font-medium text-emerald-700 dark:text-emerald-400"
                            : "font-medium text-muted-foreground"
                        }
                      >
                        {check.status === "ok" ? "OK" : "Unclassified"}
                      </span>
                      {" · "}
                      {check.completed ?? check.started}
                    </summary>
                    <p className="mt-2 font-mono text-xs">
                      {check.resultText ??
                        "No exact fsck_apfs result grammar was found in this run."}
                    </p>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                      {check.raw}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </section>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
