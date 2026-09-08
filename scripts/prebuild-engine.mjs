/**
 * Stages the multithreaded FFmpeg engine files into public/engine/.
 *
 * The MT core spawns its pthread worker via `new Worker(relative-url)`,
 * which must be same-origin (classic workers can't be constructed
 * cross-origin). Loading it from a CDN therefore fails, so we self-host.
 *
 * Source of truth is the @ffmpeg/core-mt npm package (lockfile-hashed,
 * cached in the pnpm store, visible to audit/Dependabot) — files are
 * copied out of node_modules, never fetched over HTTP at build time.
 * Files are gitignored; public/engine is rebuilt by every prebuild chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES = ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"];
const dir = path.join(__dirname, "..", "public", "engine");

async function main() {
  // Plain fs reads (not require/import) sidestep the package's restrictive
  // `exports` map. Scripts always run from the repo root, where pnpm links
  // node_modules/@ffmpeg/core-mt (symlink into the content store).
  const pkgDir = fs.realpathSync(path.resolve("node_modules/@ffmpeg/core-mt"));
  const { version } = JSON.parse(
    fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"),
  );
  const srcDir = path.join(pkgDir, "dist", "esm");
  const marker = path.join(dir, ".version");

  const cached =
    fs.existsSync(marker) &&
    fs.readFileSync(marker, "utf8").trim() === version &&
    FILES.every((f) => fs.existsSync(path.join(dir, f)));
  if (cached) {
    console.log(`engine: using cached @ffmpeg/core-mt@${version}`);
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const file of FILES) {
    const src = path.join(srcDir, file);
    if (!fs.existsSync(src)) {
      throw new Error(`@ffmpeg/core-mt@${version} is missing dist/esm/${file}`);
    }
    fs.copyFileSync(src, path.join(dir, file));
    const size = fs.statSync(path.join(dir, file)).size;
    console.log(`engine: staged ${file} (${(size / 1048576).toFixed(1)} MB)`);
  }
  fs.writeFileSync(marker, `${version}\n`);
}

main().catch((error) => {
  console.error("engine prebuild failed:", error);
  process.exit(1);
});
