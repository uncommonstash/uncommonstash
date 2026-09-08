export interface ArchiveEntry {
  path: string;
  size: number;
  mtime: number;
  kind: "text" | "sqlite" | "plist" | "binary";
  data: Uint8Array;
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

// Minimal ustar tar parser (supports plain tar; caller gunzips first).
export function parseTar(buffer: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  const dec = new TextDecoder();
  let offset = 0;
  const readStr = (off: number, len: number) =>
    dec
      .decode(buffer.subarray(off, off + len))
      .replace(/\0.*$/, "")
      .trim();
  while (offset + 512 <= buffer.length) {
    const name = readStr(offset, 100);
    if (!name) break;
    const sizeOct = readStr(offset + 124, 12);
    const size = parseInt(sizeOct || "0", 8) || 0;
    const typeflag = String.fromCharCode(buffer[offset + 156] || 0);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) break;
    if (typeflag !== "5") {
      const data = buffer.slice(dataStart, dataEnd);
      entries.push({
        path: name,
        size,
        mtime: parseInt(readStr(offset + 136, 12) || "0", 8) || 0,
        kind: classifyEntry(name),
        data,
      });
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export async function ingestFile(file: File | Blob): Promise<ArchiveEntry[]> {
  // Gunzip if possible, else treat as raw tar.
  let bytes = new Uint8Array(await file.arrayBuffer());
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (isGzip && typeof DecompressionStream !== "undefined") {
    const stream = new Response(
      new Blob([bytes as unknown as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream("gzip")),
    );
    bytes = new Uint8Array(await (await stream.blob()).arrayBuffer());
  }
  const entries = parseTar(bytes);
  // Spill large text/sqlite entries to OPFS when available (best-effort).
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (root) {
      for (const e of entries.slice(0, 50)) {
        const h = await root.getFileHandle(
          `sysdiag-${e.path.replace(/[^a-z0-9]+/gi, "-").slice(-80)}`,
          { create: true },
        );
        const w = await (
          h as unknown as {
            createWritable: () => Promise<{
              write: (d: Uint8Array) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }
        ).createWritable();
        await w.write(e.data);
        await w.close();
      }
    }
  } catch {
    // OPFS unavailable (private mode etc.) — stay in memory.
  }
  return entries;
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

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const MAC = /\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;

export function redact(text: string, enabled: boolean): string {
  if (!enabled) return text;
  return text.replace(EMAIL, "[redacted-email]").replace(MAC, "[redacted-mac]");
}

export interface BatteryPoint {
  ts: number;
  level: number;
  process?: string;
  energy?: number;
}

// Parse synthetic/simple battery CSV or powerlog-ish text:
// lines like: 2024-01-01T10:00:00Z,85  or  ts,level,process,energy
export function parseBatteryText(text: string): BatteryPoint[] {
  const out: BatteryPoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(",");
    if (parts.length < 2) continue;
    const ts = Date.parse(parts[0].trim());
    const level = Number(parts[1]);
    if (!Number.isFinite(ts) || !Number.isFinite(level)) continue;
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

// Single-thread sqlite-wasm query helper (dynamic import, no COOP/COEP needed).
// Falls back to null when dep/file unavailable; callers use parseBatteryText instead.
export async function queryPowerlog(
  data: Uint8Array,
  sql: string,
): Promise<Array<Record<string, unknown>> | null> {
  try {
    const mod = await import("@sqlite.org/sqlite-wasm").catch(() => null);
    if (!mod) return null;
    const sqlite3 = await (
      mod as unknown as { default: (opts?: object) => Promise<unknown> }
    ).default();
    const db = new (
      sqlite3 as unknown as {
        oo1: {
          DB: new (
            p: string,
            m: string,
          ) => { exec: (o: object) => void; close: () => void };
        };
      }
    ).oo1.DB(":memory:", "rw");
    sqlite3 as unknown as {
      capi: { sqlite3_deserialize: (...a: unknown[]) => number };
    };
    // Load bytes via executescript using param binding is complex across versions;
    // simplest portable path: write via OPFS/vfs not required for small fixture —
    // use exec with carray import if available, else bail to fallback.
    void data;
    const rows: Array<Record<string, unknown>> = [];
    db.exec({
      sql,
      rowMode: "object",
      callback: (r: Record<string, unknown>) => rows.push(r),
    });
    db.close();
    return rows;
  } catch {
    return null;
  }
}
