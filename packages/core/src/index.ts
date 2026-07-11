import type React from 'react';
export type WidgetType = string;
export type Primitive = string | number | boolean | null;
export type DataRecord = Record<string, unknown>;

export interface GridPosition { x: number; y: number; w: number; h: number; minW?: number; minH?: number; maxW?: number; maxH?: number }
export interface StaticDataSource { kind: 'static'; data: DataRecord[] }
export interface RestDataSource { kind: 'rest'; url: string; method?: 'GET' | 'POST'; params?: Record<string, Primitive> }
export type DataSourceConfig = StaticDataSource | RestDataSource;
export interface DashboardWidget { id: string; type: WidgetType; title?: string; position: GridPosition; datasource?: DataSourceConfig; options?: Record<string, unknown>; style?: Record<string, string | number> }
export interface FilterConfig { id: string; label: string; type: 'search' | 'select' | 'checkbox' | 'radio' | 'date'; field?: string; options?: { label: string; value: Primitive }[]; defaultValue?: Primitive }
export interface DashboardConfig { id: string; title: string; description?: string; version: string; theme?: 'light' | 'dark' | ThemeTokens; filters?: FilterConfig[]; widgets: DashboardWidget[] }
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
  value.widgets.forEach((widget) => { if (!widget.id || !widget.type || !widget.position || ids.has(widget.id)) throw new Error(`Invalid or duplicate widget: ${widget.id}`); ids.add(widget.id); });
  return value;
};
