import type { ArchiveEntry } from "../../lib";

export type CrashReportClass =
  | "app-crash"
  | "jetsam"
  | "cpu-resource"
  | "disk-write-resource"
  | "panic"
  | "unclassified";

export interface JetsamDetails {
  largestProcess?: string;
  pageSize?: number;
  victimPages?: number;
}

export interface CrashRecord {
  entry: ArchiveEntry;
  sourcePath: string;
  /** Source artifact stem, never inferred to be a process identity. */
  sourceLabel: string;
  raw: string;
  metadata: Record<string, unknown> | null;
  body: Record<string, unknown> | null;
  incidentTime: number | null;
  reportClass: CrashReportClass;
  subtype?: string;
  process?: string;
  bundleId?: string;
  condition: string;
  classificationEvidence: string;
  exceptionType?: string;
  terminationNamespace?: string;
  terminationCode?: string;
  jetsam?: JetsamDetails;
}

export interface CrashGroup {
  key: string;
  explanation: string;
  reports: CrashRecord[];
  firstIncidentTime: number | null;
  latestIncidentTime: number | null;
}

export const CRASH_CLASS_LABELS: Record<CrashReportClass, string> = {
  "app-crash": "App crash",
  jetsam: "Jetsam",
  "cpu-resource": "CPU resource",
  "disk-write-resource": "Disk-write resource",
  panic: "Panic",
  unclassified: "Unclassified",
};

const decoder = new TextDecoder();
const CRASH_PATH = /(^|\/)crashes_and_spins\/.+\.ips$/i;
const TIMESTAMP_IN_NAME =
  /-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?:\.\d+)?\.ips$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseIncidentTime(value: unknown): number | null {
  const text = asText(value);
  if (!text) return null;
  // IPS dates use a space between date and time, which Date.parse does not
  // handle consistently across all browsers unless normalized to ISO-like text.
  const normalized = text.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(\s+[+-]\d{4})$/,
    "$1T$2$3",
  );
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function labeledValue(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp(`^${escaped}:\\s*(.+)$`, "mi").exec(text);
  return found?.[1]?.trim() || undefined;
}

function filenameTime(path: string): number | null {
  const match = TIMESTAMP_IN_NAME.exec(path);
  if (!match) return null;
  const parsed = Date.parse(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function reportStem(path: string): string {
  return basename(path)
    .replace(/-\d{4}-\d{2}-\d{2}-\d{6}(?:\.\d+)?\.ips$/i, "")
    .replace(/\.json$/i, "")
    .replace(/\.ips$/i, "");
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function jsonString(value: unknown): string | undefined {
  return asText(value);
}

function conditionFor(
  reportClass: CrashReportClass,
  body: Record<string, unknown> | null,
  fallback: string,
): {
  condition: string;
  exceptionType?: string;
  terminationNamespace?: string;
  terminationCode?: string;
} {
  if (reportClass === "jetsam") return { condition: fallback };
  if (reportClass === "cpu-resource")
    return { condition: "CPU resource exception" };
  if (reportClass === "disk-write-resource")
    return { condition: "Disk-write resource exception" };
  if (reportClass === "panic") return { condition: "Kernel panic report" };

  const exception = asRecord(body?.exception);
  const termination = asRecord(body?.termination);
  const exceptionType = jsonString(exception?.type);
  const signal = jsonString(exception?.signal);
  const terminationNamespace = jsonString(termination?.namespace);
  const terminationCode =
    typeof termination?.code === "number" ||
    typeof termination?.code === "string"
      ? String(termination.code)
      : undefined;
  const indicator = jsonString(termination?.indicator);
  const parts = [
    exceptionType ? [exceptionType, signal].filter(Boolean).join(" · ") : "",
    terminationNamespace
      ? `${terminationNamespace}${indicator ? `: ${indicator}` : terminationCode ? `: ${terminationCode}` : ""}`
      : "",
  ].filter(Boolean);
  return {
    condition: parts.join("; ") || fallback,
    exceptionType,
    terminationNamespace,
    terminationCode,
  };
}

function jetsamVictim(body: Record<string, unknown> | null): {
  name?: string;
  reason?: string;
  details?: JetsamDetails;
} {
  const processes = Array.isArray(body?.processes) ? body.processes : [];
  const victim = processes
    .map(asRecord)
    .find((process) => asText(process?.reason));
  const memoryStatus = asRecord(body?.memoryStatus);
  const pageSize = asNumber(memoryStatus?.pageSize);
  const victimPages = asNumber(victim?.rpages);
  return {
    name: asText(victim?.name),
    reason: asText(victim?.reason),
    details: {
      largestProcess: asText(body?.largestProcess),
      pageSize,
      victimPages,
    },
  };
}

function detectClass(
  path: string,
  body: Record<string, unknown> | null,
  raw: string,
): { reportClass: CrashReportClass; evidence: string; subtype?: string } {
  const name = basename(path);
  const exception = asRecord(body?.exception);
  const exceptionType = asText(exception?.type);
  const isJetsam =
    asRecord(body?.memoryStatus) !== null && Array.isArray(body?.processes);
  if (isJetsam)
    return {
      reportClass: "jetsam",
      evidence: "Jetsam memory-status report fields",
    };
  if (asText(body?.panicString))
    return { reportClass: "panic", evidence: "panicString report field" };
  if (exceptionType === "EXC_RESOURCE") {
    const resourceText = `${raw} ${JSON.stringify(body)}`.toLocaleLowerCase();
    if (resourceText.includes("cpu"))
      return {
        reportClass: "cpu-resource",
        evidence: "EXC_RESOURCE report field with CPU evidence",
      };
    if (resourceText.includes("disk") || resourceText.includes("write"))
      return {
        reportClass: "disk-write-resource",
        evidence: "EXC_RESOURCE report field with disk-write evidence",
      };
  }
  if (
    body?.procName &&
    (asRecord(body.exception) || asRecord(body.termination))
  )
    return {
      reportClass: "app-crash",
      evidence: "Crash report process and exception/termination fields",
    };
  if (/^JetsamEvent-/i.test(name))
    return { reportClass: "jetsam", evidence: "Filename family: JetsamEvent" };
  if (/\.cpu_resource-/i.test(name))
    return {
      reportClass: "cpu-resource",
      evidence: "Filename family: .cpu_resource",
    };
  if (/\.diskwrites_resource-/i.test(name))
    return {
      reportClass: "disk-write-resource",
      evidence: "Filename family: .diskwrites_resource",
    };
  if (/^panic-/i.test(name))
    return { reportClass: "panic", evidence: "Filename family: panic" };
  if (/^stacks-/i.test(name))
    return {
      reportClass: "unclassified",
      subtype: "Diagnostic stack capture",
      evidence: "Filename family: stacks diagnostic capture",
    };
  return {
    reportClass: "unclassified",
    subtype: asText(body?.reason) ?? "Unclassified report",
    evidence: "No supported report classification fields or filename family",
  };
}

/** Returns only report artifacts collected into crashes_and_spins. */
export function isCrashEntry(entry: ArchiveEntry): boolean {
  return CRASH_PATH.test(entry.path);
}

export function parseCrashEntry(entry: ArchiveEntry): CrashRecord {
  const raw = decoder.decode(entry.data);
  const newline = raw.search(/\r?\n/);
  const firstLine = (newline < 0 ? raw : raw.slice(0, newline)).replace(
    /^\uFEFF/,
    "",
  );
  const rest = newline < 0 ? "" : raw.slice(newline).replace(/^\r?\n/, "");
  const metadata = parseJsonRecord(firstLine);
  const body = parseJsonRecord(rest.trim());
  const detected = detectClass(entry.path, body, raw);
  const labeledDate =
    labeledValue(rest, "End time") ?? labeledValue(rest, "Date/Time");
  const incidentTime =
    parseIncidentTime(body?.captureTime) ??
    parseIncidentTime(body?.date) ??
    parseIncidentTime(metadata?.timestamp) ??
    parseIncidentTime(labeledDate) ??
    filenameTime(entry.path) ??
    (entry.mtime > 0 ? entry.mtime * 1000 : null);
  const bundleInfo = asRecord(body?.bundleInfo);
  const victim =
    detected.reportClass === "jetsam" ? jetsamVictim(body) : undefined;
  const process =
    victim?.name ??
    asText(body?.procName) ??
    asText(metadata?.app_name) ??
    asText(metadata?.name) ??
    labeledValue(rest, "Command");
  const bundleId =
    asText(bundleInfo?.CFBundleIdentifier) ??
    asText(metadata?.bundleID) ??
    labeledValue(rest, "Identifier");
  const classified = conditionFor(
    detected.reportClass,
    body,
    victim?.reason ??
      detected.subtype ??
      "No reported termination or exception reason",
  );
  return {
    entry,
    sourcePath: entry.path,
    sourceLabel: reportStem(entry.path),
    raw,
    metadata,
    body,
    incidentTime,
    reportClass: detected.reportClass,
    subtype: detected.subtype,
    process,
    bundleId,
    condition: classified.condition,
    classificationEvidence: detected.evidence,
    exceptionType: classified.exceptionType,
    terminationNamespace: classified.terminationNamespace,
    terminationCode: classified.terminationCode,
    jetsam: victim?.details,
  };
}

export function buildCrashRecords(entries: ArchiveEntry[]): CrashRecord[] {
  return entries
    .filter(isCrashEntry)
    .map(parseCrashEntry)
    .sort(
      (left, right) =>
        (right.incidentTime ?? Number.NEGATIVE_INFINITY) -
          (left.incidentTime ?? Number.NEGATIVE_INFINITY) ||
        right.sourcePath.localeCompare(left.sourcePath),
    );
}

function groupParts(report: CrashRecord): { key: string; explanation: string } {
  const identity = report.bundleId ?? report.process ?? report.sourceLabel;
  if (report.reportClass === "jetsam") {
    const key = [report.reportClass, identity, report.condition]
      .map(normalize)
      .join(" | ");
    return {
      key,
      explanation: `Jetsam + jettisoned process (${identity}) + reason (${report.condition})`,
    };
  }
  if (report.reportClass === "app-crash") {
    const key = [
      report.reportClass,
      identity,
      report.exceptionType ?? "no exception type",
      report.terminationNamespace ?? "no termination namespace",
      report.terminationCode ?? "no termination code",
    ]
      .map(normalize)
      .join(" | ");
    return {
      key,
      explanation: `App crash + process or bundle (${identity}) + exception (${report.exceptionType ?? "not reported"}) + termination (${report.terminationNamespace ?? "not reported"}${report.terminationCode ? ` ${report.terminationCode}` : ""})`,
    };
  }
  if (
    report.reportClass === "cpu-resource" ||
    report.reportClass === "disk-write-resource"
  ) {
    const key = [report.reportClass, identity].map(normalize).join(" | ");
    return {
      key,
      explanation: `${CRASH_CLASS_LABELS[report.reportClass]} + process or bundle (${identity})`,
    };
  }
  const key = [report.reportClass, identity].map(normalize).join(" | ");
  return {
    key,
    explanation: `${CRASH_CLASS_LABELS[report.reportClass]} + stable report identity (${identity})`,
  };
}

export function groupCrashRecords(records: CrashRecord[]): CrashGroup[] {
  const groups = new Map<string, CrashGroup>();
  for (const report of records) {
    const { key, explanation } = groupParts(report);
    const group = groups.get(key) ?? {
      key,
      explanation,
      reports: [],
      firstIncidentTime: null,
      latestIncidentTime: null,
    };
    group.reports.push(report);
    if (
      report.incidentTime !== null &&
      (group.firstIncidentTime === null ||
        report.incidentTime < group.firstIncidentTime)
    )
      group.firstIncidentTime = report.incidentTime;
    if (
      report.incidentTime !== null &&
      (group.latestIncidentTime === null ||
        report.incidentTime > group.latestIncidentTime)
    )
      group.latestIncidentTime = report.incidentTime;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      reports: [...group.reports].sort(
        (left, right) =>
          (right.incidentTime ?? Number.NEGATIVE_INFINITY) -
          (left.incidentTime ?? Number.NEGATIVE_INFINITY),
      ),
    }))
    .sort(
      (left, right) =>
        (right.latestIncidentTime ?? Number.NEGATIVE_INFINITY) -
        (left.latestIncidentTime ?? Number.NEGATIVE_INFINITY),
    );
}

export interface CrashRedactionOptions {
  identifiers: boolean;
  paths: boolean;
}

export function redactCrashRaw(
  raw: string,
  { identifiers, paths }: CrashRedactionOptions,
): string {
  let value = raw;
  if (identifiers) {
    value = value
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[redacted-email]")
      .replace(/\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, "[redacted-mac]")
      .replace(
        /\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\b/g,
        "[redacted-identifier]",
      )
      .replace(/\b[0-9A-Fa-f]{40,64}\b/g, "[redacted-identifier]")
      .replace(
        /("(?:incident|incident_id|crashReporterKey|slice_uuid|serialNumber|deviceIdentifier)"\s*:\s*")[^"]*(")/gi,
        "$1[redacted-identifier]$2",
      );
  }
  if (paths) {
    value = value.replace(
      /(?:\/|\\\/)(?:private|System|usr|var|Library|Applications)(?:(?:\/|\\\/)[^"\s\\]*)+/g,
      "[redacted-path]",
    );
  }
  return value;
}
