import fs from "fs/promises";
import path from "path";
import * as yaml from "js-yaml";
import { existsSync } from "fs";
import * as RadixIcons from "@radix-ui/react-icons";

const candidates = [
  path.resolve(process.cwd(), "src/pages"),
  path.resolve(process.cwd(), "app"),
];
const toolsDir = candidates.find((d) => existsSync(d)) ?? candidates[0];
const outputFile = path.resolve(process.cwd(), "src/lib/tools.json");

async function findToolYamlFiles(dir) {
  let files = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(await findToolYamlFiles(fullPath));
    } else if (item.name === "tool.yaml") {
      files.push(fullPath);
    }
  }
  return files;
}

function fail(file, message) {
  console.error(`collect-tools: validation failed for ${file}: ${message}`);
  process.exit(1);
}

async function collectTools() {
  let toolFiles;
  try {
    toolFiles = await findToolYamlFiles(toolsDir);
  } catch (error) {
    console.error(`collect-tools: failed to scan ${toolsDir}:`, error);
    process.exit(1);
  }
  const tools = [];
  const seenSlugs = new Map();

  for (const file of toolFiles) {
    const content = await fs.readFile(file, "utf8");
    const data = yaml.load(content);

    if (typeof data !== "object" || data === null) {
      fail(file, "tool.yaml must parse to a mapping object");
    }

    const { name, description, ready, icon } = data;

    if (typeof name !== "string" || name.trim().length === 0) {
      fail(
        file,
        'missing or empty required field "name" (must be a non-empty string)',
      );
    }
    if (typeof description !== "string" || description.trim().length === 0) {
      fail(
        file,
        'missing or empty required field "description" (must be a non-empty string)',
      );
    }
    if (typeof ready !== "boolean") {
      fail(
        file,
        'missing or invalid required field "ready" (must be a boolean)',
      );
    }
    if (typeof icon !== "string" || icon.trim().length === 0) {
      fail(
        file,
        'missing or empty required field "icon" (must be a non-empty string)',
      );
    }
    if (!(icon in RadixIcons)) {
      fail(
        file,
        `unknown icon "${icon}" (not exported by @radix-ui/react-icons)`,
      );
    }

    const slug =
      path.dirname(file).replace(toolsDir, "").replace(/\\/g, "/") || "/";
    if (seenSlugs.has(slug)) {
      console.error(
        `collect-tools: duplicate slug "${slug}" from ${file} and ${seenSlugs.get(slug)}`,
      );
      process.exit(1);
    }
    seenSlugs.set(slug, file);

    tools.push({
      ...data,
      slug,
      icon,
    });
  }

  await fs.writeFile(outputFile, JSON.stringify(tools, null, 2));
  console.log(`Collected ${tools.length} tools into ${outputFile}`);
}

collectTools().catch((error) => {
  console.error("collect-tools: unexpected error:", error);
  process.exit(1);
});
