// Double-build reproducibility gate: rebuilds from scratch (with a time
// gap so wall-clock leaks surface) and fails on any byte difference in
// dist/ or the deterministic tarball. Run after `pnpm build` in CI.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function snapshot(dir) {
  const out = new Map();
  const walk = (d) => {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const rel = path.relative(root, full);
        out.set(
          rel,
          createHash("sha256").update(fs.readFileSync(full)).digest("hex"),
        );
      }
    }
  };
  walk(dir);
  return out;
}

function diffMaps(a, b, label) {
  const problems = [];
  for (const [k, v] of a) {
    if (!b.has(k)) problems.push(`only in first build: ${k}`);
    else if (b.get(k) !== v) problems.push(`content differs: ${k}`);
  }
  for (const k of b.keys()) {
    if (!a.has(k)) problems.push(`only in second build: ${k}`);
  }
  if (problems.length > 0) {
    console.error(`verify-reproducible: ${label} NOT reproducible:`);
    for (const p of problems) console.error(`  - ${p}`);
    return false;
  }
  console.log(
    `verify-reproducible: ${label} identical across builds (${a.size} files)`,
  );
  return true;
}

const distDir = path.join(root, "dist");
if (!fs.existsSync(distDir)) {
  console.error("verify-reproducible: dist/ missing, run pnpm build first");
  process.exit(1);
}

const first = snapshot(distDir);
const firstCodegen = new Map([
  ["src/lib/tools.json", ""],
  ["src/lib/blog-data.ts", ""],
]);
for (const f of firstCodegen.keys()) {
  firstCodegen.set(
    f,
    createHash("sha256")
      .update(fs.readFileSync(path.join(root, f)))
      .digest("hex"),
  );
}

// Guarantee file mtimes differ between builds so timestamp leaks fail loudly.
await new Promise((r) => setTimeout(r, 2000));
fs.rmSync(distDir, { recursive: true, force: true });
execSync("pnpm build", { stdio: "inherit", cwd: root });

let ok = true;
ok = diffMaps(first, snapshot(distDir), "dist/") && ok;

const secondCodegen = new Map();
for (const f of firstCodegen.keys()) {
  secondCodegen.set(
    f,
    createHash("sha256")
      .update(fs.readFileSync(path.join(root, f)))
      .digest("hex"),
  );
}
ok = diffMaps(firstCodegen, secondCodegen, "codegen") && ok;

execSync("node scripts/make-dist-tarball.mjs", { stdio: "pipe", cwd: root });
const tarA = fs.readFileSync(path.join(root, "dist.tar.gz"));
fs.rmSync(path.join(root, "dist.tar.gz"));
fs.rmSync(path.join(root, "dist.tar.gz.sha256"));
execSync("node scripts/make-dist-tarball.mjs", { stdio: "pipe", cwd: root });
const tarB = fs.readFileSync(path.join(root, "dist.tar.gz"));
if (tarA.equals(tarB)) {
  console.log("verify-reproducible: dist.tar.gz identical across builds");
} else {
  console.error("verify-reproducible: dist.tar.gz differs across builds");
  ok = false;
}

if (!ok) process.exit(1);
console.log("verify-reproducible: PASS");
