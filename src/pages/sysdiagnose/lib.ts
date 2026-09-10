export interface ArchiveEntry {
  path: string;
  size: number;
  mtime: number;
  kind: "text" | "sqlite" | "plist" | "binary";
  data: Uint8Array;
}

export function findBatteryPlistEntry(
  entries: ArchiveEntry[],
): ArchiveEntry | undefined {
  const candidates = entries.filter((entry) =>
    /BatteryUISysdiagnose\.plist$/i.test(entry.path),
  );
  return (
    candidates.find((entry) =>
      /(?:^|\/)logs\/BatteryUIPlist\/BatteryUISysdiagnose\.plist$/i.test(
        entry.path,
      ),
    ) ??
    candidates.find((entry) =>
      /(?:^|\/)BatteryUIPlist\/BatteryUISysdiagnose\.plist$/i.test(entry.path),
    ) ??
    candidates[0]
  );
}

const SYSDIAGNOSE_CAPTURE_RE =
  /(?:^|\/)sysdiagnose_(\d{4})\.(\d{2})\.(\d{2})_(\d{2})-(\d{2})-(\d{2})([+-]\d{4})(?:_|\/|$)/i;

/**
 * Powerlog timestamps are device-relative seconds. Anchor them to the
 * sysdiagnose capture instant, not BatteryUI's next midnight boundary.
 */
export function inferSysdiagnoseCaptureTime(
  entries: Array<Pick<ArchiveEntry, "path">>,
  fallbackMs: number,
): number {
  for (const entry of entries) {
    const match = SYSDIAGNOSE_CAPTURE_RE.exec(entry.path);
    if (!match) continue;
    const timestamp = Date.parse(
      `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7]}`,
    );
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return fallbackMs;
}

export function classifyEntry(path: string): ArchiveEntry["kind"] {
  const p = path.toLowerCase();
  if (p.endsWith(".plsql") || p.endsWith(".sqlite") || p.endsWith(".db"))
    return "sqlite";
  if (p.endsWith(".plist")) return "plist";
  if (
    p.endsWith(".log") ||
    p.endsWith(".txt") ||
    p.endsWith(".ips") ||
    p.includes("system_logs")
  )
    return "text";
  return "binary";
}

// Tar parser: plain ustar + PAX extended headers ('x'/'g') + GNU longnames
// ('L'). Required because real sysdiagnose archives use PAX headers and
// paths >100 chars (prefix/longname). Caller gunzips first.
export function parseTar(
  buffer: Uint8Array,
  onProgress?: (offset: number, total: number, files: number) => void,
): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  const dec = new TextDecoder();
  let offset = 0;
  let nextReport = 4 * 1024 * 1024;
  let pendingLongName: string | null = null;
  let pendingPaxPath: string | null = null;
  const readStr = (off: number, len: number) =>
    dec
      .decode(buffer.subarray(off, off + len))
      .replace(/\0.*$/, "")
      .trim();
  const parsePaxPath = (data: Uint8Array): string | null => {
    // PAX records: "<len> <key>=<value>\n" — len includes itself.
    const text = dec.decode(data);
    let at = 0;
    let found: string | null = null;
    while (at < text.length) {
      const nl = text.indexOf("\n", at);
      if (nl < 0) break;
      const line = text.slice(at, nl);
      const sp = line.indexOf(" ");
      const eq = line.indexOf("=");
      if (sp > 0 && eq > sp && line.slice(sp + 1, eq) === "path") {
        found = line.slice(eq + 1);
      }
      at = nl + 1;
    }
    return found;
  };
  while (offset + 512 <= buffer.length) {
    const rawName = readStr(offset, 100);
    if (!rawName) break;
    const prefix = readStr(offset + 345, 155);
    const sizeOct = readStr(offset + 124, 12);
    const size = parseInt(sizeOct || "0", 8) || 0;
    const typeflag = String.fromCharCode(buffer[offset + 156] || 0);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) break;
    const data = buffer.slice(dataStart, dataEnd);
    const mtime = parseInt(readStr(offset + 136, 12) || "0", 8) || 0;
    offset = dataStart + Math.ceil(size / 512) * 512;
    // Metadata entries: consume, never emit.
    if (typeflag === "x" || typeflag === "g") {
      const p = parsePaxPath(data);
      if (p && typeflag === "x") pendingPaxPath = p;
      continue;
    }
    if (typeflag === "L") {
      pendingLongName = dec.decode(data).replace(/\0.*$/, "");
      continue;
    }
    if (typeflag === "5") continue; // directory
    const name =
      pendingLongName ??
      pendingPaxPath ??
      (prefix ? `${prefix}/${rawName}` : rawName);
    pendingLongName = null;
    pendingPaxPath = null;
    // Skip AppleDouble sidecar files (._*) — metadata, not real content.
    if (/(^|\/)(\._|\.DS_Store)/.test(name)) continue;
    entries.push({
      path: name,
      size,
      mtime,
      kind: classifyEntry(name),
      data,
    });
    // Byte-anchored: fires for many-small-files and few-big-files alike.
    // postMessage from the worker dispatches even mid-scan, so the main
    // thread keeps repainting through the blocking loop.
    if (onProgress && offset >= nextReport) {
      onProgress(offset, buffer.length, entries.length);
      nextReport = offset + 4 * 1024 * 1024;
    }
  }
  onProgress?.(offset, buffer.length, entries.length);
  return entries;
}

import {
  type IngestProgress,
  runIngest,
} from "@/workers/sysdiagnose-ingest/pipeline";

export type { IngestProgress };

export async function ingestFile(
  file: File | Blob,
  onProgress?: (p: IngestProgress) => void,
): Promise<ArchiveEntry[]> {
  return runIngest(file, onProgress);
}

export interface LogLine {
  ts: number;
  process: string;
  level: "default" | "error" | "fault" | "info";
  message: string;
  source: string;
}

export function parseLogText(source: string, text: string): LogLine[] {
  const lines = text.split(/\r?\n/).slice(0, 20000);
  const out: LogLine[] = [];
  const re =
    /^(?<ts>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\s*(?:\[(?<lvl>Error|Fault|Default|Info)\])?\s*(?<proc>[\w.\-]+(?:\[\d+\])?)?:?\s*(?<msg>.*)$/;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = re.exec(line.slice(0, 2000));
    const lvl = (m?.groups?.lvl?.toLowerCase() ??
      "default") as LogLine["level"];
    out.push({
      ts: m?.groups?.ts ? Date.parse(m.groups.ts) || 0 : 0,
      process: m?.groups?.proc ?? "unknown",
      level: ["error", "fault", "info", "default"].includes(lvl)
        ? lvl
        : "default",
      message: m?.groups?.msg ?? line.slice(0, 2000),
      source,
    });
  }
  return out;
}

export interface BatteryPoint {
  ts: number;
  level: number;
  process?: string;
  energy?: number;
}

// Parse synthetic/simple battery CSV or powerlog-ish text:
// lines like: 2024-01-01T10:00:00Z,85  or  ts,level,process,energy
// Strict: level must be 0-100 and timestamp must parse, otherwise the row
// is skipped (real sysdiagnose plists/CSVs are full of comma-separated
// numbers that are NOT battery samples).
export function parseBatteryText(text: string): BatteryPoint[] {
  const out: BatteryPoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(",");
    if (parts.length < 2) continue;
    // CSV must start with an ISO timestamp at line start.
    if (!/^\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(parts[0])) continue;
    const ts = Date.parse(parts[0].trim());
    const level = Number(parts[1]);
    if (!Number.isFinite(ts) || !Number.isFinite(level)) continue;
    if (level < 0 || level > 100) continue;
    out.push({
      ts,
      level,
      process: parts[2]?.trim() || undefined,
      energy: parts[3] ? Number(parts[3]) : undefined,
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export interface ProcessAggregate {
  process: string;
  samples: number;
  avgLevel: number;
  wakeups: number;
  energy: number;
}

export function aggregateBattery(points: BatteryPoint[]): ProcessAggregate[] {
  const map = new Map<string, ProcessAggregate>();
  for (const p of points) {
    const key = p.process ?? "system";
    const cur = map.get(key) ?? {
      process: key,
      samples: 0,
      avgLevel: 0,
      wakeups: 0,
      energy: 0,
    };
    cur.samples += 1;
    cur.avgLevel += p.level;
    cur.energy += p.energy ?? 0;
    if (/wake/i.test(p.process ?? "")) cur.wakeups += 1;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((a) => ({ ...a, avgLevel: a.samples ? a.avgLevel / a.samples : 0 }))
    .sort((a, b) => b.energy - a.energy || b.samples - a.samples);
}

export interface BatteryApp {
  name: string;
  bundleId: string;
  energy: number;
  foregroundSec: number;
  backgroundSec: number;
  components?: Record<string, number>;
}

export interface BatteryPlistData {
  points: BatteryPoint[];
  charging: Array<{ start: number; end: number }>;
  apps: BatteryApp[];
  endTime: number;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const BATTERY_ENERGY_COMPONENT_KEYS = new Set([
  "APSOCBaseIOReport",
  "AudioCodec",
  "AudioSpeaker",
  "BB",
  "Bluetooth",
  "Cellular",
  "CPU",
  "Display",
  "DisplayController",
  "DisplayDynamic",
  "DRAM",
  "GPU",
  "GPS",
  "IO",
  "Location",
  "Memory",
  "NeuralEngine",
  "RestOfSOC",
  "SOCDisplay",
  "SystemOnChip",
  "WiFiData",
  "WiFi-Data",
]);

function isBatteryEnergyComponentKey(key: string): boolean {
  return (
    BATTERY_ENERGY_COMPONENT_KEYS.has(key) || key.startsWith("Foreground-")
  );
}

// Extract battery curve + per-app energy from a parsed
// BatteryUISysdiagnose.plist object (XML or binary — same shape).
// Curve: Graph.PLBatteryUIGraph24hrs.PLBatteryUIBatteryLevelsKey =
// 96 [level, flags] pairs, 15-min samples over 24h ending at endOfDay.
// Level -1 = no data (future). Charging intervals are [startSec, endSec]
// offsets from the start of that 24h window.
export function extractBatteryFromPlist(obj: unknown): BatteryPlistData | null {
  const root = asRecord(obj);
  const graph = asRecord(root?.["Graph"]);
  const g24 = asRecord(graph?.["PLBatteryUIGraph24hrs"]);
  const levels = g24?.["PLBatteryUIBatteryLevelsKey"];
  if (!Array.isArray(levels) || levels.length === 0) return null;
  const endTime =
    asNum(root?.["endOfDay"]) ??
    asNum(root?.["PLBatteryUIQueryTime"]) ??
    Date.now() / 1000;
  const endMs = endTime * 1000;
  const stepMs = (24 * 3600 * 1000) / levels.length;
  const points: BatteryPoint[] = [];
  levels.forEach((pair, i) => {
    const level = Array.isArray(pair) ? asNum(pair[0]) : asNum(pair);
    if (level === null || level < 0 || level > 100) return;
    points.push({ ts: endMs - (levels.length - 1 - i) * stepMs, level });
  });
  if (points.length === 0) return null;
  const startMs = endMs - 24 * 3600 * 1000;
  const charging: Array<{ start: number; end: number }> = [];
  const intervals = asRecord(
    g24?.["PLBatteryUIChargingStateIntervalsDictKey"],
  )?.["PLBatteryUIChargingIntervalsKey"];
  if (Array.isArray(intervals)) {
    for (const iv of intervals) {
      if (!Array.isArray(iv)) continue;
      const s = asNum(iv[0]);
      const e = asNum(iv[1]);
      if (s === null || e === null) continue;
      charging.push({ start: startMs + s * 1000, end: startMs + e * 1000 });
    }
  }
  const apps: BatteryApp[] = [];
  const day = asRecord(
    asRecord(root?.["Breakdown"])?.["PLBatteryUIQueryRangeDayKey"],
  );
  const arr = day?.["PLBatteryUIAppArrayKey"];
  if (Array.isArray(arr)) {
    for (const item of arr) {
      const r = asRecord(item);
      if (!r) continue;
      const name =
        typeof r["PLBatteryUIAppNameKey"] === "string"
          ? r["PLBatteryUIAppNameKey"]
          : null;
      const bundleId =
        typeof r["PLBatteryUIAppBundleIDKey"] === "string"
          ? r["PLBatteryUIAppBundleIDKey"]
          : "";
      if (!name) continue;
      apps.push({
        name,
        bundleId,
        energy: asNum(r["PLBatteryUIAppEnergyUsedKey"]) ?? 0,
        foregroundSec: asNum(r["PLBatteryUIAppForegroundRuntimeKey"]) ?? 0,
        backgroundSec: asNum(r["PLBatteryUIAppBackgroundRuntimeKey"]) ?? 0,
        components: Object.fromEntries(
          Object.entries(r)
            .filter(
              ([key, value]) =>
                !key.startsWith("PLBatteryUI") &&
                isBatteryEnergyComponentKey(key) &&
                asNum(value) !== null,
            )
            .map(([key, value]) => [key, asNum(value) as number]),
        ),
      });
    }
    apps.sort((a, b) => b.energy - a.energy);
  }
  return { points, charging, apps, endTime: endMs };
}

// --- Plist parsing (XML via DOMParser, binary via minimal bplist reader) ---

function xmlPlistToValue(node: Element): unknown {
  const tag = node.tagName;
  const text = node.textContent ?? "";
  switch (tag) {
    case "dict": {
      const out: Record<string, unknown> = {};
      const kids = [...node.children];
      for (let i = 0; i + 1 < kids.length; i += 2) {
        if (kids[i].tagName === "key" && kids[i + 1].tagName) {
          out[kids[i].textContent ?? ""] = xmlPlistToValue(kids[i + 1]);
        }
      }
      return out;
    }
    case "array":
      return [...node.children].filter((c) => c.tagName).map(xmlPlistToValue);
    case "string":
      return text;
    case "integer":
      return parseInt(text, 10);
    case "real":
      return parseFloat(text);
    case "true":
      return true;
    case "false":
      return false;
    case "date":
      return Date.parse(text) / 1000;
    case "data":
      return text.trim();
    default:
      return text;
  }
}

export function parseXmlPlist(data: Uint8Array): unknown {
  const doc = new DOMParser().parseFromString(
    new TextDecoder().decode(data),
    "application/xml",
  );
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("invalid XML plist");
  const root = doc.documentElement;
  const first = [...root.children].find((c) => c.tagName !== "key");
  if (!first) throw new Error("empty plist");
  return xmlPlistToValue(first);
}

// Minimal Apple binary plist (bplist00) reader. Supports null/bool/int/
// real/date/data/ascii/unicode/uid/array/set/dict — enough for iOS plists.
export function parseBplist(data: Uint8Array): unknown {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = new TextDecoder().decode(data.subarray(0, 8));
  if (magic !== "bplist00") throw new Error("not a bplist");
  const readU64 = (at: number): number => {
    let v = 0;
    for (let i = 0; i < 8; i++) v = v * 256 + data[at + i];
    return v;
  };
  // 32-byte trailer: [6 unused][offSize][refSize][numObjects:8][top:8][tableOff:8]
  const offSize = data[data.length - 26];
  const refSize = data[data.length - 25];
  const numObjects = readU64(data.length - 24);
  const topObject = readU64(data.length - 16);
  const tableOff = readU64(data.length - 8);
  const offsets: number[] = [];
  for (let i = 0; i < numObjects; i++) {
    let v = 0;
    for (let j = 0; j < offSize; j++)
      v = v * 256 + data[tableOff + i * offSize + j];
    offsets.push(v);
  }
  const readInt = (at: number, len: number): number => {
    let v = 0;
    for (let j = 0; j < len; j++) v = v * 256 + data[at + j];
    return v;
  };
  const parseObj = (idx: number): unknown => {
    const at = offsets[idx];
    const marker = data[at];
    const type = marker >> 4;
    const info = marker & 0x0f;
    const sized = (): { len: number; head: number } => {
      if (info !== 0x0f) return { len: info, head: 1 };
      const n = data[at + 1] & 0x0f;
      return { len: readInt(at + 2, 1 << n), head: 2 + (1 << n) };
    };
    switch (type) {
      case 0:
        return info === 8 ? false : info === 9 ? true : null;
      case 1:
        return readInt(at + 1, 1 << info);
      case 2:
        return info === 2
          ? view.getFloat32(at + 1, false)
          : view.getFloat64(at + 1, false);
      case 3: {
        // date: seconds since 2001-01-01
        const s = view.getFloat64(at + 1, false);
        return 978307200 + s;
      }
      case 4: {
        const { len, head } = sized();
        return data.slice(at + head, at + head + len);
      }
      case 5: {
        const { len, head } = sized();
        return new TextDecoder("utf-8").decode(
          data.subarray(at + head, at + head + len),
        );
      }
      case 6: {
        const { len, head } = sized();
        return new TextDecoder("utf-16be").decode(
          data.subarray(at + head, at + head + len * 2),
        );
      }
      case 8: {
        const { len, head } = sized();
        const out: number[] = [];
        for (let i = 0; i < len; i++)
          out.push(readInt(at + head + i * refSize, refSize));
        return out;
      }
      case 10:
      case 11:
      case 12: {
        const { len, head } = sized();
        return Array.from({ length: len }, (_, i) =>
          parseObj(readInt(at + head + i * refSize, refSize)),
        );
      }
      case 13: {
        const { len, head } = sized();
        const out: Record<string, unknown> = {};
        for (let i = 0; i < len; i++) {
          const k = parseObj(readInt(at + head + i * refSize, refSize));
          const v = parseObj(
            readInt(at + head + len * refSize + i * refSize, refSize),
          );
          out[String(k)] = v;
        }
        return out;
      }
      default:
        return null;
    }
  };
  return parseObj(topObject);
}

export function parsePlist(data: Uint8Array): unknown {
  if (
    data.length >= 8 &&
    new TextDecoder().decode(data.subarray(0, 8)) === "bplist00"
  ) {
    return parseBplist(data);
  }
  return parseXmlPlist(data);
}
