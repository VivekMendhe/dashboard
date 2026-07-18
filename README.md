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

## Production contracts

The framework retains its original JSON schema while adding optional reusable datasets, typed widget bindings, responsive positions, revisioned dashboard persistence, workspace roles, and a server-side data gateway contract. See [the quick start](docs/quick-start.md) for migration-safe examples and security guidance.
# dashboard
