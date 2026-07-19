import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { AreaChart, Area, BarChart, Bar, CartesianGrid, Cell, Funnel, FunnelChart, Legend, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, Sankey, Scatter, ScatterChart, Treemap, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { registerWidget, type WidgetDefinition, type WidgetRenderProps } from '@dashboard-generator/core';

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const colors = ['#2563eb','#7c3aed','#16a34a','#d97706','#db2777','#0891b2','#ea580c','#4f46e5','#059669','#e11d48'];
const Empty = ({ widget }: WidgetRenderProps) => <div className="dg-empty">{String(widget.options?.message ?? 'No data available')}</div>;
const pct = (v: number, max: number) => max > 0 ? Math.round((v / max) * 100) : 0;

/* ------------------------------------------------------------------ */
/*  Existing widgets                                                    */
/* ------------------------------------------------------------------ */

const Chart = ({ kind, ...props }: WidgetRenderProps & { kind: 'bar'|'line'|'area'|'pie'|'donut' }) => {
  const { data, widget, theme } = props; const options = widget.options ?? {}; const xKey = String(options.xKey ?? 'name'); const yKey = String(options.yKey ?? 'value'); const color = String(options.color ?? theme.primary);
  if (!data.length) return <Empty {...props} />;
  if (kind === 'pie' || kind === 'donut') return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey={yKey} nameKey={xKey} innerRadius={kind === 'donut' ? '55%' : 0} outerRadius="80%" paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>;
  const common = <><CartesianGrid stroke={theme.border} strokeDasharray="3 3" /><XAxis dataKey={xKey} stroke={theme.mutedText} /><YAxis stroke={theme.mutedText} /><Tooltip /><Legend /></>;
  if (kind === 'bar') return <ResponsiveContainer width="100%" height="100%"><BarChart data={data}>{common}<Bar dataKey={yKey} fill={color} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
  if (kind === 'line') return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}>{common}<Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>{common}<Area type="monotone" dataKey={yKey} stroke={color} fill={color} fillOpacity={.2} /></AreaChart></ResponsiveContainer>;
};

const Kpi = ({ widget, data, theme }: WidgetRenderProps) => { const o = widget.options ?? {}; const key = String(o.valueKey ?? 'value'); const value = o.value ?? data[0]?.[key] ?? '—'; return <div className="dg-kpi"><span>{String(o.label ?? widget.title ?? 'Metric')}</span><strong style={{ color: String(o.color ?? theme.primary) }}>{String(o.prefix ?? '')}{String(value)}{String(o.suffix ?? '')}</strong>{o.trend || o.change ? <small>{String(o.trend ?? o.change)}</small> : null}</div> };
const Table = ({ widget, data }: WidgetRenderProps) => { const columns = (widget.options?.columns as string[] | undefined) ?? Object.keys(data[0] ?? {}); return data.length ? <div className="dg-table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{data.map((row,i) => <tr key={i}>{columns.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>)}</tbody></table></div> : <Empty widget={widget} data={data} loading={false} filters={{}} theme={{} as never} /> };
const Text = ({ widget }: WidgetRenderProps) => <div className="dg-text">{String(widget.options?.content ?? widget.title ?? '')}</div>;
const Divider = () => <hr className="dg-divider" />;
const Loading = () => <div className="dg-empty">Loading…</div>;
const ErrorWidget = ({ widget }: WidgetRenderProps) => <div className="dg-error">{String(widget.options?.message ?? 'Unable to load this widget')}</div>;

/* ------------------------------------------------------------------ */
/*  New chart widgets                                                   */
/* ------------------------------------------------------------------ */

/* Gauge – SVG arc gauge */
const Gauge = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const value = Number(o.value ?? data[0]?.[String(o.valueKey ?? 'value')] ?? 0);
  const min = Number(o.min ?? 0);
  const max = Number(o.max ?? 100);
  const color = String(o.color ?? theme.primary);
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / (max - min || 1);
  const angle = -90 + ratio * 180;
  const r = 70, cx = 100, cy = 90;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (startDeg: number, endDeg: number) => {
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const needleX = cx + (r - 10) * Math.cos(toRad(angle));
  const needleY = cy + (r - 10) * Math.sin(toRad(angle));
  return (
    <div className="dg-gauge">
      <svg viewBox="0 0 200 120" width="100%" height="100%">
        <path d={arcPath(-180, 0)} fill="none" stroke={theme.border} strokeWidth="10" strokeLinecap="round" />
        <path d={arcPath(-180, angle)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={theme.text} strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill={theme.text} />
        <text x={cx} y={cy + 20} textAnchor="middle" fill={theme.text} fontSize="18" fontWeight="700" fontFamily="Inter,sans-serif">{clamped}</text>
        <text x={cx - 60} y={cy + 14} textAnchor="middle" fill={theme.mutedText} fontSize="9" fontFamily="Inter,sans-serif">{min}</text>
        <text x={cx + 60} y={cy + 14} textAnchor="middle" fill={theme.mutedText} fontSize="9" fontFamily="Inter,sans-serif">{max}</text>
      </svg>
    </div>
  );
};

/* Funnel */
const FunnelWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {}; const xKey = String(o.xKey ?? 'name'); const yKey = String(o.yKey ?? 'value');
  if (!data.length) return <Empty widget={widget} data={[]} loading={false} filters={{}} theme={theme} />;
  return <ResponsiveContainer width="100%" height="100%"><FunnelChart><Tooltip /><Legend /><Funnel dataKey={yKey} data={data} nameKey={xKey}>{data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Funnel></FunnelChart></ResponsiveContainer>;
};

/* Scatter */
const ScatterWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {}; const xKey = String(o.xKey ?? 'x'); const yKey = String(o.yKey ?? 'y'); const color = String(o.color ?? theme.primary);
  if (!data.length) return <Empty widget={widget} data={[]} loading={false} filters={{}} theme={theme} />;
  return <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid stroke={theme.border} strokeDasharray="3 3" /><XAxis dataKey={xKey} name="X" stroke={theme.mutedText} /><YAxis dataKey={yKey} name="Y" stroke={theme.mutedText} /><Tooltip /><Scatter data={data} fill={color} /></ScatterChart></ResponsiveContainer>;
};

/* Bubble – scatter with size key */
const BubbleWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {}; const xKey = String(o.xKey ?? 'x'); const yKey = String(o.yKey ?? 'y'); const zKey = String(o.zKey ?? 'z'); const color = String(o.color ?? theme.primary);
  if (!data.length) return <Empty widget={widget} data={[]} loading={false} filters={{}} theme={theme} />;
  return <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid stroke={theme.border} strokeDasharray="3 3" /><XAxis dataKey={xKey} name="X" stroke={theme.mutedText} /><YAxis dataKey={yKey} name="Y" stroke={theme.mutedText} /><Tooltip /><Scatter data={data} fill={color} fillOpacity={.6} /></ScatterChart></ResponsiveContainer>;
};

/* Heatmap – SVG grid */
const Heatmap = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {}; const xKey = String(o.xKey ?? 'name'); const yKey = String(o.yKey ?? 'category'); const vKey = String(o.valueKey ?? 'value');
  const xLabels = [...new Set(data.map((r) => String(r[xKey])))];
  const yLabels = [...new Set(data.map((r) => String(r[yKey])))];
  const vals = data.map((r) => Number(r[vKey] ?? 0));
  const max = Math.max(...vals, 1);
  const cellW = 100 / (xLabels.length || 1);
  const cellH = 100 / (yLabels.length || 1);
  return (
    <div className="dg-heatmap">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
        {data.map((r, i) => {
          const xi = xLabels.indexOf(String(r[xKey]));
          const yi = yLabels.indexOf(String(r[yKey]));
          const v = Number(r[vKey] ?? 0);
          const intensity = v / max;
          return <rect key={i} x={xi * cellW} y={yi * cellH} width={cellW} height={cellH} fill={`rgba(37,99,235,${0.1 + intensity * 0.9})`} rx="0.5" />;
        })}
      </svg>
      <div className="dg-heatmap-labels-x">{xLabels.map((l, i) => <span key={i} style={{ left: `${(i + 0.5) * cellW}%` }}>{l}</span>)}</div>
      <div className="dg-heatmap-labels-y">{yLabels.map((l, i) => <span key={i} style={{ top: `${(i + 0.5) * cellH}%` }}>{l}</span>)}</div>
    </div>
  );
};

/* Treemap */
const TreemapWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {}; const nameKey = String(o.xKey ?? 'name'); const sizeKey = String(o.yKey ?? 'value');
  if (!data.length) return <Empty widget={widget} data={[]} loading={false} filters={{}} theme={theme} />;
  const transformed = data.map((d, i) => ({ name: String(d[nameKey] ?? ''), size: Number(d[sizeKey] ?? 0), fill: colors[i % colors.length] }));
  return <ResponsiveContainer width="100%" height="100%"><Treemap data={transformed} dataKey="size" nameKey="name" stroke={theme.border} fill="transparent"><Tooltip /></Treemap></ResponsiveContainer>;
};

/* Radar */
const RadarWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {}; const xKey = String(o.xKey ?? 'name'); const yKey = String(o.yKey ?? 'value'); const color = String(o.color ?? theme.primary);
  if (!data.length) return <Empty widget={widget} data={[]} loading={false} filters={{}} theme={theme} />;
  return <ResponsiveContainer width="100%" height="100%"><RadarChart data={data}><PolarGrid stroke={theme.border} /><PolarAngleAxis dataKey={xKey} tick={{ fill: theme.mutedText, fontSize: 10 }} /><PolarRadiusAxis stroke={theme.border} /><Radar name="Value" dataKey={yKey} stroke={color} fill={color} fillOpacity={.25} /><Tooltip /><Legend /></RadarChart></ResponsiveContainer>;
};

/* Histogram – bar chart with auto-bins */
const HistogramWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {}; const key = String(o.valueKey ?? 'value'); const color = String(o.color ?? theme.primary); const bins = Number(o.bins ?? 10);
  const values = data.map((r) => Number(r[key] ?? 0));
  const min = Math.min(...values), max = Math.max(...values);
  const step = (max - min) / bins || 1;
  const bucketed = Array.from({ length: bins }, (_, i) => {
    const lo = min + i * step;
    const hi = lo + step;
    return { range: `${Math.round(lo)}`, count: values.filter((v) => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length };
  });
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={bucketed}><CartesianGrid stroke={theme.border} strokeDasharray="3 3" /><XAxis dataKey="range" stroke={theme.mutedText} fontSize={10} /><YAxis stroke={theme.mutedText} /><Tooltip /><Bar dataKey="count" fill={color} radius={[3,3,0,0]} /></BarChart></ResponsiveContainer>;
};

/* ------------------------------------------------------------------ */
/*  Financial widgets                                                   */
/* ------------------------------------------------------------------ */

/* Waterfall – stacked bar chart */
const WaterfallWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {}; const xKey = String(o.xKey ?? 'name'); const yKey = String(o.yKey ?? 'value');
  const values = data.map((r) => Number(r[yKey] ?? 0));
  let cum = 0;
  const processed = data.map((r, i) => {
    const v = Number(r[yKey] ?? 0);
    const start = v >= 0 ? cum : cum + v;
    cum += v;
    return { name: String(r[xKey] ?? ''), increase: v >= 0 ? v : 0, decrease: v < 0 ? Math.abs(v) : 0, invisible: v >= 0 ? start : cum };
  });
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={processed}><CartesianGrid stroke={theme.border} strokeDasharray="3 3" /><XAxis dataKey="name" stroke={theme.mutedText} /><YAxis stroke={theme.mutedText} /><Tooltip /><Legend /><Bar dataKey="invisible" stackId="a" fill="transparent" /><Bar dataKey="increase" stackId="a" fill="#16a34a" radius={[3,3,0,0]} /><Bar dataKey="decrease" stackId="a" fill="#dc2626" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer>;
};

/* Candlestick – SVG */
const CandlestickWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const xKey = String(o.xKey ?? 'name');
  const w = 16, gap = 4;
  const items = data.map((r) => ({ label: String(r[xKey] ?? ''), open: Number(r.open ?? 0), close: Number(r.close ?? 0), high: Number(r.high ?? 0), low: Number(r.low ?? 0) }));
  const allVals = items.flatMap((d) => [d.high, d.low]);
  const hi = Math.max(...allVals, 1), lo = Math.min(...allVals, 0);
  const h = 100 / (hi - lo || 1);
  const totalW = items.length * (w + gap);
  return (
    <div className="dg-candlestick">
      <svg viewBox={`0 0 ${totalW} 100`} preserveAspectRatio="none" width="100%" height="100%">
        {items.map((d, i) => {
          const x = i * (w + gap) + gap / 2;
          const bull = d.close >= d.open;
          const bodyTop = Math.max(d.open, d.close);
          const bodyBot = Math.min(d.open, d.close);
          const y1 = (hi - d.high) * h;
          const y2 = (hi - bodyTop) * h;
          const y3 = (hi - bodyBot) * h;
          const y4 = (hi - d.low) * h;
          const fill = bull ? '#16a34a' : '#dc2626';
          return <g key={i}><line x1={x + w / 2} y1={y1} x2={x + w / 2} y2={y2} stroke={fill} strokeWidth="1" /><rect x={x} y={y2} width={w} height={Math.max(y3 - y2, 1)} fill={fill} rx="1" /><line x1={x + w / 2} y1={y3} x2={x + w / 2} y2={y4} stroke={fill} strokeWidth="1" /></g>;
        })}
      </svg>
      <div className="dg-candlestick-labels">{items.map((d, i) => <span key={i} style={{ left: `${(i + 0.5) * (100 / items.length)}%` }}>{d.label}</span>)}</div>
    </div>
  );
};

/* Sankey – recharts Sankey */
const SankeyWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  if (!data.length) return <Empty widget={widget} data={[]} loading={false} filters={{}} theme={theme} />;
  const nodes = [...new Set(data.flatMap((d) => [String(d.source ?? ''), String(d.target ?? '')]))].map((name) => ({ name }));
  const links = data.map((d) => ({ source: nodes.findIndex((n) => n.name === String(d.source ?? '')), target: nodes.findIndex((n) => n.name === String(d.target ?? '')), value: Number(d.value ?? 1) })).filter((l) => l.source >= 0 && l.target >= 0);
  const sankeyData = { nodes, links };
  return <ResponsiveContainer width="100%" height="100%"><Sankey data={sankeyData} node={<rect fill={theme.primary} />} nodePadding={20} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}><Tooltip /></Sankey></ResponsiveContainer>;
};

/* Sunburst – SVG concentric rings */
const SunburstWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const nameKey = String(o.xKey ?? 'name');
  const valueKey = String(o.yKey ?? 'value');
  const total = data.reduce((s, r) => s + Number(r[valueKey] ?? 0), 0) || 1;
  const cx = 50, r1 = 18, r2 = 42;
  let startAngle = -90;
  const arcs = data.map((r, i) => {
    const val = Number(r[valueKey] ?? 0);
    const sweep = (val / total) * 360;
    const sa = startAngle;
    startAngle += sweep;
    const large = sweep > 180 ? 1 : 0;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1o = cx + r2 * Math.cos(toRad(sa)), y1o = cx + r2 * Math.sin(toRad(sa));
    const x2o = cx + r2 * Math.cos(toRad(sa + sweep)), y2o = cx + r2 * Math.sin(toRad(sa + sweep));
    const x1i = cx + r1 * Math.cos(toRad(sa + sweep)), y1i = cx + r1 * Math.sin(toRad(sa + sweep));
    const x2i = cx + r1 * Math.cos(toRad(sa)), y2i = cx + r1 * Math.sin(toRad(sa));
    return { d: `M ${x1o} ${y1o} A ${r2} ${r2} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${r1} ${r1} 0 ${large} 0 ${x2i} ${y2i} Z`, fill: colors[i % colors.length], label: String(r[nameKey] ?? ''), pct: pct(val, total) };
  });
  return (
    <div className="dg-sunburst">
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        {arcs.map((a, i) => <path key={i} d={a.d} fill={a.fill} stroke={theme.background} strokeWidth="0.5" />)}
        <circle cx={cx} cy={cx} r={r1 - 1} fill={theme.background} />
        <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle" fill={theme.text} fontSize="5" fontWeight="600" fontFamily="Inter,sans-serif">{total}</text>
      </svg>
      <div className="dg-sunburst-legend">{arcs.map((a, i) => <span key={i}><i style={{ background: a.fill }} />{a.label} {a.pct}%</span>)}</div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Media / layout widgets                                              */
/* ------------------------------------------------------------------ */

/* Map – placeholder with coord display */
const MapWidget = ({ widget }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const lat = String(o.latitude ?? '0');
  const lng = String(o.longitude ?? '0');
  const zoom = Number(o.zoom ?? 12);
  return (
    <div className="dg-map">
      <div className="dg-map-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>
        <span>{lat}, {lng}</span>
        <small>Zoom: {zoom}</small>
      </div>
    </div>
  );
};

/* Markdown */
const MarkdownWidget = ({ widget }: WidgetRenderProps) => {
  const content = String(widget.options?.content ?? '');
  const html = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/^- (.+)$/gm, '<li>$1</li>').replace(/\n/g, '<br />');
  return <div className="dg-markdown" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
};

/* Image */
const ImageWidget = ({ widget }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const src = String(o.src ?? o.url ?? '');
  const alt = String(o.alt ?? widget.title ?? 'Image');
  const fit = String(o.objectFit ?? 'cover');
  return src ? <div className="dg-image-wrap"><img src={src} alt={alt} style={{ objectFit: fit }} /></div> : <Empty widget={widget} data={[]} loading={false} filters={{}} theme={{} as never} />;
};

/* Video */
const VideoWidget = ({ widget }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const src = String(o.src ?? o.url ?? '');
  const type = String(o.type ?? 'video/mp4');
  return src ? <div className="dg-video-wrap"><video src={src} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} /><source src={src} type={type} /></div> : <Empty widget={widget} data={[]} loading={false} filters={{}} theme={{} as never} />;
};

/* Iframe */
const IframeWidget = ({ widget }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const src = String(o.src ?? o.url ?? '');
  return src ? <iframe src={src} title={widget.title ?? 'Embedded content'} style={{ width: '100%', height: '100%', border: 'none' }} sandbox="allow-scripts" /> : <Empty widget={widget} data={[]} loading={false} filters={{}} theme={{} as never} />;
};

/* ------------------------------------------------------------------ */
/*  Utility widgets                                                     */
/* ------------------------------------------------------------------ */

/* Progress – circular or linear */
const ProgressWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const value = Number(o.value ?? data[0]?.[String(o.valueKey ?? 'value')] ?? 0);
  const max = Number(o.max ?? 100);
  const color = String(o.color ?? theme.primary);
  const mode = String(o.mode ?? 'circular');
  const clamped = Math.max(0, Math.min(max, value));
  if (mode === 'linear') {
    const ratio = pct(clamped, max);
    return (
      <div className="dg-progress-linear">
        <div className="dg-progress-linear-track"><div className="dg-progress-linear-fill" style={{ width: `${ratio}%`, background: color }} /></div>
        <span className="dg-progress-value">{clamped}<small>/{max}</small></span>
      </div>
    );
  }
  const r = 38, stroke = 6, circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / (max || 1)) * circumference;
  return (
    <div className="dg-progress-circular">
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <circle cx="50" cy="50" r={r} fill="none" stroke={theme.border} strokeWidth={stroke} />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset .4s ease' }} />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill={theme.text} fontSize="16" fontWeight="700" fontFamily="Inter,sans-serif">{clamped}</text>
      </svg>
    </div>
  );
};

/* Timeline */
const TimelineWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const timeKey = String(o.timeKey ?? 'date');
  const labelKey = String(o.labelKey ?? 'name');
  const descKey = String(o.descKey ?? 'description');
  if (!data.length) return <Empty widget={widget} data={[]} loading={false} filters={{}} theme={theme} />;
  return (
    <div className="dg-timeline">
      {data.map((r, i) => (
        <div key={i} className="dg-timeline-item">
          <div className="dg-timeline-dot" style={{ background: colors[i % colors.length] }} />
          <div className="dg-timeline-content">
            <strong>{String(r[labelKey] ?? '')}</strong>
            <small>{String(r[timeKey] ?? '')}</small>
            {r[descKey] ? <p>{String(r[descKey])}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
};

/* Calendar */
const CalendarWidget = ({ widget, data, theme }: WidgetRenderProps) => {
  const o = widget.options ?? {};
  const dateKey = String(o.dateKey ?? 'date');
  const titleKey = String(o.titleKey ?? 'name');
  const now = new Date();
  const year = Number(o.year ?? now.getFullYear());
  const month = Number(o.month ?? now.getMonth());
  const monthName = new Date(year, month).toLocaleString('en', { month: 'long' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const events = new Map(data.filter((r) => String(r[dateKey] ?? '').startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).map((r) => [Number(String(r[dateKey]).split('-')[2]), String(r[titleKey] ?? '')]));
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} className="dg-cal-empty" />);
  for (let d = 1; d <= daysInMonth; d++) cells.push(<div key={d} className={`dg-cal-day ${d === now.getDate() && month === now.getMonth() && year === now.getFullYear() ? 'today' : ''} ${events.has(d) ? 'has-event' : ''}`} title={events.get(d)}><span>{d}</span>{events.has(d) && <small>{events.get(d)}</small>}</div>);
  return (
    <div className="dg-calendar">
      <div className="dg-cal-header"><strong>{monthName} {year}</strong></div>
      <div className="dg-cal-weekdays">{['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="dg-cal-grid">{cells}</div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Register all                                                        */
/* ------------------------------------------------------------------ */

const definitions: WidgetDefinition[] = [
  /* Existing */
  { type: 'kpi', name: 'KPI Card', renderer: Kpi },
  { type: 'bar', name: 'Bar Chart', renderer: (p) => <Chart {...p} kind="bar" /> },
  { type: 'line', name: 'Line Chart', renderer: (p) => <Chart {...p} kind="line" /> },
  { type: 'area', name: 'Area Chart', renderer: (p) => <Chart {...p} kind="area" /> },
  { type: 'pie', name: 'Pie Chart', renderer: (p) => <Chart {...p} kind="pie" /> },
  { type: 'donut', name: 'Donut Chart', renderer: (p) => <Chart {...p} kind="donut" /> },
  { type: 'table', name: 'Table', renderer: Table },
  { type: 'text', name: 'Text', renderer: Text },
  { type: 'divider', name: 'Divider', renderer: Divider },
  /* Charts */
  { type: 'gauge', name: 'Gauge', renderer: Gauge },
  { type: 'funnel', name: 'Funnel', renderer: FunnelWidget },
  { type: 'scatter', name: 'Scatter', renderer: ScatterWidget },
  { type: 'bubble', name: 'Bubble', renderer: BubbleWidget },
  { type: 'heatmap', name: 'Heatmap', renderer: Heatmap },
  { type: 'treemap', name: 'Treemap', renderer: TreemapWidget },
  { type: 'radar', name: 'Radar', renderer: RadarWidget },
  { type: 'histogram', name: 'Histogram', renderer: HistogramWidget },
  /* Financial */
  { type: 'waterfall', name: 'Waterfall', renderer: WaterfallWidget },
  { type: 'candlestick', name: 'Candlestick', renderer: CandlestickWidget },
  { type: 'sankey', name: 'Sankey', renderer: SankeyWidget },
  { type: 'sunburst', name: 'Sunburst', renderer: SunburstWidget },
  /* Media */
  { type: 'map', name: 'Map', renderer: MapWidget },
  { type: 'markdown', name: 'Markdown', renderer: MarkdownWidget },
  { type: 'image', name: 'Image', renderer: ImageWidget },
  { type: 'video', name: 'Video', renderer: VideoWidget },
  { type: 'iframe', name: 'Iframe', renderer: IframeWidget },
  /* Utility */
  { type: 'progress', name: 'Progress', renderer: ProgressWidget },
  { type: 'timeline', name: 'Timeline', renderer: TimelineWidget },
  { type: 'calendar', name: 'Calendar', renderer: CalendarWidget },
];

definitions.forEach(registerWidget);
export { definitions as builtInWidgets };
