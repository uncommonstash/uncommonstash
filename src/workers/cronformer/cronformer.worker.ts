/// <reference lib="webworker" />

import * as ort from "onnxruntime-web";
import type {
  CronformerProgress,
  CronformerResponse,
} from "./cronformer.protocol";
import {
  CRONFORMER_PROTOCOL_VERSION,
  isCronformerRequest,
} from "./cronformer.protocol";

const MODEL_URL = `${import.meta.env.BASE_URL}models/cronformer/model.onnx`;
const VOCAB_URL = `${import.meta.env.BASE_URL}models/cronformer/vocab.txt`;
const MODEL_MANIFEST_URL = `${import.meta.env.BASE_URL}models/cronformer/manifest.json`;
const COMPONENTS = ["minute", "hour", "dom", "month", "dow"] as const;
const PATTERNS = {
  WILDCARD: 0,
  VALUE: 1,
  LIST: 2,
  RANGE: 3,
  STEP: 4,
  NTH_WEEKDAY: 5,
  LAST: 6,
  NEAREST: 7,
} as const;

type ComponentName = (typeof COMPONENTS)[number];
type TensorOutputs = Record<string, ort.Tensor>;
type ModelManifest = { revision: string };

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let vocabularyPromise: Promise<Map<string, number>> | null = null;
const activeRequests = new Set<number>();

function post(response: CronformerResponse) {
  self.postMessage(response);
}

function reportProgress(progress: CronformerProgress) {
  for (const id of activeRequests) {
    post({
      v: CRONFORMER_PROTOCOL_VERSION,
      id,
      kind: "cronformer/progress",
      progress,
    });
  }
}

function argmax(values: ArrayLike<number>): number {
  let bestIndex = 0;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index++) {
    if (values[index] > bestValue) {
      bestValue = values[index];
      bestIndex = index;
    }
  }
  return bestIndex;
}

function topK(values: ArrayLike<number>, count: number): number[] {
  return Array.from(values, (value, index) => ({ index, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, count)
    .map(({ index }) => index);
}

function values(output: TensorOutputs, name: string): Float32Array {
  const tensor = output[name];
  if (!(tensor?.data instanceof Float32Array)) {
    throw new Error(`Cronformer output ${name} was unavailable`);
  }
  return tensor.data;
}

function isChineseCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x20000 && codePoint <= 0x2a6df)
  );
}

function basicTokens(prompt: string): string[] {
  const separatedChinese = Array.from(prompt, (character) =>
    isChineseCharacter(character) ? ` ${character} ` : character,
  ).join("");
  return separatedChinese
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/[\p{P}\p{S}]/gu, " $& ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function wordPieces(token: string, vocabulary: Map<string, number>): number[] {
  if (token.length > 100) return [vocabulary.get("[UNK]") ?? 100];
  const pieces: number[] = [];
  let start = 0;
  while (start < token.length) {
    let end = token.length;
    let match: number | undefined;
    while (start < end) {
      const candidate = `${start === 0 ? "" : "##"}${token.slice(start, end)}`;
      match = vocabulary.get(candidate);
      if (match !== undefined) break;
      end--;
    }
    if (match === undefined) return [vocabulary.get("[UNK]") ?? 100];
    pieces.push(match);
    start = end;
  }
  return pieces;
}

function tokenize(
  prompt: string,
  vocabulary: Map<string, number>,
): BigInt64Array {
  const ids = [vocabulary.get("[CLS]") ?? 101];
  for (const token of basicTokens(prompt)) {
    ids.push(...wordPieces(token, vocabulary));
    if (ids.length >= 127) break;
  }
  ids.length = Math.min(ids.length, 127);
  ids.push(vocabulary.get("[SEP]") ?? 102);
  while (ids.length < 128) ids.push(vocabulary.get("[PAD]") ?? 0);
  return BigInt64Array.from(ids, BigInt);
}

function componentToCron(
  output: TensorOutputs,
  component: ComponentName,
  componentIndex: number,
): string {
  const pattern = values(output, `${component}_pattern`);
  const valueLogits = values(output, `${component}_values`);
  const listValueLogits = values(output, `${component}_list_values`);
  const rangeStart = values(output, `${component}_range_start`);
  const rangeEnd = values(output, `${component}_range_end`);
  const stepStart = values(output, `${component}_step_start`);
  const stepSize = values(output, `${component}_step_size`);
  const nth = values(output, `${component}_nth`);
  const lastOffset = values(output, `${component}_last_offset`);
  const valueCount = values(output, `${component}_value_count`);
  const patternIndex = argmax(pattern);

  switch (patternIndex) {
    case PATTERNS.WILDCARD:
      return "*";
    case PATTERNS.VALUE:
      return String(argmax(valueLogits));
    case PATTERNS.LIST: {
      const count = Math.max(
        1,
        Math.min(argmax(valueCount), listValueLogits.length),
      );
      const selected = topK(listValueLogits, count).sort(
        (left, right) => left - right,
      );
      if (componentIndex === 2 && argmax(lastOffset) === 0) selected.push(-1);
      return selected
        .map((value) => (value === -1 ? "L" : String(value)))
        .join(",");
    }
    case PATTERNS.RANGE:
      return `${argmax(rangeStart)}-${argmax(rangeEnd)}`;
    case PATTERNS.STEP: {
      const start = argmax(stepStart);
      const size = argmax(stepSize);
      if (size === 1 && start === 0) return "*";
      return `${start === 0 ? "*" : start}/${size}`;
    }
    case PATTERNS.NTH_WEEKDAY:
      return `${argmax(valueLogits)}#${argmax(nth)}`;
    case PATTERNS.LAST: {
      const offset = argmax(lastOffset);
      if (offset > 0) return `L-${offset}`;
      return componentIndex !== 2 && valueLogits.some((value) => value > 0)
        ? `${argmax(valueLogits)}L`
        : "L";
    }
    case PATTERNS.NEAREST:
      return `${argmax(valueLogits)}W`;
    default:
      return "*";
  }
}

async function cachedAsset(
  url: string,
  cacheName: string,
  reportDownload: boolean,
): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(cacheName);
    const cached = await cache.match(url);
    if (cached) {
      const totalBytes = Number(cached.headers.get("content-length")) || 0;
      if (reportDownload) {
        reportProgress({
          phase: "downloading",
          source: "cache",
          loadedBytes: totalBytes || 1,
          totalBytes: totalBytes || 1,
        });
      }
      return cached.arrayBuffer();
    }
  } catch {
    // Cache Storage is optional (for example, it can be unavailable in private mode).
  }

  const response = await fetch(url);
  if (!response.ok)
    throw new Error("Cronformer model files could not be downloaded");
  void cache?.put(url, response.clone()).catch(() => {
    // Inference still works if the browser declines to persist the model.
  });

  const totalBytes = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    const asset = await response.arrayBuffer();
    if (reportDownload) {
      reportProgress({
        phase: "downloading",
        source: "network",
        loadedBytes: asset.byteLength,
        totalBytes: totalBytes || asset.byteLength,
      });
    }
    return asset;
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    if (reportDownload) {
      reportProgress({
        phase: "downloading",
        source: "network",
        loadedBytes,
        totalBytes,
      });
    }
  }
  const asset = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    asset.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return asset.buffer;
}

async function modelManifest(): Promise<ModelManifest> {
  const response = await fetch(MODEL_MANIFEST_URL, { cache: "no-cache" });
  if (!response.ok)
    throw new Error("Cronformer model metadata could not be loaded");
  const manifest: unknown = await response.json();
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    typeof (manifest as Record<string, unknown>).revision !== "string"
  ) {
    throw new Error("Cronformer model metadata was invalid");
  }
  return manifest as ModelManifest;
}

function parseVocabulary(asset: ArrayBuffer): Map<string, number> {
  return new Map(
    new TextDecoder()
      .decode(asset)
      .trimEnd()
      .split("\n")
      .map((token, index) => [token.replace(/\r$/, ""), index]),
  );
}

async function createSession(
  model: ArrayBuffer,
): Promise<ort.InferenceSession> {
  const options = { graphOptimizationLevel: "all" as const };
  // The WebGPU entry point can leave session creation pending on devices that
  // expose an adapter but cannot run this model, so its fallback never runs.
  // Single-threaded WASM is reliable in workers and does not require COOP/COEP.
  ort.env.wasm.numThreads = 1;
  return ort.InferenceSession.create(model, {
    ...options,
    executionProviders: ["wasm"],
  });
}

async function session() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const manifest = await modelManifest();
      const cacheName = `cronformer-${manifest.revision}`;
      const [model, vocab] = await Promise.all([
        cachedAsset(MODEL_URL, cacheName, true),
        cachedAsset(VOCAB_URL, cacheName, false),
      ]);
      vocabularyPromise = Promise.resolve(parseVocabulary(vocab));
      reportProgress({
        phase: "initializing",
        source: "cache",
        loadedBytes: model.byteLength,
        totalBytes: model.byteLength,
      });
      const loadedSession = await createSession(model);
      reportProgress({
        phase: "ready",
        source: "cache",
        loadedBytes: model.byteLength,
        totalBytes: model.byteLength,
      });
      return loadedSession;
    })().catch((error) => {
      sessionPromise = null;
      vocabularyPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function infer(prompt: string): Promise<string> {
  const loadedSession = await session();
  const loadedVocabulary = await vocabularyPromise;
  if (!loadedVocabulary)
    throw new Error("Cronformer tokenizer could not be loaded");
  const inputIds = tokenize(prompt, loadedVocabulary);
  const attentionMask = BigInt64Array.from(inputIds, (id) =>
    id === 0n ? 0n : 1n,
  );
  const output = await loadedSession.run({
    input_ids: new ort.Tensor("int64", inputIds, [1, 128]),
    attention_mask: new ort.Tensor("int64", attentionMask, [1, 128]),
  });
  return COMPONENTS.map((component, index) =>
    componentToCron(output, component, index),
  ).join(" ");
}

self.onmessage = async (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isCronformerRequest(message)) {
    if (
      typeof message === "object" &&
      message !== null &&
      typeof (message as Record<string, unknown>).id === "number"
    ) {
      post({
        v: CRONFORMER_PROTOCOL_VERSION,
        id: (message as Record<string, number>).id,
        kind: "cronformer/error",
        message: "Cronformer received an invalid request",
      });
    }
    return;
  }
  activeRequests.add(message.id);
  try {
    const cron = await infer(message.prompt);
    post({
      v: CRONFORMER_PROTOCOL_VERSION,
      id: message.id,
      kind: "cronformer/result",
      result: { cron },
    } satisfies CronformerResponse);
  } catch (error) {
    post({
      v: CRONFORMER_PROTOCOL_VERSION,
      id: message.id,
      kind: "cronformer/error",
      message: error instanceof Error ? error.message : "Cronformer failed",
    } satisfies CronformerResponse);
  } finally {
    activeRequests.delete(message.id);
  }
};
