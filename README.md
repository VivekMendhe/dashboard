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
- `playground`: builder store, templates, dashboard repository, and snap engine

## Canvas editing (enterprise)

The builder provides a Figma-quality canvas editing experience:

### Multi-widget selection

| Action | Behaviour |
|---|---|
| Click | Select single widget |
| **Shift + Click** | Add widget to selection |
| **Ctrl / Cmd + Click** | Toggle widget in selection |
| **Drag on empty canvas** | Marquee (rubber-band) selection |
| **Ctrl / Cmd + A** | Select all widgets |
| **Escape** | Clear selection |
| **Tab / Shift + Tab** | Cycle focus between widgets |

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + C` | Copy selected |
| `Ctrl/Cmd + X` | Cut selected |
| `Ctrl/Cmd + V` | Paste |
| `Ctrl/Cmd + D` | Duplicate selected |
| `Delete / Backspace` | Delete selected |
| `Arrow keys` | Nudge selected widgets by 1 grid unit |
| `Shift + Arrow keys` | Nudge by 3 grid units |
| `Alt + Arrow keys` | Navigate between widgets |
| `Ctrl/Cmd + Shift + L` | Align left (2+ selected) |
| `Ctrl/Cmd + Shift + R` | Align right (2+ selected) |
| `Ctrl/Cmd + Shift + T` | Align top (2+ selected) |
| `Ctrl/Cmd + Shift + B` | Align bottom (2+ selected) |
| `Ctrl/Cmd + Shift + H` | Center horizontally (2+ selected) / Hide selected |
| `Ctrl/Cmd + Shift + V` | Center vertically (2+ selected) |
| `Ctrl/Cmd + Shift + W` | Equal width (2+ selected) |
| `Ctrl/Cmd + Shift + E` | Equal height (2+ selected) |
| `Ctrl/Cmd + Shift + I` | Distribute horizontally (3+ selected) |
| `Ctrl/Cmd + Shift + O` | Distribute vertically (3+ selected) |
| `Ctrl/Cmd + Shift + G` | Group selected (2+) |
| `Ctrl/Cmd + Shift + U` | Ungroup selected |
| `Ctrl/Cmd + Shift + K` | Lock / Unlock selected |

### Visual feedback

- **Primary selection**: solid blue outline with glow
- **Multi-selection**: dashed blue outlines on additional selections
- **Selection badge**: floating counter when multiple widgets are selected
- **Marquee overlay**: translucent blue rectangle during drag selection
- **Improved resize handles**: larger, styled handles with directional cursors
- **Enhanced drag ghost**: blue-tinted shadow with subtle rotation during drag
- **Inspector panel**: shows multi-selection summary with batch actions (lock toggle, delete all, duplicate all)

### Alignment guides & snapping

Figma-style alignment guides appear automatically during drag:

| Guide type | Behaviour |
|---|---|
| **Edge-to-edge** | Snaps left/right/top/bottom edges to other widget edges |
| **Edge-to-opposite** | Snaps left edge to another widget's right edge (and vice versa) |
| **Center alignment** | Snaps horizontal/vertical centers to other widget centers |
| **Equal spacing** | Detects and enforces equal gaps between 3+ widgets in a row/column |
| **Distance labels** | Shows pixel distance between close edges when guides activate |

The snap engine runs on the existing grid constants (12 columns, 82px rows, 12px margins) and converts pixel-space alignment back to grid units. Snap tolerance defaults to 0.35 grid units.

**Snap engine API** (`@dashboard-generator/playground`):

- `computeSnapGuides(dragged, dragId, widgets, containerWidth, tolerance?)` — pure function returning `SnapResult`
- `gridToPixel(pos, containerWidth)` — convert grid position to `PixelRect`
- `pixelToGridX(px, containerWidth)` / `pixelToGridY(px)` — convert pixel offsets to grid units
- Types: `SnapGuide`, `DistanceLabel`, `SnapResult`, `PixelRect`

### Layout tools

Professional layout tools appear as a floating toolbar when 2+ widgets are selected, providing Figma/Retool-grade alignment and distribution:

| Tool | Description |
|---|---|
| **Align left/right/top/bottom** | Snap selected edges to the extreme position |
| **Center horizontally/vertically** | Center all selected widgets between outermost bounds |
| **Equal width / Equal height** | Average the dimension across all selected widgets |
| **Distribute horizontally/vertically** | Evenly space 3+ widgets with equal gaps |
| **Group / Ungroup** | Bind widgets into a logical group; clicking one selects all |
| **Lock / Unlock** | Prevent or allow drag/resize of selected widgets |
| **Hide** | Temporarily remove widgets from the canvas |
| **Show all** | Restore hidden widgets from the floating hidden widgets bar |

**Pure layout tools API** (`@dashboard-generator/playground`):

```ts
import { alignLeft, distributeHorizontally, groupWidgets, lockWidgets, hideWidgets } from '@dashboard-generator/playground';

// All functions accept (widgets: DashboardWidget[], selectedIds: Set<string>, viewport?)
// and return new arrays with patched positions/options.
```

**Hidden widgets**: Hidden widgets are excluded from the grid layout, snap calculations, and canvas rendering. A floating "hidden widgets" bar appears at the bottom of the canvas when widgets are hidden, allowing one-click restoration.

**Widget grouping**: Grouped widgets share a `groupId` in their options. When one widget in a group is selected, all group members are automatically added to the selection. Groups can be dissolved with the ungroup action.

### Store API

The Zustand store (`useBuilderStore`) exposes multi-selection through:

- `selectedIds: string[]` — all selected widget IDs
- `selectedId: string | undefined` — backward-compatible primary selection
- `select(id, { additive?, toggle? })` — flexible selection logic
- `selectAll()` / `clearSelection()` — bulk operations
- `removeSelected()` / `duplicateSelected()` / `copySelected()` — multi-widget actions
- `nudgeSelected(dx, dy)` — move all selected widgets
- `focusNext(direction)` — keyboard navigation
- `marquee: MarqueeRect | null` — current drag-selection rectangle
- `snapGuides: SnapGuide[]` — active alignment guide lines during drag
- `snapDistances: DistanceLabel[]` — distance indicator labels during drag
- `setSnapGuides(guides, distances, draggingId?)` / `clearSnapGuides()` — guide state management
- `alignSelected(direction)` — align left/right/top/bottom/center-h/center-v
- `equalizeSelected(dimension)` — equal width/height
- `distributeSelected(axis)` — distribute horizontally/vertically
- `groupSelected()` / `ungroupSelected()` — group/ungroup selected widgets
- `lockSelected()` / `unlockSelected()` — lock/unlock selected widgets
- `hideSelected()` / `showSelected()` — hide/show selected widgets
- `patchWidgets(next)` — apply batch widget replacement

All existing single-widget APIs (`select`, `remove`, `duplicate`, `copy`, `paste`) remain fully backward compatible.

## Widget library (29 built-in widgets)

All widgets are registered via `registerWidget()` and rendered with type-safe `WidgetRenderProps`.

### Charts (14)

| Type | Widget | Data |
|---|---|---|
| `kpi` | KPI card with label, value, prefix/suffix, trend | Static value or `valueKey` |
| `bar` | Bar chart (Recharts) | `xKey` / `yKey` |
| `line` | Line chart | `xKey` / `yKey` |
| `area` | Area chart | `xKey` / `yKey` |
| `pie` | Pie chart with segments | `xKey` / `yKey` |
| `donut` | Donut chart (inner radius) | `xKey` / `yKey` |
| `gauge` | SVG arc gauge with needle | `valueKey`, `min`, `max` |
| `funnel` | Funnel chart | `xKey` / `yKey` |
| `scatter` | Scatter plot | `xKey` / `yKey` |
| `bubble` | Scatter with `z` sizing | `xKey` / `yKey` / `zKey` |
| `heatmap` | SVG color-intensity grid | `xKey` / `yKey` / `valueKey` |
| `treemap` | Nested rectangles | `xKey` / `yKey` |
| `radar` | Radar/spider chart | `xKey` / `yKey` |
| `histogram` | Auto-binned bar chart | `valueKey`, `bins` |

### Financial (4)

| Type | Widget | Data |
|---|---|---|
| `waterfall` | Stacked green/red waterfall | `xKey` / `yKey` |
| `candlestick` | SVG OHLC candles | `open`, `high`, `low`, `close` |
| `sankey` | Flow diagram (Recharts Sankey) | `source` / `target` / `value` |
| `sunburst` | Concentric-ring SVG | `xKey` / `yKey` |

### Media (5)

| Type | Widget | Options |
|---|---|---|
| `map` | Map placeholder with coordinates | `latitude`, `longitude`, `zoom` |
| `markdown` | Rendered markdown | `content` |
| `image` | Image with object-fit | `src`, `alt`, `objectFit` |
| `video` | HTML5 video player | `src`, `type` |
| `iframe` | Sandboxed iframe | `src` |

### Utility (3)

| Type | Widget | Options |
|---|---|---|
| `progress` | Circular or linear progress | `value`, `max`, `mode` |
| `timeline` | Vertical event timeline | `timeKey`, `labelKey`, `descKey` |
| `calendar` | Monthly calendar with events | `dateKey`, `titleKey`, `year`, `month` |

### Content (3)

| Type | Widget | Data |
|---|---|---|
| `table` | Data table with headers | `columns` option or auto |
| `text` | Plain text / rich text | `content` option |
| `divider` | Horizontal rule divider | None |

## Data Source Manager

Full connection management UI accessible from the **Data** button in the enterprise toolbar.

### Supported connection types

| Category | Type | Gateway Required | Notes |
|---|---|---|---|
| **API** | REST | Optional (direct fetch for public URLs) | Base URL, auth, headers |
| **API** | GraphQL | Yes | Endpoint, query, variables |
| **Database** | MySQL | Yes | Host, port, database, credentials |
| **Database** | PostgreSQL | Yes | Host, port, database, schema |
| **Database** | SQL Server | Yes | Host, port, database, credentials |
| **Database** | Oracle | Yes | Host, port, service, credentials |
| **Database** | MongoDB | Yes | Host, port, database, collection queries |
| **Warehouse** | Snowflake | Yes | Account, warehouse, database, schema |
| **Warehouse** | BigQuery | Yes | Project ID, dataset, service account |
| **File** | CSV | No (client-side) | URL or file upload, delimiter config |
| **File** | Excel | Yes | Sheet name, server-side parsing |
| **File** | JSON | No (client-side) | URL or file upload, JSONPath support |

### Features

- **Connection Manager** — Create, edit, delete named connections stored in localStorage
- **Connection Test** — One-click test with latency reporting and status indicators
- **Schema Explorer** — Browse tables, columns, types, and row counts
- **Data Preview** — Run queries or import files, view results in a data grid
- **Refresh** — Re-fetch schema and data on demand
- **Caching** — Per-connection configurable TTL with manual invalidation
- **Retries** — Exponential backoff retry with configurable attempt count
- **Timeouts** — Per-connection request timeout in milliseconds
- **Settings** — View connection metadata, last test result, and danger zone controls

### Gateway contract

Database and warehouse connections route through the `DataGateway` contract:

```typescript
import { configureDataGateway } from '@dashboard-generator/datasource';

configureDataGateway(async (request) => {
  const response = await fetch('/api/gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return response.json();
});
```

### Programmatic API

```typescript
import { connectionManager, CONNECTION_TYPES } from '@dashboard-generator/playground';

// CRUD
const conn = connectionManager.create({ id: 'my-db', name: 'Production DB', type: 'postgres', host: 'db.example.com', port: 5432, database: 'app', username: 'readonly', password: '***', timeout: 15000, retries: 3, cacheTTL: 300, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

// Test & schema
await connectionManager.test(conn.id);
const schema = await connectionManager.getSchema(conn.id);

// Execute query
const data = await connectionManager.execute(conn.id, 'SELECT * FROM users LIMIT 100');
```

### Store actions

| Action | Description |
|---|---|
| `addConnection(config)` | Create a connection |
| `updateConnection(id, patch)` | Update connection fields |
| `removeConnection(id)` | Delete a connection |
| `testConnection(id)` | Test connection and store result |
| `refreshSchema(id)` | Fetch and cache schema |
| `previewData(id, query, limit?)` | Execute query with caching |
| `openDataSourceManager()` | Open the DSM modal |
| `closeDataSourceManager()` | Close the DSM modal |

## Query Builder

Visual query construction integrated into the Inspector's **Data** tab. Expand the Query Builder panel when a dataset is bound to a widget.

### Features

- **Dataset Selector** — Choose from dashboard-level datasets; create new datasets inline
- **Dimensions** — Click field chips to select group-by columns (with type badges)
- **Metrics** — Add aggregations (SUM, AVG, MIN, MAX, COUNT) on any field
- **Calculated Fields** — Define computed columns with custom expressions (e.g. `price * qty`)
- **WHERE Filters** — Visual filter editor supporting 13 operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `NOT LIKE`, `IN`, `NOT IN`, `IS NULL`, `IS NOT NULL`, `BETWEEN`
- **ORDER BY** — Sort by any field ascending or descending
- **GROUP BY / HAVING** — Group by fields with optional post-aggregation filters
- **JOINs** — INNER, LEFT, RIGHT, FULL joins between datasets with ON clause
- **SQL Mode** — Toggle to raw SQL editor; overrides all visual settings
- **Query Preview** — See the generated SQL and execute it against the connection to preview results in a data grid
- **Limit** — Configurable row limit in the footer

### Extended `WidgetBinding` type

```typescript
interface WidgetBinding {
  datasetId?: string;
  dimensions?: string[];
  metrics?: { field: string; aggregation?: 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count' }[];
  filters?: Record<string, Primitive>;
  limit?: number;
  sort?: { field: string; direction: 'asc' | 'desc' }[];
  // New Query Builder fields:
  joins?: JoinClause[];
  calculatedFields?: CalculatedField[];
  groupBy?: string[];
  where?: WhereClause[];
  having?: WhereClause[];
  sql?: string;
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
}

interface JoinClause {
  datasetId: string;
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  onLeft: string;
  onRight: string;
  alias?: string;
}

interface CalculatedField {
  name: string;
  expression: string;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'datetime';
}

interface WhereClause {
  field: string;
  operator: FilterOperator;
  value?: Primitive | Primitive[];
}
```

### Programmatic usage

```typescript
import { QueryBuilder, generateSqlPreview } from '@dashboard-generator/playground';

// Render the Query Builder
<QueryBuilder widget={widget} onClose={() => close()} />

// Generate SQL from a binding
const sql = generateSqlPreview(binding, 'users');
```

## Advanced Dashboard Interactions

Full interaction system built on an event bus architecture.

### Cross-filtering

Click a data point in one widget to filter all other widgets. Configurable per-widget in the Interaction tab:

- Enable cross-filter on any widget
- Choose the source field for the filter value
- Optionally target specific widgets (or all with the same dataset)
- Click again to deselect

### Drill-down

Navigate through field hierarchies by clicking data points:

- Configure a hierarchy (e.g. `year → month → day`)
- Each click drills deeper into the next field
- Breadcrumb trail shows current depth
- Drill up / reset controls in the Inspector

### Drill-through

Navigate to a different dashboard on click:

- Set target dashboard ID
- Pass query parameters using `{{field}}` interpolation
- Parameters are serialized to the URL

### Widget interactions

Configurable click/hover actions per widget:

| Action | Description |
|---|---|
| `crossFilter` | Filter other widgets by a field value |
| `drillDown` | Navigate field hierarchy |
| `drillThrough` | Navigate to another dashboard |
| `setVariable` | Set a dashboard variable from row data |
| `openUrl` | Open a URL with `{{field}}` interpolation |

### Dashboard variables

Global variables on `DashboardConfig.variables`:

```typescript
interface DashboardVariable {
  name: string; label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'select';
  defaultValue?: Primitive;
  urlParam?: string;  // Sync to URL query param
}
```

Variables are synced bidirectionally with URL parameters and can be referenced in expressions.

### URL parameters

All dashboard variables with `urlParam` set are automatically synced to the URL query string. Changing a variable updates the URL; loading a page with params initializes variables.

### Bookmarks

Save and restore full dashboard state (filters, variables, widget positions):

```typescript
import { bookmarkManager } from '@dashboard-generator/playground';
bookmarkManager.save('My view', dashboardId, snapshot);
bookmarkManager.restore(bookmarkId);
```

### Saved Views

Named snapshots with descriptions, stored in localStorage:

```typescript
import { savedViewManager } from '@dashboard-generator/playground';
savedViewManager.save('Q1 Report', dashboardId, snapshot, 'Revenue focus');
savedViewManager.load(viewId);
```

### Conditional formatting

Rule-based cell/widget styling in the Advanced tab:

- 11 operators: `>`, `>=`, `<`, `<=`, `==`, `!=`, `contains`, `notContains`, `between`, `isNull`, `isNotNull`
- Per-rule background color and text color

### Dynamic colors

Data-driven color assignment:

- Define thresholds with operators and colors
- Cell values are evaluated against thresholds
- Fallback default color

### Dynamic labels

Data-driven label replacement:

- Map value-to-label pairs
- Fallback default label for unmatched values

### Calculated fields

Dashboard-level computed fields:

```typescript
interface DashboardCalculatedField {
  name: string; expression: string;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'datetime';
}
```

### Interaction engine API

```typescript
import {
  emit, on, once, off,           // Event bus
  applyCrossFilter, clearCrossFilter, getCrossFilters,  // Cross-filter
  drillDown, drillUp, resetDrillDown,                   // Drill-down
  initVariables, setVariable, getVariables,             // Variables
  bookmarkManager, savedViewManager,                    // Persistence
  evaluateCondition, evaluateDynamicColor, evaluateDynamicLabel,  // Evaluation
  handleInteraction, resolveExpression,                 // Utilities
} from '@dashboard-generator/playground';
```

## Production contracts

The framework retains its original JSON schema while adding optional reusable datasets, typed widget bindings, responsive positions, revisioned dashboard persistence, workspace roles, and a server-side data gateway contract. See [the quick start](docs/quick-start.md) for migration-safe examples and security guidance.
# dashboard
