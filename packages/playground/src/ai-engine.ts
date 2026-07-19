import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { DashboardConfig, DataRecord, WidgetConfig } from '@dashboard-generator/core';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export type ColType = 'string' | 'number' | 'date' | 'boolean';

export interface DataColumn {
  name: string;
  type: ColType;
  nullable: boolean;
  totalCount: number;
  uniqueCount: number;
  nullCount: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  sum?: number;
  q1?: number;
  q3?: number;
  topValues?: Array<{ value: string; count: number; pct: number }>;
  minDate?: string;
  maxDate?: string;
  dateFormat?: string;
  isId?: boolean;
  isMonotonic?: boolean;
}

export interface DataAnalysis {
  columns: DataColumn[];
  rowCount: number;
  tableName: string;
  numericCols: string[];
  categoricalCols: string[];
  dateCols: string[];
  booleanCols: string[];
  highCardinalityCols: string[];
  lowCardinalityCols: string[];
  correlations: Array<{ col1: string; col2: string; r: number }>;
}

export interface ChartSuggestion {
  id: string;
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'histogram' | 'kpi' | 'table' | 'heatmap' | 'funnel' | 'radar';
  title: string;
  description: string;
  confidence: number;
  reasoning: string;
  config: Partial<WidgetConfig>;
  x?: string;
  y?: string;
  yAgg?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  groupBy?: string;
  filters?: Array<{ field: string; op: string; value: unknown }>;
}

export interface KPISuggestion {
  id: string;
  title: string;
  field: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  format: string;
  color: string;
  icon: string;
  description: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface FilterSuggestion {
  id: string;
  field: string;
  filterType: 'select' | 'multiselect' | 'range' | 'daterange' | 'text';
  label: string;
  options?: string[];
  min?: number;
  max?: number;
  defaultEnabled: boolean;
}

export interface CalcFieldSuggestion {
  id: string;
  name: string;
  formula: string;
  description: string;
  category: string;
}

export interface NLResult {
  intent: string;
  confidence: number;
  response: string;
  actions: NLAction[];
}

export interface NLAction {
  type: 'add_widget' | 'add_filter' | 'add_kpi' | 'modify_widget' | 'remove_widget' | 'generate_all' | 'explain' | 'generate_calc_field' | 'set_title' | 'set_layout';
  payload: Record<string, unknown>;
}

export interface DashboardBlueprint {
  title: string;
  description: string;
  widgets: WidgetConfig[];
  variables: Array<{ id: string; name: string; defaultValue: unknown }>;
  datasets: Array<{ id: string; name: string; datasource: { kind: 'static'; data: DataRecord[] } }>;
}

/* ================================================================== */
/*  File Parsers                                                        */
/* ================================================================== */

export function parseCSV(text: string): DataRecord[] {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true, transformHeader: (h) => h.trim() });
  return (result.data as DataRecord[]).filter((row) => Object.values(row).some((v) => v !== null && v !== ''));
}

export function parseExcel(buffer: ArrayBuffer, sheetName?: string): DataRecord[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const name = sheetName ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: null }) as DataRecord[];
}

export function getExcelSheetNames(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: 'array', bookSheets: true });
  return wb.SheetNames;
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/* ================================================================== */
/*  Column Type Detection                                               */
/* ================================================================== */

const ISO_DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(T|\s)\d{1,2}:\d{2}(:\d{2})?/;
const DATE_LIKE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;
const BOOLEAN_LIKE_RE = /^(true|false|yes|no|0|1)$/i;

function detectColumnType(values: unknown[], name: string): ColType {
  const sample = values.filter((v) => v !== null && v !== undefined && v !== '').slice(0, 200);
  if (sample.length === 0) return 'string';

  let numCount = 0;
  let dateCount = 0;
  let boolCount = 0;

  for (const v of sample) {
    const s = String(v).trim();
    if (BOOLEAN_LIKE_RE.test(s)) { boolCount++; continue; }
    const n = Number(s);
    if (s !== '' && !isNaN(n) && isFinite(n)) { numCount++; continue; }
    if (DATE_LIKE_RE.test(s) || ISO_DATE_RE.test(s)) { dateCount++; continue; }
  }

  const total = sample.length;
  if (numCount / total > 0.85) return 'number';
  if (dateCount / total > 0.8) return 'date';
  if (boolCount / total > 0.8) return 'boolean';
  return 'string';
}

function isIdColumn(name: string, col: Partial<DataColumn>): boolean {
  const lc = name.toLowerCase();
  if (['id', 'key', 'uuid', 'index', '_id', 'pk'].includes(lc)) return true;
  if (col.uniqueCount === col.totalCount && col.type === 'number') return true;
  return false;
}

function isMonotonic(values: number[]): boolean {
  if (values.length < 3) return false;
  let inc = true;
  let dec = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) inc = false;
    if (values[i] > values[i - 1]) dec = false;
    if (!inc && !dec) break;
  }
  return inc || dec;
}

/* ================================================================== */
/*  Statistics                                                          */
/* ================================================================== */

function computeStats(values: (number | null | undefined)[]): Pick<DataColumn, 'min' | 'max' | 'mean' | 'median' | 'std' | 'sum' | 'q1' | 'q3'> {
  const nums = values.filter((v): v is number => v !== null && v !== undefined && !isNaN(Number(v)) && isFinite(Number(v)));
  if (nums.length === 0) return {};
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / nums.length;
  const std = Math.sqrt(variance);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return { min: sorted[0], max: sorted[sorted.length - 1], mean, median, std, sum, q1, q3 };
}

function computeTopValues(values: unknown[], limit = 10): Array<{ value: string; count: number; pct: number }> {
  const freq = new Map<string, number>();
  for (const v of values) {
    const s = v === null || v === undefined ? '(null)' : String(v);
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  const total = values.length;
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count, pct: Math.round((count / total) * 100) }));
}

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

/* ================================================================== */
/*  Data Analysis                                                       */
/* ================================================================== */

export function analyzeData(data: DataRecord[], tableName: string): DataAnalysis {
  if (data.length === 0) return { columns: [], rowCount: 0, tableName, numericCols: [], categoricalCols: [], dateCols: [], booleanCols: [], highCardinalityCols: [], lowCardinalityCols: [], correlations: [] };

  const allKeys = new Set<string>();
  data.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)));
  const colNames = [...allKeys];

  const columns: DataColumn[] = colNames.map((name) => {
    const values = data.map((r) => r[name]);
    const type = detectColumnType(values, name);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
    const uniqueSet = new Set(nonNull.map(String));
    const col: DataColumn = {
      name,
      type,
      nullable: nonNull.length < values.length,
      totalCount: values.length,
      uniqueCount: uniqueSet.size,
      nullCount: values.length - nonNull.length,
    };

    if (type === 'number') {
      const stats = computeStats(values.map(Number));
      Object.assign(col, stats);
    } else if (type === 'date') {
      const strDates = nonNull.map(String).sort();
      col.minDate = strDates[0];
      col.maxDate = strDates[strDates.length - 1];
    } else {
      col.topValues = computeTopValues(nonNull);
    }

    col.isId = isIdColumn(name, col);
    if (type === 'number') {
      const nums = nonNull.map(Number).filter(isFinite);
      col.isMonotonic = isMonotonic(nums);
    }
    return col;
  });

  const numericCols = columns.filter((c) => c.type === 'number' && !c.isId).map((c) => c.name);
  const categoricalCols = columns.filter((c) => c.type === 'string').map((c) => c.name);
  const dateCols = columns.filter((c) => c.type === 'date').map((c) => c.name);
  const booleanCols = columns.filter((c) => c.type === 'boolean').map((c) => c.name);
  const highCardinalityCols = columns.filter((c) => c.type === 'string' && c.uniqueCount > 20).map((c) => c.name);
  const lowCardinalityCols = columns.filter((c) => c.type === 'string' && c.uniqueCount <= 10).map((c) => c.name);

  const correlations: Array<{ col1: string; col2: string; r: number }> = [];
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const x = data.map((r) => Number(r[numericCols[i]]) || 0);
      const y = data.map((r) => Number(r[numericCols[j]]) || 0);
      const r = pearson(x, y);
      if (Math.abs(r) > 0.3) correlations.push({ col1: numericCols[i], col2: numericCols[j], r: Math.round(r * 100) / 100 });
    }
  }
  correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  return { columns, rowCount: data.length, tableName, numericCols, categoricalCols, dateCols, booleanCols, highCardinalityCols, lowCardinalityCols, correlations };
}

/* ================================================================== */
/*  Chart Suggestions                                                   */
/* ================================================================== */

const uid = () => `sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function suggestCharts(analysis: DataAnalysis): ChartSuggestion[] {
  const suggestions: ChartSuggestion[] = [];
  const { columns, numericCols, categoricalCols, dateCols, lowCardinalityCols } = analysis;

  for (const numCol of numericCols.slice(0, 5)) {
    const col = columns.find((c) => c.name === numCol);
    if (!col) continue;

    if (dateCols.length > 0) {
      const dateCol = dateCols[0];
      suggestions.push({
        id: uid(), type: 'line', title: `${numCol} over time`,
        description: `Trend of ${numCol} across ${dateCol}`,
        confidence: 0.9, reasoning: 'Numeric value over time is best shown as a line chart',
        config: { type: 'chart', chartType: 'line', title: `${numCol} over time` },
        x: dateCol, y: numCol, yAgg: 'avg',
      });
      suggestions.push({
        id: uid(), type: 'area', title: `${numCol} area trend`,
        description: `Filled area showing ${numCol} trend over ${dateCol}`,
        confidence: 0.75, reasoning: 'Area chart emphasizes volume over time',
        config: { type: 'chart', chartType: 'area', title: `${numCol} area trend` },
        x: dateCol, y: numCol, yAgg: 'sum',
      });
    }

    for (const catCol of lowCardinalityCols.slice(0, 3)) {
      suggestions.push({
        id: uid(), type: 'bar', title: `${numCol} by ${catCol}`,
        description: `Compare ${numCol} across ${catCol} categories`,
        confidence: 0.85, reasoning: 'Bar chart is ideal for categorical comparison',
        config: { type: 'chart', chartType: 'bar', title: `${numCol} by ${catCol}` },
        x: catCol, y: numCol, yAgg: 'sum', groupBy: catCol,
      });
    }

    suggestions.push({
      id: uid(), type: 'kpi', title: `Total ${numCol}`,
      description: `Aggregate sum of ${numCol}`,
      confidence: 0.95, reasoning: 'Key metrics are best shown as KPI cards',
      config: { type: 'kpi', title: `Total ${numCol}` },
      y: numCol, yAgg: 'sum',
    });

    if (col.mean !== undefined) {
      suggestions.push({
        id: uid(), type: 'kpi', title: `Average ${numCol}`,
        description: `Mean value of ${numCol}`,
        confidence: 0.9, reasoning: 'Average is a key metric for numeric data',
        config: { type: 'kpi', title: `Average ${numCol}` },
        y: numCol, yAgg: 'avg',
      });
    }
  }

    if (lowCardinalityCols.length > 0) {
      const catCol = lowCardinalityCols[0];
      const col = columns.find((c) => c.name === catCol);
      if (col && col.topValues && col.topValues.length <= 8) {
        suggestions.push({
          id: uid(), type: 'pie', title: `${catCol} distribution`,
          description: `Proportion of each ${catCol} value`,
          confidence: 0.8, reasoning: 'Pie charts show proportions well for small category counts',
          config: { type: 'chart', chartType: 'pie', title: `${catCol} distribution` },
          x: catCol, y: numericCols[0], yAgg: 'count', groupBy: catCol,
        });
      }
    }

    if (numericCols.length >= 2) {
      suggestions.push({
        id: uid(), type: 'scatter', title: `${numericCols[0]} vs ${numericCols[1]}`,
        description: `Relationship between ${numericCols[0]} and ${numericCols[1]}`,
        confidence: 0.7, reasoning: 'Scatter plots reveal correlations between numeric variables',
        config: { type: 'chart', chartType: 'scatter', title: `${numericCols[0]} vs ${numericCols[1]}` },
        x: numericCols[0], y: numericCols[1],
      });
    }

    if (numericCols.length > 0) {
      const histCol = numericCols[0];
      suggestions.push({
        id: uid(), type: 'histogram', title: `${histCol} distribution`,
        description: `Frequency distribution of ${histCol} values`,
        confidence: 0.75, reasoning: 'Histograms reveal the distribution shape of numeric data',
        config: { type: 'chart', chartType: 'bar', title: `${histCol} distribution` },
        y: histCol, yAgg: 'count',
      });
    }

  suggestions.push({
    id: uid(), type: 'table', title: 'Data table',
    description: `Full table view of ${analysis.rowCount} rows`,
    confidence: 0.6, reasoning: 'Tables provide detailed data inspection',
    config: { type: 'table', title: 'Data table' },
  });

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/* ================================================================== */
/*  KPI Suggestions                                                     */
/* ================================================================== */

const KPI_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const KPI_ICONS = ['$', '#', '%', '\u2191', '\u2193', '\u2605', '\u25cf', '\u25a0'];

export function suggestKPIs(analysis: DataAnalysis): KPISuggestion[] {
  const kpis: KPISuggestion[] = [];
  const { columns, numericCols } = analysis;

  numericCols.slice(0, 8).forEach((colName, i) => {
    const col = columns.find((c) => c.name === colName);
    if (!col || col.isId) return;
    kpis.push({
      id: uid(), title: `Total ${colName}`, field: colName,
      aggregation: 'sum', format: 'number', color: KPI_COLORS[i % KPI_COLORS.length],
      icon: KPI_ICONS[i % KPI_ICONS.length], description: `Sum of all ${colName} values`,
    });
    if (col.mean !== undefined) {
      kpis.push({
        id: uid(), title: `Avg ${colName}`, field: colName,
        aggregation: 'avg', format: 'number', color: KPI_COLORS[(i + 3) % KPI_COLORS.length],
        icon: '\u2248', description: `Average ${colName} value`,
      });
    }
  });

  kpis.push({
    id: uid(), title: 'Total Records', field: '__count',
    aggregation: 'count', format: 'number', color: KPI_COLORS[0],
    icon: '#', description: 'Total number of rows',
  });

  return kpis;
}

/* ================================================================== */
/*  Filter Suggestions                                                  */
/* ================================================================== */

export function suggestFilters(analysis: DataAnalysis): FilterSuggestion[] {
  const filters: FilterSuggestion[] = [];
  const { columns, dateCols, categoricalCols, lowCardinalityCols, numericCols } = analysis;

  for (const dateCol of dateCols.slice(0, 2)) {
    filters.push({
      id: uid(), field: dateCol, filterType: 'daterange',
      label: `${dateCol} range`, defaultEnabled: true,
    });
  }

  for (const catCol of lowCardinalityCols.slice(0, 4)) {
    const col = columns.find((c) => c.name === catCol);
    if (!col?.topValues) continue;
    const options = col.topValues.slice(0, 20).map((tv) => tv.value);
    filters.push({
      id: uid(), field: catCol,
      filterType: col.topValues.length <= 8 ? 'select' : 'multiselect',
      label: catCol, options, defaultEnabled: true,
    });
  }

  for (const numCol of numericCols.slice(0, 3)) {
    const col = columns.find((c) => c.name === numCol);
    if (!col || col.min === undefined || col.max === undefined || col.isId) continue;
    filters.push({
      id: uid(), field: numCol, filterType: 'range',
      label: `${numCol} range`, min: col.min, max: col.max, defaultEnabled: false,
    });
  }

  return filters;
}

/* ================================================================== */
/*  Calculated Field Suggestions                                        */
/* ================================================================== */

const CALC_TEMPLATES: Array<{ pattern: (c: DataAnalysis) => CalcFieldSuggestion[] }> = [
  (a) => {
    if (a.numericCols.length < 2) return [];
    return a.numericCols.slice(0, 3).flatMap((col1, i) =>
      a.numericCols.slice(i + 1, i + 3).map((col2) => ({
        id: uid(), name: `${col1} per ${col2}`,
        formula: `{${col2}} !== 0 ? {${col1}} / {${col2}} : 0`,
        description: `Ratio of ${col1} to ${col2}`,
        category: 'Ratio',
      })),
    );
  },
  (a) => {
    const numCols = a.numericCols.filter((n) => {
      const lc = n.toLowerCase();
      return lc.includes('revenue') || lc.includes('price') || lc.includes('amount') || lc.includes('sale') || lc.includes('cost');
    });
    if (numCols.length < 2) return [];
    return [{ id: uid(), name: 'Revenue per Unit', formula: `{${numCols[0]}} / Math.max({${numCols[1]}}, 1)`, description: 'Revenue divided by quantity', category: 'Business' }];
  },
  (a) => {
    if (a.numericCols.length === 0) return [];
    return a.numericCols.slice(0, 2).map((col) => ({
      id: uid(), name: `${col} (normalized)`,
      formula: `(({${col}}} - ${a.columns.find((c) => c.name === col)?.min ?? 0}) / (${a.columns.find((c) => c.name === col)?.max ?? 1} - ${a.columns.find((c) => c.name === col)?.min ?? 0})) * 100`,
      description: `Normalized ${col} as percentage (0-100)`,
      category: 'Normalization',
    }));
  },
  (a) => {
    if (a.numericCols.length === 0) return [];
    return [{ id: uid(), name: 'Record Count', formula: '1', description: 'Constant 1 for counting rows', category: 'Utility' }];
  },
  (a) => {
    if (a.numericCols.length === 0) return [];
    const totalCol = a.numericCols[0];
    const stat = a.columns.find((c) => c.name === totalCol);
    if (!stat || stat.mean === undefined) return [];
    return a.numericCols.slice(0, 3).map((col) => ({
      id: uid(), name: `${col} vs Average`,
      formula: `{${col}} > ${stat.mean} ? 'Above Average' : 'Below Average'`,
      description: `Whether ${col} is above or below the dataset average`,
      category: 'Comparison',
    }));
  },
];

export function suggestCalculatedFields(analysis: DataAnalysis): CalcFieldSuggestion[] {
  return CALC_TEMPLATES.flatMap((fn) => fn(analysis));
}

/* ================================================================== */
/*  Dashboard Blueprint Generation                                      */
/* ================================================================== */

export function generateDashboardBlueprint(analysis: DataAnalysis, data: DataRecord[]): DashboardBlueprint {
  const chartSuggestions = suggestCharts(analysis);
  const kpiSuggestions = suggestKPIs(analysis);
  const filterSuggestions = suggestFilters(analysis);

  const widgets: WidgetConfig[] = [];
  let y = 0;

  for (const kpi of kpiSuggestions.slice(0, 6)) {
    widgets.push({
      id: kpi.id,
      type: 'kpi',
      title: kpi.title,
      x: widgets.length % 4,
      y: 0,
      w: 3,
      h: 3,
      options: { value: kpi.field, aggregation: kpi.aggregation, color: kpi.color, icon: kpi.icon },
      bindings: { datasetId: '__ai_dataset', dataMapping: { value: kpi.field } },
    });
  }
  y = 3;

  const chartSugs = chartSuggestions.filter((s) => s.type !== 'kpi' && s.type !== 'table').slice(0, 6);
  let cx = 0;
  for (const chart of chartSugs) {
    const w = chart.type === 'scatter' ? 6 : 6;
    const h = 5;
    if (cx + w > 12) { cx = 0; y += h; }
    widgets.push({
      id: chart.id,
      type: 'chart',
      title: chart.title,
      x: cx,
      y,
      w,
      h,
      options: { chartType: chart.config.chartType ?? chart.type, x: chart.x, y: chart.y, aggregation: chart.yAgg },
      bindings: { datasetId: '__ai_dataset', dataMapping: { x: chart.x, y: chart.y } },
    });
    cx += w;
  }

  if (filterSuggestions.length > 0) {
    const lastChart = widgets.filter((w) => w.type === 'chart').pop();
    const filterY = lastChart ? lastChart.y + lastChart.h : y + 5;
    filterSuggestions.slice(0, 4).forEach((f, i) => {
      widgets.push({
        id: f.id,
        type: 'filter',
        title: f.label,
        x: i * 3,
        y: filterY,
        w: 3,
        h: 2,
        options: { filterType: f.filterType, field: f.field, label: f.label, options: f.options },
        bindings: { datasetId: '__ai_dataset' },
      });
    });
  }

  const variables = filterSuggestions.map((f) => ({
    id: f.field, name: f.label, defaultValue: f.filterType === 'select' || f.filterType === 'multiselect'
      ? (f.options ?? []) : f.filterType === 'range' ? [f.min ?? 0, f.max ?? 100] : '',
  }));

  return {
    title: `${analysis.tableName} Dashboard`,
    description: `Auto-generated dashboard for ${analysis.tableName} (${analysis.rowCount} rows, ${analysis.columns.length} columns)`,
    variables,
    datasets: [{ id: '__ai_dataset', name: analysis.tableName, datasource: { kind: 'static', data } }],
    widgets,
  };
}

/* ================================================================== */
/*  Natural Language Processing                                         */
/* ================================================================== */

interface NLIntent {
  patterns: RegExp[];
  intent: string;
  handler: (match: RegExpMatchArray, analysis: DataAnalysis) => NLResult;
}

function nlResult(intent: string, confidence: number, response: string, actions: NLAction[] = []): NLResult {
  return { intent, confidence, response, actions };
}

const INTENT_HANDLERS: NLIntent[] = [
  {
    patterns: [/^(?:create|generate|build|make)\s+(?:a\s+)?dashboard/i, /^dashboard$/i, /^auto\s*dashboard/i],
    intent: 'generate_dashboard',
    handler: (_m, analysis) => nlResult('generate_dashboard', 0.9,
      `Generating a full dashboard with ${analysis.numericCols.length} KPIs, ${suggestCharts(analysis).length} chart suggestions, and ${suggestFilters(analysis).length} filters for ${analysis.rowCount} rows of data.`,
      [{ type: 'generate_all', payload: {} }],
    ),
  },
  {
    patterns: [/^(?:suggest|show|recommend)\s+(?:me\s+)?(?:some\s+)?charts?/i, /^what\s+charts?/i, /^chart\s+suggestions?/i],
    intent: 'suggest_charts',
    handler: (_m, analysis) => {
      const charts = suggestCharts(analysis);
      return nlResult('suggest_charts', 0.85,
        `Found ${charts.length} chart suggestions: ${charts.slice(0, 5).map((c) => c.title).join(', ')}.`,
      );
    },
  },
  {
    patterns: [/^(?:add|create|generate|show)\s+(?:me\s+)?(?:some\s+)?KPIs?/i, /^KPIs?$/i, /^key\s+performance/i],
    intent: 'generate_kpis',
    handler: (_m, analysis) => nlResult('generate_kpis', 0.85,
      `Generated ${analysis.numericCols.length} KPI cards for: ${analysis.numericCols.slice(0, 5).join(', ')}.`,
      [{ type: 'add_kpi', payload: { columns: analysis.numericCols } }],
    ),
  },
  {
    patterns: [/^(?:add|create|generate|build)\s+(?:me\s+)?(?:some\s+)?filters?/i, /^filters?$/i],
    intent: 'generate_filters',
    handler: (_m, analysis) => {
      const filters = suggestFilters(analysis);
      return nlResult('generate_filters', 0.85,
        `Created ${filters.length} filters: ${filters.map((f) => f.label).join(', ')}.`,
        [{ type: 'add_filter', payload: { filters } }],
      );
    },
  },
  {
    patterns: [/^(?:create|generate|add)\s+(?:a\s+)?(?:new\s+)?(?:calculated?\s+)?fields?/i, /^calculated?\s+fields?/i, /^computed?\s+fields?/i],
    intent: 'generate_calc_fields',
    handler: (_m, analysis) => {
      const fields = suggestCalculatedFields(analysis);
      return nlResult('generate_calc_fields', 0.8,
        `Suggested ${fields.length} calculated fields: ${fields.slice(0, 3).map((f) => f.name).join(', ')}.`,
        [{ type: 'generate_calc_field', payload: { fields } }],
      );
    },
  },
  {
    patterns: [/^(?:explain|describe|what(?:'s| is| are))\s+(?:this|the|that)\s+chart/i, /^explain\s+chart/i],
    intent: 'explain_chart',
    handler: (_m, analysis) => nlResult('explain_chart', 0.7,
      `I can explain a specific chart. Select a chart from the suggestions to get a detailed explanation of what it shows and why it was recommended.`,
    ),
  },
  {
    patterns: [/^(?:what|show)\s+(?:me\s+)?(?:the\s+)?(?:data|columns?|fields?|schema)/i, /^describe\s+(?:the\s+)?data/i, /^schema$/i],
    intent: 'describe_data',
    handler: (_m, analysis) => nlResult('describe_data', 0.9,
      `Dataset "${analysis.tableName}" has ${analysis.rowCount} rows and ${analysis.columns.length} columns. ` +
      `Numeric: ${analysis.numericCols.join(', ') || 'none'}. ` +
      `Categorical: ${analysis.categoricalCols.join(', ') || 'none'}. ` +
      `Dates: ${analysis.dateCols.join(', ') || 'none'}. ` +
      (analysis.correlations.length > 0 ? `Strong correlations: ${analysis.correlations.slice(0, 2).map((c) => `${c.col1}\u2194${c.col2} (r=${c.r})`).join(', ')}.` : ''),
    ),
  },
  {
    patterns: [/^(?:what|which)\s+(?:are?\s+)?(?:the\s+)?top\s+(\d+)?\s*(\w+)/i, /^top\s+(\d+)?\s*(\w+)/i],
    intent: 'top_values',
    handler: (m, analysis) => {
      const n = parseInt(m[1] ?? '5', 10);
      const col = m[2];
      const found = analysis.columns.find((c) => c.name.toLowerCase() === col?.toLowerCase());
      if (found?.topValues) {
        return nlResult('top_values', 0.8,
          `Top ${n} values for ${found.name}: ${found.topValues.slice(0, n).map((tv) => `${tv.value} (${tv.count}, ${tv.pct}%)`).join(', ')}.`,
        );
      }
      return nlResult('top_values', 0.4, `Column "${col}" not found or has no categorical data.`);
    },
  },
  {
    patterns: [/^(?:create|add)\s+(?:a\s+)?bar\s+chart\s+(?:of|for|showing)\s+(\w+)\s+(?:by|per|vs|versus|grouped?\s+by)\s+(\w+)/i],
    intent: 'create_bar_chart',
    handler: (m, analysis) => {
      const y = m[1]; const x = m[2];
      const yCol = analysis.columns.find((c) => c.name.toLowerCase() === y.toLowerCase());
      const xCol = analysis.columns.find((c) => c.name.toLowerCase() === x.toLowerCase());
      if (!yCol || !xCol) return nlResult('create_bar_chart', 0.3, `Could not find columns "${y}" or "${x}". Available: ${analysis.columns.map((c) => c.name).join(', ')}`);
      return nlResult('create_bar_chart', 0.85,
        `Creating bar chart of ${yCol.name} by ${xCol.name}.`,
        [{ type: 'add_widget', payload: { type: 'chart', chartType: 'bar', title: `${yCol.name} by ${xCol.name}`, x: xCol.name, y: yCol.name } }],
      );
    },
  },
  {
    patterns: [/^(?:create|add)\s+(?:a\s+)?(?:line|trend)\s+chart\s+(?:of|for|showing)\s+(\w+)\s+(?:over|by|vs)\s+(\w+)/i],
    intent: 'create_line_chart',
    handler: (m, analysis) => {
      const y = m[1]; const x = m[2];
      const yCol = analysis.columns.find((c) => c.name.toLowerCase() === y.toLowerCase());
      const xCol = analysis.columns.find((c) => c.name.toLowerCase() === x.toLowerCase());
      if (!yCol || !xCol) return nlResult('create_line_chart', 0.3, `Could not find columns "${y}" or "${x}".`);
      return nlResult('create_line_chart', 0.85,
        `Creating line chart of ${yCol.name} over ${xCol.name}.`,
        [{ type: 'add_widget', payload: { type: 'chart', chartType: 'line', title: `${yCol.name} over ${xCol.name}`, x: xCol.name, y: yCol.name } }],
      );
    },
  },
  {
    patterns: [/^(?:create|add)\s+(?:a\s+)?pie\s+chart\s+(?:of|for)\s+(\w+)/i],
    intent: 'create_pie_chart',
    handler: (m, analysis) => {
      const col = m[1];
      const found = analysis.columns.find((c) => c.name.toLowerCase() === col.toLowerCase());
      if (!found) return nlResult('create_pie_chart', 0.3, `Column "${col}" not found.`);
      return nlResult('create_pie_chart', 0.8,
        `Creating pie chart for ${found.name}.`,
        [{ type: 'add_widget', payload: { type: 'chart', chartType: 'pie', title: `${found.name} distribution`, x: found.name } }],
      );
    },
  },
  {
    patterns: [/^(?:set|change|rename)\s+(?:the\s+)?(?:dashboard\s+)?(?:title|name)\s+(?:to\s+)?["']?(.+?)["']?\s*$/i],
    intent: 'set_title',
    handler: (m) => nlResult('set_title', 0.9,
      `Dashboard title set to "${m[1]}".`,
      [{ type: 'set_title', payload: { title: m[1] } }],
    ),
  },
  {
    patterns: [/^(?:show|display|list)\s+(?:the\s+)?(?:all\s+)?columns?/i, /^columns?$/i, /^fields?$/i],
    intent: 'list_columns',
    handler: (_m, analysis) => nlResult('list_columns', 0.9,
      `Columns: ${analysis.columns.map((c) => `${c.name} (${c.type}${c.isId ? ', id' : ''})`).join(', ')}.`,
    ),
  },
  {
    patterns: [/^(?:show|find|search)\s+(?:me\s+)?.*?(?:where|with|having)\s+(.+?)(?:\s*=\s*|\s+equals?\s+|\s+is\s+)(.+)/i],
    intent: 'filter_data',
    handler: (m, analysis) => {
      const field = m[1].trim();
      const value = m[2].trim();
      const col = analysis.columns.find((c) => c.name.toLowerCase() === field.toLowerCase());
      if (!col) return nlResult('filter_data', 0.3, `Column "${field}" not found.`);
      return nlResult('filter_data', 0.7,
        `Filtering data where ${col.name} = "${value}".`,
        [{ type: 'add_filter', payload: { field: col.name, value } }],
      );
    },
  },
  {
    patterns: [/^(?:help|what can you do|commands?|options?|\?)$/i],
    intent: 'help',
    handler: () => nlResult('help', 1, [
      'Here\'s what I can do:',
      '\u2022 "generate dashboard" \u2014 create a full dashboard from the data',
      '\u2022 "suggest charts" \u2014 recommend chart types',
      '\u2022 "add KPIs" \u2014 generate key performance indicators',
      '\u2022 "add filters" \u2014 create data filters',
      '\u2022 "add calculated fields" \u2014 suggest computed columns',
      '\u2022 "create bar chart of X by Y" \u2014 specific chart',
      '\u2022 "create line chart of X over Y" \u2014 trend chart',
      '\u2022 "create pie chart of X" \u2014 distribution chart',
      '\u2022 "describe data" \u2014 show dataset info',
      '\u2022 "top 5 [column]" \u2014 show top values',
      '\u2022 "set title to X" \u2014 rename dashboard',
      '\u2022 "explain chart" \u2014 get chart explanation',
    ].join('\n')),
  },
];

export function processNL(query: string, analysis: DataAnalysis): NLResult {
  const trimmed = query.trim();
  if (!trimmed) return nlResult('empty', 0, 'Please enter a command. Type "help" to see what I can do.');

  for (const intent of INTENT_HANDLERS) {
    for (const pattern of intent.patterns) {
      const match = trimmed.match(pattern);
      if (match) return intent.handler(match, analysis);
    }
  }

  const lower = trimmed.toLowerCase();
  const colMentions = analysis.columns.filter((c) => lower.includes(c.name.toLowerCase()));
  if (colMentions.length > 0) {
    const hasNumeric = colMentions.some((c) => c.type === 'number');
    const hasCategorical = colMentions.some((c) => c.type === 'string');
    if (hasNumeric && hasCategorical) {
      const num = colMentions.find((c) => c.type === 'number')!;
      const cat = colMentions.find((c) => c.type === 'string')!;
      return nlResult('implicit_bar', 0.5,
        `I noticed you mentioned "${num.name}" and "${cat.name}". Would you like a bar chart of ${num.name} by ${cat.name}?`,
        [{ type: 'add_widget', payload: { type: 'chart', chartType: 'bar', title: `${num.name} by ${cat.name}`, x: cat.name, y: num.name } }],
      );
    }
    if (hasNumeric) {
      const num = colMentions.find((c) => c.type === 'number')!;
      return nlResult('implicit_kpi', 0.4,
        `I see you mentioned "${num.name}". Adding a KPI card for it.`,
        [{ type: 'add_kpi', payload: { field: num.name } }],
      );
    }
  }

  return nlResult('unknown', 0.2,
    `I didn't understand "${trimmed}". Type "help" to see available commands.`,
  );
}

/* ================================================================== */
/*  Chart Explanation                                                   */
/* ================================================================== */

export function explainChart(suggestion: ChartSuggestion, analysis: DataAnalysis): string {
  const lines: string[] = [];
  lines.push(`**${suggestion.title}**`);
  lines.push(`Type: ${suggestion.type.charAt(0).toUpperCase() + suggestion.type.slice(1)} chart`);
  lines.push(`Confidence: ${Math.round(suggestion.confidence * 100)}%`);
  lines.push('');
  lines.push(`**What it shows:** ${suggestion.description}`);
  lines.push(`**Why this chart:** ${suggestion.reasoning}`);
  lines.push('');

  if (suggestion.x) {
    const xCol = analysis.columns.find((c) => c.name === suggestion.x);
    if (xCol) {
      lines.push(`**X-axis (${xCol.name}):** ${xCol.type === 'number' ? `Numeric, range ${xCol.min} to ${xCol.max}` : xCol.type === 'date' ? `Date range: ${xCol.minDate} to ${xCol.maxDate}` : `${xCol.uniqueCount} unique categories`}`);
    }
  }
  if (suggestion.y) {
    const yCol = analysis.columns.find((c) => c.name === suggestion.y);
    if (yCol) {
      lines.push(`**Y-axis (${yCol.name}):** ${yCol.type === 'number' ? `Numeric, sum=${yCol.sum?.toLocaleString()}, avg=${yCol.mean?.toFixed(2)}` : `Categorical with ${yCol.uniqueCount} values`}`);
    }
  }
  if (suggestion.yAgg) {
    lines.push(`**Aggregation:** ${suggestion.yAgg.toUpperCase()}`);
  }
  if (suggestion.groupBy) {
    lines.push(`**Grouped by:** ${suggestion.groupBy}`);
  }

  const corr = analysis.correlations.find((c) =>
    (c.col1 === suggestion.x && c.col2 === suggestion.y) || (c.col1 === suggestion.y && c.col2 === suggestion.x),
  );
  if (corr) {
    lines.push(`**Correlation:** r = ${corr.r} (${corr.r > 0 ? 'positive' : 'negative'} relationship)`);
  }

  lines.push('');
  lines.push('**Tip:** Click "Add to Dashboard" to include this chart in your dashboard.');

  return lines.join('\n');
}
