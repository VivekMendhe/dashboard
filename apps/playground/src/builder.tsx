import { useEffect, useMemo, useRef, useState } from 'react';
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { getWidget, listWidgets, type DashboardConfig, type DashboardWidget, type DataRecord, type FilterConfig, type Primitive, type WidgetRenderProps } from '@dashboard-generator/core';
import { loadData } from '@dashboard-generator/datasource';
import { darkTheme, lightTheme } from '@dashboard-generator/theme';
import { useBuilderStore } from '@dashboard-generator/playground';
import '@dashboard-generator/widgets';

const chartTypes = ['kpi', 'bar', 'line', 'area', 'pie', 'donut'];
const category = (type: string) => chartTypes.includes(type) ? 'Charts' : type === 'table' ? 'Data' : 'Layout';
const icon: Record<string, string> = { kpi: '◆', bar: '▥', line: '⌁', area: '◒', pie: '◔', donut: '◉', table: '▤', text: 'T', divider: '—' };
const defaultPosition = (type: string) => ({ x: 0, y: 0, w: type === 'table' ? 6 : type === 'kpi' ? 3 : 4, h: type === 'table' ? 4 : type === 'kpi' ? 2 : 3, minW: type === 'kpi' ? 2 : 3, minH: type === 'kpi' ? 2 : 3, maxW: 12, maxH: 12 });

const filterData = (data: DataRecord[], values: Record<string, Primitive>, filters: FilterConfig[] = []) => data.filter((row) => filters.every((filter) => {
  const value = values[filter.id]; if (value === null || value === '' || value === false || value === undefined || !filter.field) return true;
  const cell = String(row[filter.field] ?? '');
  if (filter.type === 'search') return cell.toLowerCase().includes(String(value).toLowerCase());
  return cell.toLowerCase() === String(value).toLowerCase();
}));
const positionFor = (widget: DashboardWidget, viewport: 'desktop' | 'tablet' | 'mobile') => viewport === 'desktop' ? widget.position : widget.positions?.[viewport] ?? widget.position;

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
  return <div className="pg-widget-content">{loading ? <div className="pg-empty">Loading…</div> : definition.renderer(props)}</div>;
}

function WidgetToolbar({ widget }: { widget: DashboardWidget }) {
  const { duplicate, copy, remove, update, updatePosition } = useBuilderStore();
  const locked = Boolean(widget.options?.locked);
  const action = (event: React.MouseEvent, fn: () => void) => { event.stopPropagation(); fn(); };
  return <div className="pg-widget-toolbar" onMouseDown={(event) => event.stopPropagation()}>
    <button title="Duplicate" onClick={(e) => action(e, () => duplicate(widget.id))}>⧉</button>
    <button title="Copy" onClick={(e) => action(e, () => copy(widget.id))}>⎘</button>
    <button title={locked ? 'Unlock' : 'Lock'} onClick={(e) => action(e, () => update(widget.id, { options: { ...widget.options, locked: !locked } }))}>{locked ? '🔒' : '🔓'}</button>
    <button title="Bring forward" onClick={(e) => action(e, () => update(widget.id, { style: { ...widget.style, zIndex: 2 } }))}>↑</button>
    <button title="Send back" onClick={(e) => action(e, () => update(widget.id, { style: { ...widget.style, zIndex: 1 } }))}>↓</button>
    <button title="Reset size" onClick={(e) => action(e, () => updatePosition(widget.id, { ...defaultPosition(widget.type), x: widget.position.x, y: widget.position.y }))}>⟲</button>
    <button title="Delete" className="danger" onClick={(e) => action(e, () => remove(widget.id))}>×</button>
  </div>;
}

function FilterBar() {
  const { dashboard, filterValues, setFilter, clearFilters } = useBuilderStore();
  if (!dashboard.filters?.length) return null;
  return <div className="pg-filterbar">{dashboard.filters.map((filter) => <label key={filter.id}>{filter.label}<select value={String(filterValues[filter.id] ?? '')} onChange={(e) => setFilter(filter.id, e.target.value)}><option value="">All</option>{filter.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select></label>)}<button onClick={clearFilters}>Clear filters</button></div>;
}

function Canvas() {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1000 });
  const { dashboard, selectedId, select, updatePosition, preview, viewport } = useBuilderStore();
  const scale = viewport === 'desktop' ? 1 : viewport === 'tablet' ? .78 : .52;
  const layout = useMemo<Layout>(() => dashboard.widgets.map((widget) => { const position = positionFor(widget, viewport); return { i: widget.id, ...position, minW: position.minW ?? 2, maxW: position.maxW ?? 12, minH: position.minH ?? 2, maxH: position.maxH ?? 12, static: Boolean(widget.options?.locked) }; }), [dashboard.widgets, viewport]);
  const commit = (items: Layout) => items.forEach((item) => { const before = dashboard.widgets.find((widget) => widget.id === item.i); const position = before && positionFor(before, viewport); if (position && (position.x !== item.x || position.y !== item.y || position.w !== item.w || position.h !== item.h)) updatePosition(item.i, { x: item.x, y: item.y, w: item.w, h: item.h, minW: position.minW, minH: position.minH, maxW: position.maxW, maxH: position.maxH }, viewport); });
  const selectFromContent = (event: React.PointerEvent<HTMLDivElement>, id: string) => { if (preview || (event.target as Element).closest('.pg-drag, .pg-widget-toolbar')) return; select(id); };
  const deselectIfEmpty = (event: React.MouseEvent<HTMLDivElement>) => { if (!preview && !(event.target as Element).closest('.pg-widget, .pg-filterbar')) select(undefined); };
  return <section className="pg-canvas-shell"><div className={`pg-viewport ${viewport}`} style={{ transform: `scale(${scale})` }} ref={containerRef} onClick={deselectIfEmpty}><FilterBar />{mounted && <GridLayout width={width} layout={layout} autoSize gridConfig={{ cols: 12, rowHeight: 82, margin: [12, 12], containerPadding: [12, 12] }} dragConfig={{ enabled: !preview, handle: '.pg-drag', cancel: '.pg-widget-toolbar,button,input,select,textarea', threshold: 5 }} resizeConfig={{ enabled: !preview, handles: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] }} onDragStop={commit} onResizeStop={commit} className={preview ? 'pg-grid preview' : 'pg-grid'}>{dashboard.widgets.map((widget) => <div key={widget.id} className={`pg-widget ${selectedId === widget.id ? 'selected' : ''}`} style={widget.style} onPointerDownCapture={(event) => selectFromContent(event, widget.id)} onClick={() => !preview && select(widget.id)}><div className="pg-widget-head pg-drag"><span>{widget.title || widget.type}</span></div>{!preview && <WidgetToolbar widget={widget} />}<WidgetContent widget={widget} /></div>)}</GridLayout>}</div></section>;
}

function Library() {
  const add = useBuilderStore((state) => state.add); const [search, setSearch] = useState(''); const [open, setOpen] = useState<Record<string, boolean>>({ Charts: true, Data: true, Layout: true });
  const widgets = listWidgets().filter((widget) => widget.name.toLowerCase().includes(search.toLowerCase()) || widget.type.includes(search.toLowerCase()));
  return <aside className="pg-left"><div className="pg-library-header"><div className="pg-section-title">Widget library</div><input aria-label="Search widgets" placeholder="Search widgets…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="pg-library-list">{['Charts', 'Data', 'Layout'].map((group) => <section key={group}><button className="pg-category" onClick={() => setOpen((value) => ({ ...value, [group]: !value[group] }))}>{open[group] ? '⌄' : '›'} {group}</button>{open[group] && widgets.filter((widget) => category(widget.type) === group).map((widget) => <button className="pg-library-item" key={widget.type} onClick={() => add(widget.type)}><b>{icon[widget.type] ?? '◇'}</b><span><strong>{widget.name}</strong><small>Add {widget.name.toLowerCase()}</small></span><em>+</em></button>)}</section>)}</div></aside>;
}

function DataEditor({ widget }: { widget: DashboardWidget }) {
  const update = useBuilderStore((state) => state.update); const [text, setText] = useState(JSON.stringify(widget.datasource?.kind === 'static' ? widget.datasource.data : [], null, 2)); const [error, setError] = useState('');
  return <label>Dataset JSON<textarea value={text} onChange={(e) => { setText(e.target.value); try { const data = JSON.parse(e.target.value) as DataRecord[]; if (!Array.isArray(data)) throw new Error('Dataset must be an array'); update(widget.id, { datasource: { kind: 'static', data } }); setError(''); } catch { setError('Invalid JSON array'); } }} />{error && <small className="pg-error">{error}</small>}</label>;
}

function Inspector() {
  const { dashboard, selectedId, update } = useBuilderStore(); const widget = dashboard.widgets.find((item) => item.id === selectedId);
  if (!widget) return <aside className="pg-right"><div className="pg-section-title">Properties</div><p className="pg-muted">Select a widget to edit its properties.</p><FilterBuilder /></aside>;
  const options = widget.options ?? {}; const setOption = (key: string, value: unknown) => update(widget.id, { options: { ...options, [key]: value } });
  return <aside className="pg-right"><div className="pg-section-title">Properties</div><label>Title<input value={widget.title ?? ''} onChange={(e) => update(widget.id, { title: e.target.value })} /></label><label>Dataset<select value={widget.binding?.datasetId ?? ''} onChange={(e) => update(widget.id, { binding: e.target.value ? { ...widget.binding, datasetId: e.target.value } : undefined })}><option value="">Widget-local data</option>{dashboard.datasets?.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select></label><label>Subtitle<input value={String(options.subtitle ?? '')} onChange={(e) => setOption('subtitle', e.target.value)} /></label>{widget.type === 'kpi' ? <><label>Label<input value={String(options.label ?? '')} onChange={(e) => setOption('label', e.target.value)} /></label><label>Value<input value={String(options.value ?? '')} onChange={(e) => setOption('value', e.target.value)} /></label><label>Prefix<input value={String(options.prefix ?? '')} onChange={(e) => setOption('prefix', e.target.value)} /></label><label>Suffix<input value={String(options.suffix ?? '')} onChange={(e) => setOption('suffix', e.target.value)} /></label></> : <><label>X Axis<input value={String(options.xKey ?? 'name')} onChange={(e) => setOption('xKey', e.target.value)} /></label><label>Y Axis<input value={String(options.yKey ?? 'value')} onChange={(e) => setOption('yKey', e.target.value)} /></label><label>Chart color<input type="color" value={String(options.color ?? '#2563eb')} onChange={(e) => setOption('color', e.target.value)} /></label>{!widget.binding?.datasetId && <DataEditor widget={widget} />}</>}<label>Padding<input type="number" value={Number(widget.style?.padding ?? 8)} onChange={(e) => update(widget.id, { style: { ...widget.style, padding: Number(e.target.value) } })} /></label><FilterBuilder /></aside>;
}

function FilterBuilder() {
  const { dashboard, addFilter, removeFilter } = useBuilderStore(); const [label, setLabel] = useState('Country'); const [type, setType] = useState<FilterConfig['type']>('select');
  return <div className="pg-filter-builder"><strong>Dashboard filters</strong>{dashboard.filters?.map((filter) => <div key={filter.id}>{filter.label}<button onClick={() => removeFilter(filter.id)}>×</button></div>)}<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Filter label" /><select value={type} onChange={(e) => setType(e.target.value as FilterConfig['type'])}><option value="select">Single select</option><option value="search">Search</option><option value="date">Date</option></select><button onClick={() => addFilter({ id: `${label.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`, label, type, options: type === 'select' ? [{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }] : undefined })}>Add filter</button></div>;
}

function Toolbar() { const state = useBuilderStore(); const file = useRef<HTMLInputElement>(null); const exportJson = () => { const blob = new Blob([JSON.stringify(state.dashboard, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.dashboard.id}.json`; link.click(); URL.revokeObjectURL(link.href); }; return <header className="pg-toolbar"><strong>Dashboard <i>Studio</i></strong><button onClick={state.reset}>New</button><button onClick={() => file.current?.click()}>Open</button><input ref={file} hidden type="file" accept="application/json" onChange={(e) => e.target.files?.[0]?.text().then((text) => state.setDashboard(JSON.parse(text) as DashboardConfig))} /><button onClick={() => localStorage.setItem('dashboard-generator:autosave', JSON.stringify(state.dashboard))}>Save</button><button disabled={!state.history.length} onClick={state.undo}>↶</button><button disabled={!state.future.length} onClick={state.redo}>↷</button><button className={state.preview ? 'active' : ''} onClick={state.togglePreview}>{state.preview ? 'Edit' : 'Preview'}</button><button onClick={exportJson}>Export JSON</button><button onClick={() => useBuilderStore.setState({ jsonOpen: !state.jsonOpen })}>JSON</button><span className="pg-spacer" /><button onClick={() => useBuilderStore.setState({ dark: !state.dark })}>{state.dark ? '☀' : '◐'}</button><select value={state.viewport} onChange={(e) => useBuilderStore.setState({ viewport: e.target.value as typeof state.viewport })}><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select></header>; }

function JsonPanel() { const { dashboard, setDashboard, jsonOpen } = useBuilderStore(); const [text, setText] = useState(JSON.stringify(dashboard, null, 2)); const [error, setError] = useState(''); useEffect(() => setText(JSON.stringify(dashboard, null, 2)), [dashboard]); if (!jsonOpen) return null; return <section className="pg-json"><div><strong>Dashboard JSON</strong><span>{error}</span></div><textarea value={text} onChange={(e) => { setText(e.target.value); try { const next = JSON.parse(e.target.value) as DashboardConfig; if (!Array.isArray(next.widgets)) throw new Error('widgets must be an array'); setDashboard(next); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invalid JSON'); } }} /></section>; }

export function DashboardBuilder({ initialDashboard }: { initialDashboard: DashboardConfig }) { useEffect(() => useBuilderStore.getState().setDashboard(initialDashboard, false), [initialDashboard]); useEffect(() => { const handler = (e: KeyboardEvent) => { const state = useBuilderStore.getState(); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? state.redo() : state.undo(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && state.selectedId) state.copy(state.selectedId); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') state.paste(); if (e.key === 'Delete' && state.selectedId) state.remove(state.selectedId); const widget = state.dashboard.widgets.find((item) => item.id === state.selectedId); if (widget && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const distance = e.shiftKey ? 10 : 1; const delta = e.key === 'ArrowUp' ? { y: Math.max(0, widget.position.y - distance) } : e.key === 'ArrowDown' ? { y: widget.position.y + distance } : e.key === 'ArrowLeft' ? { x: Math.max(0, widget.position.x - distance) } : { x: Math.min(12 - widget.position.w, widget.position.x + distance) }; state.updatePosition(widget.id, { ...widget.position, ...delta }); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []); const { dark, preview, dashboard } = useBuilderStore(); return <div className={`pg-app ${dark ? 'dark' : ''} ${preview ? 'previewing' : ''}`}><Toolbar /><div className="pg-workspace"><Library /><Canvas />{!preview && <Inspector />}</div><JsonPanel /><footer>{dashboard.widgets.length} widgets · {preview ? 'Preview mode' : 'Edit mode'} · Autosave ready</footer></div>; }
