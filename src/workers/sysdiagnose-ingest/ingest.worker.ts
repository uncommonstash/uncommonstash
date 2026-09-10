/// <reference lib="webworker" />

// Sysdiagnose ingest worker entry. Bundled by Vite into a content-hashed
// asset (see src/workers/README.md). Receives a Blob, runs the shared
// pipeline, reports progress, and transfers entry buffers back zero-copy.

import { analyzeWifiEntries } from "@/workers/sysdiagnose-wifi/analysis";
import {
  type IngestEntryMsg,
  isIngestStartMsg,
  type WorkerIn,
} from "./ingest.protocol";
import { runIngest } from "./pipeline";

async function handleStart(msg: Extract<WorkerIn, { kind: "ingest/start" }>) {
  const { id, file } = msg;
  try {
    const entries = await runIngest(file, (p) =>
      postMessage({
        v: 1,
        kind: "ingest/progress",
        id,
        stage: p.stage,
        fraction: p.fraction,
        bytesRead: p.bytesRead,
        bytesTotal: p.bytesTotal,
        filesFound: p.filesFound,
      }),
    );
    // Analytics Store exports are nested gzip/TAR containers. Decode them
    // while this worker still owns the archive buffers, before transferring
    // the outer archive index to the main thread.
    const wifi = await analyzeWifiEntries(entries);
    const out: IngestEntryMsg[] = entries.map((e) => {
      // Transfer the backing buffer zero-copy. Only safe when the view
      // covers its buffer exactly; otherwise compact first (parseTar
      // currently slices, so this is the fast path — the guard keeps it
      // correct if that ever changes to subarray views).
      const exact =
        e.data.byteOffset === 0 &&
        e.data.byteLength === e.data.buffer.byteLength
          ? e.data.buffer
          : e.data.slice().buffer;
      return {
        path: e.path,
        size: e.size,
        mtime: e.mtime,
        kind: e.kind,
        data: exact as ArrayBuffer,
      };
    });
    const transfer = out.map((e) => e.data);
    postMessage(
      { v: 1, kind: "ingest/done", id, entries: out, wifi },
      transfer,
    );
  } catch (err) {
    postMessage({
      v: 1,
      kind: "ingest/error",
      id,
      code: "unknown",
      message: err instanceof Error ? err.message : "ingest failed",
    });
  }
}

onmessage = (event: MessageEvent<unknown>) => {
  const msg = event.data;
  if (!isIngestStartMsg(msg)) {
    postMessage({
      v: 1,
      kind: "ingest/error",
      id: -1,
      code: "unknown",
      message: "unknown message kind",
    });
    return;
  }
  void handleStart(msg);
};
