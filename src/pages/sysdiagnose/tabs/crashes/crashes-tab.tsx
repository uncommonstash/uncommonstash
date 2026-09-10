import { AlertTriangle, FileWarning, Layers3 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { ArchiveEntry } from "../../lib";
import {
  buildCrashRecords,
  CRASH_CLASS_LABELS,
  type CrashGroup,
  type CrashRecord,
  type CrashReportClass,
  groupCrashRecords,
  redactCrashRaw,
} from "./crash-model";

type Facet = "all" | CrashReportClass;
type View = "events" | "groups";

const FACETS: Array<{ id: Facet; label: string }> = [
  { id: "all", label: "All" },
  { id: "app-crash", label: "App crash" },
  { id: "jetsam", label: "Jetsam" },
  { id: "cpu-resource", label: "CPU resource" },
  { id: "disk-write-resource", label: "Disk-write resource" },
  { id: "panic", label: "Panic" },
  { id: "unclassified", label: "Unclassified" },
];

function formatTime(time: number | null): string {
  if (time === null) return "No incident time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(time);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

function ClassPill({ reportClass }: { reportClass: CrashReportClass }) {
  const color =
    reportClass === "panic"
      ? "bg-destructive/15 text-destructive"
      : reportClass === "jetsam"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
        : reportClass === "unclassified"
          ? "bg-secondary text-muted-foreground"
          : "bg-primary/10 text-primary";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {CRASH_CLASS_LABELS[reportClass]}
    </span>
  );
}

export function CrashesTab({ entries }: { entries: ArchiveEntry[] }) {
  const [facet, setFacet] = useState<Facet>("all");
  const [view, setView] = useState<View>("events");
  const [selectedReport, setSelectedReport] = useState<CrashRecord | null>(
    null,
  );
  const [selectedGroup, setSelectedGroup] = useState<CrashGroup | null>(null);
  const records = useMemo(() => buildCrashRecords(entries), [entries]);
  const groups = useMemo(() => groupCrashRecords(records), [records]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FACETS.map(({ id }) => [
          id,
          id === "all"
            ? records.length
            : records.filter((record) => record.reportClass === id).length,
        ]),
      ) as Record<Facet, number>,
    [records],
  );
  const filteredRecords =
    facet === "all"
      ? records
      : records.filter((record) => record.reportClass === facet);
  const filteredGroups =
    facet === "all"
      ? groups
      : groups.filter((group) => group.reports[0]?.reportClass === facet);
  const hasPanic = counts.panic > 0;

  const openReport = (report: CrashRecord) => {
    setSelectedGroup(null);
    setSelectedReport(report);
  };
  const openGroup = (group: CrashGroup) => {
    setSelectedGroup(group);
    setSelectedReport(group.reports[0] ?? null);
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-4"
      data-testid="crashes-tab"
    >
      <div className="shrink-0 space-y-3 px-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Crashes</h2>
            <p className="text-xs text-muted-foreground">
              {records.length.toLocaleString()} report
              {records.length === 1 ? "" : "s"} collected from crashes_and_spins
            </p>
          </div>
          <div
            role="group"
            aria-label="Crashes view"
            className="inline-flex items-center gap-1 rounded-md border p-0.5"
          >
            <Button
              size="sm"
              variant={view === "events" ? "default" : "plain"}
              onClick={() => setView("events")}
              aria-pressed={view === "events"}
            >
              Events
            </Button>
            <Button
              size="sm"
              variant={view === "groups" ? "default" : "plain"}
              onClick={() => setView("groups")}
              aria-pressed={view === "groups"}
            >
              Groups
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <p>
              Jetsam is an OS memory-pressure termination, not necessarily an
              app crash. Resource-exception and panic reports record a reported
              condition, not a root-cause diagnosis.{" "}
              {hasPanic
                ? "Kernel panic report(s) were captured."
                : "No captured kernel panic report in this archive; this does not establish that the device did not reboot."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Crash report facets">
          {FACETS.map(({ id, label }) => (
            <Button
              key={id}
              size="sm"
              variant={facet === id ? "secondary" : "outline"}
              onClick={() => setFacet(id)}
              aria-pressed={facet === id}
            >
              {label} {counts[id]}
            </Button>
          ))}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="px-4 py-10 text-sm text-muted-foreground sm:px-6">
          No `crashes_and_spins/*.ips` reports were found in this archive.
        </div>
      ) : view === "events" ? (
        <EventTable records={filteredRecords} onOpen={openReport} />
      ) : (
        <GroupTable groups={filteredGroups} onOpen={openGroup} />
      )}

      <CrashDetailSheet
        report={selectedReport}
        group={selectedGroup}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedReport(null);
            setSelectedGroup(null);
          }
        }}
        onSelectGroupReport={setSelectedReport}
      />
    </section>
  );
}

function EventTable({
  records,
  onOpen,
}: {
  records: CrashRecord[];
  onOpen: (report: CrashRecord) => void;
}) {
  return (
    <ScrollArea
      type="always"
      className="min-h-0 flex-1 border-y"
      orientation="both"
    >
      <table className="w-full min-w-[720px] text-sm" aria-label="Crash events">
        <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-3 font-medium sm:px-6">Incident time</th>
            <th className="px-2 py-3 font-medium">Report class</th>
            <th className="px-2 py-3 font-medium">Process / bundle</th>
            <th className="px-4 py-3 font-medium sm:px-6">
              Termination / exception
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((report) => (
            <tr
              key={report.sourcePath}
              tabIndex={0}
              className="cursor-pointer border-b align-top hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => onOpen(report)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onOpen(report);
              }}
            >
              <td className="whitespace-nowrap px-4 py-3 text-xs sm:px-6">
                {formatTime(report.incidentTime)}
              </td>
              <td className="px-2 py-3">
                <ClassPill reportClass={report.reportClass} />
              </td>
              <td className="max-w-72 px-2 py-3">
                <div className="truncate font-medium">
                  {report.process ?? report.sourceLabel}
                </div>
                {report.bundleId ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {report.bundleId}
                  </div>
                ) : !report.process ? (
                  <div className="truncate text-xs text-muted-foreground">
                    Report source (not a process)
                  </div>
                ) : null}
              </td>
              <td className="max-w-96 px-4 py-3 text-xs text-muted-foreground sm:px-6">
                {report.condition}
              </td>
            </tr>
          ))}
          {records.length === 0 ? <EmptyRow colSpan={4} /> : null}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function GroupTable({
  groups,
  onOpen,
}: {
  groups: CrashGroup[];
  onOpen: (group: CrashGroup) => void;
}) {
  return (
    <ScrollArea
      type="always"
      className="min-h-0 flex-1 border-y"
      orientation="both"
    >
      <table
        className="w-full min-w-[720px] text-sm"
        aria-label="Crash recurrence groups"
      >
        <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-4 py-3 font-medium sm:px-6">Latest incident</th>
            <th className="px-2 py-3 font-medium">Class</th>
            <th className="px-2 py-3 font-medium">Recurrence fingerprint</th>
            <th className="px-4 py-3 text-right font-medium sm:px-6">
              Reports
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const latest = group.reports[0];
            if (!latest) return null;
            return (
              <tr
                key={group.key}
                tabIndex={0}
                className="cursor-pointer border-b align-top hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => onOpen(group)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onOpen(group);
                }}
              >
                <td className="whitespace-nowrap px-4 py-3 text-xs sm:px-6">
                  {formatTime(group.latestIncidentTime)}
                </td>
                <td className="px-2 py-3">
                  <ClassPill reportClass={latest.reportClass} />
                </td>
                <td className="max-w-[34rem] px-2 py-3 text-xs text-muted-foreground">
                  {group.explanation}
                </td>
                <td className="px-4 py-3 text-right font-medium sm:px-6">
                  {group.reports.length}
                </td>
              </tr>
            );
          })}
          {groups.length === 0 ? <EmptyRow colSpan={4} /> : null}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-10 text-center text-sm text-muted-foreground"
      >
        No reports match this facet.
      </td>
    </tr>
  );
}

function CrashDetailSheet({
  report,
  group,
  onOpenChange,
  onSelectGroupReport,
}: {
  report: CrashRecord | null;
  group: CrashGroup | null;
  onOpenChange: (open: boolean) => void;
  onSelectGroupReport: (report: CrashRecord) => void;
}) {
  const [redactIdentifiers, setRedactIdentifiers] = useState(true);
  const [redactPaths, setRedactPaths] = useState(true);
  if (!report) return null;
  const victimMemory =
    report.jetsam?.pageSize && report.jetsam.victimPages !== undefined
      ? report.jetsam.pageSize * report.jetsam.victimPages
      : null;
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-3 p-0 sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b px-6 pb-4 pt-6">
          <SheetTitle className="pr-8">
            {report.process ?? report.sourceLabel}
          </SheetTitle>
          <SheetDescription>
            {formatTime(report.incidentTime)} ·{" "}
            {CRASH_CLASS_LABELS[report.reportClass]}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-6 pb-6" type="always">
          <div className="space-y-5 pr-3">
            {group ? (
              <div className="rounded-md border bg-secondary/30 p-3 text-xs">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <Layers3 className="h-4 w-4" /> Recurrence group ·{" "}
                  {group.reports.length} reports
                </div>
                <p className="text-muted-foreground">
                  Grouping key: {group.explanation}. All original reports remain
                  available below.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.reports.map((member) => (
                    <Button
                      key={member.sourcePath}
                      size="sm"
                      variant={
                        member.sourcePath === report.sourcePath
                          ? "secondary"
                          : "outline"
                      }
                      onClick={() => onSelectGroupReport(member)}
                    >
                      {formatTime(member.incidentTime)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Condition</dt>
              <dd>{report.condition}</dd>
              <dt className="text-muted-foreground">Process</dt>
              <dd className="break-all">
                {report.process ?? "Not reported by this report"}
              </dd>
              {!report.process ? (
                <>
                  <dt className="text-muted-foreground">Report source</dt>
                  <dd className="break-all">{report.sourceLabel}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Bundle</dt>
              <dd className="break-all">{report.bundleId ?? "Not reported"}</dd>
              <dt className="text-muted-foreground">Classification</dt>
              <dd>{report.classificationEvidence}</dd>
              {report.subtype ? (
                <>
                  <dt className="text-muted-foreground">Subtype</dt>
                  <dd>{report.subtype}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Source file</dt>
              <dd className="break-all font-mono text-xs">
                {redactPaths ? "[redacted-path]" : report.sourcePath}
              </dd>
            </dl>

            {report.reportClass === "jetsam" ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <FileWarning className="h-4 w-4" /> Jetsam details
                </div>
                <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Largest process</dt>
                  <dd>{report.jetsam?.largestProcess ?? "Not reported"}</dd>
                  <dt className="text-muted-foreground">Memory page size</dt>
                  <dd>
                    {report.jetsam?.pageSize
                      ? formatBytes(report.jetsam.pageSize)
                      : "Not reported"}
                  </dd>
                  <dt className="text-muted-foreground">
                    Jettisoned process memory
                  </dt>
                  <dd>
                    {victimMemory === null
                      ? "Not reported"
                      : `${formatBytes(victimMemory)} (${report.jetsam?.victimPages?.toLocaleString()} pages)`}
                  </dd>
                </dl>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border p-3 text-xs">
              <label className="flex items-center gap-2">
                <Switch
                  checked={redactIdentifiers}
                  onCheckedChange={setRedactIdentifiers}
                  aria-label="Redact identifiers"
                />{" "}
                Redact identifiers
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={redactPaths}
                  onCheckedChange={setRedactPaths}
                  aria-label="Redact filesystem paths"
                />{" "}
                Redact filesystem paths
              </label>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Raw report</h3>
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-secondary/30 p-3 font-mono text-xs leading-5">
                {redactCrashRaw(report.raw, {
                  identifiers: redactIdentifiers,
                  paths: redactPaths,
                })}
              </pre>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
