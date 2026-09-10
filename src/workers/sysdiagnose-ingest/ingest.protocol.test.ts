import { isIngestStartMsg, isWorkerOutMsg } from "./ingest.protocol";

describe("ingest protocol guards", () => {
  it("accepts a valid start message", () => {
    expect(
      isIngestStartMsg({
        v: 1,
        kind: "ingest/start",
        id: 1,
        file: new Blob(["x"]),
      }),
    ).toBe(true);
  });
  it("rejects malformed inbound messages", () => {
    expect(isIngestStartMsg(null)).toBe(false);
    expect(isIngestStartMsg({})).toBe(false);
    expect(
      isIngestStartMsg({ v: 2, kind: "ingest/start", id: 1, file: 42 }),
    ).toBe(false);
    expect(isIngestStartMsg({ v: 1, kind: "ingest/start", id: "1" })).toBe(
      false,
    );
    expect(
      isIngestStartMsg({ v: 1, kind: "other", id: 1, file: new Blob([]) }),
    ).toBe(false);
  });
  it("accepts valid worker output, rejects the rest", () => {
    expect(
      isWorkerOutMsg({
        v: 1,
        kind: "ingest/progress",
        id: 1,
        stage: "reading",
        fraction: 0.1,
      }),
    ).toBe(true);
    expect(
      isWorkerOutMsg({ v: 1, kind: "ingest/done", id: 1, entries: [] }),
    ).toBe(true);
    expect(
      isWorkerOutMsg({
        v: 1,
        kind: "ingest/error",
        id: 1,
        message: "boom",
      }),
    ).toBe(true);
    expect(isWorkerOutMsg({ v: 1, kind: "ingest/done", id: 1 })).toBe(false);
    expect(
      isWorkerOutMsg({ v: 9, kind: "ingest/done", id: 1, entries: [] }),
    ).toBe(false);
    expect(isWorkerOutMsg({ kind: "ingest/progress" })).toBe(false);
  });
});
