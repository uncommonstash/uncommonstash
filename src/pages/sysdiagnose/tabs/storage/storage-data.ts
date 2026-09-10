import type { ArchiveEntry } from "../../lib";

const decoder = new TextDecoder();

export interface StorageVolume {
  filesystem: string;
  total: string;
  used: string;
  available: string;
  capacity: string;
  mountPoint: string;
}

export interface FsckRun {
  device: string;
  started: string;
  completed: string | null;
  status: "ok" | "unclassified";
  resultText: string | null;
  raw: string;
}

export interface DiskWriteEvent {
  source: string;
  process: string;
  incidentTime: string;
  incidentMs: number;
  reportType: "disk writes";
  raw: string;
}

export interface ApfsCounter {
  name: string;
  value: string;
}

export interface ApfsSection {
  name: string;
  counters: ApfsCounter[];
}

export interface FileProviderFinding {
  source: string;
  status: "pass" | "fail";
  text: string;
}

export interface FileProviderSource {
  path: string;
  raw: string;
}

export interface FileProviderDiagnostics {
  findings: FileProviderFinding[];
  providers: string[];
  sources: FileProviderSource[];
}

function text(entry: ArchiveEntry): string {
  return decoder.decode(entry.data);
}

function findEntry(
  entries: ArchiveEntry[],
  pattern: RegExp,
): ArchiveEntry | null {
  return entries.find((entry) => pattern.test(entry.path)) ?? null;
}

export function parseDisksText(source: string): StorageVolume[] {
  const lines = source.split(/\r?\n/);
  const header = lines.findIndex((line) =>
    /^Filesystem\s+Size\s+Used\s+Avail\s+Capacity\s+iused\s+ifree\s+%iused\s+Mounted on\s*$/i.test(
      line.trim(),
    ),
  );
  if (header < 0) return [];

  const volumes: StorageVolume[] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line.trim()) continue;
    const fields = line.trim().split(/\s{2,}/);
    if (fields.length < 9 || !/^\d+(?:\.\d+)?%$/.test(fields[4])) continue;
    volumes.push({
      filesystem: fields[0],
      total: fields[1],
      used: fields[2],
      available: fields[3],
      capacity: fields[4],
      mountPoint: fields.slice(8).join("  "),
    });
  }
  return volumes;
}

export function parseFsckLog(source: string): FsckRun[] {
  const starts = [
    ...source.matchAll(/^([^\n:]+): fsck_apfs started at (.+)$/gm),
  ];
  return starts.map((start, index) => {
    const raw = source.slice(start.index, starts[index + 1]?.index).trim();
    const completed =
      /^(?:[^\n:]+): fsck_apfs completed at (.+)$/m.exec(raw)?.[1] ?? null;
    // Apple’s exact successful-result grammar is deliberately the only
    // classification. Every other complete or partial run stays unclassified.
    const result =
      /^.*\*\* The volume .+ appears to be OK\.$/m.exec(raw)?.[0] ?? null;
    return {
      device: start[1],
      started: start[2],
      completed,
      status: result ? "ok" : "unclassified",
      resultText: result,
      raw,
    };
  });
}

const DISK_WRITES_NAME =
  /(?:^|\/)([^/]+)\.diskwrites_resource-\d{4}-\d{2}-\d{2}-\d{6}\.ips$/i;

function parseIncidentMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseDiskWriteReport(
  entry: ArchiveEntry,
): DiskWriteEvent | null {
  const match = DISK_WRITES_NAME.exec(entry.path);
  if (!match) return null;
  const raw = text(entry);
  const headerLine = raw.split(/\r?\n/, 1)[0];
  let header: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(headerLine);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    header = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (header.bug_type !== "145" || !/^Event:\s+disk writes\s*$/im.test(raw)) {
    return null;
  }
  const headerProcess =
    typeof header.app_name === "string"
      ? header.app_name
      : typeof header.name === "string"
        ? header.name
        : null;
  const command = /^Command:\s+(.+)$/m.exec(raw)?.[1]?.trim();
  const incidentTime =
    typeof header.timestamp === "string" ? header.timestamp : "Unknown time";
  return {
    source: entry.path,
    process: headerProcess ?? command ?? match[1],
    incidentTime,
    incidentMs: parseIncidentMs(incidentTime),
    reportType: "disk writes",
    raw,
  };
}

export function parseApfsStats(source: string): ApfsSection[] {
  const sections: ApfsSection[] = [];
  let current: ApfsSection | null = null;
  const section =
    /^(?:Device: .+|Totals for all \d+ disks:|APFSContainer: .+|\s*Volume .+ on disk\S+)$/;
  for (const line of source.split(/\r?\n/)) {
    const label = line.trim();
    if (section.test(line)) {
      current = { name: label, counters: [] };
      sections.push(current);
      continue;
    }
    const counter = /^\s*(.+?)\s*=\s*(.+?)\s*$/.exec(line);
    if (counter && current) {
      current.counters.push({
        name: counter[1].trim(),
        value: counter[2].trim(),
      });
    }
  }
  return sections.filter((item) => item.counters.length > 0);
}

function isFileProviderPath(path: string): boolean {
  return /(?:^|\/)FileProvider(?:\/|$)/i.test(path);
}

export function parseFileProviderDiagnostics(
  entries: ArchiveEntry[],
): FileProviderDiagnostics {
  const sources = entries
    .filter((entry) => entry.kind === "text" && isFileProviderPath(entry.path))
    .map((entry) => ({ path: entry.path, raw: text(entry) }));
  const findings: FileProviderFinding[] = [];
  const providers = new Set<string>();
  for (const source of sources) {
    const provider = /(?:^|\/)FileProvider\/([^/]+)\//i.exec(source.path)?.[1];
    if (provider) providers.add(provider);
    for (const line of source.raw.split(/\r?\n/)) {
      const marked = /^\s*([✅❌])\s*(.+?)\s*$/.exec(line);
      if (!marked) continue;
      if (
        !/\b(?:succeeded|failed)\s+on\s+\d+(?:\/\d+)?\s+files\.\s*$/i.test(
          marked[2],
        )
      ) {
        continue;
      }
      findings.push({
        source: source.path,
        status: marked[1] === "✅" ? "pass" : "fail",
        text: line.trim(),
      });
    }
  }
  return { findings, providers: [...providers].sort(), sources };
}

export interface StorageArtifacts {
  volumes: StorageVolume[];
  fsck: { runs: FsckRun[]; raw: string | null };
  writeEvents: DiskWriteEvent[];
  apfs: { sections: ApfsSection[]; raw: string | null };
  fileProvider: FileProviderDiagnostics;
}

export function extractStorageArtifacts(
  entries: ArchiveEntry[],
): StorageArtifacts {
  const disks = findEntry(entries, /(?:^|\/)disks\.txt$/i);
  const fsck = findEntry(entries, /(?:^|\/)logs\/fsck\/fsck_apfs\.log$/i);
  const apfs = findEntry(entries, /(?:^|\/)apfs_stats\.txt$/i);
  const fsckRaw = fsck ? text(fsck) : null;
  const apfsRaw = apfs ? text(apfs) : null;
  return {
    volumes: disks ? parseDisksText(text(disks)) : [],
    fsck: { runs: fsckRaw ? parseFsckLog(fsckRaw) : [], raw: fsckRaw },
    writeEvents: entries
      .map(parseDiskWriteReport)
      .filter((event): event is DiskWriteEvent => event !== null)
      .sort((left, right) => right.incidentMs - left.incidentMs),
    apfs: { sections: apfsRaw ? parseApfsStats(apfsRaw) : [], raw: apfsRaw },
    fileProvider: parseFileProviderDiagnostics(entries),
  };
}
