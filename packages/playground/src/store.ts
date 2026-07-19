import { create } from 'zustand';
import type { Bookmark, ConnectionConfig, ConnectionTestResult, DashboardConfig, DashboardMeta, DashboardStateSnapshot, DashboardVariable, DashboardWidget, FilterConfig, GridPosition, Primitive, SavedView, SchemaInfo } from '@dashboard-generator/core';
import type { SnapGuide, DistanceLabel } from './snap-engine';
import { alignLeft, alignRight, alignTop, alignBottom, centerHorizontal, centerVertical, equalWidth, equalHeight, distributeHorizontally, distributeVertically, groupWidgets, ungroupWidgets, getGroupMembers, lockWidgets, unlockWidgets, hideWidgets, showWidgets } from './layout-tools';
import { connectionManager } from './connection-manager';
import { applyCrossFilter, clearCrossFilter, clearAllCrossFilters, drillDown as engineDrillDown, drillUp as engineDrillUp, resetDrillDown as engineResetDrillDown, bookmarkManager, savedViewManager, takeSnapshot, applySnapshot, initVariables, setVariable as engineSetVariable, getVariables as engineGetVariables, setVariables as engineSetVariables, syncAllVariablesToUrl } from './interaction-engine';
import { dashboardManager, autosaveController } from './dashboard-manager';

type Viewport = 'desktop' | 'laptop' | 'tablet' | 'mobile';

export interface MarqueeRect { x: number; y: number; width: number; height: number }

interface BuilderState {
  dashboard: DashboardConfig;
  /** @deprecated Use `selectedIds` for multi-selection. `selectedId` returns the primary (last-clicked) selection for backward compatibility. */
  selectedId?: string;
  selectedIds: string[];
  history: DashboardConfig[];
  future: DashboardConfig[];
  clipboard?: DashboardWidget;
  filterValues: Record<string, Primitive>;
  preview: boolean;
  dark: boolean;
  viewport: Viewport;
  jsonOpen: boolean;
  dataOpen: boolean;
  marquee: MarqueeRect | null;
  /** Active alignment guides during drag. */
  snapGuides: SnapGuide[];
  /** Distance labels between close edges during drag. */
  snapDistances: DistanceLabel[];
  /** ID of the widget currently being dragged (for guide rendering). */
  draggingId?: string;
  /** Focused widget id for keyboard navigation (Tab cycling). */
  focusedId?: string;

  /* Connection management */
  connections: ConnectionConfig[];
  connectionSchemas: Record<string, SchemaInfo>;
  connectionTestResults: Record<string, ConnectionTestResult>;
  connectionTesting: Record<string, boolean>;
  /** Currently selected connection ID in the data source manager. */
  activeConnectionId?: string;
  /** Data source manager modal open state. */
  dataSourceManagerOpen: boolean;

  /* Interaction state */
  variableValues: Record<string, Primitive>;
  crossFilterWidgetId?: string;
  bookmarks: Bookmark[];
  savedViews: SavedView[];
  drillStacks: Record<string, number>;

  /* Dashboard management */
  dashboardListOpen: boolean;
  currentMeta?: DashboardMeta;
  autosaveActive: boolean;
  lastAutosave?: string;

  setDashboard(value: DashboardConfig, history?: boolean): void;
  select(id?: string, options?: { additive?: boolean; toggle?: boolean }): void;
  selectAll(): void;
  clearSelection(): void;
  add(type: string): void;
  update(id: string, patch: Partial<DashboardWidget>): void;
  updatePosition(id: string, position: GridPosition, viewport?: Viewport): void;
  remove(id: string): void;
  duplicate(id: string): void;
  copy(id: string): void;
  paste(): void;
  undo(): void;
  redo(): void;
  reset(): void;
  togglePreview(): void;
  setFilter(id: string, value: Primitive): void;
  clearFilters(): void;
  addFilter(filter: FilterConfig): void;
  removeFilter(id: string): void;
  setMarquee(rect: MarqueeRect | null): void;
  /** Update snap guides and distances during drag. */
  setSnapGuides(guides: SnapGuide[], distances: DistanceLabel[], draggingId?: string): void;
  /** Clear all snap guides (called on drag end). */
  clearSnapGuides(): void;
  /** Remove all currently selected widgets. */
  removeSelected(): void;
  /** Duplicate all currently selected widgets. */
  duplicateSelected(): void;
  /** Copy all currently selected widgets. */
  copySelected(): void;
  /** Move focus to the next/previous widget in DOM order. */
  focusNext(direction: 1 | -1): void;
  /** Move all selected widgets by delta grid units. */
  nudgeSelected(dx: number, dy: number): void;
  /** Apply a batch widget replacement (used by layout tools). */
  patchWidgets(next: DashboardWidget[]): void;
  /* Layout tool shortcuts */
  alignSelected(direction: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v'): void;
  equalizeSelected(dimension: 'width' | 'height'): void;
  distributeSelected(axis: 'horizontal' | 'vertical'): void;
  groupSelected(): void;
  ungroupSelected(): void;
  lockSelected(): void;
  unlockSelected(): void;
  hideSelected(): void;
  showSelected(): void;
  /* Connection management actions */
  loadConnections(): void;
  addConnection(config: Omit<ConnectionConfig, 'createdAt' | 'updatedAt'>): ConnectionConfig;
  updateConnection(id: string, patch: Partial<ConnectionConfig>): void;
  removeConnection(id: string): void;
  testConnection(id: string): Promise<ConnectionTestResult>;
  refreshSchema(id: string): Promise<void>;
  previewData(id: string, query: string, limit?: number): Promise<import('@dashboard-generator/core').DataRecord[]>;
  setActiveConnection(id?: string): void;
  openDataSourceManager(): void;
  closeDataSourceManager(): void;
  /* Interaction actions */
  initDashboardVariables(variables: DashboardVariable[]): void;
  setDashboardVariable(name: string, value: Primitive): void;
  setDashboardVariables(values: Record<string, Primitive>): void;
  applyWidgetCrossFilter(widgetId: string, field: string, value: Primitive): void;
  clearWidgetCrossFilter(widgetId: string): void;
  clearAllWidgetCrossFilters(): void;
  widgetDrillDown(widgetId: string, hierarchy: string[], value: Primitive, field: string): void;
  widgetDrillUp(widgetId: string): void;
  widgetResetDrillDown(widgetId: string): void;
  saveBookmark(name: string): Bookmark | undefined;
  restoreBookmark(bookmarkId: string): boolean;
  deleteBookmark(bookmarkId: string): void;
  saveView(name: string, description?: string): SavedView | undefined;
  loadView(viewId: string): boolean;
  deleteView(viewId: string): void;
  refreshBookmarks(): void;
  refreshSavedViews(): void;
  /* Dashboard management */
  openDashboardList(): void;
  closeDashboardList(): void;
  openDashboard(meta: DashboardMeta): void;
  saveCurrentDashboard(): void;
  publishCurrentDashboard(): void;
  archiveCurrentDashboard(): void;
  restoreDashboard(id: string): void;
  toggleAutosave(): void;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const emptyDashboard: DashboardConfig = { id: 'untitled-dashboard', title: 'Untitled dashboard', description: '', version: '1.0.0', theme: 'light', widgets: [] };
const defaultDataForType = (type: string): Record<string, unknown>[] => {
  const categorical = [{ name: 'A', value: 60 }, { name: 'B', value: 40 }, { name: 'C', value: 25 }, { name: 'D', value: 80 }];
  const timeSeries = [{ name: 'Jan', value: 30 }, { name: 'Feb', value: 52 }, { name: 'Mar', value: 41 }, { name: 'Apr', value: 67 }];
  const scatter = [{ x: 10, y: 20, z: 5 }, { x: 25, y: 35, z: 8 }, { x: 40, y: 15, z: 3 }, { x: 55, y: 45, z: 10 }];
  const heatmap = [{ name: 'A', category: 'X', value: 10 }, { name: 'A', category: 'Y', value: 30 }, { name: 'B', category: 'X', value: 50 }, { name: 'B', category: 'Y', value: 20 }];
  const sankey = [{ source: 'Page A', target: 'Page B', value: 10 }, { source: 'Page A', target: 'Page C', value: 5 }, { source: 'Page B', target: 'Page D', value: 8 }];
  const timeline = [{ date: '2025-01-15', name: 'Launch', description: 'Project started' }, { date: '2025-03-20', name: 'Beta', description: 'Beta release' }, { date: '2025-06-01', name: 'Release', description: 'v1.0 shipped' }];
  const candlestick = [{ name: 'Mon', open: 100, high: 110, low: 95, close: 105 }, { name: 'Tue', open: 105, high: 115, low: 100, close: 98 }, { name: 'Wed', open: 98, high: 108, low: 90, close: 103 }];
  const waterfall = [{ name: 'Start', value: 100 }, { name: 'Add', value: 50 }, { name: 'Remove', value: -20 }, { name: 'Add', value: 30 }, { name: 'End', value: 0 }];
  const funnel = [{ name: 'Visits', value: 1000 }, { name: 'Signups', value: 400 }, { name: 'Purchase', value: 120 }];
  const calendar = [{ date: '2025-07-10', name: 'Meeting' }, { date: '2025-07-15', name: 'Deadline' }, { date: '2025-07-22', name: 'Review' }];
  const radar = [{ name: 'Speed', value: 80 }, { name: 'Safety', value: 70 }, { name: 'Comfort', value: 90 }, { name: 'Value', value: 60 }, { name: 'Design', value: 75 }];
  if (type === 'pie' || type === 'donut' || type === 'bar' || type === 'line' || type === 'area' || type === 'scatter' || type === 'bubble') return scatter;
  if (type === 'histogram' || type === 'treemap' || type === 'funnel' || type === 'radar') return categorical;
  if (type === 'gauge') return [{ value: 72 }];
  if (type === 'heatmap') return heatmap;
  if (type === 'waterfall') return waterfall;
  if (type === 'candlestick') return candlestick;
  if (type === 'sankey') return sankey;
  if (type === 'sunburst') return categorical;
  if (type === 'progress') return [{ value: 68 }];
  if (type === 'timeline') return timeline;
  if (type === 'calendar') return calendar;
  return timeSeries;
};
const defaultOptionsForType = (type: string): Record<string, unknown> => {
  if (type === 'kpi') return { label: 'New metric', value: '$0' };
  if (type === 'progress') return { value: 68, max: 100, mode: 'circular' };
  if (type === 'candlestick') return { xKey: 'name', openKey: 'open', highKey: 'high', lowKey: 'low', closeKey: 'close' };
  if (type === 'waterfall') return { xKey: 'name', yKey: 'value' };
  if (type === 'heatmap') return { xKey: 'name', yKey: 'category', valueKey: 'value' };
  if (type === 'scatter' || type === 'bubble') return { xKey: 'x', yKey: 'y', zKey: 'z' };
  if (type === 'markdown') return { content: '## Heading\n\nYour **markdown** content here.' };
  if (type === 'image') return { src: '', alt: 'Image', objectFit: 'cover' };
  if (type === 'video') return { src: '' };
  if (type === 'iframe') return { src: 'https://example.com' };
  if (type === 'map') return { latitude: '40.7128', longitude: '-74.0060', zoom: 12 };
  if (type === 'timeline') return { timeKey: 'date', labelKey: 'name', descKey: 'description' };
  if (type === 'calendar') return { dateKey: 'date', titleKey: 'name' };
  return { xKey: 'name', yKey: 'value' };
};
const wideTypes = ['table','heatmap','treemap','sankey','sunburst','map','iframe','timeline','calendar'];
const tallTypes = ['gauge','funnel','radar','candlestick','waterfall'];
const smallTypes = ['kpi','progress'];
const makeWidget = (type: string, index: number): DashboardWidget => {
  const widgetWidth = wideTypes.includes(type) ? 8 : smallTypes.includes(type) ? 3 : 4;
  const widgetHeight = wideTypes.includes(type) ? 5 : tallTypes.includes(type) ? 4 : smallTypes.includes(type) ? 2 : 3;
  return {
    id: `${type}-${Date.now()}`,
    type,
    title: type === 'kpi' ? 'New metric' : `New ${type} widget`,
    position: { x: (index * 3) % 12, y: Math.floor(index / 4) * 3 + 6, w: widgetWidth, h: widgetHeight, minW: smallTypes.includes(type) ? 2 : 3, minH: smallTypes.includes(type) ? 2 : 3, maxW: 12, maxH: 12 },
    datasource: { kind: 'static', data: defaultDataForType(type) },
    options: defaultOptionsForType(type),
  };
};

/** Sort widgets in a stable DOM order (top-to-bottom, left-to-right). */
const sortedWidgetIds = (widgets: DashboardWidget[]): string[] =>
  [...widgets].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x).map((w) => w.id);

export const useBuilderStore = create<BuilderState>((set, get) => {
  const pushHistory = (dashboard: DashboardConfig) => set(state => ({ history:[...state.history, clone(state.dashboard)].slice(-50), future:[], dashboard:clone(dashboard) }));

  return {
    dashboard: emptyDashboard,
    selectedId: undefined,
    selectedIds: [],
    history:[],
    future:[],
    filterValues:{},
    preview:false,
    dark:false,
    viewport:'desktop',
    jsonOpen:false,
    dataOpen:false,
    marquee: null,
    snapGuides: [],
    snapDistances: [],
    draggingId: undefined,
    focusedId: undefined,

    connections: connectionManager.list(),
    connectionSchemas: {},
    connectionTestResults: {},
    connectionTesting: {},
    activeConnectionId: undefined,
    dataSourceManagerOpen: false,

    variableValues: {},
    crossFilterWidgetId: undefined,
    bookmarks: [],
    savedViews: [],
    drillStacks: {},

    dashboardListOpen: false,
    currentMeta: undefined,
    autosaveActive: dashboardManager.getAutosaveConfig().enabled,
    lastAutosave: dashboardManager.getAutosaveConfig().lastSavedAt,

    setDashboard: (dashboard, history = true) => history ? pushHistory(dashboard) : set({dashboard:clone(dashboard)}),

    select: (id, options) => {
      const { additive, toggle } = options ?? {};
      set((state) => {
        if (!id) {
          return additive ? {} : { selectedIds: [], selectedId: undefined };
        }
        const ids = new Set(state.selectedIds);
        if (toggle) {
          if (ids.has(id)) ids.delete(id); else ids.add(id);
        } else if (additive) {
          ids.add(id);
        } else {
          return { selectedIds: [id], selectedId: id, focusedId: id };
        }
        const next = [...ids];
        return { selectedIds: next, selectedId: next[next.length - 1] ?? undefined, focusedId: id };
      });
    },

    selectAll: () => set((state) => {
      const ids = state.dashboard.widgets.map((w) => w.id);
      return { selectedIds: ids, selectedId: ids[ids.length - 1] };
    }),

    clearSelection: () => set({ selectedIds: [], selectedId: undefined }),

    add: type => { const state=get(); const widget=makeWidget(type,state.dashboard.widgets.length); pushHistory({...state.dashboard,widgets:[...state.dashboard.widgets,widget]}); set({selectedId:widget.id, selectedIds:[widget.id], focusedId:widget.id}); },

    update: (id, patch) => { const state=get(); pushHistory({...state.dashboard,widgets:state.dashboard.widgets.map(w => w.id===id ? {...w,...patch} : w)}); },

    updatePosition: (id, position, viewport = 'desktop') => { const state=get(); pushHistory({...state.dashboard,widgets:state.dashboard.widgets.map(w => w.id===id ? viewport === 'desktop' ? {...w,position} : {...w,positions:{...w.positions,[viewport]:position}} : w)}); },

    remove: id => { const state=get(); pushHistory({...state.dashboard,widgets:state.dashboard.widgets.filter(w => w.id!==id)}); set({selectedId:undefined, selectedIds:[]}); },

    duplicate: id => { const state=get(); const source=state.dashboard.widgets.find(w=>w.id===id); if (!source) return; const copy={...clone(source),id:`${source.type}-${Date.now()}`,position:{...source.position,y:source.position.y+source.position.h}}; pushHistory({...state.dashboard,widgets:[...state.dashboard.widgets,copy]}); set({selectedId:copy.id, selectedIds:[copy.id]}); },

    copy:id => { const widget=get().dashboard.widgets.find(w=>w.id===id); if (widget) set({clipboard:clone(widget)}); },

    paste:() => { const {clipboard,dashboard}=get(); if(!clipboard)return; const copy={...clone(clipboard),id:`${clipboard.type}-${Date.now()}`,position:{...clipboard.position,y:clipboard.position.y+1}}; pushHistory({...dashboard,widgets:[...dashboard.widgets,copy]}); set({selectedId:copy.id, selectedIds:[copy.id]}); },

    undo:() => { const state=get(); const previous=state.history.at(-1); if(!previous)return; set({dashboard:clone(previous),history:state.history.slice(0,-1),future:[clone(state.dashboard),...state.future], selectedIds:[], selectedId:undefined}); },

    redo:() => { const state=get(); const next=state.future[0]; if(!next)return; set({dashboard:clone(next),history:[...state.history,clone(state.dashboard)],future:state.future.slice(1), selectedIds:[], selectedId:undefined}); },

    reset:() => { const state=get(); pushHistory({...state.dashboard,id:`dashboard-${Date.now()}`,title:'Untitled dashboard',description:'',widgets:[]}); set({selectedId:undefined, selectedIds:[]}); },

    togglePreview:()=>set(s=>({preview:!s.preview, selectedIds: s.preview ? get().selectedIds : [], selectedId: s.preview ? get().selectedId : undefined})),

    setFilter:(id,value)=>set(state=>({filterValues:{...state.filterValues,[id]:value}})),
    clearFilters:()=>set({filterValues:{}}),
    addFilter:filter=>{ const state=get(); pushHistory({...state.dashboard,filters:[...(state.dashboard.filters??[]),filter]}); },
    removeFilter:id=>{ const state=get(); pushHistory({...state.dashboard,filters:(state.dashboard.filters??[]).filter(filter=>filter.id!==id)}); },

    setMarquee: (rect) => set({ marquee: rect }),

    setSnapGuides: (guides, distances, draggingId) => set({ snapGuides: guides, snapDistances: distances, draggingId }),

    clearSnapGuides: () => set({ snapGuides: [], snapDistances: [], draggingId: undefined }),

    removeSelected: () => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size === 0) return;
      pushHistory({ ...state.dashboard, widgets: state.dashboard.widgets.filter((w) => !ids.has(w.id)) });
      set({ selectedIds: [], selectedId: undefined });
    },

    duplicateSelected: () => {
      const state = get();
      const selected = state.dashboard.widgets.filter((w) => state.selectedIds.includes(w.id));
      if (selected.length === 0) return;
      const clones = selected.map((w, i) => ({
        ...clone(w),
        id: `${w.type}-${Date.now()}-${i}`,
        position: { ...w.position, y: w.position.y + w.position.h },
      }));
      pushHistory({ ...state.dashboard, widgets: [...state.dashboard.widgets, ...clones] });
      const newIds = clones.map((c) => c.id);
      set({ selectedIds: newIds, selectedId: newIds[newIds.length - 1] });
    },

    copySelected: () => {
      const state = get();
      const selected = state.dashboard.widgets.filter((w) => state.selectedIds.includes(w.id));
      if (selected.length === 1) {
        set({ clipboard: clone(selected[0]) });
      } else if (selected.length > 1) {
        set({ clipboard: clone(selected[0]) });
      }
    },

    focusNext: (direction) => {
      const state = get();
      const ordered = sortedWidgetIds(state.dashboard.widgets);
      if (ordered.length === 0) return;
      const currentIdx = ordered.indexOf(state.focusedId ?? state.selectedId ?? '');
      const nextIdx = currentIdx === -1 ? 0 : (currentIdx + direction + ordered.length) % ordered.length;
      set({ focusedId: ordered[nextIdx], selectedId: ordered[nextIdx], selectedIds: [ordered[nextIdx]] });
    },

    nudgeSelected: (dx, dy) => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size === 0) return;
      const viewport = state.viewport;
      pushHistory({
        ...state.dashboard,
        widgets: state.dashboard.widgets.map((w) => {
          if (!ids.has(w.id)) return w;
          if (viewport === 'desktop') {
            const pos = w.position;
            return { ...w, position: { ...pos, x: Math.max(0, Math.min(12 - pos.w, pos.x + dx)), y: Math.max(0, pos.y + dy) } };
          }
          const existing = w.positions?.[viewport] ?? w.position;
          return { ...w, positions: { ...w.positions, [viewport]: { ...existing, x: Math.max(0, Math.min(12 - existing.w, existing.x + dx)), y: Math.max(0, existing.y + dy) } } };
        }),
      });
    },

    patchWidgets: (next) => { const state = get(); pushHistory({ ...state.dashboard, widgets: next }); },

    alignSelected: (direction) => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size < 2) return;
      const fns = { left: alignLeft, right: alignRight, top: alignTop, bottom: alignBottom, 'center-h': centerHorizontal, 'center-v': centerVertical };
      pushHistory({ ...state.dashboard, widgets: fns[direction](state.dashboard.widgets, ids, state.viewport) });
    },

    equalizeSelected: (dimension) => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size < 2) return;
      pushHistory({ ...state.dashboard, widgets: (dimension === 'width' ? equalWidth : equalHeight)(state.dashboard.widgets, ids, state.viewport) });
    },

    distributeSelected: (axis) => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size < 3) return;
      pushHistory({ ...state.dashboard, widgets: (axis === 'horizontal' ? distributeHorizontally : distributeVertically)(state.dashboard.widgets, ids, state.viewport) });
    },

    groupSelected: () => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size < 2) return;
      const { widgets } = groupWidgets(state.dashboard.widgets, ids);
      pushHistory({ ...state.dashboard, widgets });
    },

    ungroupSelected: () => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size === 0) return;
      pushHistory({ ...state.dashboard, widgets: ungroupWidgets(state.dashboard.widgets, ids) });
    },

    lockSelected: () => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size === 0) return;
      pushHistory({ ...state.dashboard, widgets: lockWidgets(state.dashboard.widgets, ids) });
    },

    unlockSelected: () => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size === 0) return;
      pushHistory({ ...state.dashboard, widgets: unlockWidgets(state.dashboard.widgets, ids) });
    },

    hideSelected: () => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size === 0) return;
      pushHistory({ ...state.dashboard, widgets: hideWidgets(state.dashboard.widgets, ids) });
      set({ selectedIds: [], selectedId: undefined });
    },

    showSelected: () => {
      const state = get();
      const ids = new Set(state.selectedIds);
      if (ids.size === 0) return;
      pushHistory({ ...state.dashboard, widgets: showWidgets(state.dashboard.widgets, ids) });
    },

    /* Connection management */
    loadConnections: () => set({ connections: connectionManager.list() }),

    addConnection: (config) => {
      const connection = connectionManager.create(config);
      set({ connections: connectionManager.list(), activeConnectionId: connection.id });
      return connection;
    },

    updateConnection: (id, patch) => {
      connectionManager.update(id, patch);
      set({ connections: connectionManager.list() });
    },

    removeConnection: (id) => {
      connectionManager.remove(id);
      set((state) => ({
        connections: connectionManager.list(),
        activeConnectionId: state.activeConnectionId === id ? undefined : state.activeConnectionId,
      }));
    },

    testConnection: async (id) => {
      set((state) => ({ connectionTesting: { ...state.connectionTesting, [id]: true } }));
      const result = await connectionManager.test(id);
      set((state) => ({
        connectionTesting: { ...state.connectionTesting, [id]: false },
        connectionTestResults: { ...state.connectionTestResults, [id]: result },
        connections: connectionManager.list(),
      }));
      return result;
    },

    refreshSchema: async (id) => {
      const schema = await connectionManager.getSchema(id);
      set((state) => ({ connectionSchemas: { ...state.connectionSchemas, [id]: schema } }));
    },

    previewData: async (id, query, limit) => {
      return connectionManager.preview(id, query, limit);
    },

    setActiveConnection: (id) => set({ activeConnectionId: id }),

    openDataSourceManager: () => set({ dataSourceManagerOpen: true }),

    closeDataSourceManager: () => set({ dataSourceManagerOpen: false, activeConnectionId: undefined }),

    /* Interaction actions */
    initDashboardVariables: (variables) => {
      initVariables(variables);
      set({ variableValues: engineGetVariables() });
    },

    setDashboardVariable: (name, value) => {
      engineSetVariable(name, value);
      set({ variableValues: engineGetVariables() });
    },

    setDashboardVariables: (values) => {
      engineSetVariables(values);
      set({ variableValues: engineGetVariables() });
    },

    applyWidgetCrossFilter: (widgetId, field, value) => {
      applyCrossFilter(widgetId, field, value);
      set({ crossFilterWidgetId: widgetId });
    },

    clearWidgetCrossFilter: (widgetId) => {
      clearCrossFilter(widgetId);
      set({ crossFilterWidgetId: undefined });
    },

    clearAllWidgetCrossFilters: () => {
      clearAllCrossFilters();
      set({ crossFilterWidgetId: undefined });
    },

    widgetDrillDown: (widgetId, hierarchy, value, field) => {
      engineDrillDown(widgetId, hierarchy, value, field);
      const state = engineGetVariables();
      set((s) => ({ drillStacks: { ...s.drillStacks, [widgetId]: (s.drillStacks[widgetId] ?? 0) + 1 }, variableValues: state }));
    },

    widgetDrillUp: (widgetId) => {
      engineDrillUp(widgetId);
      const state = engineGetVariables();
      set((s) => ({ drillStacks: { ...s.drillStacks, [widgetId]: Math.max(0, (s.drillStacks[widgetId] ?? 1) - 1) }, variableValues: state }));
    },

    widgetResetDrillDown: (widgetId) => {
      engineResetDrillDown(widgetId);
      set((s) => { const next = { ...s.drillStacks }; delete next[widgetId]; return { drillStacks: next }; });
    },

    saveBookmark: (name) => {
      const state = get();
      const snapshot = takeSnapshot(state.filterValues, state.dashboard.widgets);
      const bookmark = bookmarkManager.save(name, state.dashboard.id, snapshot);
      set({ bookmarks: bookmarkManager.list(state.dashboard.id) });
      return bookmark;
    },

    restoreBookmark: (bookmarkId) => {
      const snapshot = bookmarkManager.restore(bookmarkId);
      if (!snapshot) return false;
      const state = get();
      applySnapshot(snapshot, {
        onSetFilters: (values) => set({ filterValues: values }),
        onSetVariables: (values) => { engineSetVariables(values); set({ variableValues: engineGetVariables() }); },
        onSetPositions: (positions) => {
          const widgets = state.dashboard.widgets.map((w) => positions[w.id] ? { ...w, position: positions[w.id] } : w);
          pushHistory({ ...state.dashboard, widgets });
        },
      });
      return true;
    },

    deleteBookmark: (bookmarkId) => {
      bookmarkManager.remove(bookmarkId);
      const state = get();
      set({ bookmarks: bookmarkManager.list(state.dashboard.id) });
    },

    saveView: (name, description) => {
      const state = get();
      const snapshot = takeSnapshot(state.filterValues, state.dashboard.widgets);
      const view = savedViewManager.save(name, state.dashboard.id, snapshot, description);
      set({ savedViews: savedViewManager.list(state.dashboard.id) });
      return view;
    },

    loadView: (viewId) => {
      const snapshot = savedViewManager.load(viewId);
      if (!snapshot) return false;
      const state = get();
      applySnapshot(snapshot, {
        onSetFilters: (values) => set({ filterValues: values }),
        onSetVariables: (values) => { engineSetVariables(values); set({ variableValues: engineGetVariables() }); },
        onSetPositions: (positions) => {
          const widgets = state.dashboard.widgets.map((w) => positions[w.id] ? { ...w, position: positions[w.id] } : w);
          pushHistory({ ...state.dashboard, widgets });
        },
      });
      return true;
    },

    deleteView: (viewId) => {
      savedViewManager.remove(viewId);
      const state = get();
      set({ savedViews: savedViewManager.list(state.dashboard.id) });
    },

    refreshBookmarks: () => {
      const state = get();
      set({ bookmarks: bookmarkManager.list(state.dashboard.id) });
    },

    refreshSavedViews: () => {
      const state = get();
      set({ savedViews: savedViewManager.list(state.dashboard.id) });
    },

    /* Dashboard management */
    openDashboardList: () => set({ dashboardListOpen: true }),

    closeDashboardList: () => set({ dashboardListOpen: false }),

    openDashboard: (meta) => {
      const draft = dashboardManager.getDraft(meta.id);
      const config = draft ?? { id: meta.id, title: meta.title, description: meta.description ?? '', version: '1.0.0', theme: 'light' as const, widgets: [] };
      dashboardManager.trackAccess(meta.id);
      set({ dashboard: clone(config), currentMeta: meta, dashboardListOpen: false, selectedIds: [], selectedId: undefined, history: [], future: [] });
    },

    saveCurrentDashboard: () => {
      const state = get();
      const id = state.dashboard.id;
      let meta = dashboardManager.get(id);
      if (!meta) meta = dashboardManager.create(state.dashboard);
      else dashboardManager.update(id, { widgetCount: state.dashboard.widgets.length, updatedAt: new Date().toISOString() });
      dashboardManager.saveDraft(id, state.dashboard);
      dashboardManager.saveVersion(id, state.dashboard, 'Autosave');
      autosaveController.trigger();
      set({ currentMeta: dashboardManager.get(id), lastAutosave: new Date().toISOString() });
    },

    publishCurrentDashboard: () => {
      const state = get();
      const id = state.dashboard.id;
      let meta = dashboardManager.get(id);
      if (!meta) meta = dashboardManager.create(state.dashboard);
      dashboardManager.saveDraft(id, state.dashboard);
      dashboardManager.saveVersion(id, state.dashboard, 'Publish');
      dashboardManager.publish(id);
      set({ currentMeta: dashboardManager.get(id) });
    },

    archiveCurrentDashboard: () => {
      const state = get();
      dashboardManager.archive(state.dashboard.id);
      set({ currentMeta: dashboardManager.get(state.dashboard.id) });
    },

    restoreDashboard: (id) => {
      dashboardManager.restore(id);
      const meta = dashboardManager.get(id);
      if (meta) {
        const draft = dashboardManager.getDraft(id);
        if (draft) set({ dashboard: clone(draft), currentMeta: meta });
        else set({ currentMeta: meta });
      }
    },

    toggleAutosave: () => {
      const config = dashboardManager.getAutosaveConfig();
      const next = dashboardManager.setAutosaveConfig({ enabled: !config.enabled });
      if (next.enabled) {
        autosaveController.start(() => get().saveCurrentDashboard());
      } else {
        autosaveController.stop();
      }
      set({ autosaveActive: next.enabled });
    },
  };
});
export type { Viewport };
