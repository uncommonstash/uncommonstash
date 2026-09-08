import type { BatteryApp } from "@/pages/sysdiagnose/lib";
import {
  type AnalyticsOut,
  type AnalyticsResultMsg,
  isAnalyticsOut,
} from "./analytics.protocol";

export class AnalyticsClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private latestQueryId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: AnalyticsOut) => void;
      reject: (error: Error) => void;
    }
  >();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./analytics.worker.ts", import.meta.url),
        { type: "module", name: "sysdiagnose-analytics" },
      );
      this.worker.onmessage = (event: MessageEvent<unknown>) => {
        if (!isAnalyticsOut(event.data)) return;
        this.handle(event.data);
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || "analytics worker failed");
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      };
    }
    return this.worker;
  }

  private handle(msg: AnalyticsOut) {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    if (msg.kind === "analytics/result" && msg.id !== this.latestQueryId) {
      this.pending.delete(msg.id);
      pending.reject(new Error("stale analytics result"));
      return;
    }
    this.pending.delete(msg.id);
    if (msg.kind === "analytics/error") pending.reject(new Error(msg.message));
    else pending.resolve(msg);
  }

  private request<T extends AnalyticsOut>(
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
  ): Promise<T> {
    const id = Number(message["id"]);
    const worker = this.ensureWorker();
    const promise = new Promise<AnalyticsOut>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    worker.postMessage(message, transfer);
    return promise as Promise<T>;
  }

  init(
    powerlog: ArrayBuffer,
    apps: BatteryApp[],
    endTime: number,
  ): Promise<Extract<AnalyticsOut, { kind: "analytics/ready" }>> {
    const id = this.nextId++;
    return this.request(
      { v: 1, kind: "analytics/init", id, powerlog, apps, endTime },
      [powerlog],
    );
  }

  query(startMs: number, endMs: number): Promise<AnalyticsResultMsg> {
    const id = this.nextId++;
    this.latestQueryId = id;
    for (const [pendingId, pending] of this.pending) {
      if (pendingId !== id && pendingId > 0 && pendingId < id) {
        pending.reject(new Error("stale analytics request"));
        this.pending.delete(pendingId);
      }
    }
    return this.request({
      v: 1,
      kind: "analytics/query",
      id,
      startMs,
      endMs,
    }) as Promise<AnalyticsResultMsg>;
  }

  terminate() {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("analytics worker terminated"));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
