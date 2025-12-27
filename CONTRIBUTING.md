# Contributing

## Add an icon

1. Add SVGs to `src/icons/<vendor>/` using `<slug>.<variant>.svg` naming.
2. Add metadata at `src/meta/<vendor>.<slug>.json`.
3. Ensure `categories`, `tags`, and `variants` match `src/taxonomy.json`.
4. Run:

```
npm run validate
npm run build
```

5. Commit updated `dist/` output.

## Update taxonomy

- Edit `src/taxonomy.json` to add new vendors, categories, tags, or variants.
- Taxonomy is strict; validation fails if metadata references unknown values.
