/* ================================================================== */
/*  AI Web Worker – offloads data analysis & suggestion generation      */
/* ================================================================== */

interface WorkerMessage {
  id: string;
  type: 'analyze' | 'suggest_charts' | 'suggest_kpis' | 'suggest_filters' | 'suggest_calcs' | 'generate_dashboard';
  input: unknown;
}

/* ---- stats helpers ---- */

function computeStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return { min: sorted[0], max: sorted[sorted.length - 1], mean, median, std, sum, q1: sorted[Math.floor(sorted.length * 0.25)], q3: sorted[Math.floor(sorted.length * 0.75)] };
}

function detectType(values: unknown[]): string {
  const sample = values.filter((v) => v !== null && v !== undefined && v !== '').slice(0, 200);
  if (sample.length === 0) return 'string';
  let num = 0, date = 0, bool = 0;
  const boolRe = /^(true|false|yes|no|0|1)$/i;
  const dateRe = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/;
  for (const v of sample) {
    const s = String(v).trim();
    if (boolRe.test(s)) { bool++; continue; }
    if (s !== '' && !isNaN(Number(s)) && isFinite(Number(s))) { num++; continue; }
    if (dateRe.test(s)) { date++; continue; }
  }
  const t = sample.length;
  if (num / t > 0.85) return 'number';
  if (date / t > 0.8) return 'date';
  if (bool / t > 0.8) return 'boolean';
  return 'string';
}

function topValues(values: unknown[], limit = 10) {
  const freq = new Map<string, number>();
  for (const v of values) { const s = v === null || v === undefined ? '(null)' : String(v); freq.set(s, (freq.get(s) ?? 0) + 1); }
  const total = values.length;
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value, count]) => ({ value, count, pct: Math.round((count / total) * 100) }));
}

/* ---- main handler ---- */

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { id, type, input } = e.data;
  try {
    let result: unknown;
    switch (type) {
      case 'analyze': {
        const data = input as Array<Record<string, unknown>>;
        const keys = [...new Set(data.flatMap((r) => Object.keys(r)))];
        const columns = keys.map((name) => {
          const values = data.map((r) => r[name]);
          const type_ = detectType(values);
          const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
          const uniqueSet = new Set(nonNull.map(String));
          const col: Record<string, unknown> = { name, type: type_, nullable: nonNull.length < values.length, totalCount: values.length, uniqueCount: uniqueSet.size, nullCount: values.length - nonNull.length };
          if (type_ === 'number') Object.assign(col, computeStats(nonNull.map(Number).filter(isFinite)));
          if (type_ !== 'number' && type_ !== 'boolean') col.topValues = topValues(nonNull);
          const lc = name.toLowerCase();
          col.isId = ['id', 'key', 'uuid', '_id', 'pk'].includes(lc) || (type_ === 'number' && uniqueSet.size === values.length);
          return col;
        });
        const numericCols = columns.filter((c) => c.type === 'number' && !c.isId).map((c) => c.name);
        const categoricalCols = columns.filter((c) => c.type === 'string').map((c) => c.name);
        const dateCols = columns.filter((c) => c.type === 'date').map((c) => c.name);
        const lowCardinalityCols = columns.filter((c) => c.type === 'string' && (c.uniqueCount as number) <= 10).map((c) => c.name);
        result = { columns, rowCount: data.length, tableName: '', numericCols, categoricalCols, dateCols, booleanCols: columns.filter((c) => c.type === 'boolean').map((c) => c.name), highCardinalityCols: columns.filter((c) => c.type === 'string' && (c.uniqueCount as number) > 20).map((c) => c.name), lowCardinalityCols, correlations: [] };
        break;
      }
      case 'suggest_charts': {
        const analysis = input as { columns: Array<{ name: string; type: string; isId?: boolean; uniqueCount: number; min?: number; max?: number }>; numericCols: string[]; categoricalCols: string[]; dateCols: string[]; lowCardinalityCols: string[] };
        const sugs: unknown[] = [];
        let id = 0;
        for (const num of analysis.numericCols.slice(0, 5)) {
          if (analysis.dateCols.length > 0) {
            sugs.push({ id: `w-${++id}`, type: 'line', title: `${num} over time`, description: `Trend of ${num}`, confidence: 0.9, reasoning: 'Numeric over time = line chart', x: analysis.dateCols[0], y: num, yAgg: 'avg' });
          }
          for (const cat of analysis.lowCardinalityCols.slice(0, 3)) {
            sugs.push({ id: `w-${++id}`, type: 'bar', title: `${num} by ${cat}`, description: `Compare ${num} across ${cat}`, confidence: 0.85, reasoning: 'Bar chart for categorical comparison', x: cat, y: num, yAgg: 'sum' });
          }
          sugs.push({ id: `w-${++id}`, type: 'kpi', title: `Total ${num}`, description: `Sum of ${num}`, confidence: 0.95, reasoning: 'Key metric', y: num, yAgg: 'sum' });
        }
        if (analysis.lowCardinalityCols.length > 0) {
          sugs.push({ id: `w-${++id}`, type: 'pie', title: `${analysis.lowCardinalityCols[0]} distribution`, description: 'Proportions', confidence: 0.8, reasoning: 'Pie for few categories', x: analysis.lowCardinalityCols[0] });
        }
        if (analysis.numericCols.length >= 2) {
          sugs.push({ id: `w-${++id}`, type: 'scatter', title: `${analysis.numericCols[0]} vs ${analysis.numericCols[1]}`, description: 'Relationship', confidence: 0.7, reasoning: 'Scatter for correlation', x: analysis.numericCols[0], y: analysis.numericCols[1] });
        }
        sugs.push({ id: `w-${++id}`, type: 'table', title: 'Data table', description: 'Full table', confidence: 0.6, reasoning: 'Detailed view' });
        result = sugs;
        break;
      }
      case 'suggest_kpis': {
        const analysis = input as { numericCols: string[]; columns: Array<{ name: string; mean?: number }> };
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        const icons = ['$', '#', '%', '\u2191', '\u2193', '\u2605', '\u25cf', '\u25a0'];
        const kpis = analysis.numericCols.slice(0, 6).map((col, i) => {
          const stat = analysis.columns.find((c) => c.name === col);
          return { id: `kpi-${i}`, title: `Total ${col}`, field: col, aggregation: 'sum', color: colors[i % colors.length], icon: icons[i % icons.length], description: `Sum of ${col}` };
        });
        result = kpis;
        break;
      }
      case 'suggest_filters': {
        const analysis = input as { dateCols: string[]; lowCardinalityCols: string[]; numericCols: string[]; columns: Array<{ name: string; topValues?: Array<{ value: string }>; min?: number; max?: number; isId?: boolean }> };
        const filters: unknown[] = [];
        for (const d of analysis.dateCols.slice(0, 2)) filters.push({ id: `f-${d}`, field: d, filterType: 'daterange', label: `${d} range`, defaultEnabled: true });
        for (const c of analysis.lowCardinalityCols.slice(0, 4)) {
          const col = analysis.columns.find((x) => x.name === c);
          if (col?.topValues) filters.push({ id: `f-${c}`, field: c, filterType: col.topValues.length <= 8 ? 'select' : 'multiselect', label: c, options: col.topValues.slice(0, 20).map((tv) => tv.value), defaultEnabled: true });
        }
        result = filters;
        break;
      }
      default:
        result = null;
    }
    self.postMessage({ id, type: 'result', result });
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};
