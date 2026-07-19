import { useCallback, useMemo, useState } from 'react';
import type { CalculatedField, ConnectionConfig, DashboardConfig, DashboardWidget, DataField, DataRecord, FilterOperator, JoinClause, SchemaColumn, SchemaInfo, WhereClause, WidgetBinding } from '@dashboard-generator/core';
import { connectionManager } from './connection-manager';
import { useBuilderStore } from './store';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type Tab = 'columns' | 'filters' | 'sort' | 'group' | 'joins' | 'calc' | 'sql' | 'preview';

export interface QueryBuilderProps {
  widget: DashboardWidget;
  onClose?: () => void;
}

interface DataSourceOption {
  id: string;
  name: string;
  kind: 'dataset' | 'connection';
  fields?: DataField[];
  schema?: SchemaInfo;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: 'LIKE', label: 'LIKE' },
  { value: 'NOT LIKE', label: 'NOT LIKE' },
  { value: 'IN', label: 'IN' },
  { value: 'NOT IN', label: 'NOT IN' },
  { value: 'IS NULL', label: 'IS NULL' },
  { value: 'IS NOT NULL', label: 'IS NOT NULL' },
  { value: 'BETWEEN', label: 'BETWEEN' },
];

const AGGREGATIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'sum', label: 'SUM' },
  { value: 'avg', label: 'AVG' },
  { value: 'min', label: 'MIN' },
  { value: 'max', label: 'MAX' },
  { value: 'count', label: 'COUNT' },
];

const JOIN_TYPES: { value: JoinClause['type']; label: string }[] = [
  { value: 'INNER', label: 'INNER JOIN' },
  { value: 'LEFT', label: 'LEFT JOIN' },
  { value: 'RIGHT', label: 'RIGHT JOIN' },
  { value: 'FULL', label: 'FULL JOIN' },
];

const isSqlLike = (ds?: ConnectionConfig): boolean =>
  !!ds && ['mysql', 'postgres', 'sqlserver', 'oracle', 'snowflake', 'bigquery'].includes(ds.type);

const fieldsFromSchema = (schema?: SchemaInfo): DataField[] => {
  if (!schema) return [];
  const fields: DataField[] = [];
  schema.tables.forEach((table) => {
    table.columns.forEach((col) => {
      const typeMap: Record<string, DataField['type']> = {
        varchar: 'string', text: 'string', char: 'string', string: 'string',
        int: 'number', integer: 'number', bigint: 'number', smallint: 'number',
        decimal: 'number', numeric: 'number', float: 'number', double: 'number', real: 'number',
        boolean: 'boolean', bool: 'boolean',
        date: 'date', datetime: 'datetime', timestamp: 'datetime',
      };
      fields.push({
        name: `${table.name}.${col.name}`,
        label: `${table.name}.${col.name}`,
        type: typeMap[col.type.toLowerCase()] ?? 'unknown',
        nullable: col.nullable,
      });
    });
  });
  return fields;
};

const generateSqlPreview = (binding: WidgetBinding, sourceName: string): string => {
  if (binding.sql) return binding.sql;
  const dims = binding.dimensions ?? [];
  const metrics = binding.metrics ?? [];
  const where = binding.where ?? [];
  const groupBy = binding.groupBy ?? [];
  const orderBy = binding.orderBy ?? binding.sort ?? [];
  const limit = binding.limit;

  const selectParts = [
    ...dims.map((d) => d),
    ...metrics.map((m) => m.aggregation && m.aggregation !== 'none' ? `${m.aggregation.toUpperCase()}(${m.field}) AS ${m.aggregation}_${m.field}` : m.field),
    ...(binding.calculatedFields ?? []).map((cf) => `${cf.expression} AS ${cf.name}`),
  ];

  let sql = `SELECT ${selectParts.length > 0 ? selectParts.join(', ') : '*'}`;
  sql += `\nFROM ${sourceName}`;

  if (binding.joins?.length) {
    binding.joins.forEach((j) => {
      sql += `\n${j.type} JOIN ${j.datasetId}${j.alias ? ` AS ${j.alias}` : ''} ON ${j.onLeft} = ${j.onRight}`;
    });
  }

  if (where.length > 0) {
    const clauses = where.map((w) => {
      if (w.operator === 'IS NULL') return `${w.field} IS NULL`;
      if (w.operator === 'IS NOT NULL') return `${w.field} IS NOT NULL`;
      if (w.operator === 'IN' || w.operator === 'NOT IN') {
        const vals = Array.isArray(w.value) ? w.value.map((v) => `'${v}'`).join(', ') : `'${w.value}'`;
        return `${w.field} ${w.operator} (${vals})`;
      }
      if (w.operator === 'BETWEEN' && Array.isArray(w.value)) {
        return `${w.field} BETWEEN '${w.value[0]}' AND '${w.value[1]}'`;
      }
      return `${w.field} ${w.operator} '${w.value}'`;
    });
    sql += `\nWHERE ${clauses.join(' AND ')}`;
  }

  if (groupBy.length > 0 || metrics.length > 0) {
    const groupCols = groupBy.length > 0 ? groupBy : dims;
    if (groupCols.length > 0) sql += `\nGROUP BY ${groupCols.join(', ')}`;
  }

  if (binding.having?.length) {
    const havingClauses = binding.having.map((h) => {
      if (h.operator === 'IS NULL') return `${h.field} IS NULL`;
      if (h.operator === 'IS NOT NULL') return `${h.field} IS NOT NULL`;
      return `${h.field} ${h.operator} '${h.value}'`;
    });
    sql += `\nHAVING ${havingClauses.join(' AND ')}`;
  }

  if (orderBy.length > 0) {
    sql += `\nORDER BY ${orderBy.map((o) => `${o.field} ${o.direction.toUpperCase()}`).join(', ')}`;
  }

  if (limit) sql += `\nLIMIT ${limit}`;

  return sql;
};

/* ------------------------------------------------------------------ */
/*  DatasetSelector                                                     */
/* ------------------------------------------------------------------ */

function DatasetSelector({ dashboard, value, onChange }: { dashboard: DashboardConfig; value?: string; onChange: (datasetId?: string) => void }) {
  const datasets = dashboard.datasets ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('New dataset');

  const createDataset = () => {
    const id = `dataset-${Date.now()}`;
    const newDs = { id, name: newName, datasource: { kind: 'static' as const, data: [] } };
    const updated = { ...dashboard, datasets: [...datasets, newDs] };
    useBuilderStore.getState().setDashboard(updated);
    onChange(id);
    setShowCreate(false);
  };

  return (
    <div className="qb-dataset-selector">
      <label className="qb-label">Data Source</label>
      <div className="qb-dataset-row">
        <select className="qb-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Select dataset…</option>
          {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="qb-btn-icon" onClick={() => setShowCreate(!showCreate)} title="Create dataset">+</button>
      </div>
      {showCreate && (
        <div className="qb-create-dataset">
          <input className="qb-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dataset name" />
          <button className="qb-btn qb-btn-primary" onClick={createDataset}>Create</button>
          <button className="qb-btn" onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ColumnEditor                                                        */
/* ------------------------------------------------------------------ */

function ColumnEditor({ fields, binding, onChange }: { fields: DataField[]; binding: WidgetBinding; onChange: (patch: Partial<WidgetBinding>) => void }) {
  const dims = binding.dimensions ?? [];
  const metrics = binding.metrics ?? [];

  const toggleDim = (field: string) => {
    const next = dims.includes(field) ? dims.filter((d) => d !== field) : [...dims, field];
    onChange({ dimensions: next });
  };

  const updateMetric = (idx: number, patch: Partial<typeof metrics[0]>) => {
    const next = [...metrics];
    next[idx] = { ...next[idx], ...patch };
    onChange({ metrics: next });
  };

  const addMetric = () => {
    onChange({ metrics: [...metrics, { field: fields[0]?.name ?? '', aggregation: 'none' }] });
  };

  const removeMetric = (idx: number) => {
    onChange({ metrics: metrics.filter((_, i) => i !== idx) });
  };

  return (
    <div className="qb-columns">
      <div className="qb-section">
        <label className="qb-label">Dimensions (Group By)</label>
        <div className="qb-chip-list">
          {fields.map((f) => (
            <button key={f.name} className={`qb-chip ${dims.includes(f.name) ? 'active' : ''}`} onClick={() => toggleDim(f.name)}>
              <span className={`qb-chip-type qb-type-${f.type}`}>{f.type[0].toUpperCase()}</span>
              {f.label ?? f.name}
            </button>
          ))}
          {fields.length === 0 && <span className="qb-empty-text">Select a dataset to see fields</span>}
        </div>
      </div>
      <div className="qb-section">
        <label className="qb-label">Metrics (Aggregations)</label>
        {metrics.map((m, idx) => (
          <div key={idx} className="qb-metric-row">
            <select className="qb-select qb-select-sm" value={m.field} onChange={(e) => updateMetric(idx, { field: e.target.value })}>
              {fields.map((f) => <option key={f.name} value={f.name}>{f.label ?? f.name}</option>)}
            </select>
            <select className="qb-select qb-select-sm" value={m.aggregation ?? 'none'} onChange={(e) => updateMetric(idx, { aggregation: e.target.value as typeof m.aggregation })}>
              {AGGREGATIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <button className="qb-btn-icon qb-btn-remove" onClick={() => removeMetric(idx)} title="Remove">×</button>
          </div>
        ))}
        <button className="qb-btn qb-btn-add" onClick={addMetric}>+ Add metric</button>
      </div>
      <div className="qb-section">
        <label className="qb-label">Calculated Fields</label>
        {(binding.calculatedFields ?? []).map((cf, idx) => (
          <div key={idx} className="qb-calc-row">
            <input className="qb-input qb-input-sm" value={cf.name} onChange={(e) => {
              const next = [...(binding.calculatedFields ?? [])];
              next[idx] = { ...next[idx], name: e.target.value };
              onChange({ calculatedFields: next });
            }} placeholder="Name" />
            <input className="qb-input qb-input-sm" value={cf.expression} onChange={(e) => {
              const next = [...(binding.calculatedFields ?? [])];
              next[idx] = { ...next[idx], expression: e.target.value };
              onChange({ calculatedFields: next });
            }} placeholder="Expression (e.g. price * qty)" />
            <button className="qb-btn-icon qb-btn-remove" onClick={() => {
              onChange({ calculatedFields: (binding.calculatedFields ?? []).filter((_, i) => i !== idx) });
            }} title="Remove">×</button>
          </div>
        ))}
        <button className="qb-btn qb-btn-add" onClick={() => {
          onChange({ calculatedFields: [...(binding.calculatedFields ?? []), { name: '', expression: '' }] });
        }}>+ Add calculated field</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterEditor                                                        */
/* ------------------------------------------------------------------ */

function FilterEditor({ fields, clauses, label, onChange }: { fields: DataField[]; clauses: WhereClause[]; label: string; onChange: (clauses: WhereClause[]) => void }) {
  const update = (idx: number, patch: Partial<WhereClause>) => {
    const next = [...clauses];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="qb-filters">
      <label className="qb-label">{label}</label>
      {clauses.map((c, idx) => (
        <div key={idx} className="qb-filter-row">
          <select className="qb-select qb-select-sm" value={c.field} onChange={(e) => update(idx, { field: e.target.value })}>
            {fields.map((f) => <option key={f.name} value={f.name}>{f.label ?? f.name}</option>)}
          </select>
          <select className="qb-select qb-select-xs" value={c.operator} onChange={(e) => update(idx, { operator: e.target.value as FilterOperator })}>
            {OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select>
          {c.operator !== 'IS NULL' && c.operator !== 'IS NOT NULL' && (
            c.operator === 'IN' || c.operator === 'NOT IN' ? (
              <input className="qb-input qb-input-sm" value={Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')} onChange={(e) => update(idx, { value: e.target.value.split(',').map((v) => v.trim()) })} placeholder="val1, val2" />
            ) : c.operator === 'BETWEEN' ? (
              <div className="qb-filter-between">
                <input className="qb-input qb-input-sm" value={Array.isArray(c.value) ? String(c.value[0] ?? '') : ''} onChange={(e) => update(idx, { value: [e.target.value, Array.isArray(c.value) ? c.value[1] ?? '' : ''] })} placeholder="min" />
                <span>AND</span>
                <input className="qb-input qb-input-sm" value={Array.isArray(c.value) ? String(c.value[1] ?? '') : ''} onChange={(e) => update(idx, { value: [Array.isArray(c.value) ? c.value[0] ?? '' : '', e.target.value] })} placeholder="max" />
              </div>
            ) : (
              <input className="qb-input qb-input-sm" value={String(c.value ?? '')} onChange={(e) => update(idx, { value: e.target.value })} placeholder="Value" />
            )
          )}
          <button className="qb-btn-icon qb-btn-remove" onClick={() => onChange(clauses.filter((_, i) => i !== idx))} title="Remove">×</button>
        </div>
      ))}
      <button className="qb-btn qb-btn-add" onClick={() => onChange([...clauses, { field: fields[0]?.name ?? '', operator: '=', value: '' }])}>+ Add condition</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SortEditor                                                          */
/* ------------------------------------------------------------------ */

function SortEditor({ fields, items, onChange }: { fields: DataField[]; items: WidgetBinding['sort']; onChange: (items: WidgetBinding['sort']) => void }) {
  const list = items ?? [];
  const update = (idx: number, patch: Partial<typeof list[0]>) => {
    const next = [...list];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="qb-sort">
      <label className="qb-label">Sort Order</label>
      {list.map((s, idx) => (
        <div key={idx} className="qb-sort-row">
          <select className="qb-select qb-select-sm" value={s.field} onChange={(e) => update(idx, { field: e.target.value })}>
            {fields.map((f) => <option key={f.name} value={f.name}>{f.label ?? f.name}</option>)}
          </select>
          <select className="qb-select qb-select-xs" value={s.direction} onChange={(e) => update(idx, { direction: e.target.value as 'asc' | 'desc' })}>
            <option value="asc">ASC ↑</option>
            <option value="desc">DESC ↓</option>
          </select>
          <button className="qb-btn-icon qb-btn-remove" onClick={() => onChange(list.filter((_, i) => i !== idx))} title="Remove">×</button>
        </div>
      ))}
      <button className="qb-btn qb-btn-add" onClick={() => onChange([...list, { field: fields[0]?.name ?? '', direction: 'asc' }])}>+ Add sort</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  JoinEditor                                                          */
/* ------------------------------------------------------------------ */

function JoinEditor({ dashboard, binding, fields, onChange }: { dashboard: DashboardConfig; binding: WidgetBinding; fields: DataField[]; onChange: (patch: Partial<WidgetBinding>) => void }) {
  const datasets = (dashboard.datasets ?? []).filter((d) => d.id !== binding.datasetId);
  const joins = binding.joins ?? [];

  const update = (idx: number, patch: Partial<JoinClause>) => {
    const next = [...joins];
    next[idx] = { ...next[idx], ...patch };
    onChange({ joins: next });
  };

  return (
    <div className="qb-joins">
      <label className="qb-label">Joins</label>
      {joins.map((j, idx) => (
        <div key={idx} className="qb-join-card">
          <div className="qb-join-header">
            <select className="qb-select qb-select-sm" value={j.type} onChange={(e) => update(idx, { type: e.target.value as JoinClause['type'] })}>
              {JOIN_TYPES.map((jt) => <option key={jt.value} value={jt.value}>{jt.label}</option>)}
            </select>
            <button className="qb-btn-icon qb-btn-remove" onClick={() => onChange({ joins: joins.filter((_, i) => i !== idx) })} title="Remove">×</button>
          </div>
          <div className="qb-join-fields">
            <select className="qb-select qb-select-sm" value={j.datasetId} onChange={(e) => update(idx, { datasetId: e.target.value })}>
              <option value="">Select table…</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <div className="qb-join-on">
              <select className="qb-select qb-select-sm" value={j.onLeft} onChange={(e) => update(idx, { onLeft: e.target.value })}>
                {fields.map((f) => <option key={f.name} value={f.name}>{f.label ?? f.name}</option>)}
              </select>
              <span>=</span>
              <input className="qb-input qb-input-sm" value={j.onRight} onChange={(e) => update(idx, { onRight: e.target.value })} placeholder="Right field" />
            </div>
          </div>
        </div>
      ))}
      <button className="qb-btn qb-btn-add" onClick={() => onChange({ joins: [...joins, { datasetId: '', type: 'INNER', onLeft: fields[0]?.name ?? '', onRight: '' }] })}>+ Add join</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SqlModeEditor                                                       */
/* ------------------------------------------------------------------ */

function SqlModeEditor({ binding, onChange }: { binding: WidgetBinding; onChange: (patch: Partial<WidgetBinding>) => void }) {
  return (
    <div className="qb-sql">
      <label className="qb-label">Raw SQL</label>
      <p className="qb-hint">Write a custom SQL query. This overrides all other query settings.</p>
      <textarea className="qb-sql-editor" value={binding.sql ?? ''} onChange={(e) => onChange({ sql: e.target.value })} placeholder="SELECT * FROM my_table WHERE condition" spellCheck={false} rows={12} />
      {binding.sql && (
        <button className="qb-btn" onClick={() => onChange({ sql: undefined })}>Clear SQL</button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  QueryPreview                                                        */
/* ------------------------------------------------------------------ */

function QueryPreview({ binding, sourceName, data, loading, error, onRun }: { binding: WidgetBinding; sourceName: string; data: DataRecord[]; loading: boolean; error: string; onRun: () => void }) {
  const sql = generateSqlPreview(binding, sourceName);
  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div className="qb-preview">
      <div className="qb-preview-header">
        <label className="qb-label">Generated Query</label>
        <button className="qb-btn qb-btn-primary" onClick={onRun} disabled={loading}>{loading ? 'Running…' : 'Run & Preview'}</button>
      </div>
      <pre className="qb-sql-display">{sql}</pre>
      {error && <div className="qb-preview-error">{error}</div>}
      {data.length > 0 ? (
        <div className="qb-preview-table-wrap">
          <table className="qb-preview-table">
            <thead><tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr></thead>
            <tbody>{data.slice(0, 50).map((row, i) => <tr key={i}>{columns.map((col) => <td key={col}>{String(row[col] ?? '')}</td>)}</tr>)}</tbody>
          </table>
          {data.length > 50 && <div className="qb-preview-more">Showing 50 of {data.length} rows</div>}
        </div>
      ) : !loading && !error ? (
        <div className="qb-preview-empty">No data. Click Run & Preview to execute the query.</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main QueryBuilder                                                   */
/* ------------------------------------------------------------------ */

export function QueryBuilder({ widget, onClose }: QueryBuilderProps) {
  const { dashboard, update, connections, connectionSchemas } = useBuilderStore();
  const [activeTab, setActiveTab] = useState<Tab>('columns');
  const [previewData, setPreviewData] = useState<DataRecord[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const binding: WidgetBinding = widget.binding ?? {};
  const datasets = dashboard.datasets ?? [];
  const selectedDataset = datasets.find((d) => d.id === binding.datasetId);

  const fields = useMemo(() => {
    if (selectedDataset?.fields?.length) return selectedDataset.fields;
    if (selectedDataset?.datasource?.kind === 'rest' && selectedDataset.datasource.connectionId) {
      const schema = connectionSchemas[selectedDataset.datasource.connectionId];
      return fieldsFromSchema(schema);
    }
    return [];
  }, [selectedDataset, connectionSchemas]);

  const sourceName = selectedDataset?.name ?? 'unknown';
  const conn = selectedDataset?.datasource?.kind !== 'static' && 'connectionId' in (selectedDataset?.datasource ?? {})
    ? connections.find((c) => c.id === (selectedDataset?.datasource as { connectionId?: string }).connectionId)
    : undefined;

  const updateBinding = useCallback((patch: Partial<WidgetBinding>) => {
    update(widget.id, { binding: { ...binding, ...patch } });
  }, [widget.id, binding, update]);

  const handleRunPreview = useCallback(async () => {
    if (!conn) {
      setPreviewError('Select a connection-backed dataset to preview.');
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const sql = binding.sql ?? generateSqlPreview(binding, sourceName);
      const data = await connectionManager.preview(conn.id, sql, 100);
      setPreviewData(data);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
      setPreviewData([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [conn, binding, sourceName]);

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'columns', label: 'Columns', icon: '⊞' },
    { id: 'filters', label: 'Filters', icon: '⬡' },
    { id: 'sort', label: 'Sort', icon: '↕' },
    { id: 'group', label: 'Group', icon: '≡' },
    { id: 'joins', label: 'Joins', icon: '⨁' },
    { id: 'calc', label: 'Calc', icon: 'ƒ' },
    { id: 'sql', label: 'SQL', icon: '⟨⟩' },
    { id: 'preview', label: 'Preview', icon: '▶' },
  ];

  return (
    <div className="qb-root">
      <div className="qb-header">
        <span className="qb-title-icon">⊞</span>
        <span className="qb-title">Query Builder</span>
        {onClose && <button className="qb-btn-icon qb-close" onClick={onClose} title="Close">×</button>}
      </div>

      <DatasetSelector dashboard={dashboard} value={binding.datasetId} onChange={(id) => updateBinding({ datasetId: id })} />

      <div className="qb-tabs">
        {TABS.map((tab) => (
          <button key={tab.id} className={`qb-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            <span className="qb-tab-icon">{tab.icon}</span>
            <span className="qb-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="qb-content">
        {activeTab === 'columns' && <ColumnEditor fields={fields} binding={binding} onChange={updateBinding} />}
        {activeTab === 'filters' && <FilterEditor fields={fields} clauses={binding.where ?? []} label="WHERE Conditions" onChange={(w) => updateBinding({ where: w })} />}
        {activeTab === 'sort' && <SortEditor fields={fields} items={binding.orderBy ?? binding.sort} onChange={(s) => updateBinding({ orderBy: s, sort: s })} />}
        {activeTab === 'group' && (
          <div className="qb-group">
            <label className="qb-label">GROUP BY</label>
            <div className="qb-chip-list">
              {fields.map((f) => (
                <button key={f.name} className={`qb-chip ${(binding.groupBy ?? []).includes(f.name) ? 'active' : ''}`} onClick={() => {
                  const gb = binding.groupBy ?? [];
                  updateBinding({ groupBy: gb.includes(f.name) ? gb.filter((g) => g !== f.name) : [...gb, f.name] });
                }}>
                  <span className={`qb-chip-type qb-type-${f.type}`}>{f.type[0].toUpperCase()}</span>
                  {f.label ?? f.name}
                </button>
              ))}
            </div>
            {(binding.groupBy ?? []).length > 0 && (
              <>
                <label className="qb-label" style={{ marginTop: 8 }}>HAVING</label>
                <FilterEditor fields={fields} clauses={binding.having ?? []} label="" onChange={(h) => updateBinding({ having: h })} />
              </>
            )}
          </div>
        )}
        {activeTab === 'joins' && <JoinEditor dashboard={dashboard} binding={binding} fields={fields} onChange={updateBinding} />}
        {activeTab === 'calc' && <ColumnEditor fields={fields} binding={binding} onChange={updateBinding} />}
        {activeTab === 'sql' && <SqlModeEditor binding={binding} onChange={updateBinding} />}
        {activeTab === 'preview' && <QueryPreview binding={binding} sourceName={sourceName} data={previewData} loading={previewLoading} error={previewError} onRun={handleRunPreview} />}
      </div>

      <div className="qb-footer">
        <div className="qb-limit-row">
          <label className="qb-label">Limit</label>
          <input className="qb-input qb-input-sm" type="number" value={binding.limit ?? ''} onChange={(e) => updateBinding({ limit: e.target.value ? Number(e.target.value) : undefined })} placeholder="No limit" min={1} />
        </div>
      </div>
    </div>
  );
}

export { generateSqlPreview, fieldsFromSchema };
