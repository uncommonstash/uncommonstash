// Fails the build if a pinned binary input changed unexpectedly.
// Update EXPECTED + review the diff whenever the dependency is intentionally bumped.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EXPECTED = {
  "public/magick.wasm":
    "8cf682c6b1cbf2d4772b7bfd7d4e481501fb953953fa2c9411f4c881a2e74c59",
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
    console.error(`verify-inputs: HASH MISMATCH ${rel}\n  want ${want}\n  got  ${got}`);
    failed = true;
  } else {
    console.log(`verify-inputs: ok ${rel} (${got.slice(0, 12)}…)`);
  }
}
if (failed) process.exit(1);
