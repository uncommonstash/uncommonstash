// Ingest pipeline: read → gunzip → tar index → OPFS spill.
// Runs identically on the main thread (tests, fallback) and inside the
// ingest worker. Worker-safe: no DOM APIs (DecompressionStream, Blob,
// navigator.storage all exist in workers).

import { type ArchiveEntry, parseTar } from "@/pages/sysdiagnose/lib";

export interface IngestProgress {
  stage: "reading" | "decompressing" | "indexing" | "storing" | "done";
  /** 0..1 overall. Byte-exact for reading; estimated afterwards. */
  fraction: number;
  bytesRead: number;
  bytesTotal: number;
  filesFound: number;
}

async function readWithProgress(
  stream: ReadableStream<Uint8Array>,
  total: number,
  onProgress?: (read: number) => void,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  let lastEmitted = 0;
  const EMIT_EVERY = 1024 * 1024; // byte-anchored: smooth at any speed
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      read += value.length;
      if (onProgress && (read - lastEmitted >= EMIT_EVERY || read >= total)) {
        lastEmitted = read;
        onProgress(read);
      }
    }
  }
  if (onProgress && lastEmitted < read) onProgress(read);
  const out = new Uint8Array(read);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Shared ingest implementation used by `ingestFile` and the worker. */
export async function runIngest(
  file: File | Blob,
  onProgress?: (p: IngestProgress) => void,
): Promise<ArchiveEntry[]> {
  const total = (file as File).size ?? 0;
  const emit = (p: IngestProgress) => onProgress?.(p);
  const canStream = typeof (file as Blob).stream === "function";
  // Continuous byte-anchored map: reading 0 → 0.10, decompressing
  // 0.10 → 0.55, indexing 0.55 → 0.90, storing 0.90 → 0.97, done 1.
  // No jumps: each stage starts where the previous ends.
  let bytes: Uint8Array;
  if (canStream) {
    bytes = await readWithProgress(
      (file as Blob).stream() as unknown as ReadableStream<Uint8Array>,
      total,
      (read) =>
        emit({
          stage: "reading",
          fraction: total > 0 ? 0.1 * (read / total) : 0.05,
          bytesRead: read,
          bytesTotal: total,
          filesFound: 0,
        }),
    );
  } else {
    bytes = new Uint8Array(await file.arrayBuffer());
    emit({
      stage: "reading",
      fraction: 0.1,
      bytesRead: bytes.length,
      bytesTotal: total || bytes.length,
      filesFound: 0,
    });
  }
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (isGzip && typeof DecompressionStream !== "undefined") {
    // Tracked by compressed bytes consumed.
    const gzTotal = bytes.length;
    const decompressed = await readWithProgress(
      new Blob([bytes as unknown as BlobPart])
        .stream()
        .pipeThrough(
          new DecompressionStream("gzip"),
        ) as unknown as ReadableStream<Uint8Array>,
      gzTotal,
      (read) =>
        emit({
          stage: "decompressing",
          fraction: 0.1 + 0.45 * (read / gzTotal),
          bytesRead: read,
          bytesTotal: total,
          filesFound: 0,
        }),
    );
    bytes = decompressed;
  }
  // Index tar entries, reporting live byte offset through the scan so the
  // bar never freezes during the blocking loop.
  emit({
    stage: "indexing",
    fraction: 0.55,
    bytesRead: total,
    bytesTotal: total,
    filesFound: 0,
  });
  // Let the loading screen paint before the blocking scan.
  await new Promise((r) => setTimeout(r, 0));
  const entries = parseTar(bytes, (offset, tarTotal, files) =>
    emit({
      stage: "indexing",
      fraction: 0.55 + 0.35 * (tarTotal > 0 ? offset / tarTotal : 1),
      bytesRead: total,
      bytesTotal: total,
      filesFound: files,
    }),
  );
  // Spill large text/sqlite entries to OPFS when available (best-effort).
  emit({
    stage: "storing",
    fraction: 0.9,
    bytesRead: total,
    bytesTotal: total,
    filesFound: entries.length,
  });
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (root) {
      const spill = entries.slice(0, 50);
      let i = 0;
      for (const e of spill) {
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
        i += 1;
        emit({
          stage: "storing",
          fraction: 0.9 + 0.07 * (i / spill.length),
          bytesRead: total,
          bytesTotal: total,
          filesFound: entries.length,
        });
      }
    }
  } catch {
    // OPFS unavailable (private mode etc.) — stay in memory.
  }
  emit({
    stage: "done",
    fraction: 1,
    bytesRead: total,
    bytesTotal: total,
    filesFound: entries.length,
  });
  return entries;
}
