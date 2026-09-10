// Shared protocol for the sysdiagnose ingest worker.
// Imported by both the worker and the main-thread client — shapes are defined
// exactly once. All messages carry v: 1 so future versions can coexist.

import type { WifiAnalysis } from "@/workers/sysdiagnose-wifi/analysis";

export const INGEST_PROTOCOL_VERSION = 1 as const;

export type IngestStage =
  | "reading"
  | "decompressing"
  | "indexing"
  | "storing"
  | "done";

export interface IngestProgressMsg {
  v: typeof INGEST_PROTOCOL_VERSION;
  kind: "ingest/progress";
  id: number;
  stage: IngestStage;
  /** 0..1 overall. Byte-exact for reading; estimated afterwards. */
  fraction: number;
  bytesRead: number;
  bytesTotal: number;
  filesFound: number;
}

export interface IngestEntryMsg {
  path: string;
  size: number;
  mtime: number;
  kind: "text" | "sqlite" | "plist" | "binary";
  data: ArrayBuffer;
}

export interface IngestDoneMsg {
  v: typeof INGEST_PROTOCOL_VERSION;
  kind: "ingest/done";
  id: number;
  entries: IngestEntryMsg[];
  wifi: WifiAnalysis;
}

export interface IngestErrorMsg {
  v: typeof INGEST_PROTOCOL_VERSION;
  kind: "ingest/error";
  id: number;
  code: "read" | "decompress" | "parse" | "unknown";
  message: string;
}

export interface IngestStartMsg {
  v: typeof INGEST_PROTOCOL_VERSION;
  kind: "ingest/start";
  id: number;
  file: Blob;
}

export type WorkerIn = IngestStartMsg;
export type WorkerOut = IngestProgressMsg | IngestDoneMsg | IngestErrorMsg;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isIngestStartMsg(v: unknown): v is IngestStartMsg {
  if (!isRecord(v)) return false;
  return (
    v["v"] === INGEST_PROTOCOL_VERSION &&
    v["kind"] === "ingest/start" &&
    typeof v["id"] === "number" &&
    v["file"] instanceof Blob
  );
}

export function isWorkerOutMsg(v: unknown): v is WorkerOut {
  if (!isRecord(v)) return false;
  if (v["v"] !== INGEST_PROTOCOL_VERSION) return false;
  switch (v["kind"]) {
    case "ingest/progress":
      return (
        typeof v["id"] === "number" &&
        typeof v["stage"] === "string" &&
        typeof v["fraction"] === "number"
      );
    case "ingest/done":
      return (
        typeof v["id"] === "number" &&
        Array.isArray(v["entries"]) &&
        isRecord(v["wifi"])
      );
    case "ingest/error":
      return typeof v["id"] === "number" && typeof v["message"] === "string";
    default:
      return false;
  }
}
