import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type ArchiveEntry, inferSysdiagnoseCaptureTime } from "../../lib";
import type { FsckRun, StorageVolume } from "./storage-data";
import { extractStorageArtifacts } from "./storage-data";
import { VolumeDetailSheet } from "./volume-detail-sheet";

function captureLabel(entries: ArchiveEntry[]): string {
  const time = inferSysdiagnoseCaptureTime(entries, 0);
  return time > 0 ? new Date(time).toLocaleString() : "Unavailable";
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function RawSource({ children, label }: { children: string; label: string }) {
  return (
    <details className="mt-3 rounded-md border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {label}
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t p-3 font-mono text-xs text-muted-foreground">
        {children}
      </pre>
    </details>
  );
}

function fileProviderSourceLabel(path: string): string {
  const marker = "/FileProvider/";
  const index = path.lastIndexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) : path;
}

export function StorageTab({ entries }: { entries: ArchiveEntry[] }) {
  const artifacts = useMemo(() => extractStorageArtifacts(entries), [entries]);
  const captureTime = useMemo(() => captureLabel(entries), [entries]);
  const [selectedVolume, setSelectedVolume] = useState<StorageVolume | null>(
    null,
  );
  const checksByVolume = useMemo(() => {
    const checks = new Map<string, FsckRun[]>();
    for (const check of artifacts.fsck.runs) {
      const matching = checks.get(check.device) ?? [];
      matching.push(check);
      checks.set(check.device, matching);
    }
    return checks;
  }, [artifacts.fsck.runs]);
  const selectedChecks = selectedVolume
    ? (checksByVolume.get(selectedVolume.filesystem) ?? [])
    : [];
  return (
    <section
      data-testid="storage-tab"
      className="h-full space-y-5 overflow-y-auto px-4 pb-8 sm:px-6"
    >
      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">Volumes</CardTitle>
          <p className="text-xs text-muted-foreground">
            Capture time: {captureTime}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {artifacts.volumes.length === 0 ? (
            <div className="px-4 pb-4">
              <Empty>
                `disks.txt` was not found or did not match the expected volume
                table.
              </Empty>
            </div>
          ) : (
            <Table
              aria-label="Mounted volumes at capture"
              className="table-fixed"
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[27%] pl-4">Filesystem</TableHead>
                  <TableHead className="w-[9%] text-right">Total</TableHead>
                  <TableHead className="w-[9%] text-right">Used</TableHead>
                  <TableHead className="w-[9%] text-right">Available</TableHead>
                  <TableHead className="w-[9%] text-right">Capacity</TableHead>
                  <TableHead className="w-[22%]">Mount point</TableHead>
                  <TableHead className="w-[15%] pr-4">Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artifacts.volumes.map((volume) => {
                  const checks = checksByVolume.get(volume.filesystem) ?? [];
                  const latest = checks.at(-1);
                  const health = latest
                    ? latest.status === "ok"
                      ? "OK"
                      : "Unclassified"
                    : "Not checked";
                  return (
                    <TableRow
                      key={`${volume.filesystem}:${volume.mountPoint}`}
                      tabIndex={0}
                      aria-label={`View ${volume.filesystem} details`}
                      aria-selected={selectedVolume === volume}
                      className="cursor-pointer aria-selected:bg-muted/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => setSelectedVolume(volume)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedVolume(volume);
                        }
                      }}
                    >
                      <TableCell className="pl-4 font-mono text-xs">
                        <span
                          className="block truncate"
                          title={volume.filesystem}
                        >
                          {volume.filesystem}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {volume.total}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {volume.used}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {volume.available}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {volume.capacity}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span
                          className="block truncate"
                          title={volume.mountPoint}
                        >
                          {volume.mountPoint}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`pr-4 text-sm ${latest?.status === "ok" ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
                      >
                        <span className="block truncate">{health}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">Write-pressure events</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {artifacts.writeEvents.length === 0 ? (
            <Empty>
              No recognized `diskwrites_resource` reports were found.
            </Empty>
          ) : (
            <div className="space-y-2">
              {artifacts.writeEvents.map((event) => (
                <details key={event.source} className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{event.process}</span>
                    {" · "}
                    {event.incidentTime}
                    {" · "}
                    {event.reportType}
                  </summary>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    {event.source}
                  </p>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                    {event.raw}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">APFS counters</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {artifacts.apfs.raw === null ? (
            <Empty>`apfs_stats.txt` was not found in this archive.</Empty>
          ) : artifacts.apfs.sections.length === 0 ? (
            <>
              <Empty>
                The APFS stats file was found, but no `name = value` counters
                were recognized.
              </Empty>
              <RawSource label="Raw apfs_stats.txt">
                {artifacts.apfs.raw}
              </RawSource>
            </>
          ) : (
            <>
              {artifacts.apfs.sections.map((section) => (
                <details key={section.name} className="mb-3 rounded-md border">
                  <summary className="cursor-pointer px-3 py-2 font-mono text-xs font-medium">
                    {section.name}
                  </summary>
                  <Table aria-label={`${section.name} APFS counters`}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Counter</TableHead>
                        <TableHead>Raw value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.counters.map((counter) => (
                        <TableRow key={`${counter.name}:${counter.value}`}>
                          <TableCell className="font-mono text-xs">
                            {counter.name}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {counter.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              ))}
              <RawSource label="Complete raw apfs_stats.txt">
                {artifacts.apfs.raw}
              </RawSource>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">File Provider diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {artifacts.fileProvider.sources.length === 0 ? (
            <Empty>
              No File Provider diagnostics were found in this archive.
            </Empty>
          ) : (
            <>
              <p className="text-sm">
                {artifacts.fileProvider.sources.length} source file
                {artifacts.fileProvider.sources.length === 1 ? "" : "s"}
                {artifacts.fileProvider.providers.length > 0
                  ? ` · ${artifacts.fileProvider.providers.length} provider${artifacts.fileProvider.providers.length === 1 ? "" : "s"}`
                  : ""}
              </p>
              {artifacts.fileProvider.findings.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {artifacts.fileProvider.findings.map((finding) => (
                    <li
                      key={`${finding.source}:${finding.text}`}
                      className={
                        finding.status === "fail"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground"
                      }
                    >
                      {finding.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>
                  No marked check-result lines were recognized; inspect the raw
                  sources below.
                </Empty>
              )}
              {artifacts.fileProvider.providers.length > 0 ? (
                <details className="mt-3 rounded-md border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                    Providers ({artifacts.fileProvider.providers.length})
                  </summary>
                  <ul className="space-y-1 border-t p-3 font-mono text-xs text-muted-foreground">
                    {artifacts.fileProvider.providers.map((provider) => (
                      <li key={provider}>{provider}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <details className="mt-3 rounded-md border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                  Source files ({artifacts.fileProvider.sources.length})
                </summary>
                <div className="space-y-2 border-t p-3">
                  {artifacts.fileProvider.sources.map((source) => (
                    <RawSource
                      key={source.path}
                      label={fileProviderSourceLabel(source.path)}
                    >
                      {source.raw}
                    </RawSource>
                  ))}
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      <VolumeDetailSheet
        volume={selectedVolume}
        checks={selectedChecks}
        onOpenChange={(open) => {
          if (!open) setSelectedVolume(null);
        }}
      />
    </section>
  );
}
