import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GridLayout, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { getWidget, listWidgets, type DashboardConfig, type DashboardWidget, type DataRecord, type FilterConfig, type GridPosition, type Primitive, type WidgetRenderProps, type WidgetInteraction, type ConditionalFormatRule, type DynamicColorRule, type DynamicLabelRule, type DashboardVariable, type CalculatedField } from '@dashboard-generator/core';
import { loadData } from '@dashboard-generator/datasource';
import { darkTheme, lightTheme } from '@dashboard-generator/theme';
import { useBuilderStore, type MarqueeRect, computeSnapGuides, type SnapGuide, type DistanceLabel, getGroupMembers, QueryBuilder } from '@dashboard-generator/playground';
import '@dashboard-generator/widgets';
import { ErrorBoundary } from '@dashboard-generator/playground';

const chartTypes = ['kpi','bar','line','area','pie','donut','gauge','funnel','scatter','bubble','heatmap','treemap','radar','histogram'];
const financialTypes = ['waterfall','candlestick','sankey','sunburst'];
const mediaTypes = ['map','markdown','image','video','iframe'];
const utilityTypes = ['progress','timeline','calendar'];
const category = (type: string) => chartTypes.includes(type) || financialTypes.includes(type) ? 'Charts' : mediaTypes.includes(type) ? 'Media' : utilityTypes.includes(type) ? 'Utility' : type === 'table' ? 'Data' : 'Layout';
const icon: Record<string, string> = { kpi:'◆', bar:'▥', line:'⌁', area:'◒', pie:'◔', donut:'◉', gauge:'◎', funnel:'▼', scatter:'⬡', bubble:'●', heatmap:'▦', treemap:'⊞', radar:'⬢', histogram:'▥', waterfall:'▥', candlestick:'│', sankey:'ਯ', sunburst:'◕', map:'⊛', markdown:'M', image:'⬜', video:'▶', iframe:'⧉', progress:'◔', timeline:'⋯', table:'▤', text:'T', divider:'—' };
const defaultPosition = (type: string) => {
  const wide = ['table','heatmap','treemap','sankey','sunburst','map','iframe','timeline','calendar'];
  const tall = ['gauge','funnel','radar','candlestick','waterfall'];
  const small = ['kpi','progress'];
  const w = wide.includes(type) ? 8 : small.includes(type) ? 3 : 4;
  const h = wide.includes(type) ? 5 : tall.includes(type) ? 4 : small.includes(type) ? 2 : 3;
  return { x: 0, y: 0, w, h, minW: small.includes(type) ? 2 : 3, minH: small.includes(type) ? 2 : 3, maxW: 12, maxH: 12 };
};

const filterData = (data: DataRecord[], values: Record<string, Primitive>, filters: FilterConfig[] = []) => data.filter((row) => filters.every((filter) => {
  const value = values[filter.id]; if (value === null || value === '' || value === false || value === undefined || !filter.field) return true;
  const cell = String(row[filter.field] ?? '');
  if (filter.type === 'search') return cell.toLowerCase().includes(String(value).toLowerCase());
  return cell.toLowerCase() === String(value).toLowerCase();
}));
const positionFor = (widget: DashboardWidget, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile') => viewport === 'desktop' ? widget.position : widget.positions?.[viewport] ?? widget.position;

/* ------------------------------------------------------------------ */
/*  WidgetContent                                                      */
/* ------------------------------------------------------------------ */

function WidgetContent({ widget }: { widget: DashboardWidget }) {
  const [data, setData] = useState<DataRecord[]>([]);
  const dashboard = useBuilderStore((state) => state.dashboard);
  const source = widget.datasource ?? dashboard.datasets?.find((dataset) => dataset.id === widget.binding?.datasetId)?.datasource;
  const [loading, setLoading] = useState(Boolean(source));
  const filters = useBuilderStore((state) => state.filterValues);
  const dark = useBuilderStore((state) => state.dark);
  const definition = getWidget(widget.type);
  useEffect(() => { let active = true; setLoading(Boolean(source)); loadData(source).then((result) => { if (active) setData(result.data); }).catch(() => active && setData([])).finally(() => active && setLoading(false)); return () => { active = false; }; }, [source]);
  if (!definition) return <div className="pg-empty">Unknown widget</div>;
  const props: WidgetRenderProps = { widget, data: filterData(data, filters, dashboard.filters), loading, filters, theme: dark ? darkTheme : lightTheme };
  return <div className="pg-widget-content">{loading ? <div className="pg-widget-skeleton"><div className="pg-skeleton-line" style={{width:'60%'}} /><div className="pg-skeleton-line" style={{width:'80%'}} /><div className="pg-skeleton-line" style={{width:'40%'}} /></div> : definition.renderer(props)}</div>;
}

/* ------------------------------------------------------------------ */
/*  WidgetToolbar  (single-widget actions)                              */
/* ------------------------------------------------------------------ */

function WidgetToolbar({ widget }: { widget: DashboardWidget }) {
  const { duplicate, copy, remove, update, updatePosition, hideSelected } = useBuilderStore();
  const locked = Boolean(widget.options?.locked);
  const action = (event: React.MouseEvent, fn: () => void) => { event.stopPropagation(); fn(); };
  return <div className="pg-widget-toolbar" onMouseDown={(event) => event.stopPropagation()}>
    <button title="Duplicate (Ctrl+D)" onClick={(e) => action(e, () => duplicate(widget.id))}>⧉</button>
    <button title="Copy (Ctrl+C)" onClick={(e) => action(e, () => copy(widget.id))}>⎘</button>
    <button title={locked ? 'Unlock (Ctrl+Shift+K)' : 'Lock (Ctrl+Shift+K)'} onClick={(e) => action(e, () => update(widget.id, { options: { ...widget.options, locked: !locked } }))}>{locked ? '🔒' : '🔓'}</button>
    <button title="Bring forward" onClick={(e) => action(e, () => update(widget.id, { style: { ...widget.style, zIndex: 2 } }))}>↑</button>
    <button title="Send back" onClick={(e) => action(e, () => update(widget.id, { style: { ...widget.style, zIndex: 1 } }))}>↓</button>
    <button title="Hide (Ctrl+Shift+H)" onClick={(e) => { e.stopPropagation(); useBuilderStore.getState().select(widget.id); hideSelected(); }}>👁</button>
    <button title="Reset size" onClick={(e) => action(e, () => updatePosition(widget.id, { ...defaultPosition(widget.type), x: widget.position.x, y: widget.position.y }))}>⟲</button>
    <button title="Delete (Del)" className="danger" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${widget.title || widget.type}"?`)) remove(widget.id); }}>×</button>
  </div>;
}

/* ------------------------------------------------------------------ */
/*  SelectionBadge – shows count when multiple widgets are selected     */
/* ------------------------------------------------------------------ */

function SelectionBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return <div className="pg-selection-badge" aria-live="polite">{count} selected</div>;
}

/* ------------------------------------------------------------------ */
/*  LayoutToolbar – alignment & distribution tools (shown on multi)    */
/* ------------------------------------------------------------------ */

function LayoutToolbar() {
  const { selectedIds, dashboard, alignSelected, equalizeSelected, distributeSelected, groupSelected, ungroupSelected, lockSelected, unlockSelected, hideSelected } = useBuilderStore();
  if (selectedIds.length < 2) return null;
  const widgets = dashboard.widgets.filter((w) => selectedIds.includes(w.id));
  const allLocked = widgets.every((w) => w.options?.locked);
  const allHidden = widgets.every((w) => w.options?.hidden);
  const hasGroup = widgets.some((w) => w.options?.groupId);
  const count = widgets.length;
  const disabled = (req: number) => count < req ? 'disabled' : undefined;
  const btn = (label: string, tip: string, fn: () => void, req = 2) => (
    <button title={tip} className={disabled(req)} disabled={count < req} onClick={fn}>{label}</button>
  );
  return (
    <div className="pg-layout-toolbar" role="toolbar" aria-label="Layout tools">
      <span className="pg-layout-toolbar-label">Layout</span>
      <div className="pg-layout-toolbar-group">
        <span className="pg-layout-toolbar-divider" />
        {btn('⫷', 'Align left', () => alignSelected('left'))}
        {btn('⫸', 'Align right', () => alignSelected('right'))}
        {btn('⫠', 'Align top', () => alignSelected('top'))}
        {btn('⫡', 'Align bottom', () => alignSelected('bottom'))}
        {btn('⫶', 'Center horizontally', () => alignSelected('center-h'))}
        {btn('⫷', 'Center vertically', () => alignSelected('center-v'))}
      </div>
      <div className="pg-layout-toolbar-group">
        <span className="pg-layout-toolbar-divider" />
        {btn('⇔', 'Equal width', () => equalizeSelected('width'))}
        {btn('⇕', 'Equal height', () => equalizeSelected('height'))}
      </div>
      <div className="pg-layout-toolbar-group">
        <span className="pg-layout-toolbar-divider" />
        {btn('⟶', 'Distribute horizontally', () => distributeSelected('horizontal'), 3)}
        {btn('⟶', 'Distribute vertically', () => distributeSelected('vertical'), 3)}
      </div>
      <div className="pg-layout-toolbar-group">
        <span className="pg-layout-toolbar-divider" />
        {hasGroup ? btn('⊞', 'Ungroup', ungroupSelected) : btn('⊞', 'Group', groupSelected)}
        {allLocked ? btn('🔓', 'Unlock all', unlockSelected) : btn('🔒', 'Lock all', lockSelected)}
        {btn('👁', 'Hide', hideSelected)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HiddenWidgetsBar – bar for unhiding hidden widgets                 */
/* ------------------------------------------------------------------ */

function HiddenWidgetsBar() {
  const { dashboard, showSelected, select } = useBuilderStore();
  const hidden = dashboard.widgets.filter((w) => w.options?.hidden);
  if (hidden.length === 0) return null;
  return (
    <div className="pg-hidden-bar">
      <span className="pg-hidden-count">{hidden.length} hidden widget{hidden.length !== 1 ? 's' : ''}</span>
      {hidden.map((w) => (
        <button key={w.id} className="pg-hidden-chip" title={`Show "${w.title || w.type}"`} onClick={() => {
          select(w.id, { additive: true });
        }}>
          {w.title || w.type}
        </button>
      ))}
      <button className="pg-hidden-show-all" onClick={() => {
        const store = useBuilderStore.getState();
        store.select(undefined);
        hidden.forEach((w) => select(w.id, { additive: true }));
        showSelected();
      }}>Show all</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MarqueeOverlay – the drag-selection rectangle                      */
/* ------------------------------------------------------------------ */

function MarqueeOverlay({ rect }: { rect: MarqueeRect | null }) {
  if (!rect) return null;
  return (
    <div
      className="pg-marquee"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  SnapGuideLines – alignment guides rendered during drag              */
/* ------------------------------------------------------------------ */

function SnapGuideLines({ guides, distances }: { guides: SnapGuide[]; distances: DistanceLabel[] }) {
  if (guides.length === 0) return null;
  return (
    <div className="pg-snap-overlay" aria-hidden="true">
      {guides.map((guide, i) => (
        <div
          key={i}
          className={`pg-snap-line pg-snap-${guide.axis}`}
          style={guide.axis === 'vertical'
            ? { left: guide.position, top: guide.start, height: guide.end - guide.start }
            : { top: guide.position, left: guide.start, width: guide.end - guide.start }
          }
        />
      ))}
      {distances.map((d, i) => (
        <div
          key={`d-${i}`}
          className={`pg-distance-label pg-distance-${d.axis}`}
          style={{ left: d.x, top: d.y }}
        >
          {d.text}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar                                                          */
/* ------------------------------------------------------------------ */

function FilterBar() {
  const { dashboard, filterValues, setFilter, clearFilters } = useBuilderStore();
  if (!dashboard.filters?.length) return null;
  return <div className="pg-filterbar">{dashboard.filters.map((filter) => <label key={filter.id}>{filter.label}<select value={String(filterValues[filter.id] ?? '')} onChange={(e) => setFilter(filter.id, e.target.value)}><option value="">All</option>{filter.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select></label>)}<button onClick={clearFilters}>Clear filters</button></div>;
}

/* ------------------------------------------------------------------ */
/*  Canvas – core editing surface                                       */
/* ------------------------------------------------------------------ */

function Canvas() {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1000 });
  const { dashboard, selectedIds, select, updatePosition, preview, viewport, marquee, setMarquee, snapGuides, snapDistances, setSnapGuides, clearSnapGuides } = useBuilderStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const [isMarqueeDragging, setIsMarqueeDragging] = useState(false);

  const scale = viewport === 'desktop' ? 1 : viewport === 'laptop' ? 0.88 : viewport === 'tablet' ? .78 : .52;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const layout = useMemo<Layout>(() => dashboard.widgets.filter((w) => !w.options?.hidden).map((widget) => { const position = positionFor(widget, viewport); return { i: widget.id, ...position, minW: position.minW ?? 2, maxW: position.maxW ?? 12, minH: position.minH ?? 2, maxH: position.maxH ?? 12, static: Boolean(widget.options?.locked) }; }), [dashboard.widgets, viewport]);

  const commit = (items: Layout) => {
    items.forEach((item) => {
      const before = dashboard.widgets.find((widget) => widget.id === item.i);
      const position = before && positionFor(before, viewport);
      if (position && (position.x !== item.x || position.y !== item.y || position.w !== item.w || position.h !== item.h))
        updatePosition(item.i, { x: item.x, y: item.y, w: item.w, h: item.h, minW: position.minW, minH: position.minH, maxW: position.maxW, maxH: position.maxH }, viewport);
    });
    clearSnapGuides();
  };

  /* ---- Snap-aware drag handlers ---- */
  const handleDragStart = useCallback((_layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
    if (preview || !newItem) return;
    useBuilderStore.getState().select(newItem.i);
  }, [preview]);

  const handleDrag = useCallback((_layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
    if (preview || !width || !newItem) return;
    const proposed: GridPosition = { x: newItem.x, y: newItem.y, w: newItem.w, h: newItem.h, minW: newItem.minW, minH: newItem.minH, maxW: newItem.maxW, maxH: newItem.maxH };
    const result = computeSnapGuides(proposed, newItem.i, dashboard.widgets, width);
    setSnapGuides(result.guides, result.distances, newItem.i);
  }, [preview, width, dashboard.widgets, setSnapGuides]);

  const handleDragStop = useCallback((_layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
    if (preview || !width || !newItem) { clearSnapGuides(); return; }
    const proposed: GridPosition = { x: newItem.x, y: newItem.y, w: newItem.w, h: newItem.h, minW: newItem.minW, minH: newItem.minH, maxW: newItem.maxW, maxH: newItem.maxH };
    const result = computeSnapGuides(proposed, newItem.i, dashboard.widgets, width);
    // Apply snapped position
    const before = dashboard.widgets.find((w) => w.id === newItem.i);
    const pos = before && positionFor(before, viewport);
    if (pos && (pos.x !== result.snapped.x || pos.y !== result.snapped.y)) {
      updatePosition(newItem.i, { ...result.snapped, minW: pos.minW, minH: pos.minH, maxW: pos.maxW, maxH: pos.maxH }, viewport);
    } else {
      commit([{ i: newItem.i, x: newItem.x, y: newItem.y, w: newItem.w, h: newItem.h }]);
    }
    clearSnapGuides();
  }, [preview, width, dashboard.widgets, viewport, updatePosition, clearSnapGuides, commit]);

  const handleResizeStop = useCallback((_layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
    if (!newItem) { clearSnapGuides(); return; }
    clearSnapGuides();
    commit([{ i: newItem.i, x: newItem.x, y: newItem.y, w: newItem.w, h: newItem.h }]);
  }, [clearSnapGuides, commit]);

  /* ---- Marquee helpers ---- */
  const getCanvasPoint = useCallback((e: React.PointerEvent | PointerEvent): { x: number; y: number } => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }, [scale]);

  const widgetsIntersectMarquee = useCallback((m: MarqueeRect): string[] => {
    const COL_W = (width - 24) / 12;
    const ROW_H = 82;
    const MARGIN = 12;
    const mLeft = m.x;
    const mTop = m.y;
    const mRight = m.x + m.width;
    const mBottom = m.y + m.height;

    return dashboard.widgets
      .filter((w) => {
        const pos = positionFor(w, viewport);
        const wLeft = pos.x * (COL_W + MARGIN) + MARGIN;
        const wTop = pos.y * (ROW_H + MARGIN) + MARGIN;
        const wRight = wLeft + pos.w * COL_W + (pos.w - 1) * MARGIN;
        const wBottom = wTop + pos.h * ROW_H + (pos.h - 1) * MARGIN;
        return wLeft < mRight && wRight > mLeft && wTop < mBottom && wBottom > mTop;
      })
      .map((w) => w.id);
  }, [dashboard.widgets, viewport, width]);

  /* ---- Pointer handlers for marquee ---- */
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (preview) return;
    const target = e.target as Element;
    if (target.closest('.pg-widget, .pg-filterbar, .pg-selection-badge')) return;

    const point = getCanvasPoint(e);
    marqueeStart.current = point;
    setIsMarqueeDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [preview, getCanvasPoint]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMarqueeDragging || !marqueeStart.current) return;
    const current = getCanvasPoint(e);
    const start = marqueeStart.current;
    const rect: MarqueeRect = {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    };
    setMarquee(rect);
  }, [isMarqueeDragging, getCanvasPoint, setMarquee]);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMarqueeDragging || !marqueeStart.current) return;
    const current = getCanvasPoint(e);
    const start = marqueeStart.current;
    const rect: MarqueeRect = {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    };

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (rect.width > 5 || rect.height > 5) {
      const hitIds = widgetsIntersectMarquee(rect);
      if (additive) {
        const existing = new Set(useBuilderStore.getState().selectedIds);
        hitIds.forEach((id) => existing.add(id));
        useBuilderStore.setState({ selectedIds: [...existing], selectedId: [...existing].pop() });
      } else {
        useBuilderStore.setState({ selectedIds: hitIds, selectedId: hitIds[hitIds.length - 1] });
      }
    } else {
      if (!additive) {
        useBuilderStore.getState().clearSelection();
      }
    }

    marqueeStart.current = null;
    setIsMarqueeDragging(false);
    setMarquee(null);
  }, [isMarqueeDragging, getCanvasPoint, widgetsIntersectMarquee, setMarquee]);

  /* ---- Click handlers ---- */
  const handleWidgetPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (preview || (event.target as Element).closest('.pg-drag, .pg-widget-toolbar, .react-resizable-handle')) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    select(id, additive ? { additive: true } : undefined);
  }, [preview, select]);

  const handleWidgetClick = useCallback((event: React.MouseEvent<HTMLDivElement>, id: string) => {
    if (preview) return;
    if ((event.target as Element).closest('.pg-widget-toolbar')) return;
    const toggle = event.shiftKey || event.ctrlKey || event.metaKey;
    select(id, toggle ? { additive: true, toggle: true } : undefined);
  }, [preview, select]);

  const deselectIfEmpty = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!preview && !(event.target as Element).closest('.pg-widget, .pg-filterbar, .pg-selection-badge')) {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (!additive) select(undefined);
    }
  }, [preview, select]);

  return (
    <section className="pg-canvas-shell">
      <div
        className={`pg-viewport ${viewport}`}
        style={{ transform: `scale(${scale})` }}
        ref={containerRef}
        onClick={deselectIfEmpty}
      >
        <FilterBar />
        <div
          className="pg-canvas-inner"
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        >
          {mounted && (
            <GridLayout
              width={width}
              layout={layout}
              autoSize
              gridConfig={{ cols: 12, rowHeight: 82, margin: [12, 12], containerPadding: [12, 12] }}
              dragConfig={{ enabled: !preview, handle: '.pg-drag', cancel: '.pg-widget-toolbar,button,input,select,textarea', threshold: 5 }}
              resizeConfig={{ enabled: !preview, handles: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] }}
              onDragStart={handleDragStart}
              onDrag={handleDrag}
              onDragStop={handleDragStop}
              onResizeStop={handleResizeStop}
              className={preview ? 'pg-grid preview' : 'pg-grid'}
            >
              {dashboard.widgets.filter((w) => !w.options?.hidden).map((widget) => {
                const isSelected = selectedSet.has(widget.id);
                const isPrimary = isSelected && selectedIds[selectedIds.length - 1] === widget.id;
                const classes = [
                  'pg-widget',
                  isSelected && 'selected',
                  isPrimary && 'primary',
                  selectedIds.length > 1 && isSelected && 'multi-selected',
                ].filter(Boolean).join(' ');
                return (
                  <div
                    key={widget.id}
                    className={classes}
                    style={widget.style}
                    onPointerDownCapture={(event) => handleWidgetPointerDown(event, widget.id)}
                    onClick={(event) => handleWidgetClick(event, widget.id)}
                  >
                    <div className="pg-widget-head pg-drag">
                      <span>{widget.title || widget.type}</span>
                    </div>
                    {!preview && <WidgetToolbar widget={widget} />}
                    <ErrorBoundary fallback={<div className="pg-empty">Widget failed to render</div>}>
                      <WidgetContent widget={widget} />
                    </ErrorBoundary>
                    {isSelected && selectedIds.length > 1 && (
                      <div className="pg-widget-selection-ring" />
                    )}
                  </div>
                );
              })}
            </GridLayout>
          )}
          <SnapGuideLines guides={snapGuides} distances={snapDistances} />
          <MarqueeOverlay rect={marquee} />
        </div>
        <SelectionBadge count={selectedIds.length} />
        <LayoutToolbar />
        <HiddenWidgetsBar />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Library – widget palette                                            */
/* ------------------------------------------------------------------ */

function Library() {
  const add = useBuilderStore((state) => state.add); const [search, setSearch] = useState(''); const [open, setOpen] = useState<Record<string, boolean>>({ Charts: true, Data: true, Layout: true });
  const widgets = listWidgets().filter((widget) => widget.name.toLowerCase().includes(search.toLowerCase()) || widget.type.includes(search.toLowerCase()));
  return <aside className="pg-left"><div className="pg-library-header"><div className="pg-section-title">Widget library</div><input aria-label="Search widgets" placeholder="Search widgets…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="pg-library-list">{['Charts', 'Data', 'Layout'].map((group) => <section key={group}><button className="pg-category" onClick={() => setOpen((value) => ({ ...value, [group]: !value[group] }))}>{open[group] ? '⌄' : '›'} {group}</button>{open[group] && widgets.filter((widget) => category(widget.type) === group).map((widget) => <button className="pg-library-item" key={widget.type} onClick={() => add(widget.type)}><b>{icon[widget.type] ?? '◇'}</b><span><strong>{widget.name}</strong><small>Add {widget.name.toLowerCase()}</small></span><em>+</em></button>)}</section>)}</div></aside>;
}

/* ------------------------------------------------------------------ */
/*  DataEditor                                                         */
/* ------------------------------------------------------------------ */
/*  Inspector primitives                                                */
/* ------------------------------------------------------------------ */

type InspectorTab = 'general' | 'data' | 'style' | 'layout' | 'interaction' | 'animation' | 'advanced';

const TAB_DEFS: { id: InspectorTab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⊙' },
  { id: 'data', label: 'Data', icon: '⊞' },
  { id: 'style', label: 'Style', icon: '◐' },
  { id: 'layout', label: 'Layout', icon: '⊞' },
  { id: 'interaction', label: 'Interaction', icon: '↗' },
  { id: 'animation', label: 'Animation', icon: '≋' },
  { id: 'advanced', label: 'Advanced', icon: '⚙' },
];

const tooltip = (text: string) => ({ 'data-tooltip': text } as React.HTMLAttributes<HTMLElement>);

function InspectorSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="pg-insp-search">
      <span className="pg-insp-search-icon">⌕</span>
      <input
        placeholder="Search properties…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Search properties"
    />
    {value && <button className="pg-insp-search-clear" onClick={() => onChange('')} aria-label="Clear search">×</button>}
    </div>
  );
}

function Section({ title, children, defaultOpen = true, onReset, search }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; onReset?: () => void; search?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  if (search && !children) return null;
  return (
    <div className={`pg-insp-section ${open ? 'open' : ''}`}>
      <button className="pg-insp-section-head" onClick={() => setOpen(!open)}>
        <span className="pg-insp-section-arrow">{open ? '▾' : '▸'}</span>
        <span className="pg-insp-section-title">{title}</span>
        {onReset && <span className="pg-insp-section-reset" title="Reset section" onClick={(e) => { e.stopPropagation(); onReset(); }}>↺</span>}
      </button>
      {open && <div className="pg-insp-section-body" ref={contentRef}>{children}</div>}
    </div>
  );
}

function Field({ label, tooltip: tip, children, error, reset }: {
  label: string; tooltip?: string; children: React.ReactNode; error?: string; reset?: () => void;
}) {
  return (
    <div className={`pg-insp-field ${error ? 'has-error' : ''}`}>
      <div className="pg-insp-field-head">
        <label className="pg-insp-field-label" {...(tip ? tooltip(tip) : {})}>{label}</label>
        {reset && <button className="pg-insp-field-reset" title="Reset to default" onClick={reset}>↺</button>}
      </div>
      <div className="pg-insp-field-input">{children}</div>
      {error && <span className="pg-insp-field-error">{error}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function NumberInput({ value, onChange, min, max, step = 1 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />;
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="pg-insp-color-wrap"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /><span className="pg-insp-color-swatch" style={{ background: value }} /></div>;
}

function ToggleInput({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <label className="pg-insp-toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="pg-insp-toggle-track" /><span className="pg-insp-toggle-label">{label}</span></label>;
}

/* ================================================================== */
/*  Advanced property editors                                           */
/* ================================================================== */

const PRESET_COLORS = ['#2563eb','#dc2626','#16a34a','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#64748b','#172033','#ffffff','#000000'];
const FONT_FAMILIES = ['Inter, ui-sans-serif, system-ui, sans-serif', 'Georgia, serif', 'ui-monospace, monospace', 'Arial, sans-serif', 'Impact, sans-serif'];
const FONT_WEIGHTS = [{ value: '400', label: 'Regular' }, { value: '500', label: 'Medium' }, { value: '600', label: 'Semi bold' }, { value: '700', label: 'Bold' }, { value: '800', label: 'Extra bold' }];
const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'];
const ICON_SET = ['⊙','⊞','◐','⚙','↗','≋','◆','▥','⌁','◒','◔','◉','▤','◇','△','▽','○','□','⬡','⬢','⊕','⊗','⊘','⊙','⊛','⊜','⊝','▲','▼','◀','▶','◀▶','▲▼','⚡','☀','☁','☂','☃','★','☆','☎','✉','✎','✂','⚖','⚗','⚙','⚛','✓','✗','♥','♦','♣','♠','♪','♫','🔑','🔒','🔓','🔔','📦','🔍','📊','📈','📉','🗂','📅','⏰','🔗','📎','📌','📍','🏷'];

function ColorPicker({ value, onChange, presets = PRESET_COLORS }: { value: string; onChange: (v: string) => void; presets?: string[] }) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const commit = (v: string) => { if (/^#[0-9a-f]{3,8}$/i.test(v)) onChange(v); };
  return (
    <div className="pg-ed-color">
      <div className="pg-ed-color-row">
        <input type="color" value={value.length === 7 ? value : '#2563eb'} onChange={(e) => { onChange(e.target.value); setHex(e.target.value); }} />
        <input className="pg-ed-color-hex" value={hex} onChange={(e) => setHex(e.target.value)} onBlur={() => commit(hex)} onKeyDown={(e) => e.key === 'Enter' && commit(hex)} placeholder="#000000" />
      </div>
      <div className="pg-ed-color-swatches">
        {presets.map((c) => (
          <button key={c} className={`pg-ed-color-swatch ${value === c ? 'active' : ''}`} style={{ background: c }} onClick={() => { onChange(c); setHex(c); }} title={c} />
        ))}
      </div>
    </div>
  );
}

function GradientPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parse = (v: string) => {
    const m = v.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);
    if (m) return { type: 'linear', angle: Number(m[1]), stops: m[2].split(',').map((s) => { const [color, pos] = s.trim().split(/\s+/); return { color: color ?? '#000', pos: Number(pos) || 0 }; }) };
    return { type: 'linear', angle: 135, stops: [{ color: '#2563eb', pos: 0 }, { color: '#8b5cf6', pos: 100 }] };
  };
  const [state, setState] = useState(() => parse(value));
  const emit = (s: typeof state) => { setState(s); onChange(`${s.type}-gradient(${s.type === 'linear' ? s.angle + 'deg, ' : ''}${s.stops.map((st) => `${st.color} ${st.pos}%`).join(', ')})`); };
  return (
    <div className="pg-ed-gradient">
      <div className="pg-ed-gradient-preview" style={{ background: value || 'linear-gradient(135deg, #2563eb, #8b5cf6)' }} />
      <div className="pg-ed-gradient-row">
        <label>Type<SelectInput value={state.type} onChange={(v) => emit({ ...state, type: v as 'linear' | 'radial' })} options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }]} /></label>
        {state.type === 'linear' && <label>Angle<NumberInput value={state.angle} onChange={(v) => emit({ ...state, angle: v })} min={0} max={360} step={15} /></label>}
      </div>
      {state.stops.map((stop, i) => (
        <div key={i} className="pg-ed-gradient-stop">
          <input type="color" value={stop.color} onChange={(e) => { const stops = [...state.stops]; stops[i] = { ...stops[i], color: e.target.value }; emit({ ...state, stops }); }} />
          <NumberInput value={stop.pos} onChange={(v) => { const stops = [...state.stops]; stops[i] = { ...stops[i], pos: v }; emit({ ...state, stops }); }} min={0} max={100} />
          <span className="pg-ed-gradient-pct">%</span>
          {state.stops.length > 2 && <button className="pg-ed-gradient-remove" onClick={() => emit({ ...state, stops: state.stops.filter((_, j) => j !== i) })}>×</button>}
        </div>
      ))}
      <button className="pg-ed-gradient-add" onClick={() => emit({ ...state, stops: [...state.stops, { color: '#000000', pos: 100 }] })}>+ Add stop</button>
    </div>
  );
}

function TypographyEditor({ value, onChange, reset }: { value: Record<string, string | number>; onChange: (v: Record<string, string | number>) => void; reset?: () => void }) {
  const patch = (k: string, v: string | number) => onChange({ ...value, [k]: v });
  return (
    <div className="pg-ed-typo">
      <div className="pg-insp-field">
        <div className="pg-insp-field-head"><label className="pg-insp-field-label">Family</label>{reset && <button className="pg-insp-field-reset" onClick={() => patch('fontFamily', 'Inter, ui-sans-serif, system-ui, sans-serif')}>↺</button>}</div>
        <div className="pg-insp-field-input"><SelectInput value={String(value.fontFamily ?? 'Inter, ui-sans-serif, system-ui, sans-serif')} onChange={(v) => patch('fontFamily', v)} options={FONT_FAMILIES.map((f) => ({ value: f, label: f.split(',')[0] }))} /></div>
      </div>
      <div className="pg-insp-field-row">
        <div className="pg-insp-field">
          <div className="pg-insp-field-head"><label className="pg-insp-field-label">Size</label></div>
          <div className="pg-insp-field-input"><NumberInput value={Number(value.fontSize ?? 13)} onChange={(v) => patch('fontSize', v)} min={8} max={96} /></div>
        </div>
        <div className="pg-insp-field">
          <div className="pg-insp-field-head"><label className="pg-insp-field-label">Weight</label></div>
          <div className="pg-insp-field-input"><SelectInput value={String(value.fontWeight ?? '400')} onChange={(v) => patch('fontWeight', v)} options={FONT_WEIGHTS} /></div>
        </div>
      </div>
      <div className="pg-insp-field-row">
        <div className="pg-insp-field">
          <div className="pg-insp-field-head"><label className="pg-insp-field-label">Line height</label></div>
          <div className="pg-insp-field-input"><NumberInput value={Number(value.lineHeight ?? 1.5)} onChange={(v) => patch('lineHeight', v)} min={0.5} max={4} step={0.1} /></div>
        </div>
        <div className="pg-insp-field">
          <div className="pg-insp-field-head"><label className="pg-insp-field-label">Spacing</label></div>
          <div className="pg-insp-field-input"><NumberInput value={Number(value.letterSpacing ?? 0)} onChange={(v) => patch('letterSpacing', v)} min={-5} max={20} step={0.5} /></div>
        </div>
      </div>
      <div className="pg-insp-field">
        <div className="pg-insp-field-head"><label className="pg-insp-field-label">Color</label></div>
        <div className="pg-insp-field-input"><ColorPicker value={String(value.color ?? '#172033')} onChange={(v) => patch('color', v)} /></div>
      </div>
      <div className="pg-insp-field">
        <div className="pg-insp-field-head"><label className="pg-insp-field-label">Align</label></div>
        <div className="pg-insp-field-input">
          <div className="pg-ed-typo-align">
            {[{ v: 'left', ic: '≡' }, { v: 'center', ic: '≡' }, { v: 'right', ic: '≡' }, { v: 'justify', ic: '≡' }].map((a) => (
              <button key={a.v} className={String(value.textAlign ?? 'left') === a.v ? 'active' : ''} onClick={() => patch('textAlign', a.v)} title={a.v}>{a.ic}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="pg-insp-field">
        <div className="pg-insp-field-head"><label className="pg-insp-field-label">Transform</label></div>
        <div className="pg-insp-field-input"><SelectInput value={String(value.textTransform ?? 'none')} onChange={(v) => patch('textTransform', v)} options={[{ value: 'none', label: 'None' }, { value: 'uppercase', label: 'UPPERCASE' }, { value: 'lowercase', label: 'lowercase' }, { value: 'capitalize', label: 'Capitalize' }]} /></div>
      </div>
    </div>
  );
}

function BorderEditor({ value, onChange, reset }: { value: Record<string, string | number>; onChange: (v: Record<string, string | number>) => void; reset?: () => void }) {
  const patch = (k: string, v: string | number) => onChange({ ...value, [k]: v });
  const [linked, setLinked] = useState(true);
  const bw = Number(value.borderWidth ?? 1);
  const bc = String(value.borderColor ?? '#e6eaf0');
  const bs = String(value.borderStyle ?? 'solid');
  return (
    <div className="pg-ed-border">
      <div className="pg-insp-field">
        <div className="pg-insp-field-head"><label className="pg-insp-field-label">Width</label>{reset && <button className="pg-insp-field-reset" onClick={() => patch('borderWidth', 1)}>↺</button>}</div>
        <div className="pg-insp-field-input"><NumberInput value={bw} onChange={(v) => patch('borderWidth', v)} min={0} max={20} /></div>
      </div>
      <div className="pg-insp-field">
        <div className="pg-insp-field-head"><label className="pg-insp-field-label">Style</label></div>
        <div className="pg-insp-field-input"><SelectInput value={bs} onChange={(v) => patch('borderStyle', v)} options={BORDER_STYLES.map((s) => ({ value: s, label: s }))} /></div>
      </div>
      <div className="pg-insp-field">
        <div className="pg-insp-field-head"><label className="pg-insp-field-label">Color</label></div>
        <div className="pg-insp-field-input"><ColorPicker value={bc} onChange={(v) => patch('borderColor', v)} /></div>
      </div>
      <div className="pg-insp-field">
        <div className="pg-insp-field-head">
          <label className="pg-insp-field-label">Radius</label>
          <ToggleInput checked={linked} onChange={setLinked} />
        </div>
        {linked ? (
          <div className="pg-insp-field-input"><NumberInput value={Number(value.borderRadius ?? 14)} onChange={(v) => patch('borderRadius', v)} min={0} max={96} /></div>
        ) : (
          <div className="pg-ed-border-radius-grid">
            {(['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const).map((corner) => (
              <div key={corner} className="pg-ed-border-radius-item">
                <label>{corner.replace(/([A-Z])/g, ' $1')}</label>
                <NumberInput value={Number(value[`border${corner}Radius`] ?? value.borderRadius ?? 14)} onChange={(v) => patch(`border${corner}Radius`, v)} min={0} max={96} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShadowEditor({ value, onChange, reset }: { value: string; onChange: (v: string) => void; reset?: () => void }) {
  const parse = (v: string) => {
    const inset = v.includes('inset');
    const nums = v.replace('inset', '').match(/-?[\d.]+/g)?.map(Number) ?? [0, 4, 12, 0];
    const colorM = v.match(/rgba?\([^)]+\)/);
    return { inset, x: nums[0] ?? 0, y: nums[1] ?? 4, blur: nums[2] ?? 12, spread: nums[3] ?? 0, color: colorM?.[0] ?? 'rgba(0,0,0,.1)' };
  };
  const [s, setS] = useState(() => parse(value));
  const emit = (next: typeof s) => { setS(next); onChange(`${next.inset ? 'inset ' : ''}${next.x}px ${next.y}px ${next.blur}px ${next.spread}px ${next.color}`); };
  return (
    <div className="pg-ed-shadow">
      <div className="pg-insp-field-row">
        <div className="pg-insp-field"><div className="pg-insp-field-head"><label className="pg-insp-field-label">X</label></div><div className="pg-insp-field-input"><NumberInput value={s.x} onChange={(v) => emit({ ...s, x: v })} min={-100} max={100} /></div></div>
        <div className="pg-insp-field"><div className="pg-insp-field-head"><label className="pg-insp-field-label">Y</label></div><div className="pg-insp-field-input"><NumberInput value={s.y} onChange={(v) => emit({ ...s, y: v })} min={-100} max={100} /></div></div>
      </div>
      <div className="pg-insp-field-row">
        <div className="pg-insp-field"><div className="pg-insp-field-head"><label className="pg-insp-field-label">Blur</label></div><div className="pg-insp-field-input"><NumberInput value={s.blur} onChange={(v) => emit({ ...s, blur: v })} min={0} max={200} /></div></div>
        <div className="pg-insp-field"><div className="pg-insp-field-head"><label className="pg-insp-field-label">Spread</label></div><div className="pg-insp-field-input"><NumberInput value={s.spread} onChange={(v) => emit({ ...s, spread: v })} min={-50} max={50} /></div></div>
      </div>
      <div className="pg-insp-field"><div className="pg-insp-field-head"><label className="pg-insp-field-label">Color</label></div><div className="pg-insp-field-input"><ColorPicker value={s.color} onChange={(v) => emit({ ...s, color: v })} /></div></div>
      <div className="pg-insp-field"><div className="pg-insp-field-head"><label className="pg-insp-field-label">Inset</label></div><div className="pg-insp-field-input"><ToggleInput checked={s.inset} onChange={(v) => emit({ ...s, inset: v })} label="Inset shadow" /></div></div>
    </div>
  );
}

function SpacingEditor({ value, onChange, reset }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void; reset?: () => void }) {
  const [linked, setLinked] = useState(true);
  const top = value.paddingTop ?? value.padding ?? 8;
  const setAll = (v: number) => onChange({ paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v, padding: v });
  const setOne = (k: string, v: number) => onChange({ ...value, [k]: v });
  return (
    <div className="pg-ed-spacing">
      <div className="pg-ed-spacing-header">
        <ToggleInput checked={linked} onChange={setLinked} label="Link all" />
        {reset && <button className="pg-insp-field-reset" style={{ opacity: 1 }} onClick={() => setAll(8)}>↺ Reset</button>}
      </div>
      {linked ? (
        <div className="pg-insp-field"><div className="pg-insp-field-head"><label className="pg-insp-field-label">All sides</label></div><div className="pg-insp-field-input"><NumberInput value={top} onChange={setAll} min={0} max={128} /></div></div>
      ) : (
        <div className="pg-ed-spacing-grid">
          {([['paddingTop', 'Top'], ['paddingRight', 'Right'], ['paddingBottom', 'Bottom'], ['paddingLeft', 'Left']] as const).map(([k, label]) => (
            <div key={k} className="pg-ed-spacing-cell">
              <label>{label[0]}</label>
              <NumberInput value={Number(value[k] ?? 8)} onChange={(v) => setOne(k, v)} min={0} max={128} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('');
  const filtered = ICON_SET.filter((ic) => !search || ic.includes(search));
  return (
    <div className="pg-ed-icon">
      <input className="pg-ed-icon-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search icons…" />
      <div className="pg-ed-icon-grid">
        {filtered.map((ic) => (
          <button key={ic} className={`pg-ed-icon-btn ${value === ic ? 'active' : ''}`} onClick={() => onChange(ic)} title={ic}>{ic}</button>
        ))}
      </div>
    </div>
  );
}

function ExpressionEditor({ value, onChange, variables = [] }: { value: string; onChange: (v: string) => void; variables?: string[] }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="pg-ed-expr">
      <div className="pg-ed-expr-input-wrap">
        <span className="pg-ed-expr-prefix">fx</span>
        <input className="pg-ed-expr-input" value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)} placeholder="e.g. {{metric.value}} or {{row.name}}" />
      </div>
      {focused && variables.length > 0 && (
        <div className="pg-ed-expr-suggestions">
          {variables.map((v) => (
            <button key={v} className="pg-ed-expr-suggestion" onClick={() => { onChange(`{{${v}}}`); setFocused(false); }}>{`{{${v}}}`}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function CodeEditor({ value, onChange, language = 'json', readOnly = false }: { value: string; onChange?: (v: string) => void; language?: string; readOnly?: boolean }) {
  const lines = value.split('\n');
  const [error, setError] = useState('');
  const handleChange = (v: string) => {
    if (language === 'json') {
      try { JSON.parse(v); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Invalid JSON'); }
    }
    onChange?.(v);
  };
  return (
    <div className={`pg-ed-code ${error ? 'has-error' : ''}`}>
      <div className="pg-ed-code-header">
        <span className="pg-ed-code-lang">{language}</span>
        {readOnly && <span className="pg-ed-code-readonly">read-only</span>}
      </div>
      <div className="pg-ed-code-body">
        <div className="pg-ed-code-gutter">{lines.map((_, i) => <span key={i}>{i + 1}</span>)}</div>
        <textarea className="pg-ed-code-textarea" value={value} onChange={(e) => handleChange(e.target.value)} readOnly={readOnly} spellCheck={false} wrap="off" />
      </div>
      {error && <span className="pg-insp-field-error">{error}</span>}
    </div>
  );
}

function VariablePicker({ value, onChange, variables }: { value: string; onChange: (v: string) => void; variables: { name: string; label: string; type: string }[] }) {
  const [search, setSearch] = useState('');
  const filtered = variables.filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="pg-ed-variable">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search variables…" className="pg-ed-variable-search" />
      <div className="pg-ed-variable-list">
        {filtered.map((v) => (
          <button key={v.name} className={`pg-ed-variable-item ${value === v.name ? 'active' : ''}`} onClick={() => onChange(v.name)}>
            <span className="pg-ed-variable-name">{v.name}</span>
            <span className="pg-ed-variable-type">{v.type}</span>
          </button>
        ))}
        {filtered.length === 0 && <span className="pg-ed-variable-empty">No variables found</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DataEditor (inline JSON editor)                                    */
/* ------------------------------------------------------------------ */

function DataEditor({ widget }: { widget: DashboardWidget }) {
  const update = useBuilderStore((state) => state.update);
  const [text, setText] = useState(JSON.stringify(widget.datasource?.kind === 'static' ? widget.datasource.data : [], null, 2));
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <div className="pg-insp-data-editor">
      <button className="pg-insp-data-toggle" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'} Inline JSON data</span>
      </button>
      {open && <>
        <textarea value={text} onChange={(e) => { setText(e.target.value); try { const data = JSON.parse(e.target.value) as DataRecord[]; if (!Array.isArray(data)) throw new Error('Must be array'); update(widget.id, { datasource: { kind: 'static', data } }); setError(''); } catch { setError('Invalid JSON array'); } }} />
        {error && <span className="pg-insp-field-error">{error}</span>}
      </>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBuilder                                                      */
/* ------------------------------------------------------------------ */

function FilterBuilder() {
  const { dashboard, addFilter, removeFilter } = useBuilderStore();
  const [label, setLabel] = useState('Country');
  const [type, setType] = useState<FilterConfig['type']>('select');
  return (
    <Section title="Dashboard Filters" defaultOpen={false}>
      {dashboard.filters?.map((filter) => (
        <div key={filter.id} className="pg-insp-filter-row">
          <span>{filter.label}</span>
          <button className="pg-insp-filter-remove" onClick={() => removeFilter(filter.id)}>×</button>
        </div>
      ))}
      <div className="pg-insp-filter-add">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
        <select value={type} onChange={(e) => setType(e.target.value as FilterConfig['type'])}>
          <option value="select">Select</option>
          <option value="search">Search</option>
          <option value="date">Date</option>
        </select>
        <button onClick={() => addFilter({ id: `${label.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`, label, type, options: type === 'select' ? [{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }] : undefined })}>+</button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: General                                                       */
/* ------------------------------------------------------------------ */

function TabGeneral({ widget, search }: { widget: DashboardWidget; search: string }) {
  const { update } = useBuilderStore();
  const s = search.toLowerCase();
  return (
    <>
      <Section title="Identity" search={search}>
        <Field label="Title" tooltip="Widget display name" reset={() => update(widget.id, { title: widget.type })}>
          <TextInput value={widget.title ?? ''} onChange={(v) => update(widget.id, { title: v })} placeholder="Widget title" />
        </Field>
        <Field label="Type" tooltip="Widget type (read-only)">
          <div className="pg-insp-type-badge">{icon[widget.type] ?? '◇'} {widget.type}</div>
        </Field>
        <Field label="ID" tooltip="Unique widget identifier (read-only)">
          <div className="pg-insp-readonly">{widget.id}</div>
        </Field>
      </Section>
      <Section title="Subtitle" search={search}>
        <Field label="Subtitle" tooltip="Optional subtitle text" reset={() => update(widget.id, { options: { ...widget.options, subtitle: '' } })}>
          <TextInput value={String(widget.options?.subtitle ?? '')} onChange={(v) => update(widget.id, { options: { ...widget.options, subtitle: v } })} placeholder="Optional subtitle" />
        </Field>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Data                                                          */
/* ------------------------------------------------------------------ */

function TabData({ widget, search }: { widget: DashboardWidget; search: string }) {
  const { dashboard, update } = useBuilderStore();
  const options = widget.options ?? {};
  const isKpi = widget.type === 'kpi';
  const ds = dashboard.datasets ?? [];
  const variables = ds.flatMap((d) => (d.fields ?? []).map((f) => ({ name: `${d.id}.${f.name}`, label: f.label ?? f.name, type: f.type })));
  const [qbOpen, setQbOpen] = useState(false);
  return (
    <>
      <Section title="Dataset Binding" search={search}>
        <Field label="Dataset" tooltip="Connect to a shared dataset" reset={() => update(widget.id, { binding: undefined })}>
          <SelectInput value={widget.binding?.datasetId ?? ''} onChange={(v) => update(widget.id, { binding: v ? { ...widget.binding, datasetId: v } : undefined })} options={[{ value: '', label: 'Widget-local data' }, ...ds.map((d) => ({ value: d.id, label: d.name }))]} />
        </Field>
        {variables.length > 0 && (
          <Field label="Variable" tooltip="Bind a specific field from your datasets">
            <VariablePicker value={String(options.boundVariable ?? '')} onChange={(v) => update(widget.id, { options: { ...options, boundVariable: v } })} variables={variables} />
          </Field>
        )}
        {widget.binding?.datasetId && (
          <button className="pg-insp-qb-toggle" onClick={() => setQbOpen(!qbOpen)}>
            <span>{qbOpen ? '▾' : '▸'} Query Builder</span>
            <small>{widget.binding.dimensions?.length ?? 0} dims, {widget.binding.metrics?.length ?? 0} metrics</small>
          </button>
        )}
      </Section>
      {qbOpen && widget.binding?.datasetId && (
        <Section title="Query Builder" search={search}>
          <QueryBuilder widget={widget} />
        </Section>
      )}
      <Section title={isKpi ? 'KPI Fields' : 'Chart Fields'} search={search}>
        {isKpi ? (<>
          <Field label="Label" reset={() => update(widget.id, { options: { ...options, label: '' } })}>
            <ExpressionEditor value={String(options.label ?? '')} onChange={(v) => update(widget.id, { options: { ...options, label: v } })} variables={variables.map((v) => v.name)} />
          </Field>
          <Field label="Value" reset={() => update(widget.id, { options: { ...options, value: '' } })}>
            <ExpressionEditor value={String(options.value ?? '')} onChange={(v) => update(widget.id, { options: { ...options, value: v } })} variables={variables.map((v) => v.name)} />
          </Field>
          <Field label="Prefix" reset={() => update(widget.id, { options: { ...options, prefix: '' } })}>
            <TextInput value={String(options.prefix ?? '')} onChange={(v) => update(widget.id, { options: { ...options, prefix: v } })} placeholder="$" />
          </Field>
          <Field label="Suffix" reset={() => update(widget.id, { options: { ...options, suffix: '' } })}>
            <TextInput value={String(options.suffix ?? '')} onChange={(v) => update(widget.id, { options: { ...options, suffix: v } })} placeholder="%" />
          </Field>
        </>) : (<>
          <Field label="X Axis key" tooltip="Field name for horizontal axis" reset={() => update(widget.id, { options: { ...options, xKey: 'name' } })}>
            <TextInput value={String(options.xKey ?? 'name')} onChange={(v) => update(widget.id, { options: { ...options, xKey: v } })} />
          </Field>
          <Field label="Y Axis key" tooltip="Field name for vertical axis" reset={() => update(widget.id, { options: { ...options, yKey: 'value' } })}>
            <TextInput value={String(options.yKey ?? 'value')} onChange={(v) => update(widget.id, { options: { ...options, yKey: v } })} />
          </Field>
          <Field label="Chart color" tooltip="Primary color for the chart series">
            <ColorPicker value={String(options.color ?? '#2563eb')} onChange={(v) => update(widget.id, { options: { ...options, color: v } })} />
          </Field>
        </>)}
      </Section>
      {!widget.binding?.datasetId && (
        <Section title="Inline Data" defaultOpen={false} search={search}>
          <DataEditor widget={widget} />
        </Section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Style                                                         */
/* ------------------------------------------------------------------ */

function TabStyle({ widget, search }: { widget: DashboardWidget; search: string }) {
  const { update } = useBuilderStore();
  const s = widget.style ?? {};
  const setStyle = (patch: Record<string, string | number>) => update(widget.id, { style: { ...s, ...patch } });
  return (
    <>
      <Section title="Spacing" search={search}>
        <SpacingEditor value={s as Record<string, number>} onChange={(v) => setStyle(v)} reset={() => setStyle({ padding: 8 })} />
      </Section>
      <Section title="Border" search={search}>
        <BorderEditor value={s} onChange={setStyle} reset={() => setStyle({ borderWidth: 1, borderStyle: 'solid', borderColor: '#e6eaf0', borderRadius: 14 })} />
      </Section>
      <Section title="Shadow" defaultOpen={false} search={search}>
        <ShadowEditor value={String(s.boxShadow ?? '')} onChange={(v) => setStyle({ boxShadow: v || undefined })} reset={() => setStyle({ boxShadow: '' })} />
      </Section>
      <Section title="Typography" defaultOpen={false} search={search}>
        <TypographyEditor value={s} onChange={setStyle} />
      </Section>
      <Section title="Background" defaultOpen={false} search={search}>
        <Field label="Color" tooltip="Widget background color">
          <ColorPicker value={String(s.background ?? '#ffffff')} onChange={(v) => setStyle({ background: v })} />
        </Field>
        <Field label="Gradient" tooltip="CSS gradient overlay">
          <GradientPicker value={String(s.backgroundGradient ?? '')} onChange={(v) => setStyle({ backgroundGradient: v, background: v })} />
        </Field>
      </Section>
      <Section title="Effects" defaultOpen={false} search={search}>
        <Field label="Opacity" tooltip="Widget opacity (0–1)" reset={() => setStyle({ opacity: 1 })}>
          <NumberInput value={Number(s.opacity ?? 1)} onChange={(v) => setStyle({ opacity: v })} min={0} max={1} step={0.05} />
        </Field>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Layout                                                        */
/* ------------------------------------------------------------------ */

function TabLayout({ widget, search }: { widget: DashboardWidget; search: string }) {
  const { dashboard, update, updatePosition, viewport } = useBuilderStore();
  const pos = viewport === 'desktop' ? widget.position : widget.positions?.[viewport] ?? widget.position;
  const isCustom = viewport !== 'desktop' && widget.positions?.[viewport] !== undefined;
  const setPosition = (patch: Partial<GridPosition>) => updatePosition(widget.id, { ...pos, ...patch }, viewport);
  const setDesktop = (patch: Partial<GridPosition>) => update(widget.id, { position: { ...widget.position, ...patch } });
  const resetResponsive = () => {
    const positions = { ...widget.positions };
    delete positions[viewport];
    update(widget.id, { positions });
  };
  return (
    <>
      <Section title="Position" search={search}>
        <div className="pg-insp-field-row">
          <Field label="X" tooltip="Column position (0–11)">
            <NumberInput value={pos.x} onChange={(v) => setPosition({ x: Math.max(0, Math.min(11, v)) })} min={0} max={11} />
          </Field>
          <Field label="Y" tooltip="Row position">
            <NumberInput value={pos.y} onChange={(v) => setPosition({ y: Math.max(0, v) })} min={0} />
          </Field>
        </div>
        <div className="pg-insp-field-row">
          <Field label="W" tooltip="Width in columns (1–12)">
            <NumberInput value={pos.w} onChange={(v) => setPosition({ w: Math.max(1, Math.min(12, v)) })} min={1} max={12} />
          </Field>
          <Field label="H" tooltip="Height in rows">
            <NumberInput value={pos.h} onChange={(v) => setPosition({ h: Math.max(1, v) })} min={1} />
          </Field>
        </div>
      </Section>
      <Section title="Constraints" defaultOpen={false} search={search}>
        <div className="pg-insp-field-row">
          <Field label="Min W" reset={() => setDesktop({ minW: undefined })}>
            <NumberInput value={pos.minW ?? 1} onChange={(v) => setDesktop({ minW: v })} min={1} max={12} />
          </Field>
          <Field label="Min H" reset={() => setDesktop({ minH: undefined })}>
            <NumberInput value={pos.minH ?? 1} onChange={(v) => setDesktop({ minH: v })} min={1} />
          </Field>
        </div>
        <div className="pg-insp-field-row">
          <Field label="Max W" reset={() => setDesktop({ maxW: undefined })}>
            <NumberInput value={pos.maxW ?? 12} onChange={(v) => setDesktop({ maxW: v })} min={1} max={12} />
          </Field>
          <Field label="Max H" reset={() => setDesktop({ maxH: undefined })}>
            <NumberInput value={pos.maxH ?? 12} onChange={(v) => setDesktop({ maxH: v })} min={1} />
          </Field>
        </div>
      </Section>
      <Section title="Responsive" search={search}>
        <div className="pg-insp-viewport-row">
          <span className="pg-insp-viewport-label">Viewport: <strong>{viewport}</strong></span>
          {isCustom && <button className="pg-insp-viewport-reset" onClick={resetResponsive}>Reset to desktop</button>}
        </div>
        {(['laptop', 'tablet', 'mobile'] as const).map((bp) => {
          const bpPos = widget.positions?.[bp];
          const active = viewport === bp;
          return (
            <div key={bp} className={`pg-insp-responsive-card ${active ? 'active' : ''} ${bpPos ? 'custom' : ''}`}>
              <span className="pg-insp-responsive-name">{bp}</span>
              <span className="pg-insp-responsive-status">{bpPos ? `${bpPos.w}×${bpPos.h} custom` : 'inherits desktop'}</span>
            </div>
          );
        })}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Interaction                                                   */
/* ------------------------------------------------------------------ */

function TabInteraction({ widget, search }: { widget: DashboardWidget; search: string }) {
  const { update, lockSelected, unlockSelected, hideSelected, groupSelected, ungroupSelected, select, dashboard, applyWidgetCrossFilter, clearWidgetCrossFilter, widgetDrillDown, widgetDrillUp, widgetResetDrillDown, drillStacks } = useBuilderStore();
  const locked = Boolean(widget.options?.locked);
  const hidden = Boolean(widget.options?.hidden);
  const groupId = widget.options?.groupId as string | undefined;
  const interaction: WidgetInteraction = (widget.options?.interaction as WidgetInteraction) ?? {};
  const setInteraction = (patch: Partial<WidgetInteraction>) => update(widget.id, { options: { ...widget.options, interaction: { ...interaction, ...patch } } });
  const ds = dashboard.datasets ?? [];
  const dsFields = ds.flatMap((d) => (d.fields ?? []).map((f) => f.name));
  const drillDepth = drillStacks[widget.id] ?? 0;
  const hierarchy = interaction.drillDownHierarchy ?? [];

  return (
    <>
      <Section title="State" search={search}>
        <Field label="Locked" tooltip="Prevent drag and resize">
          <ToggleInput checked={locked} onChange={() => {
            update(widget.id, { options: { ...widget.options, locked: !locked } });
          }} label={locked ? 'Locked' : 'Unlocked'} />
        </Field>
        <Field label="Hidden" tooltip="Hide from canvas">
          <ToggleInput checked={hidden} onChange={() => {
            select(widget.id);
            hideSelected();
          }} label={hidden ? 'Hidden' : 'Visible'} />
        </Field>
      </Section>
      <Section title="Click Action" search={search}>
        <Field label="Enable" tooltip="Enable click interaction on this widget">
          <ToggleInput checked={interaction.enabled ?? false} onChange={() => setInteraction({ enabled: !interaction.enabled })} label={interaction.enabled ? 'Enabled' : 'Disabled'} />
        </Field>
        {interaction.enabled && <>
          <Field label="Trigger" tooltip="When to fire the action">
            <SelectInput value={interaction.trigger ?? 'click'} onChange={(v) => setInteraction({ trigger: v as WidgetInteraction['trigger'] })} options={[{ value: 'click', label: 'On click' }, { value: 'hover', label: 'On hover' }]} />
          </Field>
          <Field label="Action" tooltip="What happens when triggered">
            <SelectInput value={interaction.action ?? 'none'} onChange={(v) => setInteraction({ action: v as WidgetInteraction['action'] })} options={[
              { value: 'none', label: 'None' },
              { value: 'crossFilter', label: 'Cross-filter' },
              { value: 'drillDown', label: 'Drill down' },
              { value: 'drillThrough', label: 'Drill through' },
              { value: 'setVariable', label: 'Set variable' },
              { value: 'openUrl', label: 'Open URL' },
            ]} />
          </Field>
        </>}
        {interaction.enabled && interaction.action === 'crossFilter' && <>
          <Field label="Filter field" tooltip="Row field to use as the filter key">
            <SelectInput value={interaction.crossFilterField ?? ''} onChange={(v) => setInteraction({ crossFilterField: v })} options={[{ value: '', label: 'First field' }, ...dsFields.map((f) => ({ value: f, label: f }))]} />
          </Field>
        </>}
        {interaction.enabled && interaction.action === 'drillDown' && <>
          <Field label="Hierarchy" tooltip="Comma-separated fields for drill-down levels">
            <TextInput value={(interaction.drillDownHierarchy ?? []).join(', ')} onChange={(v) => setInteraction({ drillDownHierarchy: v.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="year, month, day" />
          </Field>
          {hierarchy.length > 0 && <div className="pg-insp-drill-nav">
            {hierarchy.map((field, idx) => <span key={field} className={`pg-insp-drill-step ${idx < drillDepth ? 'active' : ''} ${idx === drillDepth ? 'current' : ''}`}>{field}{idx < hierarchy.length - 1 ? ' → ' : ''}</span>)}
          </div>}
          {drillDepth > 0 && <button className="pg-insp-qb-toggle" onClick={() => widgetDrillUp(widget.id)}>← Drill up</button>}
          {drillDepth > 0 && <button className="pg-insp-qb-toggle" onClick={() => widgetResetDrillDown(widget.id)}>Reset drill</button>}
        </>}
        {interaction.enabled && interaction.action === 'drillThrough' && <>
          <Field label="Target dashboard" tooltip="Dashboard ID to navigate to">
            <TextInput value={interaction.drillThroughDashboard ?? ''} onChange={(v) => setInteraction({ drillThroughDashboard: v })} placeholder="dashboard-id" />
          </Field>
          <Field label="Pass params" tooltip="Query params (key=field, comma-separated)">
            <TextInput value={Object.entries(interaction.drillThroughParams ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')} onChange={(v) => {
              const params: Record<string, string> = {};
              v.split(',').map((s) => s.trim()).filter(Boolean).forEach((pair) => { const [k, val] = pair.split('='); if (k) params[k.trim()] = val?.trim() ?? ''; });
              setInteraction({ drillThroughParams: params });
            }} placeholder="region=region, year=year" />
          </Field>
        </>}
        {interaction.enabled && interaction.action === 'setVariable' && <>
          <Field label="Variable name" tooltip="Dashboard variable to set">
            <TextInput value={interaction.variableName ?? ''} onChange={(v) => setInteraction({ variableName: v })} placeholder="varName" />
          </Field>
          <Field label="Value field" tooltip="Row field to use as value">
            <SelectInput value={interaction.variableValueField ?? ''} onChange={(v) => setInteraction({ variableValueField: v })} options={[{ value: '', label: 'First field' }, ...dsFields.map((f) => ({ value: f, label: f }))]} />
          </Field>
        </>}
        {interaction.enabled && interaction.action === 'openUrl' && <>
          <Field label="URL template" tooltip="URL with {{field}} interpolation">
            <TextInput value={interaction.urlTemplate ?? ''} onChange={(v) => setInteraction({ urlTemplate: v })} placeholder="https://example.com/{{id}}" />
          </Field>
          <Field label="Target" tooltip="Link target">
            <SelectInput value={interaction.urlTarget ?? '_blank'} onChange={(v) => setInteraction({ urlTarget: v as WidgetInteraction['urlTarget'] })} options={[{ value: '_blank', label: 'New tab' }, { value: '_self', label: 'Same tab' }]} />
          </Field>
        </>}
      </Section>
      <Section title="Grouping" search={search}>
        {groupId ? (
          <div className="pg-insp-group-info">
            <span className="pg-insp-group-badge">Grouped</span>
            <span className="pg-insp-group-id">{groupId}</span>
            <button className="pg-insp-group-btn" onClick={() => { select(widget.id); ungroupSelected(); }}>Ungroup</button>
          </div>
        ) : (
          <div className="pg-insp-group-info">
            <span className="pg-insp-group-muted">Not grouped</span>
            <button className="pg-insp-group-btn" onClick={() => { select(widget.id); groupSelected(); }}>Group with others</button>
          </div>
        )}
      </Section>
      <Section title="Z-Index" defaultOpen={false} search={search}>
        <Field label="Stacking" tooltip="Higher values render on top" reset={() => update(widget.id, { style: { ...widget.style, zIndex: undefined } })}>
          <NumberInput value={Number(widget.style?.zIndex ?? 0)} onChange={(v) => update(widget.id, { style: { ...widget.style, zIndex: v } })} min={0} max={100} />
        </Field>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Animation (placeholder for future use)                        */
/* ------------------------------------------------------------------ */

function TabAnimation({ widget, search }: { widget: DashboardWidget; search: string }) {
  const { update } = useBuilderStore();
  return (
    <>
      <Section title="Entrance" search={search}>
        <Field label="Type" tooltip="Animation when widget appears">
          <SelectInput value={String(widget.options?.animationType ?? 'none')} onChange={(v) => update(widget.id, { options: { ...widget.options, animationType: v } })} options={[{ value: 'none', label: 'None' }, { value: 'fade', label: 'Fade in' }, { value: 'slide-up', label: 'Slide up' }, { value: 'slide-left', label: 'Slide left' }, { value: 'scale', label: 'Scale' }]} />
        </Field>
        <Field label="Duration (ms)" tooltip="Animation duration in milliseconds">
          <NumberInput value={Number(widget.options?.animationDuration ?? 300)} onChange={(v) => update(widget.id, { options: { ...widget.options, animationDuration: v } })} min={0} max={2000} step={50} />
        </Field>
        <Field label="Delay (ms)" tooltip="Delay before animation starts">
          <NumberInput value={Number(widget.options?.animationDelay ?? 0)} onChange={(v) => update(widget.id, { options: { ...widget.options, animationDelay: v } })} min={0} max={5000} step={50} />
        </Field>
        <Field label="Easing" tooltip="Timing function">
          <SelectInput value={String(widget.options?.animationEasing ?? 'ease')} onChange={(v) => update(widget.id, { options: { ...widget.options, animationEasing: v } })} options={[{ value: 'ease', label: 'Ease' }, { value: 'linear', label: 'Linear' }, { value: 'ease-in', label: 'Ease in' }, { value: 'ease-out', label: 'Ease out' }, { value: 'ease-in-out', label: 'Ease in out' }]} />
        </Field>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Advanced                                                      */
/* ------------------------------------------------------------------ */

function TabAdvanced({ widget, search }: { widget: DashboardWidget; search: string }) {
  const { update, dashboard, setDashboard, saveBookmark, bookmarks, deleteBookmark, restoreBookmark, savedViews, saveView, loadView, deleteView, refreshBookmarks, refreshSavedViews, setDashboardVariable, variableValues } = useBuilderStore();
  const [bmName, setBmName] = useState('');
  const [viewName, setViewName] = useState('');
  const [viewDesc, setViewDesc] = useState('');
  const [newVarName, setNewVarName] = useState('');
  const [newVarLabel, setNewVarLabel] = useState('');
  const [newVarType, setNewVarType] = useState<DashboardVariable['type']>('string');

  const cfRules: ConditionalFormatRule[] = (widget.options?.conditionalFormats as ConditionalFormatRule[]) ?? [];
  const dcRules: DynamicColorRule[] = (widget.options?.dynamicColors as DynamicColorRule[]) ?? [];
  const dlRules: DynamicLabelRule[] = (widget.options?.dynamicLabels as DynamicLabelRule[]) ?? [];
  const variables: DashboardVariable[] = dashboard.variables ?? [];
  const calcFields: CalculatedField[] = dashboard.calculatedFields ?? [];
  const ds = dashboard.datasets ?? [];
  const dsFields = ds.flatMap((d) => (d.fields ?? []).map((f) => f.name));

  const addCfRule = () => {
    const rules = [...cfRules, { id: `cf-${Date.now()}`, field: dsFields[0] ?? '', operator: '>' as const, value: 0, style: { background: '#fef3c7', color: '#92400e' } }];
    update(widget.id, { options: { ...widget.options, conditionalFormats: rules } });
  };
  const updateCfRule = (idx: number, patch: Partial<ConditionalFormatRule>) => {
    const rules = [...cfRules]; rules[idx] = { ...rules[idx], ...patch }; update(widget.id, { options: { ...widget.options, conditionalFormats: rules } });
  };
  const removeCfRule = (idx: number) => {
    update(widget.id, { options: { ...widget.options, conditionalFormats: cfRules.filter((_, i) => i !== idx) } });
  };

  const addDcRule = () => {
    const rules = [...dcRules, { id: `dc-${Date.now()}`, field: dsFields[0] ?? '', thresholds: [{ value: 0, color: '#ef4444', operator: '<' as const }, { value: 50, color: '#f59e0b', operator: '>=' as const }, { value: 80, color: '#10b981', operator: '>=' as const }], defaultColor: '#6b7280' }];
    update(widget.id, { options: { ...widget.options, dynamicColors: rules } });
  };
  const updateDcRule = (idx: number, patch: Partial<DynamicColorRule>) => {
    const rules = [...dcRules]; rules[idx] = { ...rules[idx], ...patch }; update(widget.id, { options: { ...widget.options, dynamicColors: rules } });
  };
  const removeDcRule = (idx: number) => {
    update(widget.id, { options: { ...widget.options, dynamicColors: dcRules.filter((_, i) => i !== idx) } });
  };

  const addDlRule = () => {
    const rules = [...dlRules, { id: `dl-${Date.now()}`, field: dsFields[0] ?? '', mappings: [{ match: 'yes', label: '✓' }, { match: 'no', label: '✗' }], defaultLabel: '' }];
    update(widget.id, { options: { ...widget.options, dynamicLabels: rules } });
  };
  const updateDlRule = (idx: number, patch: Partial<DynamicLabelRule>) => {
    const rules = [...dlRules]; rules[idx] = { ...rules[idx], ...patch }; update(widget.id, { options: { ...widget.options, dynamicLabels: rules } });
  };
  const removeDlRule = (idx: number) => {
    update(widget.id, { options: { ...widget.options, dynamicLabels: dlRules.filter((_, i) => i !== idx) } });
  };

  const addVariable = () => {
    if (!newVarName) return;
    const v: DashboardVariable = { name: newVarName, label: newVarLabel || newVarName, type: newVarType, defaultValue: newVarType === 'number' ? 0 : newVarType === 'boolean' ? false : '' };
    setDashboard({ ...dashboard, variables: [...variables, v] });
    setDashboardVariable(v.name, v.defaultValue ?? '');
    setNewVarName(''); setNewVarLabel('');
  };

  const addCalcField = () => {
    const cf: CalculatedField = { name: `calc_${Date.now()}`, expression: '', type: 'number' };
    setDashboard({ ...dashboard, calculatedFields: [...calcFields, cf] });
  };

  return (
    <>
      <Section title="Conditional Formatting" defaultOpen={cfRules.length > 0} search={search}>
        {cfRules.map((rule, idx) => (
          <div key={rule.id} className="pg-adv-rule-card">
            <div className="pg-adv-rule-header">
              <span className="pg-adv-rule-label">Rule {idx + 1}</span>
              <button className="pg-insp-group-btn" onClick={() => removeCfRule(idx)}>×</button>
            </div>
            <div className="pg-adv-rule-fields">
              <select value={rule.field} onChange={(e) => updateCfRule(idx, { field: e.target.value })} className="pg-adv-select">{dsFields.map((f) => <option key={f} value={f}>{f}</option>)}</select>
              <select value={rule.operator} onChange={(e) => updateCfRule(idx, { operator: e.target.value as ConditionalFormatRule['operator'] })} className="pg-adv-select pg-adv-select-sm">
                <option value=">">&gt;</option><option value=">=">&ge;</option><option value="<">&lt;</option><option value="<=">&le;</option>
                <option value="==">=</option><option value="!=">≠</option><option value="contains">contains</option><option value="between">between</option>
                <option value="isNull">is null</option><option value="isNotNull">is not null</option>
              </select>
              {rule.operator !== 'isNull' && rule.operator !== 'isNotNull' && <input className="pg-adv-input" value={String(rule.value ?? '')} onChange={(e) => updateCfRule(idx, { value: e.target.value })} placeholder="Value" />}
            </div>
            <div className="pg-adv-rule-styles">
              <label>BG:</label><input type="color" value={rule.style.background ?? '#fef3c7'} onChange={(e) => updateCfRule(idx, { style: { ...rule.style, background: e.target.value } })} />
              <label>Text:</label><input type="color" value={rule.style.color ?? '#92400e'} onChange={(e) => updateCfRule(idx, { style: { ...rule.style, color: e.target.value } })} />
            </div>
          </div>
        ))}
        <button className="pg-adv-add-btn" onClick={addCfRule}>+ Add rule</button>
      </Section>
      <Section title="Dynamic Colors" defaultOpen={dcRules.length > 0} search={search}>
        {dcRules.map((rule, idx) => (
          <div key={rule.id} className="pg-adv-rule-card">
            <div className="pg-adv-rule-header">
              <span className="pg-adv-rule-label">Color by {rule.field}</span>
              <button className="pg-insp-group-btn" onClick={() => removeDcRule(idx)}>×</button>
            </div>
            <div className="pg-adv-rule-fields">
              <select value={rule.field} onChange={(e) => updateDcRule(idx, { field: e.target.value })} className="pg-adv-select">{dsFields.map((f) => <option key={f} value={f}>{f}</option>)}</select>
            </div>
            <div className="pg-adv-thresholds">
              {rule.thresholds.map((t, ti) => (
                <div key={ti} className="pg-adv-threshold-row">
                  <input type="color" value={t.color} onChange={(e) => { const th = [...rule.thresholds]; th[ti] = { ...th[ti], color: e.target.value }; updateDcRule(idx, { thresholds: th }); }} />
                  <select value={t.operator ?? '>='} onChange={(e) => { const th = [...rule.thresholds]; th[ti] = { ...th[ti], operator: e.target.value as ConditionalFormatRule['operator'] }; updateDcRule(idx, { thresholds: th }); }} className="pg-adv-select-xs">
                    <option value="<">&lt;</option><option value="<=">&le;</option><option value=">=">&ge;</option><option value=">">&gt;</option>
                  </select>
                  <input className="pg-adv-input-sm" value={String(t.value)} onChange={(e) => { const th = [...rule.thresholds]; th[ti] = { ...th[ti], value: e.target.value }; updateDcRule(idx, { thresholds: th }); }} />
                </div>
              ))}
              <button className="pg-adv-add-btn-sm" onClick={() => { const th = [...rule.thresholds, { value: 0, color: '#6b7280', operator: '>=' as const }]; updateDcRule(idx, { thresholds: th }); }}>+ Threshold</button>
            </div>
          </div>
        ))}
        <button className="pg-adv-add-btn" onClick={addDcRule}>+ Add color rule</button>
      </Section>
      <Section title="Dynamic Labels" defaultOpen={dlRules.length > 0} search={search}>
        {dlRules.map((rule, idx) => (
          <div key={rule.id} className="pg-adv-rule-card">
            <div className="pg-adv-rule-header">
              <span className="pg-adv-rule-label">Label by {rule.field}</span>
              <button className="pg-insp-group-btn" onClick={() => removeDlRule(idx)}>×</button>
            </div>
            <div className="pg-adv-rule-fields">
              <select value={rule.field} onChange={(e) => updateDlRule(idx, { field: e.target.value })} className="pg-adv-select">{dsFields.map((f) => <option key={f} value={f}>{f}</option>)}</select>
            </div>
            <div className="pg-adv-mappings">
              {rule.mappings.map((m, mi) => (
                <div key={mi} className="pg-adv-mapping-row">
                  <input className="pg-adv-input-sm" value={String(m.match)} onChange={(e) => { const mp = [...rule.mappings]; mp[mi] = { ...mp[mi], match: e.target.value }; updateDlRule(idx, { mappings: mp }); }} placeholder="Match" />
                  <span>→</span>
                  <input className="pg-adv-input-sm" value={m.label} onChange={(e) => { const mp = [...rule.mappings]; mp[mi] = { ...mp[mi], label: e.target.value }; updateDlRule(idx, { mappings: mp }); }} placeholder="Label" />
                </div>
              ))}
              <button className="pg-adv-add-btn-sm" onClick={() => { const mp = [...rule.mappings, { match: '', label: '' }]; updateDlRule(idx, { mappings: mp }); }}>+ Mapping</button>
            </div>
          </div>
        ))}
        <button className="pg-adv-add-btn" onClick={addDlRule}>+ Add label rule</button>
      </Section>
      <Section title="Dashboard Variables" defaultOpen={false} search={search}>
        {variables.map((v, idx) => (
          <div key={v.name} className="pg-adv-var-row">
            <span className="pg-adv-var-name">{v.name}</span>
            <span className="pg-adv-var-type">{v.type}</span>
            <input className="pg-adv-input-sm" value={String(variableValues[v.name] ?? v.defaultValue ?? '')} onChange={(e) => setDashboardVariable(v.name, e.target.value)} />
            <button className="pg-insp-group-btn" onClick={() => {
              const next = variables.filter((_, i) => i !== idx);
              setDashboard({ ...dashboard, variables: next });
            }}>×</button>
          </div>
        ))}
        <div className="pg-adv-var-add">
          <input className="pg-adv-input-sm" value={newVarName} onChange={(e) => setNewVarName(e.target.value)} placeholder="name" />
          <input className="pg-adv-input-sm" value={newVarLabel} onChange={(e) => setNewVarLabel(e.target.value)} placeholder="Label" />
          <select className="pg-adv-select-xs" value={newVarType} onChange={(e) => setNewVarType(e.target.value as DashboardVariable['type'])}>
            <option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="date">Date</option>
          </select>
          <button className="pg-adv-add-btn-sm" onClick={addVariable}>+</button>
        </div>
      </Section>
      <Section title="Calculated Fields" defaultOpen={false} search={search}>
        {calcFields.map((cf, idx) => (
          <div key={idx} className="pg-adv-calc-row">
            <input className="pg-adv-input-sm" value={cf.name} onChange={(e) => { const next = [...calcFields]; next[idx] = { ...next[idx], name: e.target.value }; setDashboard({ ...dashboard, calculatedFields: next }); }} placeholder="Name" />
            <input className="pg-adv-input-sm" value={cf.expression} onChange={(e) => { const next = [...calcFields]; next[idx] = { ...next[idx], expression: e.target.value }; setDashboard({ ...dashboard, calculatedFields: next }); }} placeholder="Expression" />
            <button className="pg-insp-group-btn" onClick={() => setDashboard({ ...dashboard, calculatedFields: calcFields.filter((_, i) => i !== idx) })}>×</button>
          </div>
        ))}
        <button className="pg-adv-add-btn" onClick={addCalcField}>+ Add field</button>
      </Section>
      <Section title="Bookmarks" defaultOpen={false} search={search}>
        {bookmarks.map((bm) => (
          <div key={bm.id} className="pg-adv-bookmark-row">
            <span className="pg-adv-bookmark-name">{bm.name}</span>
            <small>{new Date(bm.timestamp).toLocaleDateString()}</small>
            <button className="pg-insp-group-btn" onClick={() => restoreBookmark(bm.id)}>Restore</button>
            <button className="pg-insp-group-btn" onClick={() => deleteBookmark(bm.id)}>×</button>
          </div>
        ))}
        <div className="pg-adv-var-add">
          <input className="pg-adv-input-sm" value={bmName} onChange={(e) => setBmName(e.target.value)} placeholder="Bookmark name" />
          <button className="pg-adv-add-btn-sm" onClick={() => { if (bmName) { saveBookmark(bmName); setBmName(''); } }}>Save</button>
        </div>
      </Section>
      <Section title="Saved Views" defaultOpen={false} search={search}>
        {savedViews.map((sv) => (
          <div key={sv.id} className="pg-adv-bookmark-row">
            <span className="pg-adv-bookmark-name">{sv.name}</span>
            <small>{new Date(sv.timestamp).toLocaleDateString()}</small>
            <button className="pg-insp-group-btn" onClick={() => loadView(sv.id)}>Load</button>
            <button className="pg-insp-group-btn" onClick={() => deleteView(sv.id)}>×</button>
          </div>
        ))}
        <div className="pg-adv-var-add">
          <input className="pg-adv-input-sm" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="View name" />
          <button className="pg-adv-add-btn-sm" onClick={() => { if (viewName) { saveView(viewName, viewDesc); setViewName(''); setViewDesc(''); } }}>Save</button>
        </div>
      </Section>
      <Section title="Raw Options" defaultOpen={false} search={search}>
        <CodeEditor value={JSON.stringify(widget.options ?? {}, null, 2)} onChange={(v) => { try { update(widget.id, { options: JSON.parse(v) }); } catch { /* invalid JSON */ } }} language="json" />
      </Section>
      <Section title="Raw Style" defaultOpen={false} search={search}>
        <CodeEditor value={JSON.stringify(widget.style ?? {}, null, 2)} onChange={(v) => { try { update(widget.id, { style: JSON.parse(v) }); } catch { /* invalid */ } }} language="json" />
      </Section>
      <Section title="Raw Position" defaultOpen={false} search={search}>
        <CodeEditor value={JSON.stringify(widget.position, null, 2)} onChange={(v) => { try { update(widget.id, { position: JSON.parse(v) }); } catch { /* invalid */ } }} language="json" />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Inspector – main panel (supports multi-selection)                  */
/* ------------------------------------------------------------------ */

function Inspector() {
  const dashboard = useBuilderStore((s) => s.dashboard);
  const selectedIds = useBuilderStore((s) => s.selectedIds);
  const update = useBuilderStore((s) => s.update);
  const widgets = dashboard.widgets.filter((item) => selectedIds.includes(item.id));
  const widget = widgets.length === 1 ? widgets[0] : undefined;
  const [activeTab, setActiveTab] = useState<InspectorTab>('general');
  const [search, setSearch] = useState('');

  if (widgets.length === 0) {
    return (
      <aside className="pg-right pg-inspector">
        <div className="pg-insp-header">
          <div className="pg-section-title">Properties</div>
        </div>
        <div className="pg-insp-empty">
          <span className="pg-insp-empty-icon">⊙</span>
          <p>Select a widget to edit its properties.</p>
        </div>
        <FilterBuilder />
      </aside>
    );
  }

  if (widgets.length > 1) {
    const types = [...new Set(widgets.map((w) => w.type))];
    return (
      <aside className="pg-right pg-inspector">
        <div className="pg-insp-header">
          <div className="pg-section-title">Properties</div>
        </div>
        <div className="pg-insp-multi">
          <div className="pg-insp-multi-badge">{widgets.length}</div>
          <div className="pg-insp-multi-info">
            <strong>{widgets.length} widgets selected</strong>
            <small>{types.join(', ')}</small>
          </div>
        </div>
        <div className="pg-insp-multi-actions">
          <button onClick={() => {
            const locked = widgets.some((w) => w.options?.locked);
            widgets.forEach((w) => update(w.id, { options: { ...w.options, locked: !locked } }));
          }}>Toggle lock</button>
          <button className="pg-insp-multi-dup" onClick={() => useBuilderStore.getState().duplicateSelected()}>Duplicate</button>
          <button className="pg-insp-multi-del" onClick={() => useBuilderStore.getState().removeSelected()}>Delete</button>
        </div>
        <FilterBuilder />
      </aside>
    );
  }

  if (!widget) return null;

  const tabContent: Record<InspectorTab, React.ReactNode> = {
    general: <TabGeneral widget={widget} search={search} />,
    data: <TabData widget={widget} search={search} />,
    style: <TabStyle widget={widget} search={search} />,
    layout: <TabLayout widget={widget} search={search} />,
    interaction: <TabInteraction widget={widget} search={search} />,
    animation: <TabAnimation widget={widget} search={search} />,
    advanced: <TabAdvanced widget={widget} search={search} />,
  };

  return (
    <aside className="pg-right pg-inspector">
      <div className="pg-insp-header">
        <div className="pg-section-title">Properties</div>
        <div className="pg-insp-widget-chip">
          <span className="pg-insp-widget-chip-icon">{icon[widget.type] ?? '◇'}</span>
          <span className="pg-insp-widget-chip-name">{widget.title || widget.type}</span>
        </div>
      </div>
      <InspectorSearch value={search} onChange={setSearch} />
      <div className="pg-insp-tabs">
        {TAB_DEFS.map((tab) => (
          <button key={tab.id} className={`pg-insp-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)} title={tab.label}>
            <span className="pg-insp-tab-icon">{tab.icon}</span>
            <span className="pg-insp-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="pg-insp-content">
        {tabContent[activeTab]}
      </div>
      <FilterBuilder />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                            */
/* ------------------------------------------------------------------ */

function Toolbar() {
  const dashboard = useBuilderStore((s) => s.dashboard);
  const historyLen = useBuilderStore((s) => s.history.length);
  const futureLen = useBuilderStore((s) => s.future.length);
  const preview = useBuilderStore((s) => s.preview);
  const dark = useBuilderStore((s) => s.dark);
  const viewport = useBuilderStore((s) => s.viewport);
  const jsonOpen = useBuilderStore((s) => s.jsonOpen);
  const reset = useBuilderStore((s) => s.reset);
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const togglePreview = useBuilderStore((s) => s.togglePreview);
  const setDashboard = useBuilderStore((s) => s.setDashboard);
  const file = useRef<HTMLInputElement>(null);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(dashboard, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${dashboard.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <header className="pg-toolbar">
      <strong>Dashboard <i>Studio</i></strong>
      <button onClick={reset}>New</button>
      <button onClick={() => file.current?.click()}>Open</button>
      <input ref={file} hidden type="file" accept="application/json" onChange={(e) => e.target.files?.[0]?.text().then((text) => setDashboard(JSON.parse(text) as DashboardConfig, false))} />
      <button onClick={() => localStorage.setItem('dashboard-generator:autosave', JSON.stringify(dashboard))}>Save</button>
      <button disabled={!historyLen} onClick={undo} aria-label="Undo">↶</button>
      <button disabled={!futureLen} onClick={redo} aria-label="Redo">↷</button>
      <button className={preview ? 'active' : ''} onClick={togglePreview}>{preview ? 'Edit' : 'Preview'}</button>
      <button onClick={exportJson}>Export JSON</button>
      <button onClick={() => useBuilderStore.setState({ jsonOpen: !jsonOpen })}>JSON</button>
      <span className="pg-spacer" />
      <button onClick={() => useBuilderStore.setState({ dark: !dark })} aria-label={dark ? 'Light mode' : 'Dark mode'}>{dark ? '☀' : '◐'}</button>
      <select value={viewport} onChange={(e) => useBuilderStore.setState({ viewport: e.target.value as typeof viewport })}>
        <option value="desktop">Desktop</option>
        <option value="laptop">Laptop</option>
        <option value="tablet">Tablet</option>
        <option value="mobile">Mobile</option>
      </select>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  JsonPanel                                                          */
/* ------------------------------------------------------------------ */

function JsonPanel() {
  const dashboard = useBuilderStore((s) => s.dashboard);
  const jsonOpen = useBuilderStore((s) => s.jsonOpen);
  const setDashboard = useBuilderStore((s) => s.setDashboard);
  const [text, setText] = useState(JSON.stringify(dashboard, null, 2));
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setText(JSON.stringify(dashboard, null, 2)), [dashboard]);
  if (!jsonOpen) return null;
  return (
    <section className="pg-json">
      <div><strong>Dashboard JSON</strong><span>{error}</span></div>
      <textarea value={text} onChange={(e) => {
        setText(e.target.value);
        try {
          const next = JSON.parse(e.target.value) as DashboardConfig;
          if (!Array.isArray(next.widgets)) throw new Error('widgets must be an array');
          setError('');
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setDashboard(next), 500);
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invalid JSON'); }
      }} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  DashboardBuilder – root export + keyboard shortcuts                 */
/* ------------------------------------------------------------------ */

export function DashboardBuilder({ initialDashboard }: { initialDashboard: DashboardConfig }) {
  useEffect(() => useBuilderStore.getState().setDashboard(initialDashboard, false), [initialDashboard]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const state = useBuilderStore.getState();
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (isInput) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Undo / Redo
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? state.redo() : state.undo();
        return;
      }

      // Select All
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        state.selectAll();
        return;
      }

      // Copy / Cut / Paste
      if (ctrl && e.key.toLowerCase() === 'c') {
        if (state.selectedIds.length > 0) {
          state.copySelected();
        }
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'v') {
        state.paste();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'x') {
        if (state.selectedIds.length > 0) {
          state.copySelected();
          state.removeSelected();
        }
        return;
      }

      // Duplicate
      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (state.selectedIds.length > 0) {
          state.duplicateSelected();
        } else if (state.selectedId) {
          state.duplicate(state.selectedId);
        }
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedIds.length > 0) {
          e.preventDefault();
          state.removeSelected();
        }
        return;
      }

      // Escape – clear selection
      if (e.key === 'Escape') {
        state.clearSelection();
        return;
      }

      // Tab – keyboard navigation
      if (e.key === 'Tab') {
        e.preventDefault();
        state.focusNext(e.shiftKey ? -1 : 1);
        return;
      }

      // Arrow keys – nudge or navigate
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const distance = e.shiftKey ? 3 : 1;
        if (e.altKey || state.selectedIds.length <= 1) {
          // Navigate between widgets when no multi-select or Alt held
          if (e.altKey) {
            state.focusNext(e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
            return;
          }
        }
        // Nudge selected widgets
        const dx = e.key === 'ArrowLeft' ? -distance : e.key === 'ArrowRight' ? distance : 0;
        const dy = e.key === 'ArrowUp' ? -distance : e.key === 'ArrowDown' ? distance : 0;
        if (state.selectedIds.length > 0) {
          state.nudgeSelected(dx, dy);
        } else if (state.selectedId) {
          const widget = state.dashboard.widgets.find((w) => w.id === state.selectedId);
          if (widget) {
            const pos = widget.position;
            state.updatePosition(widget.id, {
              ...pos,
              x: Math.max(0, Math.min(12 - pos.w, pos.x + dx)),
              y: Math.max(0, pos.y + dy),
            });
          }
        }
        return;
      }

      // Layout tools (Ctrl+Shift+key)
      if (ctrl && e.shiftKey && state.selectedIds.length >= 2) {
        const key = e.key.toLowerCase();
        const map: Record<string, () => void> = {
          l: () => state.alignSelected('left'),
          r: () => state.alignSelected('right'),
          t: () => state.alignSelected('top'),
          b: () => state.alignSelected('bottom'),
          h: () => state.alignSelected('center-h'),
          v: () => state.alignSelected('center-v'),
          w: () => state.equalizeSelected('width'),
          e: () => state.equalizeSelected('height'),
          g: () => state.groupSelected(),
        };
        if (key in map) { e.preventDefault(); map[key](); return; }
        // Ctrl+Shift+Distribute (3+)
        if ((key === 'i' || key === 'o') && state.selectedIds.length >= 3) {
          e.preventDefault();
          state.distributeSelected(key === 'i' ? 'horizontal' : 'vertical');
          return;
        }
      }

      // Ungroup – Ctrl+Shift+U
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        state.ungroupSelected();
        return;
      }

      // Lock/Unlock – Ctrl+Shift+K
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const widgets = state.dashboard.widgets.filter((w) => state.selectedIds.includes(w.id));
        const allLocked = widgets.every((w) => w.options?.locked);
        allLocked ? state.unlockSelected() : state.lockSelected();
        return;
      }

      // Hide – Ctrl+Shift+H
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        state.hideSelected();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { dark, preview, dashboard, selectedIds } = useBuilderStore();
  return (
    <div className={`pg-app ${dark ? 'dark' : ''} ${preview ? 'previewing' : ''}`}>
      <Toolbar />
      <div className="pg-workspace">
        <Library />
        <Canvas />
        {!preview && <Inspector />}
      </div>
      <JsonPanel />
      <footer>
        {dashboard.widgets.length} widgets · {selectedIds.length > 0 ? `${selectedIds.length} selected · ` : ''}{preview ? 'Preview mode' : 'Edit mode'} · Autosave ready
      </footer>
    </div>
  );
}
