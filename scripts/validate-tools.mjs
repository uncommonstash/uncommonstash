import fs from "node:fs";
import path from "node:path";

const candidates = [
  path.resolve(process.cwd(), "src/pages"),
  path.resolve(process.cwd(), "app"),
];
const toolsDir = candidates.find((d) => fs.existsSync(d)) ?? candidates[0];
const appTsxPath = path.resolve(process.cwd(), "src/App.tsx");

// Routes that never require a tool.yaml:
// - "/" (home), "/blog" + "/blog/*" (blog), "/about*" (about-style, future-proof)
// - "/:slug" (DynamicConverter), "/404" + "*" (not-found catch-all)
// - "/audio-recorder" (legacy alias of /audio/recorder)
const EXEMPT_ROUTES = new Set([
  "/",
  "/blog",
  "/:slug",
  "/404",
  "*",
  "/audio-recorder",
]);

function isExemptRoute(routePath) {
  if (EXEMPT_ROUTES.has(routePath)) {
    return true;
  }
  if (routePath === "/about" || routePath.startsWith("/about/")) {
    return true;
  }
  if (routePath.startsWith("/blog/")) {
    return true;
  }
  return false;
}

function findToolYamlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findToolYamlFiles(fullPath));
    } else if (entry.name === "tool.yaml") {
      files.push(fullPath);
    }
  }
  return files;
}

function slugFromToolFile(file) {
  return path.dirname(file).replace(toolsDir, "").replace(/\\/g, "/") || "/";
}

function parseRoutePaths(source) {
  const routePaths = [];
  const re = /<Route[^>]*\bpath\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    routePaths.push(match[1]);
  }
  return routePaths;
}

function run() {
  if (!fs.existsSync(appTsxPath)) {
    console.error(`validate-tools: src/App.tsx not found at ${appTsxPath}`);
    process.exit(1);
  }

  const toolFiles = findToolYamlFiles(toolsDir);
  const slugs = toolFiles.map(slugFromToolFile);
  const slugSet = new Set(slugs);

  const appSource = fs.readFileSync(appTsxPath, "utf8");
  const routePaths = parseRoutePaths(appSource);
  const routeSet = new Set(routePaths);

  const errors = [];

  for (let i = 0; i < toolFiles.length; i += 1) {
    const slug = slugs[i];
    if (!routeSet.has(slug)) {
      errors.push(
        `tool.yaml slug "${slug}" from ${toolFiles[i]} has no matching <Route path> in src/App.tsx`,
      );
    }
  }

  for (const routePath of routeSet) {
    if (isExemptRoute(routePath)) {
      continue;
    }
    if (!slugSet.has(routePath)) {
      errors.push(
        `<Route path="${routePath}" /> in src/App.tsx has no matching tool.yaml (expected slug "${routePath}")`,
      );
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`validate-tools: ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `validate-tools: OK (${slugs.length} tool.yaml slugs, ${routePaths.length} routes, ${EXEMPT_ROUTES.size} exempt routes)`,
  );
}

run();
