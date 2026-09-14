import type {
  CronformerProgress,
  CronformerRequest,
  CronformerResult,
} from "./cronformer.protocol";
import {
  CRONFORMER_PROTOCOL_VERSION,
  isCronformerResponse,
} from "./cronformer.protocol";

/** Owns a dedicated on-device Cronformer worker for one input session. */
export class CronformerClient {
  private readonly worker: Worker;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      reject: (reason: Error) => void;
      resolve: (result: CronformerResult) => void;
      onProgress?: (progress: CronformerProgress) => void;
    }
  >();

  constructor() {
    this.worker = new Worker(
      new URL("./cronformer.worker.ts", import.meta.url),
      {
        name: "cronformer",
        type: "module",
      },
    );
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!isCronformerResponse(message)) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      if (message.kind === "cronformer/progress") {
        request.onProgress?.(message.progress);
      } else if (message.kind === "cronformer/result") {
        this.pending.delete(message.id);
        request.resolve(message.result);
      } else {
        this.pending.delete(message.id);
        request.reject(new Error(message.message));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "Cronformer worker failed");
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    };
  }

  infer(
    prompt: string,
    onProgress?: (progress: CronformerProgress) => void,
  ): Promise<CronformerResult> {
    const id = this.nextId++;
    const message: CronformerRequest = {
      v: CRONFORMER_PROTOCOL_VERSION,
      id,
      kind: "cronformer/infer",
      prompt,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage(message);
    });
  }

  dispose() {
    const error = new Error("Cronformer worker was disposed");
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.worker.terminate();
  }
}
