// Writes dist/build-info.json: the deployment's provenance claim.
// Runs at the end of `pnpm build` (before checksums/tarball in the deploy
// workflow, so this file is covered by sha256sums.txt + the attestation).
// Output must stay deterministic for a given commit: no wall-clock time,
// no absolute paths, only git metadata + stable URLs.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = "uncommonstash/uncommonstash";

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const commit = git("rev-parse HEAD");
const commitTimeEpoch = Number(git("log -1 --format=%ct") || 0);

if (!commit || !commitTimeEpoch) {
  console.error("generate-build-info: git metadata unavailable, failing");
  process.exit(1);
}

const info = {
  version: 1,
  repo: REPO,
  commit,
  commitTime: new Date(commitTimeEpoch * 1000).toISOString(),
  commitUrl: `https://github.com/${REPO}/commit/${commit}`,
  // Independent copies / evidence, all outside the served origin:
  sbom: "/sbom.cyclonedx.json",
  checksums: "/sha256sums.txt",
  attestations: `https://github.com/${REPO}/attestations`,
  ciRuns: `https://github.com/${REPO}/actions/workflows/deploy-pages.yml`,
  rebuild: {
    // Intentional line breaks (backslash continuations): render readably
    // in <pre> and still paste straight into a shell.
    checkout: `git clone https://github.com/${REPO}.git && \\\n  cd uncommonstash && \\\n  git checkout ${commit}`,
    build: `pnpm install --frozen-lockfile && \\\n  SOURCE_DATE_EPOCH=${commitTimeEpoch} pnpm build`,
    compare: `diff <(cd dist && \\\n    find . -type f | LC_ALL=C sort | xargs sha256sum) \\\n  <(curl -s https://uncommonstash.com/sha256sums.txt)`,
  },
  caveats: [
    "This proves the published artifact equals the linked source commit. It does not prove what any single visitor received over the network (CDN/DNS layer).",
    "Reproducible builds prove what code shipped. The privacy claim (files never leave your device) is a property of that code: audit the linked commit.",
  ],
};

const dist = path.resolve(process.cwd(), "dist");
if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("generate-build-info: dist/index.html not found, failing");
  process.exit(1);
}
fs.writeFileSync(
  path.join(dist, "build-info.json"),
  `${JSON.stringify(info, null, 2)}\n`,
);
console.log(
  `generate-build-info: wrote dist/build-info.json (${commit.slice(0, 12)}…)`,
);
