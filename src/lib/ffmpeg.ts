import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null;

const CORE_VERSION = "0.12.10";
// NOTE: must be the ESM build, not UMD. @ffmpeg/ffmpeg always spawns its
// class worker as { type: "module" }, so inside the worker importScripts()
// doesn't exist and the core is loaded via `await import(coreURL).default`.
// The UMD build has no default export (and its side-effect global gets
// clobbered), so it fails with "failed to import ffmpeg-core.js".
const CORE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`;

export async function getFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: CORE_URL,
      wasmURL: WASM_URL,
    });
  }
  return ffmpeg;
}

export async function cutAudio(
  file: File,
  startTime: number,
  endTime: number,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile(file.name, await fetchFile(file));

  await ffmpeg.exec([
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
  return new Blob([data as any], { type: "audio/mpeg" });
}

export async function convertAudio(
  file: File,
  outputFormat: string,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile(file.name, await fetchFile(file));

  const outputFilename = `output.${outputFormat}`;
  await ffmpeg.exec(["-i", file.name, outputFilename]);

  const data = await ffmpeg.readFile(outputFilename);
  return new Blob([data as any], { type: `audio/${outputFormat}` });
}

export async function convertVideo(
  file: File,
  outputFormat: string,
  outputMimeType: string,
  onProgress?: (progress: number) => void
): Promise<{ url: string; name: string }> {
  const ffmpeg = await getFFmpeg();
  
  let progressHandler: (({ progress }: { progress: number }) => void) | undefined;
  if (onProgress) {
      progressHandler = ({ progress }: { progress: number }) => onProgress(progress);
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
    const args =
      outputFormat === "webm"
        ? ["-i", file.name, "-c:v", "libvpx", "-crf", "30", "-b:v", "0", outputName]
        : ["-i", file.name, outputName];
    await ffmpeg.exec(args);
    const data = await ffmpeg.readFile(outputName);
    
    const blob = new Blob([data as any], { type: outputMimeType });
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
      const internalName = `input_${i}_${files[i].name.split('.').pop() || 'tmp'}`;
      await ffmpeg.writeFile(internalName, await fetchFile(files[i]));
      internalFileNames.push(internalName);
    }

    const concatList = internalFileNames.map((name) => `file '${name}'`).join("\n");
    await ffmpeg.writeFile("concat_list.txt", concatList);

    // We remove "-c", "copy" to force re-encoding. 
    // This is necessary because the concat demuxer with "copy" requires 
    // all input files to have identical stream parameters (sample rate, channels, codec).
    // Re-encoding ensures the output is a single consistent stream.
    await ffmpeg.exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat_list.txt",
      "output.mp3",
    ]);

    const data = await ffmpeg.readFile("output.mp3");
    const blob = new Blob([data as any], { type: "audio/mpeg" });
    
    // Cleanup internal files
    for (const name of internalFileNames) {
      try { await ffmpeg.deleteFile(name); } catch (_e) {}
    }
    try { await ffmpeg.deleteFile("concat_list.txt"); } catch (_e) {}
    try { await ffmpeg.deleteFile("output.mp3"); } catch (_e) {}

    return blob;
  } catch (error) {
    console.error("FFmpeg combine failed:", error);
    throw error;
  }
}
