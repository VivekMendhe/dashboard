import { memo } from 'react';
import { AreaChart, Area, BarChart, Bar, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { registerWidget, type WidgetDefinition, type WidgetRenderProps } from '@dashboard-generator/core';

const colors = ['#2563eb','#7c3aed','#16a34a','#d97706','#db2777','#0891b2'];
const Chart = ({ kind, ...props }: WidgetRenderProps & { kind: 'bar'|'line'|'area'|'pie'|'donut' }) => {
  const { data, widget, theme } = props; const options = widget.options ?? {}; const xKey = String(options.xKey ?? 'name'); const yKey = String(options.yKey ?? 'value'); const color = String(options.color ?? theme.primary);
  if (!data.length) return <Empty {...props} />;
  if (kind === 'pie' || kind === 'donut') return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey={yKey} nameKey={xKey} innerRadius={kind === 'donut' ? '55%' : 0} outerRadius="80%" paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>;
  const common = <><CartesianGrid stroke={theme.border} strokeDasharray="3 3" /><XAxis dataKey={xKey} stroke={theme.mutedText} /><YAxis stroke={theme.mutedText} /><Tooltip /><Legend /></>;
  if (kind === 'bar') return <ResponsiveContainer width="100%" height="100%"><BarChart data={data}>{common}<Bar dataKey={yKey} fill={color} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
  if (kind === 'line') return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}>{common}<Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>{common}<Area type="monotone" dataKey={yKey} stroke={color} fill={color} fillOpacity={.2} /></AreaChart></ResponsiveContainer>;
};
const Empty = ({ widget }: WidgetRenderProps) => <div className="dg-empty">{String(widget.options?.message ?? 'No data available')}</div>;
const Kpi = ({ widget, data, theme }: WidgetRenderProps) => { const o = widget.options ?? {}; const key = String(o.valueKey ?? 'value'); const value = o.value ?? data[0]?.[key] ?? '—'; return <div className="dg-kpi"><span>{String(o.label ?? widget.title ?? 'Metric')}</span><strong style={{ color: String(o.color ?? theme.primary) }}>{String(o.prefix ?? '')}{String(value)}{String(o.suffix ?? '')}</strong>{o.trend || o.change ? <small>{String(o.trend ?? o.change)}</small> : null}</div> };
const Table = ({ widget, data }: WidgetRenderProps) => { const columns = (widget.options?.columns as string[] | undefined) ?? Object.keys(data[0] ?? {}); return data.length ? <div className="dg-table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{data.map((row,i) => <tr key={i}>{columns.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>)}</tbody></table></div> : <Empty widget={widget} data={data} loading={false} filters={{}} theme={{} as never} /> };
const Text = ({ widget }: WidgetRenderProps) => <div className="dg-text">{String(widget.options?.content ?? widget.title ?? '')}</div>;
const Divider = () => <hr className="dg-divider" />;
const Loading = () => <div className="dg-empty">Loading…</div>;
const ErrorWidget = ({ widget }: WidgetRenderProps) => <div className="dg-error">{String(widget.options?.message ?? 'Unable to load this widget')}</div>;
const definitions: WidgetDefinition[] = [
  { type:'kpi', name:'KPI Card', renderer:Kpi }, { type:'bar', name:'Bar Chart', renderer:(p) => <Chart {...p} kind="bar" /> }, { type:'line', name:'Line Chart', renderer:(p) => <Chart {...p} kind="line" /> }, { type:'area', name:'Area Chart', renderer:(p) => <Chart {...p} kind="area" /> }, { type:'pie', name:'Pie Chart', renderer:(p) => <Chart {...p} kind="pie" /> }, { type:'donut', name:'Donut Chart', renderer:(p) => <Chart {...p} kind="donut" /> }, { type:'table', name:'Table', renderer:Table }, { type:'text', name:'Text', renderer:Text }, { type:'divider', name:'Divider', renderer:Divider }, { type:'empty', name:'Empty State', renderer:Empty }, { type:'loading', name:'Loading', renderer:Loading }, { type:'error', name:'Error', renderer:ErrorWidget }
];
definitions.forEach(registerWidget);
export { definitions as builtInWidgets };
