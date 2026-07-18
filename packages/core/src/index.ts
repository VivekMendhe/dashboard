import type React from 'react';
export type WidgetType = string;
export type Primitive = string | number | boolean | null;
export type DataRecord = Record<string, unknown>;
export type DashboardRole = 'viewer' | 'editor' | 'admin';

export interface GridPosition { x: number; y: number; w: number; h: number; minW?: number; minH?: number; maxW?: number; maxH?: number }
export interface StaticDataSource { kind: 'static'; data: DataRecord[] }
/** `url` is retained for legacy, public endpoints. New dashboards should use `connectionId`. */
export interface RestDataSource { kind: 'rest'; url?: string; connectionId?: string; path?: string; method?: 'GET' | 'POST'; params?: Record<string, Primitive>; body?: Record<string, unknown> }
export type DataSourceConfig = StaticDataSource | RestDataSource;
export interface DataField { name: string; label?: string; type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'unknown'; nullable?: boolean }
export interface DatasetConfig { id: string; name: string; datasource: DataSourceConfig; fields?: DataField[]; description?: string }
export interface WidgetBinding { datasetId?: string; dimensions?: string[]; metrics?: { field: string; aggregation?: 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count' }[]; filters?: Record<string, Primitive>; limit?: number; sort?: { field: string; direction: 'asc' | 'desc' }[] }
export interface ResponsivePositionMap { desktop?: GridPosition; tablet?: GridPosition; mobile?: GridPosition }
export interface DashboardWidget { id: string; type: WidgetType; title?: string; position: GridPosition; /** Optional breakpoint-specific positions; `position` remains the desktop fallback. */ positions?: ResponsivePositionMap; datasource?: DataSourceConfig; binding?: WidgetBinding; options?: Record<string, unknown>; style?: Record<string, string | number> }
export interface FilterConfig { id: string; label: string; type: 'search' | 'select' | 'checkbox' | 'radio' | 'date'; field?: string; options?: { label: string; value: Primitive }[]; defaultValue?: Primitive }
export interface DashboardConfig { id: string; title: string; description?: string; version: string; theme?: 'light' | 'dark' | ThemeTokens; filters?: FilterConfig[]; datasets?: DatasetConfig[]; sharing?: DashboardShare; schedule?: DashboardSchedule; widgets: DashboardWidget[] }
export interface DashboardIdentity { workspaceId: string; dashboardId: string; ownerId: string }
export interface DashboardRevision { revision: number; updatedAt: string; updatedBy: string; message?: string }
export interface PersistedDashboard { identity: DashboardIdentity; config: DashboardConfig; revision: DashboardRevision; deletedAt?: string }
export interface DashboardShare { visibility: 'private' | 'workspace' | 'link'; allowExport?: boolean; expiresAt?: string }
export interface DashboardSchedule { enabled: boolean; cadence: 'daily' | 'weekly' | 'monthly'; recipients: string[]; timezone?: string; format: 'pdf' | 'png' }
export interface DashboardTemplate { id: string; name: string; description: string; category: string; previewColor: string; config: DashboardConfig }
export interface ThemeTokens { primary: string; secondary: string; success: string; warning: string; error: string; background: string; surface: string; text: string; mutedText: string; border: string; radius: string; font: string }
export interface LoadedData { data: DataRecord[]; refresh(): Promise<DataRecord[]> }
export interface Datasource { load(config: DataSourceConfig): Promise<LoadedData> }
export interface WidgetRenderProps { widget: DashboardWidget; data: DataRecord[]; loading: boolean; error?: Error; filters: Record<string, Primitive>; theme: ThemeTokens }
export type WidgetRenderer = (props: WidgetRenderProps) => React.ReactNode;
export interface WidgetDefinition { type: string; name: string; renderer: WidgetRenderer; defaultOptions?: Record<string, unknown> }

class Registry<T extends { type: string }> { private items = new Map<string, T>(); register(item: T) { this.items.set(item.type, item); return () => this.items.delete(item.type) } get(type: string) { return this.items.get(type) } unregister(type: string) { this.items.delete(type) } list() { return [...this.items.values()] } }
const widgetRegistry = new Registry<WidgetDefinition>();
export const registerWidget = (definition: WidgetDefinition) => widgetRegistry.register(definition);
export const getWidget = (type: string) => widgetRegistry.get(type);
export const unregisterWidget = (type: string) => widgetRegistry.unregister(type);
export const listWidgets = () => widgetRegistry.list();

const datasources = new Map<string, Datasource>();
export const registerDatasource = (kind: string, datasource: Datasource) => { datasources.set(kind, datasource); return () => datasources.delete(kind) };
export const getDatasource = (kind: string) => datasources.get(kind);
export const validateDashboard = (value: DashboardConfig): DashboardConfig => {
  if (!value?.id || !value.title || !value.version || !Array.isArray(value.widgets)) throw new Error('Invalid dashboard config: id, title, version and widgets are required.');
  const ids = new Set<string>();
  const datasetIds = new Set((value.datasets ?? []).map((dataset) => dataset.id));
  if (datasetIds.size !== (value.datasets ?? []).length) throw new Error('Duplicate dataset id.');
  value.widgets.forEach((widget) => {
    if (!widget.id || !widget.type || !widget.position || ids.has(widget.id)) throw new Error(`Invalid or duplicate widget: ${widget.id}`);
    const positions = [widget.position, ...Object.values(widget.positions ?? {})];
    positions.forEach((position) => { if (!Number.isInteger(position.x) || !Number.isInteger(position.y) || position.x < 0 || position.y < 0 || position.w < 1 || position.h < 1 || position.x + position.w > 12) throw new Error(`Invalid position for widget: ${widget.id}`); });
    if (widget.binding?.datasetId && !datasetIds.has(widget.binding.datasetId)) throw new Error(`Unknown dataset binding for widget: ${widget.id}`);
    ids.add(widget.id);
  });
  return value;
};
