import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  WifiAnalysis,
  WifiEvidence,
} from "@/workers/sysdiagnose-wifi/analysis";

function timestamp(value: number | null): string {
  if (value === null) return "Timestamp unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(value);
}

function range(value: { startMs: number; endMs: number } | null): string {
  return value
    ? `${timestamp(value.startMs)} – ${timestamp(value.endMs)}`
    : "No validated records";
}

function EvidenceButton({
  evidence,
  onOpen,
}: {
  evidence: WifiEvidence[];
  onOpen: (evidence: WifiEvidence[]) => void;
}) {
  return (
    <Button size="sm" variant="plain" onClick={() => onOpen(evidence)}>
      Evidence ({evidence.length})
    </Button>
  );
}

function SnapshotFields({
  fields,
  labels,
}: {
  fields: Record<string, string>;
  labels: string[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {labels.flatMap((label) => {
        const value = fields[label];
        return value === undefined
          ? []
          : [
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate font-mono text-sm" title={value}>
                  {value || "Not reported"}
                </dd>
              </div>,
            ];
      })}
    </dl>
  );
}

export function WifiTab({ analysis }: { analysis: WifiAnalysis | null }) {
  const [selected, setSelected] = useState<WifiEvidence[] | null>(null);
  const timeline = useMemo(
    () =>
      [...(analysis?.events ?? [])].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)),
    [analysis],
  );
  if (!analysis)
    return (
      <section className="px-4 sm:px-6">
        <h2 className="text-base font-semibold">WiFi</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          WiFi analysis was not returned for this archive.
        </p>
      </section>
    );
  if (!analysis.available)
    return (
      <section className="px-4 sm:px-6">
        <h2 className="text-base font-semibold">WiFi</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {analysis.warnings[0] ?? "No WiFi diagnostics were found."}
        </p>
      </section>
    );
  const snapshot = analysis.snapshot;
  return (
    <section className="h-full overflow-y-auto px-4 pb-8 sm:px-6">
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold">WiFi diagnostics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            All information is analyzed locally from this sysdiagnose archive.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Observed history</CardTitle>
            <CardDescription>
              Connection events observed {range(analysis.eventRange)}. BSS
              observations span {range(analysis.bssRange)}. These are
              retained-log windows, not a statement that no issue occurred
              outside them.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Wi-Fi at capture</CardTitle>
              <CardDescription>
                Snapshot captured {timestamp(analysis.captureMs)}; it is not
                live device state.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {snapshot ? (
                <SnapshotFields
                  fields={snapshot.fields}
                  labels={[
                    "Power",
                    "Op Mode",
                    "Interface Name",
                    "SSID",
                    "BSSID",
                    "Security",
                    "IPv4 Config Method",
                    "IPv4 Address",
                    "IPv4 Router",
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  wifi_status.txt was not available.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Link details</CardTitle>
              <CardDescription>
                Named values from wifi_status.txt at capture time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {snapshot ? (
                <SnapshotFields
                  fields={snapshot.fields}
                  labels={[
                    "RSSI",
                    "Noise",
                    "Tx Rate",
                    "Channel",
                    "PHY Mode",
                    "MCS Index",
                    "Guard Interval",
                    "NSS",
                    "Country Code",
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {analysis.connectivity.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Connectivity checks at capture
              </CardTitle>
              <CardDescription>
                These checks are a capture-time snapshot and do not identify
                captive portals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2 text-sm">
                {analysis.connectivity.map((check) => (
                  <li
                    key={check.label}
                    className={`rounded-full border px-3 py-1 ${check.passed ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/10"}`}
                  >
                    {check.label}: {check.passed ? "passed" : "failed"}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Findings</CardTitle>
            <CardDescription>
              Deterministic rules cite the exact records that triggered them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No v1 WiFi finding was triggered in the observed records.
              </p>
            ) : (
              <ul className="space-y-3">
                {analysis.findings.map((finding) => (
                  <li
                    key={finding.id}
                    className="flex items-start justify-between gap-4 rounded-md border p-3"
                  >
                    <div>
                      <div className="font-medium">{finding.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {finding.detail}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {timestamp(finding.ts)}
                      </div>
                    </div>
                    <EvidenceButton
                      evidence={finding.evidence}
                      onOpen={setSelected}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connection timeline</CardTitle>
            <CardDescription>
              Join, leave, roam, recovery, and fault records only.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {timeline.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No lifecycle records were found.
              </p>
            ) : (
              <Table aria-label="WiFi connection timeline">
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeline.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {timestamp(event.ts)}
                      </TableCell>
                      <TableCell className="capitalize">{event.kind}</TableCell>
                      <TableCell
                        className="max-w-64 truncate font-mono text-xs"
                        title={
                          event.evidence.fields.status ||
                          event.evidence.fields.reason
                        }
                      >
                        {event.evidence.fields.status ||
                          event.evidence.fields.reason ||
                          event.evidence.fields.type ||
                          "—"}
                      </TableCell>
                      <TableCell>
                        <EvidenceButton
                          evidence={[event.evidence]}
                          onOpen={setSelected}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Networks and BSS observations
            </CardTitle>
            <CardDescription>
              Scan observations are not treated as connection history or
              location evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <Table aria-label="WiFi network observations">
              <TableHeader>
                <TableRow>
                  <TableHead>SSID</TableHead>
                  <TableHead>BSSID</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Band / channel</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.networks.map((network) => (
                  <TableRow key={network.id}>
                    <TableCell
                      className="max-w-40 truncate font-mono text-xs"
                      title={network.ssid ?? undefined}
                    >
                      {network.ssid ?? "Not reported"}
                    </TableCell>
                    <TableCell
                      className="max-w-40 truncate font-mono text-xs"
                      title={network.bssids.join(", ")}
                    >
                      {network.bssids.join(", ") || "Not reported"}
                    </TableCell>
                    <TableCell>{network.eventCount}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {timestamp(network.lastSeenMs)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {[network.bands.join(", "), network.channels.join(", ")]
                        .filter(Boolean)
                        .join(" / ") || "—"}
                    </TableCell>
                    <TableCell>
                      <EvidenceButton
                        evidence={network.evidence}
                        onOpen={setSelected}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {analysis.warnings.length > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="font-medium">Some WiFi data was unavailable</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              {analysis.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>WiFi source records</SheetTitle>
            <SheetDescription>
              Original fields from the local archive. Identifiers are shown as
              stored.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto font-mono text-xs">
            {selected?.map((evidence) => (
              <article
                key={`${evidence.source}:${evidence.row}`}
                className="rounded-md border p-3"
              >
                <div className="mb-2 break-all text-muted-foreground">
                  {evidence.source}
                  {evidence.row ? ` · CSV row ${evidence.row}` : ""}
                </div>
                <dl className="space-y-1">
                  {Object.entries(evidence.fields).map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-3"
                    >
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd className="break-all">{value || "(empty)"}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
