import fs from "fs/promises";
import path from "path";
import { optimizeSvg } from "./optimize.mjs";
import { validateAll, printValidationResults } from "./validate.mjs";

function parseId(id) {
  const parts = id.split(".");
  return {
    vendor: parts[0],
    slug: parts.slice(1).join(".")
  };
}

function sortObjectKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, obj[key]]));
}

const rootDir = process.cwd();
const validation = await validateAll({ rootDir, quiet: true });
printValidationResults({ errors: validation.errors, warnings: validation.warnings });
if (validation.errors.length > 0) {
  process.exit(1);
}

const distDir = path.join(rootDir, "dist");
await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(path.join(distDir, "svg"), { recursive: true });
await fs.mkdir(path.join(distDir, "index"), { recursive: true });

const metaList = Array.from(validation.metaById.values()).sort((a, b) =>
  a.id.localeCompare(b.id)
);

const svgVendorDirs = new Set();
let variantCount = 0;

for (const meta of metaList) {
  const { vendor, slug } = parseId(meta.id);
  if (!svgVendorDirs.has(vendor)) {
    await fs.mkdir(path.join(distDir, "svg", vendor), { recursive: true });
    svgVendorDirs.add(vendor);
  }

  for (const variant of meta.variants) {
    const sourcePath = path.join(rootDir, "src", "icons", vendor, `${slug}.${variant}.svg`);
    const targetPath = path.join(distDir, "svg", vendor, `${slug}.${variant}.svg`);
    const rawSvg = await fs.readFile(sourcePath, "utf8");
    const optimized = optimizeSvg(rawSvg);
    await fs.writeFile(targetPath, optimized, "utf8");
    variantCount += 1;
  }
}

const icons = metaList.map((meta) => {
  const { vendor, slug } = parseId(meta.id);
  const entry = {
    id: meta.id,
    n: meta.name,
    v: vendor,
    s: slug,
    c: meta.categories,
    t: meta.tags,
    vv: meta.variants
  };
  if (Array.isArray(meta.aliases) && meta.aliases.length > 0) {
    entry.a = meta.aliases;
  }
  if (meta.defaultVariant) {
    entry.dv = meta.defaultVariant;
  }
  return entry;
});

const byTag = {};
const byCategory = {};

for (const meta of metaList) {
  for (const tag of meta.tags) {
    if (!byTag[tag]) {
      byTag[tag] = [];
    }
    byTag[tag].push(meta.id);
  }
  for (const category of meta.categories) {
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(meta.id);
  }
}

for (const key of Object.keys(byTag)) {
  byTag[key].sort();
}
for (const key of Object.keys(byCategory)) {
  byCategory[key].sort();
}

const sortedByTag = sortObjectKeys(byTag);
const sortedByCategory = sortObjectKeys(byCategory);

const indexDir = path.join(distDir, "index");
await fs.writeFile(path.join(indexDir, "icons.min.json"), JSON.stringify(icons), "utf8");
await fs.writeFile(
  path.join(indexDir, "by-tag.json"),
  JSON.stringify(sortedByTag, null, 2),
  "utf8"
);
await fs.writeFile(
  path.join(indexDir, "by-category.json"),
  JSON.stringify(sortedByCategory, null, 2),
  "utf8"
);
await fs.writeFile(
  path.join(indexDir, "taxonomy.json"),
  JSON.stringify(validation.taxonomy, null, 2),
  "utf8"
);

const manifest = {
  schemaVersion: 1,
  iconCount: metaList.length,
  variantCount,
  tagCount: Object.keys(sortedByTag).length,
  categoryCount: Object.keys(sortedByCategory).length
};

await fs.writeFile(
  path.join(indexDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  "utf8"
);
