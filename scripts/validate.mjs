import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv/dist/2020.js";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : null;
}

function normalizeRoot(rootDir) {
  return rootDir || process.cwd();
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function parseId(id) {
  const parts = id.split(".");
  if (parts.length < 2) {
    return { vendor: null, slug: null };
  }
  const vendor = parts[0];
  const slug = parts.slice(1).join(".");
  return { vendor, slug };
}

function parseSvgFileName(fileName) {
  const base = path.basename(fileName, ".svg");
  const tokens = base.split(".");
  if (tokens.length < 2) {
    return { slug: null, variant: null };
  }
  const variant = tokens.pop();
  const slug = tokens.join(".");
  return { slug, variant };
}

export function printValidationResults({ errors, warnings }) {
  if (warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }
  if (errors.length > 0) {
    console.error("Errors:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
  }
}

export async function validateAll({ rootDir, quiet = false } = {}) {
  const baseDir = normalizeRoot(rootDir);
  const errors = [];
  const warnings = [];
  const taxonomyPath = path.join(baseDir, "src", "taxonomy.json");
  const schemaDir = path.join(baseDir, "src", "schema");
  const taxonomySchemaPath = path.join(schemaDir, "taxonomy.schema.json");
  const metaSchemaPath = path.join(schemaDir, "meta.schema.json");
  let taxonomy = null;
  let taxonomySchema = null;
  let metaSchema = null;

  try {
    taxonomySchema = await readJson(taxonomySchemaPath);
  } catch (error) {
    errors.push(`Failed to load taxonomy schema: ${taxonomySchemaPath}`);
  }

  try {
    metaSchema = await readJson(metaSchemaPath);
  } catch (error) {
    errors.push(`Failed to load metadata schema: ${metaSchemaPath}`);
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateTaxonomySchema = taxonomySchema ? ajv.compile(taxonomySchema) : null;
  const validateMetaSchema = metaSchema ? ajv.compile(metaSchema) : null;

  try {
    taxonomy = await readJson(taxonomyPath);
  } catch (error) {
    errors.push(`Failed to load taxonomy: ${taxonomyPath}`);
  }

  if (taxonomy && validateTaxonomySchema && !validateTaxonomySchema(taxonomy)) {
    const messages = (validateTaxonomySchema.errors || [])
      .map((err) => `${err.instancePath || "/"} ${err.message}`.trim())
      .join("; ");
    errors.push(`Taxonomy schema validation failed: ${messages}`);
  }

  const vendors = taxonomy?.vendors || [];
  const categories = taxonomy?.categories || [];
  const tags = taxonomy?.tags || [];
  const variants = taxonomy?.variants || [];
  const idPattern = taxonomy?.idPattern ? new RegExp(taxonomy.idPattern) : null;
  const variantPattern = taxonomy?.variantPattern ? new RegExp(taxonomy.variantPattern) : null;

  const metaDir = path.join(baseDir, "src", "meta");
  let metaFiles = [];
  try {
    metaFiles = (await fs.readdir(metaDir)).filter((file) => file.endsWith(".json"));
  } catch (error) {
    errors.push(`Missing metadata directory: ${metaDir}`);
  }

  const metaById = new Map();

  for (const file of metaFiles) {
    const filePath = path.join(metaDir, file);
    let meta = null;
    try {
      meta = await readJson(filePath);
    } catch (error) {
      errors.push(`Failed to parse metadata JSON: ${filePath}`);
      continue;
    }

    if (meta && validateMetaSchema && !validateMetaSchema(meta)) {
      const messages = (validateMetaSchema.errors || [])
        .map((err) => `${err.instancePath || "/"} ${err.message}`.trim())
        .join("; ");
      errors.push(`Metadata schema validation failed (${filePath}): ${messages}`);
    }

    const fileId = path.basename(file, ".json");
    if (!isNonEmptyString(meta.id)) {
      errors.push(`Missing id in metadata: ${filePath}`);
      continue;
    }

    if (fileId !== meta.id) {
      errors.push(
        `Metadata filename '${file}' does not match id '${meta.id}' (expected '${meta.id}.json')`
      );
    }

    if (idPattern && !idPattern.test(meta.id)) {
      errors.push(`Invalid id format: ${meta.id}`);
    }

    const { vendor, slug } = parseId(meta.id);
    if (!vendor || !slug) {
      errors.push(`Unable to parse vendor/slug from id: ${meta.id}`);
    }

    if (!isNonEmptyString(meta.name)) {
      errors.push(`Missing name for id: ${meta.id}`);
    }

    if (!isNonEmptyString(meta.vendor)) {
      errors.push(`Missing vendor for id: ${meta.id}`);
    } else if (vendor && meta.vendor !== vendor) {
      errors.push(`Vendor mismatch for id ${meta.id}: ${meta.vendor} != ${vendor}`);
    }

    if (meta.vendor && vendors.length > 0 && !vendors.includes(meta.vendor)) {
      errors.push(`Vendor not in taxonomy for id ${meta.id}: ${meta.vendor}`);
    }

    const metaCategories = ensureArray(meta.categories);
    if (!metaCategories || metaCategories.length === 0) {
      errors.push(`Missing categories for id: ${meta.id}`);
    } else {
      for (const category of metaCategories) {
        if (!categories.includes(category)) {
          errors.push(`Category not in taxonomy for id ${meta.id}: ${category}`);
        }
      }
    }

    const metaTags = ensureArray(meta.tags);
    if (!metaTags) {
      errors.push(`Missing tags for id: ${meta.id}`);
    } else {
      for (const tag of metaTags) {
        if (!tags.includes(tag)) {
          errors.push(`Tag not in taxonomy for id ${meta.id}: ${tag}`);
        }
      }
    }

    const metaVariants = ensureArray(meta.variants);
    if (!metaVariants || metaVariants.length === 0) {
      errors.push(`Missing variants for id: ${meta.id}`);
    } else {
      for (const variant of metaVariants) {
        if (variantPattern && !variantPattern.test(variant)) {
          errors.push(`Variant does not match pattern for id ${meta.id}: ${variant}`);
        }
        if (!variants.includes(variant)) {
          errors.push(`Variant not in taxonomy for id ${meta.id}: ${variant}`);
        }
      }
    }

    if (!meta.defaultVariant) {
      errors.push(`Missing defaultVariant for id: ${meta.id}`);
    } else {
      if (!metaVariants || !metaVariants.includes(meta.defaultVariant)) {
        errors.push(`defaultVariant not in variants for id ${meta.id}: ${meta.defaultVariant}`);
      }
    }

    if (!meta.source || !isNonEmptyString(meta.source.url) || !isNonEmptyString(meta.source.license)) {
      errors.push(`Missing source url/license for id: ${meta.id}`);
    }

    if (metaById.has(meta.id)) {
      errors.push(`Duplicate metadata id: ${meta.id}`);
    } else {
      metaById.set(meta.id, meta);
    }

    if (vendor && slug && metaVariants) {
      for (const variant of metaVariants) {
        const svgPath = path.join(baseDir, "src", "icons", vendor, `${slug}.${variant}.svg`);
        try {
          await fs.access(svgPath);
        } catch (error) {
          errors.push(`Missing SVG for id ${meta.id} variant ${variant}: ${svgPath}`);
        }
      }
    }
  }

  const iconsDir = path.join(baseDir, "src", "icons");
  let vendorDirs = [];
  try {
    vendorDirs = await fs.readdir(iconsDir, { withFileTypes: true });
  } catch (error) {
    errors.push(`Missing icons directory: ${iconsDir}`);
    vendorDirs = [];
  }

  const svgFiles = [];

  for (const entry of vendorDirs) {
    if (!entry.isDirectory()) {
      continue;
    }
    const vendor = entry.name;
    const vendorDir = path.join(iconsDir, vendor);
    let files = [];
    try {
      files = await fs.readdir(vendorDir);
    } catch (error) {
      errors.push(`Failed to read icon directory: ${vendorDir}`);
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".svg")) {
        continue;
      }
      svgFiles.push({
        vendor,
        file,
        path: path.join(vendorDir, file)
      });
    }
  }

  for (const svg of svgFiles) {
    const { slug, variant } = parseSvgFileName(svg.file);
    if (!slug || !variant) {
      errors.push(`Invalid SVG filename (missing variant): ${svg.path}`);
      continue;
    }

    if (variantPattern && !variantPattern.test(variant)) {
      errors.push(`Variant does not match pattern for SVG ${svg.path}: ${variant}`);
    }

    const id = `${svg.vendor}.${slug}`;
    const meta = metaById.get(id);
    if (!meta) {
      errors.push(`Missing metadata for SVG: ${svg.path}`);
      continue;
    }

    if (!Array.isArray(meta.variants) || !meta.variants.includes(variant)) {
      errors.push(`Metadata variants missing for SVG: ${svg.path}`);
    }

    let content = "";
    try {
      content = await fs.readFile(svg.path, "utf8");
    } catch (error) {
      errors.push(`Failed to read SVG: ${svg.path}`);
      continue;
    }

    if (/<\s*script\b/i.test(content)) {
      errors.push(`Disallowed <script> tag in SVG: ${svg.path}`);
    }
    if (/<\s*foreignObject\b/i.test(content)) {
      errors.push(`Disallowed <foreignObject> tag in SVG: ${svg.path}`);
    }
    if (/\son[a-z]+\s*=\s*/i.test(content)) {
      errors.push(`Disallowed on* handler attribute in SVG: ${svg.path}`);
    }
    if (!/viewBox\s*=\s*["']/i.test(content)) {
      warnings.push(`SVG missing viewBox attribute: ${svg.path}`);
    }
  }

  if (!quiet) {
    printValidationResults({ errors, warnings });
  }

  return {
    errors,
    warnings,
    metaById,
    taxonomy,
    svgFiles
  };
}

const modulePath = fileURLToPath(import.meta.url);
const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (modulePath === scriptPath) {
  const { errors, warnings } = await validateAll({ quiet: true });
  printValidationResults({ errors, warnings });
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}
