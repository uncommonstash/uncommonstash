import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { toBlobPart } from "./utils";

let ffmpeg: FFmpeg | null;

const CORE_VERSION = "0.12.10";
// NOTE: must be the ESM build, not UMD. @ffmpeg/ffmpeg always spawns its
// class worker as { type: "module" }, so inside the worker importScripts()
// doesn't exist and the core is loaded via `await import(coreURL).default`.
// The UMD build has no default export (and its side-effect global gets
// clobbered), so it fails with "failed to import ffmpeg-core.js".
const singleThread = {
  coreURL: `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`,
  wasmURL: `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`,
};
// Multithreaded core needs SharedArrayBuffer, i.e. a cross-origin-isolated
// document (see public/coi-serviceworker.js). Same version, plus worker.
// Self-hosted under /engine (see scripts/prebuild-engine.mjs): the core
// spawns its pthread worker from a URL relative to itself, and classic
// workers cannot be constructed cross-origin, so the CDN build can't work.
const multiThread = {
  coreURL: "/engine/ffmpeg-core.js",
  wasmURL: "/engine/ffmpeg-core.wasm",
};

function engineUrls() {
  if (typeof window !== "undefined" && window.crossOriginIsolated) {
    return { ...multiThread, threads: "multi" as const };
  }
  return { ...singleThread, threads: "single" as const };
}

let multiThreaded = false;

/** True once the multithreaded engine has been loaded. */
export function isMultiThreaded() {
  return multiThreaded;
}

// The MT build deadlocks when the encoder fans out too far inside 32-bit
// wasm (reproduced: hangs at 6+ threads, healthy at <=4 — while x264's own
// auto-selection stays clear of the zone). Scale with the machine but never
// exceed the proven-safe ceiling, and never drop below 2.
function threadCount(): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency > 0
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(2, Math.min(Math.floor(cores / 2), 4));
}

function threadArgs(): string[] {
  return multiThreaded ? ["-threads", String(threadCount())] : [];
}

export async function getFFmpeg() {
  if (!ffmpeg) {
    const engine = engineUrls();
    multiThreaded = engine.threads === "multi";
    console.info(`[ffmpeg] loading ${engine.threads}-thread core`);
    ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: engine.coreURL,
      wasmURL: engine.wasmURL,
    });
  }
  return ffmpeg;
}

/**
 * Run an exec command, dropping the engine singleton if the wasm instance
 * blows up. After an out-of-bounds trap or abort the heap/threads are left
 * in an undefined state — without this reset, every later conversion fails
 * identically until page reload. The next call transparently reloads fresh.
 */
async function runExec(args: string[]): Promise<number> {
  const instance = await getFFmpeg();
  try {
    return await instance.exec(args);
  } catch (error) {
    try {
      instance.terminate();
    } catch {
      // Already dead — just drop the reference below.
    }
    if (instance === ffmpeg) {
      ffmpeg = null;
    }
    throw error;
  }
}

export async function cutAudio(
  file: File,
  startTime: number,
  endTime: number,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile(file.name, await fetchFile(file));

  await runExec([
    "-i",
    file.name,
    "-ss",
    String(startTime),
    "-to",
    String(endTime),
    "-c",
    "copy",
    "output.mp3",
  ]);

  const data = await ffmpeg.readFile("output.mp3");
  return new Blob([toBlobPart(data)], { type: "audio/mpeg" });
}

export async function convertAudio(
  file: File,
  outputFormat: string,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile(file.name, await fetchFile(file));

  const outputFilename = `output.${outputFormat}`;
  await runExec(["-i", file.name, ...threadArgs(), outputFilename]);

  const data = await ffmpeg.readFile(outputFilename);
  return new Blob([toBlobPart(data)], { type: `audio/${outputFormat}` });
}

export async function convertVideo(
  file: File,
  outputFormat: string,
  outputMimeType: string,
  onProgress?: (progress: number) => void,
): Promise<{ url: string; name: string }> {
  const ffmpeg = await getFFmpeg();

  let progressHandler:
    | (({ progress }: { progress: number }) => void)
    | undefined;
  if (onProgress) {
    progressHandler = ({ progress }: { progress: number }) =>
      onProgress(progress);
    ffmpeg.on("progress", progressHandler);
  }

  try {
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    let outputName = `${baseName}.${outputFormat}`;
    if (outputName === file.name) {
      // Same container in and out (e.g. mp4->mp4): ffmpeg can't read and
      // write the same path, so suffix the output instead of failing obscurely.
      outputName = `${baseName}-converted.${outputFormat}`;
    }
    await ffmpeg.writeFile(file.name, await fetchFile(file));
    // NOTE: the single-threaded ffmpeg-core build crashes with
    // "memory access out of bounds" on the default VP9 encoder, so force
    // VP8 (libvpx) for .webm output. Verified: mp4->mp4, mp4->gif and
    // mp4->webm(vp8) all return exit code 0.
    // Same story for audio: ffmpeg's default webm audio encoder is Opus
    // (libopus), which OOBs on real-world 48kHz input in this build
    // (ffmpegwasm/ffmpeg.wasm#867: undersized Emscripten stack for libopus
    // at 48kHz; lower rates work, hence synthetic test audio never caught
    // it — fixed upstream by PR #824, unreleased as of core 0.12.10).
    // So force Vorbis (libvorbis) — also valid in WebM, verified ret=0.
    const args =
      outputFormat === "webm"
        ? [
            "-i",
            file.name,
            ...threadArgs(),
            "-c:v",
            "libvpx",
            "-crf",
            "30",
            "-b:v",
            "0",
            "-c:a",
            "libvorbis",
            outputName,
          ]
        : ["-i", file.name, ...threadArgs(), outputName];
    await runExec(args);
    const data = await ffmpeg.readFile(outputName);

    const blob = new Blob([toBlobPart(data)], { type: outputMimeType });
    const url = URL.createObjectURL(blob);
    await ffmpeg.deleteFile(outputName);
    await ffmpeg.deleteFile(file.name);

    return { url, name: outputName };
  } finally {
    if (progressHandler) {
      ffmpeg.off("progress", progressHandler);
    }
  }
}

export async function combineAudio(files: File[]): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const internalFileNames: string[] = [];

  try {
    // Write files with safe internal names to avoid issues with special characters or duplicates
    for (let i = 0; i < files.length; i++) {
      const internalName = `input_${i}_${files[i].name.split(".").pop() || "tmp"}`;
      await ffmpeg.writeFile(internalName, await fetchFile(files[i]));
      internalFileNames.push(internalName);
    }

    const concatList = internalFileNames
      .map((name) => `file '${name}'`)
      .join("\n");
    await ffmpeg.writeFile("concat_list.txt", concatList);

    // We remove "-c", "copy" to force re-encoding.
    // This is necessary because the concat demuxer with "copy" requires
    // all input files to have identical stream parameters (sample rate, channels, codec).
    // Re-encoding ensures the output is a single consistent stream.
    await runExec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat_list.txt",
      ...threadArgs(),
      "output.mp3",
    ]);

    const data = await ffmpeg.readFile("output.mp3");
    const blob = new Blob([toBlobPart(data)], { type: "audio/mpeg" });

    // Cleanup internal files
    for (const name of internalFileNames) {
      try {
        await ffmpeg.deleteFile(name);
      } catch (_e) {}
    }
    try {
      await ffmpeg.deleteFile("concat_list.txt");
    } catch (_e) {}
    try {
      await ffmpeg.deleteFile("output.mp3");
    } catch (_e) {}

    return blob;
  } catch (error) {
    console.error("FFmpeg combine failed:", error);
    throw error;
  }
}
