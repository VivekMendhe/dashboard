# Dashboard Generator

A JSON-driven, plugin-ready React dashboard framework built as an Nx monorepo.

## Quick start

```bash
npm install
npm run dev
```

Open the Playground and edit `apps/playground/src/dashboard-config.ts`. Public package APIs are exposed through the `packages/*/src/index.ts` entry points.

## Packages

- `core`: contracts, schema validation, widget and datasource registries
- `renderer`: React provider and dashboard renderer
- `widgets`: built-in data visualization and content widgets
- `layout`, `theme`, `filters`, `datasource`: independently scoped framework services
# dashboard
