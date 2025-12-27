# Icon Registry

Static SVG icon registry with strict taxonomy, per-icon metadata, and prebuilt JSON indexes.

## ID, slug, variant rules

- Icon id format: `<vendor>.<slug>` where `slug` can include dots.
- SVG filename format: `<slug>.<variant>.svg` (variant is the last token before `.svg`).
- Example: `aws.ec2.instance` → `src/icons/aws/ec2.instance.mono.svg`.

## Using the build output

- Search index: `dist/index/icons.min.json`
- By-tag index: `dist/index/by-tag.json`
- By-category index: `dist/index/by-category.json`
- Taxonomy: `dist/index/taxonomy.json`

SVG URL construction:

```
/svg/{vendor}/{slug}.{variant}.svg
```

Example:

```
/svg/aws/ec2.instance.mono.svg
```

## Build & validate

```
npm run validate
npm run build
```

Note: The build runs a minimal SVGO pass (viewBox preserved).
