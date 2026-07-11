# Quick start

Install dependencies, then run `npm run dev`. Define a typed `DashboardConfig` and pass it to `DashboardRenderer`.

Widgets are JSON objects with `id`, `type`, `position`, optional `datasource`, and `options`. Static sources use `{ kind: 'static', data: [...] }`; REST sources use `{ kind: 'rest', url }`.

Register custom widgets through `registerWidget({ type, name, renderer })`. Widget failures are isolated with an error boundary.
