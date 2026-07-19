import { createElement as h } from 'react';
import type { PluginManifest, PluginRegistration, PluginStorage, PluginLogger, PluginAPI, Plugin, PluginPermission, PluginStoreItem, WidgetDefinition, Datasource, ThemeTokens, PropertyEditorDefinition, InspectorTabDefinition } from '@dashboard-generator/core';
import { registerWidget, unregisterWidget, registerDatasource } from '@dashboard-generator/core';
import { uid, now, readJson, writeJson } from './utils';

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const STORAGE_KEY = 'dg:plugins:v1';
const PLATFORM_VERSION = '2.0.0';

/* ================================================================== */
/*  Plugin Store (marketplace catalog)                                  */
/* ================================================================== */

const PLUGIN_CATALOG: PluginStoreItem[] = [
  {
    manifest: { id: 'sparkline-widget', name: 'Sparkline Widget', version: '1.0.0', description: 'Inline sparkline charts for KPI cards and data tables', author: 'Dashboard Studio', icon: '~', minPlatformVersion: '1.0.0', permissions: ['widgets'], dependencies: [], tags: ['sparkline', 'kpi', 'mini-chart'], categories: ['widget', 'visualization'], createdAt: '2025-01-15T00:00:00Z' },
    rating: 4.8, installs: 12400, featured: true,
  },
  {
    manifest: { id: 'nord-theme', name: 'Nord Theme', version: '1.0.0', description: 'Arctic, north-bluish clean and elegant theme based on the Nord color palette', author: 'Arctic Ice Studio', icon: 'N', minPlatformVersion: '1.0.0', permissions: ['themes'], dependencies: [], tags: ['nord', 'dark', 'clean', 'minimal'], categories: ['theme'], createdAt: '2025-02-01T00:00:00Z' },
    rating: 4.9, installs: 8200, featured: true,
  },
  {
    manifest: { id: 'json-editor-plugin', name: 'Advanced JSON Editor', version: '1.2.0', description: 'Rich JSON property editor with syntax highlighting, validation, and auto-formatting', author: 'Dashboard Studio', icon: '{', minPlatformVersion: '1.0.0', permissions: ['editors'], dependencies: [], tags: ['json', 'editor', 'code', 'validation'], categories: ['utility'], createdAt: '2025-01-20T00:00:00Z' },
    rating: 4.5, installs: 6100, featured: false,
  },
  {
    manifest: { id: 'pivot-table-widget', name: 'Pivot Table', version: '2.1.0', description: 'Interactive pivot table with drag-and-drop row/column grouping and aggregation', author: 'DataViz Labs', icon: '+', minPlatformVersion: '1.5.0', permissions: ['widgets', 'editors'], dependencies: [], tags: ['pivot', 'table', 'aggregation', 'interactive'], categories: ['widget', 'analytics'], createdAt: '2025-03-10T00:00:00Z' },
    rating: 4.7, installs: 5400, featured: true,
  },
  {
    manifest: { id: 'slack-datasource', name: 'Slack Integration', version: '1.0.0', description: 'Connect to Slack workspaces to visualize channel activity, messages, and analytics', author: 'Integrations Co', icon: '#', minPlatformVersion: '1.0.0', permissions: ['datasources', 'network'], dependencies: [], tags: ['slack', 'messaging', 'integration'], categories: ['integration', 'datasource'], createdAt: '2025-02-15T00:00:00Z' },
    rating: 4.3, installs: 3200, featured: false,
  },
  {
    manifest: { id: 'gauge-pack', name: 'Advanced Gauge Pack', version: '1.5.0', description: 'Collection of 12 gauge variants: radial, linear, semi-circle, donut, bullet, and more', author: 'ChartWorks', icon: '@', minPlatformVersion: '1.0.0', permissions: ['widgets'], dependencies: [], tags: ['gauge', 'meter', 'visualization', 'kpi'], categories: ['widget', 'visualization'], createdAt: '2025-04-01T00:00:00Z' },
    rating: 4.6, installs: 4100, featured: false,
  },
  {
    manifest: { id: 'export-scheduler', name: 'Export & Scheduler Pro', version: '3.0.0', description: 'Advanced scheduling with cron expressions, multi-format export, email delivery, and webhook notifications', author: 'Dashboard Studio', icon: 'E', minPlatformVersion: '1.8.0', permissions: ['widgets', 'store', 'network'], dependencies: [], tags: ['export', 'schedule', 'email', 'automation'], categories: ['productivity'], createdAt: '2025-05-01T00:00:00Z' },
    rating: 4.4, installs: 2800, featured: false,
  },
  {
    manifest: { id: 'heatmap-pro', name: 'Heatmap Pro', version: '2.0.0', description: 'Advanced heatmap with clustering, time-series mode, custom color scales, and drill-down support', author: 'DataViz Labs', icon: '*', minPlatformVersion: '1.2.0', permissions: ['widgets', 'editors'], dependencies: [], tags: ['heatmap', 'cluster', 'time-series', 'color'], categories: ['widget', 'visualization'], createdAt: '2025-03-20T00:00:00Z' },
    rating: 4.8, installs: 3900, featured: true,
  },
  {
    manifest: { id: 'slack-tracker', name: 'Team Activity Tracker', version: '1.0.0', description: 'Track team activity across dashboards with real-time collaboration indicators', author: 'TeamFlow', icon: 'T', minPlatformVersion: '1.0.0', permissions: ['events', 'ui'], dependencies: [], tags: ['team', 'activity', 'real-time', 'collaboration'], categories: ['utility', 'productivity'], createdAt: '2025-04-15T00:00:00Z' },
    rating: 4.2, installs: 1800, featured: false,
  },
  {
    manifest: { id: 'chart-animations', name: 'Chart Animations', version: '1.0.0', description: 'Rich entrance and transition animations for all chart types with configurable easing curves', author: 'MotionLab', icon: '~', minPlatformVersion: '1.0.0', permissions: ['widgets'], dependencies: [], tags: ['animation', 'transition', 'motion', 'easing'], categories: ['visualization', 'utility'], createdAt: '2025-02-28T00:00:00Z' },
    rating: 4.1, installs: 2200, featured: false,
  },
];

/* ================================================================== */
/*  Storage                                                             */
/* ================================================================== */

function loadRegistrations(): PluginRegistration[] {
  return readJson<PluginRegistration[]>(STORAGE_KEY, []);
}
function saveRegistrations(regs: PluginRegistration[]): void {
  writeJson(STORAGE_KEY, regs);
}

/* ================================================================== */
/*  Event Bus                                                           */
/* ================================================================== */

type EventHandler = (...args: unknown[]) => void;

class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();
  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => { this.listeners.get(event)?.delete(handler); };
  }
  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((h) => { try { h(...args); } catch (e) { console.error(`[Plugin Event] ${event}:`, e); } });
    this.listeners.get('*')?.forEach((h) => { try { h(event, ...args); } catch (e) { console.error(`[Plugin Event] *:`, e); } });
  }
  off(event: string, handler?: EventHandler): void {
    if (handler) this.listeners.get(event)?.delete(handler);
    else this.listeners.delete(event);
  }
  clear(): void { this.listeners.clear(); }
}

/* ================================================================== */
/*  Plugin Storage (scoped per plugin)                                  */
/* ================================================================== */

class ScopedStorage implements PluginStorage {
  private prefix: string;
  constructor(pluginId: string) { this.prefix = `dg:plugin:${pluginId}:`; }
  get<T>(key: string): T | undefined {
    try { const raw = localStorage.getItem(this.prefix + key); return raw ? JSON.parse(raw) as T : undefined; } catch { return undefined; }
  }
  set<T>(key: string, value: T): void { localStorage.setItem(this.prefix + key, JSON.stringify(value)); }
  delete(key: string): void { localStorage.removeItem(this.prefix + key); }
  clear(): void {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(this.prefix)) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  }
  keys(): string[] {
    const result: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(this.prefix)) result.push(k.slice(this.prefix.length)); }
    return result;
  }
}

/* ================================================================== */
/*  Plugin Logger                                                       */
/* ================================================================== */

class ScopedLogger implements PluginLogger {
  private name: string;
  constructor(pluginId: string) { this.name = `[Plugin:${pluginId}]`; }
  info(msg: string, ...args: unknown[]) { console.log(`%c${this.name} ${msg}`, 'color:#3b82f6', ...args); }
  warn(msg: string, ...args: unknown[]) { console.warn(`%c${this.name} ${msg}`, 'color:#f59e0b', ...args); }
  error(msg: string, ...args: unknown[]) { console.error(`%c${this.name} ${msg}`, 'color:#ef4444', ...args); }
  debug(msg: string, ...args: unknown[]) { console.debug(`%c${this.name} ${msg}`, 'color:#6b7280', ...args); }
}

/* ================================================================== */
/*  Version Comparison                                                  */
/* ================================================================== */

function satisfiesVersion(actual: string, required: string): boolean {
  const a = actual.split('.').map(Number);
  const r = required.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, r.length); i++) {
    const av = a[i] ?? 0, rv = r[i] ?? 0;
    if (av > rv) return true;
    if (av < rv) return false;
  }
  return true;
}

/* ================================================================== */
/*  Plugin Manager                                                      */
/* ================================================================== */

class PluginManager {
  private plugins = new Map<string, { registration: PluginRegistration; plugin: Plugin; api: PluginAPI }>();
  private eventBus = new EventBus();
  private customThemes = new Map<string, ThemeTokens>();
  private customPropertyEditors = new Map<string, PropertyEditorDefinition>();
  private customInspectorTabs = new Map<string, InspectorTabDefinition>();
  private widgetCleanups = new Map<string, (() => void)[]>();
  private datasourceCleanups = new Map<string, (() => void)[]>();
  private themeCleanups = new Map<string, (() => void)[]>();
  private editorCleanups = new Map<string, (() => void)[]>();
  private tabCleanups = new Map<string, (() => void)[]>();

  constructor() { this.loadPersisted(); }

  private loadPersisted(): void {
    const regs = loadRegistrations();
    regs.forEach((r) => {
      if (r.status === 'installed') r.status = 'inactive';
    });
    saveRegistrations(regs);
  }

  /* --- Catalog --- */
  getCatalog(): PluginStoreItem[] { return [...PLUGIN_CATALOG]; }
  getFeatured(): PluginStoreItem[] { return PLUGIN_CATALOG.filter((p) => p.featured); }
  searchCatalog(query: string): PluginStoreItem[] {
    const q = query.toLowerCase();
    return PLUGIN_CATALOG.filter((p) => p.manifest.name.toLowerCase().includes(q) || p.manifest.description.toLowerCase().includes(q) || p.manifest.tags.some((t) => t.includes(q)));
  }

  /* --- Registration --- */
  register(plugin: Plugin): PluginRegistration {
    const manifest = plugin.manifest;
    const existing = this.getRegistration(manifest.id);
    if (existing) throw new Error(`Plugin "${manifest.id}" is already registered`);
    if (!satisfiesVersion(PLATFORM_VERSION, manifest.minPlatformVersion)) throw new Error(`Plugin requires platform ${manifest.minPlatformVersion}, current is ${PLATFORM_VERSION}`);
    const regs = loadRegistrations();
    const reg: PluginRegistration = {
      manifest, status: 'installed', installedAt: now(), loadOrder: regs.length,
    };
    regs.push(reg);
    saveRegistrations(regs);
    this.plugins.set(manifest.id, { registration: reg, plugin, api: this.createAPI(manifest) });
    return reg;
  }

  unregister(pluginId: string): boolean {
    const entry = this.plugins.get(pluginId);
    if (!entry) return false;
    this.deactivate(pluginId);
    this.plugins.delete(pluginId);
    const regs = loadRegistrations().filter((r) => r.manifest.id !== pluginId);
    saveRegistrations(regs);
    return true;
  }

  /* --- Lifecycle --- */
  async activate(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) throw new Error(`Plugin "${pluginId}" not found`);
    if (entry.registration.status === 'active') return;
    entry.registration.status = 'loading';
    this.updateReg(entry.registration);
    try {
      const manifest = entry.registration.manifest;
      if (manifest.permissions.includes('store')) {
        for (const dep of manifest.dependencies) {
          const depEntry = this.plugins.get(dep.id);
          if (!depEntry && !dep.optional) throw new Error(`Missing required dependency: ${dep.id}`);
          if (depEntry && depEntry.registration.status !== 'active') await this.activate(dep.id);
        }
      }
      await plugin.activate(entry.api);
      entry.registration.status = 'active';
      entry.registration.activatedAt = now();
      entry.registration.error = undefined;
      this.updateReg(entry.registration);
      this.eventBus.emit('plugin:activated', pluginId);
    } catch (e) {
      entry.registration.status = 'error';
      entry.registration.error = e instanceof Error ? e.message : String(e);
      this.updateReg(entry.registration);
      throw e;
    }
  }

  async deactivate(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry || entry.registration.status !== 'active') return;
    entry.registration.status = 'loading';
    this.updateReg(entry.registration);
    try {
      await plugin.deactivate?.();
      this.cleanupPlugin(pluginId);
      entry.registration.status = 'inactive';
      entry.registration.activatedAt = undefined;
      entry.registration.error = undefined;
      this.updateReg(entry.registration);
      this.eventBus.emit('plugin:deactivated', pluginId);
    } catch (e) {
      entry.registration.status = 'error';
      entry.registration.error = e instanceof Error ? e.message : String(e);
      this.updateReg(entry.registration);
    }
  }

  private cleanupPlugin(pluginId: string): void {
    this.widgetCleanups.get(pluginId)?.forEach((fn) => fn());
    this.widgetCleanups.delete(pluginId);
    this.datasourceCleanups.get(pluginId)?.forEach((fn) => fn());
    this.datasourceCleanups.delete(pluginId);
    this.themeCleanups.get(pluginId)?.forEach((fn) => fn());
    this.themeCleanups.delete(pluginId);
    this.editorCleanups.get(pluginId)?.forEach((fn) => fn());
    this.editorCleanups.delete(pluginId);
    this.tabCleanups.get(pluginId)?.forEach((fn) => fn());
    this.tabCleanups.delete(pluginId);
    this.eventBus.off(pluginId);
  }

  /* --- API Factory --- */
  private createAPI(manifest: PluginManifest): PluginAPI {
    const pluginId = manifest.id;
    const storage = new ScopedStorage(pluginId);
    const logger = new ScopedLogger(pluginId);
    const permissions = new Set(manifest.permissions);

    return {
      registerWidget(def: WidgetDefinition) {
        const cleanup = registerWidget(def);
        if (!pluginManager.widgetCleanups.has(pluginId)) pluginManager.widgetCleanups.set(pluginId, []);
        pluginManager.widgetCleanups.get(pluginId)!.push(cleanup);
        logger.info(`Registered widget: ${def.name} (${def.type})`);
        return cleanup;
      },
      registerWidgets(defs: WidgetDefinition[]) {
        const cleanups = defs.map((d) => registerWidget(d));
        if (!pluginManager.widgetCleanups.has(pluginId)) pluginManager.widgetCleanups.set(pluginId, []);
        pluginManager.widgetCleanups.get(pluginId)!.push(...cleanups);
        logger.info(`Registered ${defs.length} widgets`);
        return () => cleanups.forEach((fn) => fn());
      },
      registerDatasource(kind: string, datasource: Datasource) {
        const cleanup = registerDatasource(kind, datasource);
        if (!pluginManager.datasourceCleanups.has(pluginId)) pluginManager.datasourceCleanups.set(pluginId, []);
        pluginManager.datasourceCleanups.get(pluginId)!.push(cleanup);
        logger.info(`Registered datasource: ${kind}`);
        return cleanup;
      },
      registerTheme(id: string, tokens: ThemeTokens) {
        pluginManager.customThemes.set(id, tokens);
        const cleanup = () => { pluginManager.customThemes.delete(id); };
        if (!pluginManager.themeCleanups.has(pluginId)) pluginManager.themeCleanups.set(pluginId, []);
        pluginManager.themeCleanups.get(pluginId)!.push(cleanup);
        logger.info(`Registered theme: ${id}`);
        return cleanup;
      },
      registerPropertyEditor(definition: PropertyEditorDefinition) {
        pluginManager.customPropertyEditors.set(definition.type, definition);
        const cleanup = () => { pluginManager.customPropertyEditors.delete(definition.type); };
        if (!pluginManager.editorCleanups.has(pluginId)) pluginManager.editorCleanups.set(pluginId, []);
        pluginManager.editorCleanups.get(pluginId)!.push(cleanup);
        logger.info(`Registered property editor: ${definition.name}`);
        return cleanup;
      },
      registerInspectorTab(tab: InspectorTabDefinition) {
        pluginManager.customInspectorTabs.set(tab.id, tab);
        const cleanup = () => { pluginManager.customInspectorTabs.delete(tab.id); };
        if (!pluginManager.tabCleanups.has(pluginId)) pluginManager.tabCleanups.set(pluginId, []);
        pluginManager.tabCleanups.get(pluginId)!.push(cleanup);
        logger.info(`Registered inspector tab: ${tab.label}`);
        return cleanup;
      },
      on(event: string, handler: (...args: unknown[]) => void) {
        return pluginManager.eventBus.on(`${pluginId}:${event}`, handler);
      },
      emit(event: string, ...data: unknown[]) {
        pluginManager.eventBus.emit(`${pluginId}:${event}`, ...data);
        pluginManager.eventBus.emit('plugin:event', pluginId, event, ...data);
      },
      getStorage: () => storage,
      getLogger: () => logger,
      getManifest: () => manifest,
      hasPermission: (permission: PluginPermission) => permissions.has(permission),
    };
  }

  private updateReg(reg: PluginRegistration): void {
    const regs = loadRegistrations();
    const idx = regs.findIndex((r) => r.manifest.id === reg.manifest.id);
    if (idx !== -1) regs[idx] = reg;
    else regs.push(reg);
    saveRegistrations(regs);
  }

  /* --- Queries --- */
  getRegistration(pluginId: string): PluginRegistration | undefined {
    return loadRegistrations().find((r) => r.manifest.id === pluginId);
  }
  getAllRegistrations(): PluginRegistration[] { return loadRegistrations(); }
  getActivePlugins(): PluginRegistration[] { return loadRegistrations().filter((r) => r.status === 'active'); }
  getInstalledPlugins(): PluginRegistration[] { return loadRegistrations(); }
  isInstalled(pluginId: string): boolean { return loadRegistrations().some((r) => r.manifest.id === pluginId); }
  isActive(pluginId: string): boolean { return loadRegistrations().find((r) => r.manifest.id === pluginId)?.status === 'active'; }
  getCustomThemes(): Map<string, ThemeTokens> { return this.customThemes; }
  getCustomPropertyEditors(): Map<string, PropertyEditorDefinition> { return this.customPropertyEditors; }
  getCustomInspectorTabs(): Map<string, InspectorTabDefinition> { return this.customInspectorTabs; }
  getEventBus(): EventBus { return this.eventBus; }
}

/* ================================================================== */
/*  Singleton                                                           */
/* ================================================================== */

const pluginManager = new PluginManager();
export { pluginManager, PluginManager };

/* ================================================================== */
/*  Demo Plugin Implementations                                         */
/* ================================================================== */

const sparklineWidgetPlugin: Plugin = {
  manifest: PLUGIN_CATALOG[0].manifest,
  activate(api) {
    api.registerWidget({
      type: 'sparkline', name: 'Sparkline',
      renderer: ({ data, widget, theme }) => {
        const key = (widget.options as Record<string, unknown>)?.dataKey as string ?? 'value';
        const values = data.map((d) => Number(d[key]) ?? 0);
        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const range = max - min || 1;
        const w = 120; const h_ = 32;
        const points = values.map((v, i) => `${(i / (values.length - 1 || 1)) * w},${h_ - ((v - min) / range) * h_}`).join(' ');
        const color = (widget.options as Record<string, unknown>)?.color as string ?? theme.primary;
        const lastY = h_ - ((values[values.length - 1] - min) / range) * h_;
        return h('svg', { width: w, height: h_, viewBox: `0 0 ${w} ${h_}`, style: { overflow: 'visible' } },
          h('polyline', { points, fill: 'none', stroke: color, strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' }),
          values.length > 0 ? h('circle', { cx: w, cy: lastY, r: '2.5', fill: color }) : null,
        );
      },
      defaultOptions: { dataKey: 'value', color: '' },
    });
  },
};

const nordThemePlugin: Plugin = {
  manifest: PLUGIN_CATALOG[1].manifest,
  activate(api) {
    api.registerTheme('nord', {
      primary: '#5e81ac', secondary: '#81a1c1', success: '#a3be8c', warning: '#ebcb8b',
      error: '#bf616a', background: '#2e3440', surface: '#3b4252', text: '#eceff4',
      mutedText: '#a0aabe', border: '#434c5e', radius: '6px',
      font: 'Inter, ui-sans-serif, system-ui, sans-serif',
    });
    api.getLogger().info('Nord theme registered');
  },
};

const jsonEditorPlugin: Plugin = {
  manifest: PLUGIN_CATALOG[2].manifest,
  activate(api) {
    api.registerPropertyEditor({
      type: 'rich-json', name: 'Rich JSON Editor', icon: '{',
      renderer: ({ value, onChange }) => {
        const str = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h('textarea', {
            value: str,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => { try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); } },
            spellCheck: false,
            style: { width: '100%', minHeight: 100, padding: 8, fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.5, border: '1px solid var(--pg-line)', borderRadius: 6, background: 'var(--pg-bg)', color: 'var(--pg-text)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' as const },
          }),
        );
      },
    });
  },
};

export const demoPlugins: Plugin[] = [sparklineWidgetPlugin, nordThemePlugin, jsonEditorPlugin];

/* ================================================================== */
/*  Stats                                                               */
/* ================================================================== */

function getPluginStats(): { totalInstalled: number; activeCount: number; errorCount: number; widgetCount: number; datasourceCount: number; themeCount: number; editorCount: number; tabCount: number } {
  const regs = loadRegistrations();
  return {
    totalInstalled: regs.length,
    activeCount: regs.filter((r) => r.status === 'active').length,
    errorCount: regs.filter((r) => r.status === 'error').length,
    widgetCount: pluginManager.getCustomPropertyEditors().size,
    datasourceCount: 0,
    themeCount: pluginManager.getCustomThemes().size,
    editorCount: pluginManager.getCustomPropertyEditors().size,
    tabCount: pluginManager.getCustomInspectorTabs().size,
  };
}

export { getPluginStats };
