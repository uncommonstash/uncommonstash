// Deterministic dist tarball using the pinned `tar` devDependency.
// Policy: LC_ALL=C sorted entries, one mtime from SOURCE_DATE_EPOCH,
// portable headers (no uid/gid/uname/ctime/atime), gzip mtime=0.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { create } from "tar";

const root = process.cwd();
const mtime = new Date(Number(process.env.SOURCE_DATE_EPOCH || 0) * 1000);

function collect(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    out.push(rel);
    if (e.isDirectory()) out.push(...collect(path.join(dir, e.name), rel));
  }
  return out;
}

const files = ["dist", ...collect(path.join(root, "dist"), "dist")];

await create(
  {
    file: path.join(root, "dist.tar.gz"),
    cwd: root,
    portable: true,
    jobs: 1,
    mtime,
    gzip: { level: 9, mtime: 0 },
  },
  files,
);

const hash = createHash("sha256")
  .update(fs.readFileSync(path.join(root, "dist.tar.gz")))
  .digest("hex");
fs.writeFileSync(
  path.join(root, "dist.tar.gz.sha256"),
  `${hash}  dist.tar.gz\n`,
);
console.log(`make-dist-tarball: wrote dist.tar.gz (${hash.slice(0, 12)}…)`);
