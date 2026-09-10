// Main-thread client for the sysdiagnose ingest worker.
// Owns worker lifecycle (lazy singleton per session, terminate on reset),
// correlates requests by id, and drops stale completions.

import type { ArchiveEntry } from "@/pages/sysdiagnose/lib";
import type { WifiAnalysis } from "@/workers/sysdiagnose-wifi/analysis";
import {
  type IngestProgressMsg,
  isWorkerOutMsg,
  type WorkerOut,
} from "./ingest.protocol";
import type { IngestProgress } from "./pipeline";

export interface IngestResult {
  entries: ArchiveEntry[];
  wifi: WifiAnalysis;
}

export class IngestClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (result: IngestResult) => void;
      reject: (err: Error) => void;
      onProgress?: (p: IngestProgress) => void;
    }
  >();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./ingest.worker.ts", import.meta.url), {
        type: "module",
        name: "sysdiagnose-ingest",
      });
      this.worker.onmessage = (event: MessageEvent<unknown>) => {
        const msg = event.data;
        if (!isWorkerOutMsg(msg)) return; // drop malformed output
        this.handle(msg);
      };
      this.worker.onerror = (event) => {
        const err = new Error(event.message || "ingest worker failed");
        for (const [, p] of this.pending) p.reject(err);
        this.pending.clear();
      };
    }
    return this.worker;
  }

  private handle(msg: WorkerOut) {
    const p = this.pending.get(msg.id);
    if (!p) return; // stale completion from a superseded request
    if (msg.kind === "ingest/progress") {
      const prog: IngestProgressMsg = msg;
      p.onProgress?.({
        stage: prog.stage,
        fraction: prog.fraction,
        bytesRead: prog.bytesRead,
        bytesTotal: prog.bytesTotal,
        filesFound: prog.filesFound,
      });
      return;
    }
    this.pending.delete(msg.id);
    if (msg.kind === "ingest/done") {
      const entries: ArchiveEntry[] = msg.entries.map((e) => ({
        path: e.path,
        size: e.size,
        mtime: e.mtime,
        kind: e.kind,
        data: new Uint8Array(e.data),
      }));
      p.resolve({ entries, wifi: msg.wifi });
    } else {
      p.reject(new Error(msg.message || "ingest failed"));
    }
  }

  start(
    file: File | Blob,
    onProgress?: (p: IngestProgress) => void,
  ): Promise<IngestResult> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    const promise = new Promise<IngestResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
    });
    worker.postMessage({ v: 1, kind: "ingest/start", id, file });
    return promise;
  }

  terminate() {
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
