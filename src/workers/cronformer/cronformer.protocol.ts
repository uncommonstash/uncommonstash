export const CRONFORMER_PROTOCOL_VERSION = 1 as const;

export type CronformerLoadPhase = "downloading" | "initializing" | "ready";

export interface CronformerProgress {
  phase: CronformerLoadPhase;
  source: "cache" | "network";
  loadedBytes: number;
  totalBytes: number;
}

export interface CronformerRequest {
  v: typeof CRONFORMER_PROTOCOL_VERSION;
  id: number;
  kind: "cronformer/infer";
  prompt: string;
}

export interface CronformerInitializeRequest {
  v: typeof CRONFORMER_PROTOCOL_VERSION;
  id: number;
  kind: "cronformer/initialize";
}

export interface CronformerResult {
  cron: string;
}

export type CronformerResponse =
  | {
      v: typeof CRONFORMER_PROTOCOL_VERSION;
      id: number;
      kind: "cronformer/progress";
      progress: CronformerProgress;
    }
  | {
      v: typeof CRONFORMER_PROTOCOL_VERSION;
      id: number;
      kind: "cronformer/result";
      result: CronformerResult;
    }
  | {
      v: typeof CRONFORMER_PROTOCOL_VERSION;
      id: number;
      kind: "cronformer/ready";
    }
  | {
      v: typeof CRONFORMER_PROTOCOL_VERSION;
      id: number;
      kind: "cronformer/error";
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCronformerRequest(
  value: unknown,
): value is CronformerRequest | CronformerInitializeRequest {
  if (!isRecord(value)) return false;
  return (
    value["v"] === CRONFORMER_PROTOCOL_VERSION &&
    typeof value["id"] === "number" &&
    ((value["kind"] === "cronformer/infer" &&
      typeof value["prompt"] === "string") ||
      value["kind"] === "cronformer/initialize")
  );
}

export function isCronformerResponse(
  value: unknown,
): value is CronformerResponse {
  if (!isRecord(value)) return false;
  if (
    value["v"] !== CRONFORMER_PROTOCOL_VERSION ||
    typeof value["id"] !== "number"
  ) {
    return false;
  }
  switch (value["kind"]) {
    case "cronformer/progress": {
      const progress = value["progress"];
      return (
        isRecord(progress) &&
        (progress["phase"] === "downloading" ||
          progress["phase"] === "initializing" ||
          progress["phase"] === "ready") &&
        (progress["source"] === "cache" || progress["source"] === "network") &&
        typeof progress["loadedBytes"] === "number" &&
        typeof progress["totalBytes"] === "number"
      );
    }
    case "cronformer/result":
      return (
        isRecord(value["result"]) && typeof value["result"]["cron"] === "string"
      );
    case "cronformer/ready":
      return true;
    case "cronformer/error":
      return typeof value["message"] === "string";
    default:
      return false;
  }
}
