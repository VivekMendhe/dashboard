import type { Bookmark, CrossFilterState, DashboardStateSnapshot, DashboardVariable, DashboardWidget, DataRecord, DrillDownState, DynamicColorRule, DynamicLabelRule, GridPosition, ConditionalFormatRule, Primitive, SavedView, WidgetInteraction } from '@dashboard-generator/core';

/* ================================================================== */
/*  Event Bus                                                          */
/* ================================================================== */

type EventPayload = CrossFilterState | DrillDownState | Record<string, Primitive> | DataRecord | WidgetInteraction;
type EventHandler<T = EventPayload> = (payload: T) => void;
interface EventEntry { handler: EventHandler; once: boolean }

const listeners = new Map<string, EventEntry[]>();

export const emit = (event: string, payload: EventPayload) => {
  const entries = listeners.get(event);
  if (!entries) return;
  const remaining: EventEntry[] = [];
  for (const entry of entries) {
    entry.handler(payload);
    if (!entry.once) remaining.push(entry);
  }
  listeners.set(event, remaining);
};

export const on = (event: string, handler: EventHandler): (() => void) => {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event)!.push({ handler, once: false });
  return () => { const list = listeners.get(event); if (!list) return; const idx = list.findIndex((e) => e.handler === handler); if (idx >= 0) list.splice(idx, 1); };
};

export const once = (event: string, handler: EventHandler) => {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event)!.push({ handler, once: true });
};

export const off = (event: string, handler?: EventHandler) => {
  if (!handler) { listeners.delete(event); return; }
  const list = listeners.get(event); if (!list) return;
  const idx = list.findIndex((e) => e.handler === handler);
  if (idx >= 0) list.splice(idx, 1);
};

/* ================================================================== */
/*  Cross-filter                                                       */
/* ================================================================== */

const crossFilters = new Map<string, CrossFilterState>();

export const applyCrossFilter = (sourceWidgetId: string, field: string, value: Primitive) => {
  const existing = crossFilters.get(sourceWidgetId);
  if (existing && existing.field === field && existing.value === value) {
    clearCrossFilter(sourceWidgetId);
    return;
  }
  const state: CrossFilterState = { sourceWidgetId, field, value, timestamp: Date.now() };
  crossFilters.set(sourceWidgetId, state);
  emit('crossFilter:apply', state);
};

export const clearCrossFilter = (sourceWidgetId: string) => {
  crossFilters.delete(sourceWidgetId);
  emit('crossFilter:clear', { sourceWidgetId } as CrossFilterState);
};

export const clearAllCrossFilters = () => {
  crossFilters.clear();
  emit('crossFilter:clearAll', {});
};

export const getCrossFilters = (): CrossFilterState[] => [...crossFilters.values()];

export const getCrossFiltersForWidget = (widgetId: string, widgets: DashboardWidget[]): Record<string, Primitive> => {
  const result: Record<string, Primitive> = {};
  const widget = widgets.find((w) => w.id === widgetId);
  if (!widget) return result;
  const targets = widget.interaction?.crossFilterTargets;
  for (const [, filter] of crossFilters) {
    if (targets && !targets.includes(filter.sourceWidgetId)) continue;
    if (filter.sourceWidgetId === widgetId) continue;
    result[filter.field] = filter.value;
  }
  return result;
};

/* ================================================================== */
/*  Drill-down                                                         */
/* ================================================================== */

const drillStacks = new Map<string, DrillDownState>();

export const drillDown = (widgetId: string, hierarchy: string[], clickedValue: Primitive, clickedField: string) => {
  const current = drillStacks.get(widgetId);
  const depth = current ? current.depth + 1 : 1;
  const breadcrumbs = current ? [...current.breadcrumbs, { field: clickedField, value: clickedValue }] : [{ field: clickedField, value: clickedValue }];
  const state: DrillDownState = { widgetId, hierarchy, depth, breadcrumbs };
  drillStacks.set(widgetId, state);
  emit('drillDown', state);
};

export const drillUp = (widgetId: string) => {
  const current = drillStacks.get(widgetId);
  if (!current || current.depth <= 0) return;
  if (current.breadcrumbs.length <= 1) {
    drillStacks.delete(widgetId);
    emit('drillUp', { widgetId, hierarchy: current.hierarchy, depth: 0, breadcrumbs: [] } as DrillDownState);
    return;
  }
  const breadcrumbs = current.breadcrumbs.slice(0, -1);
  const state: DrillDownState = { ...current, depth: breadcrumbs.length, breadcrumbs };
  drillStacks.set(widgetId, state);
  emit('drillUp', state);
};

export const resetDrillDown = (widgetId: string) => {
  drillStacks.delete(widgetId);
  emit('drillReset', { widgetId } as DrillDownState);
};

export const getDrillDownState = (widgetId: string): DrillDownState | undefined => drillStacks.get(widgetId);

export const getDrillDownFilters = (widgetId: string): Record<string, Primitive> => {
  const state = drillStacks.get(widgetId);
  if (!state) return {};
  const filters: Record<string, Primitive> = {};
  state.breadcrumbs.forEach((bc) => { filters[bc.field] = bc.value; });
  return filters;
};

/* ================================================================== */
/*  Dashboard variables                                                */
/* ================================================================== */

let variableValues: Record<string, Primitive> = {};
const variableListeners = new Set<(vars: Record<string, Primitive>) => void>();

export const initVariables = (definitions: DashboardVariable[]) => {
  const initial: Record<string, Primitive> = {};
  const params = readUrlParams();
  definitions.forEach((v) => {
    if (v.urlParam && params[v.urlParam] !== undefined) {
      initial[v.name] = castUrlValue(params[v.urlParam], v.type);
    } else if (v.defaultValue !== undefined) {
      initial[v.name] = v.defaultValue;
    }
  });
  variableValues = initial;
  notifyVariableListeners();
};

export const setVariable = (name: string, value: Primitive) => {
  variableValues = { ...variableValues, [name]: value };
  syncToUrl(name, value);
  notifyVariableListeners();
  emit('variable:change', { name, value } as Record<string, Primitive>);
};

export const getVariable = (name: string): Primitive | undefined => variableValues[name];

export const getVariables = (): Record<string, Primitive> => ({ ...variableValues });

export const setVariables = (values: Record<string, Primitive>) => {
  variableValues = { ...values };
  Object.entries(values).forEach(([k, v]) => syncToUrl(k, v));
  notifyVariableListeners();
  emit('variables:update', variableValues);
};

export const onVariablesChange = (handler: (vars: Record<string, Primitive>) => void): (() => void) => {
  variableListeners.add(handler);
  return () => { variableListeners.delete(handler); };
};

const notifyVariableListeners = () => {
  const snapshot = { ...variableValues };
  variableListeners.forEach((fn) => fn(snapshot));
};

/* ================================================================== */
/*  URL parameters                                                     */
/* ================================================================== */

const readUrlParams = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const result: Record<string, string> = {};
  params.forEach((value, key) => { result[key] = value; });
  return result;
};

const syncToUrl = (varName: string, value: Primitive) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (value === undefined || value === null || value === '') {
    url.searchParams.delete(varName);
  } else {
    url.searchParams.set(varName, String(value));
  }
  window.history.replaceState({}, '', url.toString());
};

const castUrlValue = (raw: string, type: DashboardVariable['type']): Primitive => {
  switch (type) {
    case 'number': return Number(raw) || 0;
    case 'boolean': return raw === 'true' || raw === '1';
    default: return raw;
  }
};

export const syncAllVariablesToUrl = (definitions: DashboardVariable[]) => {
  definitions.forEach((def) => {
    const val = variableValues[def.name];
    if (val !== undefined && def.urlParam) syncToUrl(def.urlParam, val);
  });
};

/* ================================================================== */
/*  Bookmarks                                                          */
/* ================================================================== */

const BOOKMARK_KEY = 'dashboard-generator:bookmarks:v1';

const readBookmarks = (): Bookmark[] => {
  try { const v = JSON.parse(localStorage.getItem(BOOKMARK_KEY) ?? '[]') as Bookmark[]; return Array.isArray(v) ? v : []; } catch { return []; }
};
const writeBookmarks = (v: Bookmark[]) => localStorage.setItem(BOOKMARK_KEY, JSON.stringify(v));

export const bookmarkManager = {
  list(dashboardId?: string): Bookmark[] {
    const all = readBookmarks();
    return dashboardId ? all.filter((b) => b.dashboardId === dashboardId) : all;
  },

  save(name: string, dashboardId: string, state: DashboardStateSnapshot): Bookmark {
    const bookmark: Bookmark = { id: `bm-${Date.now()}`, name, timestamp: new Date().toISOString(), dashboardId, state };
    const all = readBookmarks();
    all.push(bookmark);
    writeBookmarks(all);
    return bookmark;
  },

  restore(bookmarkId: string): DashboardStateSnapshot | undefined {
    return readBookmarks().find((b) => b.id === bookmarkId)?.state;
  },

  remove(bookmarkId: string): boolean {
    const all = readBookmarks();
    const filtered = all.filter((b) => b.id !== bookmarkId);
    if (filtered.length === all.length) return false;
    writeBookmarks(filtered);
    return true;
  },

  rename(bookmarkId: string, name: string): boolean {
    const all = readBookmarks();
    const bm = all.find((b) => b.id === bookmarkId);
    if (!bm) return false;
    bm.name = name;
    writeBookmarks(all);
    return true;
  },
};

/* ================================================================== */
/*  Saved Views                                                        */
/* ================================================================== */

const VIEW_KEY = 'dashboard-generator:views:v1';

const readViews = (): SavedView[] => {
  try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '[]') as SavedView[]; return Array.isArray(v) ? v : []; } catch { return []; }
};
const writeViews = (v: SavedView[]) => localStorage.setItem(VIEW_KEY, JSON.stringify(v));

export const savedViewManager = {
  list(dashboardId?: string): SavedView[] {
    const all = readViews();
    return dashboardId ? all.filter((v) => v.dashboardId === dashboardId) : all;
  },

  save(name: string, dashboardId: string, state: DashboardStateSnapshot, description?: string): SavedView {
    const view: SavedView = { id: `view-${Date.now()}`, name, description, timestamp: new Date().toISOString(), dashboardId, state };
    const all = readViews();
    all.push(view);
    writeViews(all);
    return view;
  },

  load(viewId: string): DashboardStateSnapshot | undefined {
    return readViews().find((v) => v.id === viewId)?.state;
  },

  remove(viewId: string): boolean {
    const all = readViews();
    const filtered = all.filter((v) => v.id !== viewId);
    if (filtered.length === all.length) return false;
    writeViews(filtered);
    return true;
  },

  rename(viewId: string, name: string): boolean {
    const all = readViews();
    const view = all.find((v) => v.id === viewId);
    if (!view) return false;
    view.name = name;
    writeViews(all);
    return true;
  },
};

/* ================================================================== */
/*  Conditional Formatting evaluation                                   */
/* ================================================================== */

export const evaluateCondition = (operator: string, cellValue: Primitive, conditionValue?: Primitive | [Primitive, Primitive]): boolean => {
  const cell = cellValue;
  const val = conditionValue;
  switch (operator) {
    case '>': return Number(cell) > Number(val);
    case '>=': return Number(cell) >= Number(val);
    case '<': return Number(cell) < Number(val);
    case '<=': return Number(cell) <= Number(val);
    case '==': return String(cell) === String(val);
    case '!=': return String(cell) !== String(val);
    case 'contains': return String(cell).toLowerCase().includes(String(val).toLowerCase());
    case 'notContains': return !String(cell).toLowerCase().includes(String(val).toLowerCase());
    case 'between': {
      if (!Array.isArray(val) || val.length < 2) return false;
      const n = Number(cell);
      return n >= Number(val[0]) && n <= Number(val[1]);
    }
    case 'isNull': return cell === null || cell === undefined;
    case 'isNotNull': return cell !== null && cell !== undefined;
    default: return false;
  }
};

export const applyConditionalFormatting = (row: DataRecord, rules: ConditionalFormatRule[]): React.CSSProperties => {
  const style: React.CSSProperties = {};
  for (const rule of rules) {
    const cellValue = row[rule.field] as Primitive;
    if (evaluateCondition(rule.operator, cellValue, rule.value)) {
      if (rule.style.background) style.backgroundColor = rule.style.background;
      if (rule.style.color) style.color = rule.style.color;
      if (rule.style.fontWeight) style.fontWeight = rule.style.fontWeight as React.CSSProperties['fontWeight'];
      break;
    }
  }
  return style;
};

/* ================================================================== */
/*  Dynamic Colors evaluation                                          */
/* ================================================================== */

export const evaluateDynamicColor = (row: DataRecord, rule: DynamicColorRule): string => {
  const cellValue = row[rule.field] as Primitive;
  if (cellValue === null || cellValue === undefined) return rule.defaultColor ?? '#6b7280';
  for (const threshold of rule.thresholds) {
    const op = threshold.operator ?? '>=';
    if (evaluateCondition(op, cellValue, threshold.value)) return threshold.color;
  }
  return rule.defaultColor ?? '#6b7280';
};

/* ================================================================== */
/*  Dynamic Labels evaluation                                          */
/* ================================================================== */

export const evaluateDynamicLabel = (row: DataRecord, rule: DynamicLabelRule): string => {
  const cellValue = row[rule.field] as Primitive;
  if (cellValue === null || cellValue === undefined) return rule.defaultLabel ?? String(cellValue ?? '');
  for (const mapping of rule.mappings) {
    if (String(mapping.match) === String(cellValue)) return mapping.label;
  }
  return rule.defaultLabel ?? String(cellValue);
};

/* ================================================================== */
/*  Interaction handler (dispatches action from widget click)          */
/* ================================================================== */

export const handleInteraction = (
  interaction: WidgetInteraction,
  row: DataRecord,
  widget: DashboardWidget,
  callbacks: {
    onCrossFilter?: (field: string, value: Primitive) => void;
    onDrillDown?: (hierarchy: string[], value: Primitive, field: string) => void;
    onDrillThrough?: (dashboardId: string, params: Record<string, string>) => void;
    onSetVariable?: (name: string, value: Primitive) => void;
    onOpenUrl?: (url: string, target?: string) => void;
  }
) => {
  if (!interaction.enabled || !interaction.action || interaction.action === 'none') return;

  switch (interaction.action) {
    case 'crossFilter': {
      const field = interaction.crossFilterField ?? Object.keys(row)[0];
      const value = row[field] as Primitive;
      if (field && value !== undefined) callbacks.onCrossFilter?.(field, value);
      break;
    }
    case 'drillDown': {
      const hierarchy = interaction.drillDownHierarchy ?? [];
      if (hierarchy.length === 0) break;
      const depth = interaction.drillDownDepth ?? 0;
      const currentField = hierarchy[depth];
      if (!currentField) break;
      const value = row[currentField] as Primitive;
      if (value !== undefined) callbacks.onDrillDown?.(hierarchy, value, currentField);
      break;
    }
    case 'drillThrough': {
      const dashboardId = interaction.drillThroughDashboard;
      if (!dashboardId) break;
      const params: Record<string, string> = {};
      if (interaction.drillThroughParams) {
        Object.entries(interaction.drillThroughParams).forEach(([key, template]) => {
          params[key] = template.replace(/\{\{(\w+)\}\}/g, (_, field) => String(row[field] ?? ''));
        });
      }
      callbacks.onDrillThrough?.(dashboardId, params);
      break;
    }
    case 'setVariable': {
      const varName = interaction.variableName;
      if (!varName) break;
      const field = interaction.variableValueField;
      const value = field ? (row[field] as Primitive) : Object.values(row)[0] as Primitive;
      if (value !== undefined) callbacks.onSetVariable?.(varName, value);
      break;
    }
    case 'openUrl': {
      const template = interaction.urlTemplate;
      if (!template) break;
      const url = template.replace(/\{\{(\w+)\}\}/g, (_, field) => String(row[field] ?? ''));
      callbacks.onOpenUrl?.(url, interaction.urlTarget);
      break;
    }
  }
};

/* ================================================================== */
/*  Expression resolver ({{variable.field}} syntax)                    */
/* ================================================================== */

export const resolveExpression = (expression: string, context: Record<string, unknown>): string => {
  return expression.replace(/\{\{(.+?)\}\}/g, (match, path) => {
    const parts = path.split('.');
    let current: unknown = context;
    for (const part of parts) {
      if (current === null || current === undefined) return match;
      current = (current as Record<string, unknown>)[part];
    }
    return current === undefined || current === null ? match : String(current);
  });
};

/* ================================================================== */
/*  State snapshot helpers                                             */
/* ================================================================== */

export const takeSnapshot = (
  filterValues: Record<string, Primitive>,
  widgets: DashboardWidget[],
): DashboardStateSnapshot => {
  const positions: Record<string, GridPosition> = {};
  widgets.forEach((w) => { positions[w.id] = w.position; });
  const drillStates: Record<string, DrillDownState> = {};
  drillStacks.forEach((state, id) => { drillStates[id] = state; });
  return {
    filterValues,
    variableValues: { ...variableValues },
    widgetPositions: positions,
    drillDownStates: drillStates,
  };
};

export const applySnapshot = (
  snapshot: DashboardStateSnapshot,
  callbacks: {
    onSetFilters: (values: Record<string, Primitive>) => void;
    onSetVariables: (values: Record<string, Primitive>) => void;
    onSetPositions?: (positions: Record<string, GridPosition>) => void;
  }
) => {
  callbacks.onSetFilters(snapshot.filterValues);
  callbacks.onSetVariables(snapshot.variableValues);
  if (snapshot.widgetPositions) callbacks.onSetPositions?.(snapshot.widgetPositions);
  if (snapshot.drillDownStates) {
    Object.entries(snapshot.drillDownStates).forEach(([id, state]) => { drillStacks.set(id, state); });
  }
};
