import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.cwd(), "dist");
const indexHtml = path.join(dist, "index.html");

if (!fs.existsSync(indexHtml)) {
  console.error("postbuild-pages: dist/index.html not found, failing");
  process.exit(1);
}

// SPA fallback for GitHub Pages + react-router BrowserRouter
fs.copyFileSync(indexHtml, path.join(dist, "404.html"));
console.log("postbuild-pages: copied index.html -> 404.html");

// Prevent Jekyll processing
fs.writeFileSync(path.join(dist, ".nojekyll"), "");
console.log("postbuild-pages: wrote .nojekyll");

// CNAME for custom domain (uncommonstash.com). Kept in public/ as source of truth;
// this is a fallback in case public/CNAME was not copied.
// Never overwrite an existing dist/CNAME.
const cnamePath = path.join(dist, "CNAME");
if (!fs.existsSync(cnamePath)) {
  const publicCname = path.resolve(process.cwd(), "public/CNAME");
  if (fs.existsSync(publicCname)) {
    fs.copyFileSync(publicCname, cnamePath);
    console.log("postbuild-pages: copied public/CNAME -> dist/CNAME");
  } else {
    fs.writeFileSync(cnamePath, "uncommonstash.com\n");
    console.log("postbuild-pages: wrote dist/CNAME (uncommonstash.com)");
  }
} else {
  console.log("postbuild-pages: dist/CNAME already exists, not overwriting");
}
