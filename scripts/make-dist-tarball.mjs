// Portable deterministic tarball: sorted entries, fixed mtime/uid/gid,
// gzip without timestamp/name. Works with BSD + GNU toolchains.
import { createGzip } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const dist = path.resolve(process.cwd(), "dist");
const outTar = path.resolve(process.cwd(), "dist.tar");
const outGz = path.resolve(process.cwd(), "dist.tar.gz");
const mtime = Number(process.env.SOURCE_DATE_EPOCH || 0);

function collect(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      files.push({ rel: `dist/${rel}`, dir: true });
      files.push(...collect(full, rel));
    } else if (e.isFile()) {
      files.push({ rel: `dist/${rel}`, full });
    }
  }
  return files;
}

function tarHeader(name, size, mtime, typeflag) {
  const buf = Buffer.alloc(512, 0);
  const nameBuf = Buffer.from(name);
  if (nameBuf.length > 100) throw new Error(`path too long for tar: ${name}`);
  nameBuf.copy(buf, 0);
  buf.write("0000000", 100, 7); // mode (uid/gid stay 0)
  buf.write("0000000", 108, 7);
  buf.write("0000000", 116, 7);
  buf.write(size.toString(8).padStart(11, "0"), 124, 11);
  buf.write(mtime.toString(8).padStart(11, "0"), 136, 11);
  buf[156] = typeflag === "dir" ? 53 : 48; // '5' or '0'
  buf.write("ustar", 257, 5);
  buf.write("00", 263, 2);
  // checksum: spaces then computed
  buf.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of buf) sum += b;
  buf.write(sum.toString(8).padStart(6, "0"), 148, 6);
  buf[154] = 0;
  buf[155] = 0x20;
  return buf;
}

const entries = collect(dist);
const out = fs.createWriteStream(outTar);
for (const e of entries) {
  if (e.dir) {
    out.write(tarHeader(`${e.rel}/`, 0, mtime, "dir"));
  } else {
    const data = fs.readFileSync(e.full);
    out.write(tarHeader(e.rel, data.length, mtime, "file"));
    out.write(data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) out.write(Buffer.alloc(pad, 0));
  }
}
out.write(Buffer.alloc(1024, 0));
out.end();
await new Promise((resolve, reject) => {
  out.on("finish", resolve);
  out.on("error", reject);
});

// Deterministic gzip: mtime=0 in header (createGzip with mtime:0... use mtime option via header? Node sets MTIME from options.mtime).
await pipeline(
  fs.createReadStream(outTar),
  createGzip({ level: 9, mtime: 0 }),
  fs.createWriteStream(outGz),
);
fs.unlinkSync(outTar);

const { createHash } = await import("node:crypto");
const hash = createHash("sha256").update(fs.readFileSync(outGz)).digest("hex");
fs.writeFileSync("dist.tar.gz.sha256", `${hash}  dist.tar.gz\n`);
console.log(`make-dist-tarball: wrote dist.tar.gz (${hash.slice(0, 12)}…)`);
