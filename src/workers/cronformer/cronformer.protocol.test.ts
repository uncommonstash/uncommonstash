import {
  CRONFORMER_PROTOCOL_VERSION,
  isCronformerRequest,
  isCronformerResponse,
} from "./cronformer.protocol";

describe("Cronformer worker protocol", () => {
  it("accepts versioned inference and initialization requests", () => {
    expect(
      isCronformerRequest({
        v: CRONFORMER_PROTOCOL_VERSION,
        id: 1,
        kind: "cronformer/infer",
        prompt: "every weekday at 9am",
      }),
    ).toBe(true);
    expect(
      isCronformerRequest({
        v: CRONFORMER_PROTOCOL_VERSION,
        id: 2,
        kind: "cronformer/initialize",
      }),
    ).toBe(true);
    expect(isCronformerRequest({ id: 1, kind: "cronformer/infer" })).toBe(
      false,
    );
  });

  it("accepts complete progress, ready, and result messages", () => {
    expect(
      isCronformerResponse({
        v: CRONFORMER_PROTOCOL_VERSION,
        id: 1,
        kind: "cronformer/progress",
        progress: {
          phase: "downloading",
          source: "network",
          loadedBytes: 12,
          totalBytes: 24,
        },
      }),
    ).toBe(true);
    expect(
      isCronformerResponse({
        v: CRONFORMER_PROTOCOL_VERSION,
        id: 1,
        kind: "cronformer/ready",
      }),
    ).toBe(true);
    expect(
      isCronformerResponse({
        v: CRONFORMER_PROTOCOL_VERSION,
        id: 1,
        kind: "cronformer/result",
        result: { cron: "0 9 * * 1-5" },
      }),
    ).toBe(true);
    expect(
      isCronformerResponse({
        v: CRONFORMER_PROTOCOL_VERSION,
        id: 1,
        kind: "cronformer/progress",
        progress: { phase: "ready" },
      }),
    ).toBe(false);
  });
});
