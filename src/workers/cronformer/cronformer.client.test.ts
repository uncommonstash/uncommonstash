import { CronformerClient } from "./cronformer.client";

class FakeWorker {
  static instance: FakeWorker;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = jest.fn();
  terminate = jest.fn();

  constructor() {
    FakeWorker.instance = this;
  }

  emit(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

describe("CronformerClient", () => {
  beforeEach(() => {
    global.Worker = FakeWorker as unknown as typeof Worker;
  });

  it("routes progress and results to their matching inference request", async () => {
    const client = new CronformerClient();
    const onProgress = jest.fn();
    const result = client.infer("every weekday at 9am", onProgress);

    expect(FakeWorker.instance.postMessage).toHaveBeenCalledWith({
      v: 1,
      id: 0,
      kind: "cronformer/infer",
      prompt: "every weekday at 9am",
    });
    FakeWorker.instance.emit({
      v: 1,
      id: 0,
      kind: "cronformer/progress",
      progress: {
        phase: "downloading",
        source: "network",
        loadedBytes: 12,
        totalBytes: 24,
      },
    });
    FakeWorker.instance.emit({
      v: 1,
      id: 0,
      kind: "cronformer/result",
      result: { cron: "0 9 * * 1-5" },
    });

    await expect(result).resolves.toEqual({ cron: "0 9 * * 1-5" });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "downloading" }),
    );
  });

  it("ignores malformed messages and rejects pending requests when disposed", async () => {
    const client = new CronformerClient();
    const result = client.infer("every day at noon");

    FakeWorker.instance.emit({ id: 0, kind: "cronformer/result" });
    client.dispose();

    await expect(result).rejects.toThrow("Cronformer worker was disposed");
    expect(FakeWorker.instance.terminate).toHaveBeenCalledTimes(1);
  });
});
