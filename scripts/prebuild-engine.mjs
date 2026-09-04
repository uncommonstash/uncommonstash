/**
 * Fetches the multithreaded FFmpeg engine files into public/engine/.
 *
 * The MT core spawns its pthread worker via `new Worker(relative-url)`,
 * which must be same-origin (classic workers can't be constructed
 * cross-origin). Loading it from a CDN therefore fails, so we self-host.
 * Files are gitignored and (re)fetched by postinstall/dev/build; existing
 * version-matching files are reused as a cache.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_VERSION = "0.12.10";
const FILES = ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"];
const dir = path.join(__dirname, "..", "public", "engine");
const marker = path.join(dir, ".version");

async function main() {
  const cached =
    fs.existsSync(marker) &&
    fs.readFileSync(marker, "utf8").trim() === CORE_VERSION &&
    FILES.every((f) => fs.existsSync(path.join(dir, f)));
  if (cached) {
    console.log(`engine: using cached @ffmpeg/core-mt@${CORE_VERSION}`);
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const file of FILES) {
    const url = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm/${file}`;
    console.log(`engine: fetching ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error(`fetch ${url}: empty body`);
    fs.writeFileSync(path.join(dir, file), buf);
    console.log(
      `engine: wrote ${file} (${(buf.length / 1048576).toFixed(1)} MB)`,
    );
  }
  fs.writeFileSync(marker, `${CORE_VERSION}\n`);
}

main().catch((error) => {
  console.error("engine prebuild failed:", error);
  process.exit(1);
});
