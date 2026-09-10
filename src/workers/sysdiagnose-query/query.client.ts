import {
  isSysdiagnoseQueryOut,
  SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
  type SysdiagnoseQueryCatalog,
  type SysdiagnoseQueryOut,
  type SysdiagnoseQueryPlan,
  type SysdiagnoseQueryResult,
} from "./query.protocol";

export class SysdiagnoseQueryClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: SysdiagnoseQueryOut) => void;
      reject: (error: Error) => void;
    }
  >();

  private ensureWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL("./query.worker.ts", import.meta.url), {
        type: "module",
        name: "sysdiagnose-query",
      });
      this.worker.onmessage = (event: MessageEvent<unknown>) => {
        if (!isSysdiagnoseQueryOut(event.data)) return;
        const pending = this.pending.get(event.data.id);
        if (!pending) return;
        this.pending.delete(event.data.id);
        if (event.data.kind === "query/error")
          pending.reject(new Error(event.data.message));
        else pending.resolve(event.data);
      };
      this.worker.onerror = (event) => {
        const error = new Error(
          event.message || "sysdiagnose query worker failed",
        );
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      };
    }
    return this.worker;
  }

  private request<T extends SysdiagnoseQueryOut>(
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
  ) {
    const id = Number(message.id);
    const worker = this.ensureWorker();
    const promise = new Promise<SysdiagnoseQueryOut>((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
    worker.postMessage(message, transfer);
    return promise as Promise<T>;
  }

  init(powerlog: ArrayBuffer): Promise<SysdiagnoseQueryCatalog> {
    const id = this.nextId++;
    return this.request(
      {
        v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
        kind: "query/init",
        id,
        powerlog,
      },
      [powerlog],
    );
  }

  run(plan: SysdiagnoseQueryPlan): Promise<SysdiagnoseQueryResult> {
    const id = this.nextId++;
    return this.request({
      v: SYS_DIAGNOSE_QUERY_PROTOCOL_VERSION,
      kind: "query/run",
      id,
      plan,
    });
  }

  terminate() {
    for (const pending of this.pending.values())
      pending.reject(new Error("sysdiagnose query worker terminated"));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
