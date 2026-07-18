# Quick start

Install dependencies, then run `npm run dev`. Define a typed `DashboardConfig` and pass it to `DashboardRenderer`.

Widgets are JSON objects with `id`, `type`, `position`, optional `datasource`, and `options`. Static sources use `{ kind: 'static', data: [...] }`; REST sources use `{ kind: 'rest', url }`.

Register custom widgets through `registerWidget({ type, name, renderer })`. Widget failures are isolated with an error boundary.

## Production foundations

The original JSON configuration remains valid. New configurations may define reusable `datasets`, widget `binding.datasetId`, and breakpoint-specific widget `positions` (`desktop`, `tablet`, and `mobile`). A widget without these fields continues to use its existing `datasource` and `position`.

For production data, configure a server-side gateway with `configureDataGateway`. A `rest` source using `connectionId` is sent to that gateway; credentials must stay on the server. Legacy `{ kind: 'rest', url }` sources are still supported for public endpoints only.

The playground includes a versioned browser repository for offline development. Production hosts should implement `DashboardRepository` against their authenticated API and pass the resolved dashboard into the builder. Repository saves support `expectedRevision` to prevent silent overwrites.
