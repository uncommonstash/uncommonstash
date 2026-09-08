// Fails the build if a pinned binary input changed unexpectedly.
// Update EXPECTED + review the diff whenever the dependency is intentionally bumped.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EXPECTED = {
  "public/magick.wasm":
    "8cf682c6b1cbf2d4772b7bfd7d4e481501fb953953fa2c9411f4c881a2e74c59",
  // Multithreaded FFmpeg engine, staged from @ffmpeg/core-mt by
  // scripts/prebuild-engine.mjs (gitignored build input, like blog-data).
  "public/engine/ffmpeg-core.js":
    "270a2e6ff945e173238610669a3f7132df5f9c52698a9bf708cf5c2ab6bda0de",
  "public/engine/ffmpeg-core.wasm":
    "be2c97605366b78f3f13e21b52e81a55a79e1f29c133b03a68ec187b1a2ec41a",
  "public/engine/ffmpeg-core.worker.js":
    "f77898d631dc010b45c29c23cb4379c611a7d7b131bf591d08a656bb729a4ca3",
};

let failed = false;
for (const [rel, want] of Object.entries(EXPECTED)) {
  const full = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(full)) {
    console.error(`verify-inputs: missing ${rel}`);
    failed = true;
    continue;
  }
  const got = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  if (got !== want) {
    console.error(
      `verify-inputs: HASH MISMATCH ${rel}\n  want ${want}\n  got  ${got}`,
    );
    failed = true;
  } else {
    console.log(`verify-inputs: ok ${rel} (${got.slice(0, 12)}…)`);
  }
}
if (failed) process.exit(1);
