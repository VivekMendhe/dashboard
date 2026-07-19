import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionConfig, ConnectionTestResult, ConnectionType, DashboardConfig, DataRecord, SchemaColumn, SchemaInfo, SchemaTable } from '@dashboard-generator/core';
import { browserDashboardRepository, connectionManager, CONNECTION_TYPES, dashboardTemplates, localSession, useBuilderStore, dashboardManager, autosaveController, brandingManager, dedupeRequest, globalCache, perfMonitor, ErrorBoundary, PanelSpinner, LazySharePanel, LazyCollaborationPanel, LazySecurityPanel, LazyBrandingPanel, LazyPluginPanel, LazyAIPanel, LazyDashboardManager, LazyResponsivePanel, LazyAdminPanel, PerfMonitorPanel, WorkspaceToolbar } from '@dashboard-generator/playground';
import { DashboardBuilder } from './builder';

type Panel = 'templates' | 'versions' | 'share' | 'data' | 'schedule' | 'collaborate' | 'security' | 'branding' | 'plugins' | 'ai' | 'responsive' | 'admin' | undefined;
type DsmTab = 'schema' | 'preview' | 'settings';
const clone = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;

/* ------------------------------------------------------------------ */
/*  DataSourceManager – full connection management modal                */
/* ------------------------------------------------------------------ */

const DataSourceManager = memo(function DataSourceManager() {
  const { connections, activeConnectionId, connectionSchemas, connectionTestResults, connectionTesting, setActiveConnection, addConnection, updateConnection, removeConnection, testConnection, refreshSchema, previewData, closeDataSourceManager } = useBuilderStore();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<DsmTab>('schema');
  const [previewData_, setPreviewData_] = useState<DataRecord[]>([]);
  const [previewQuery, setPreviewQuery] = useState('SELECT * FROM data LIMIT 100');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [filterType, setFilterType] = useState<ConnectionType | 'all'>('all');
  const [newConnType, setNewConnType] = useState<ConnectionType>('rest');
  const [showNewForm, setShowNewForm] = useState(false);

  const conn = connections.find((c) => c.id === activeConnectionId);
  const schema = conn ? connectionSchemas[conn.id] : undefined;
  const testResult = conn ? connectionTestResults[conn.id] : undefined;
  const testing = conn ? connectionTesting[conn.id] : false;

  const filtered = connections.filter((c) => {
    if (filterType !== 'all' && c.type !== filterType) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.type.includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const groups: Record<string, ConnectionConfig[]> = {};
    filtered.forEach((c) => {
      const cat = CONNECTION_TYPES[c.type]?.category ?? 'Other';
      (groups[cat] ??= []).push(c);
    });
    return groups;
  }, [filtered]);

  const handleCreate = useCallback(() => {
    const now = new Date().toISOString();
    const conn = addConnection({
      id: `conn-${Date.now()}`,
      name: `New ${CONNECTION_TYPES[newConnType].label}`,
      type: newConnType,
      port: CONNECTION_TYPES[newConnType].defaultPort,
      timeout: 30000,
      retries: 2,
      cacheTTL: 60,
    });
    setShowNewForm(false);
    setActiveConnection(conn.id);
  }, [newConnType, addConnection, setActiveConnection]);

  const handleTest = useCallback(async () => {
    if (!conn) return;
    await testConnection(conn.id);
  }, [conn, testConnection]);

  const handleRefreshSchema = useCallback(async () => {
    if (!conn) return;
    await refreshSchema(conn.id);
  }, [conn, refreshSchema]);

  const handlePreview = useCallback(async () => {
    if (!conn) return;
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const data = await previewData(conn.id, previewQuery, 100);
      setPreviewData_(data);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
      setPreviewData_([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [conn, previewQuery, previewData]);

  const handleFileImport = useCallback(async (connId: string, text: string) => {
    const c = connections.find((x) => x.id === connId);
    if (!c) return;
    if (c.type === 'csv') {
      const delimiter = c.delimiter ?? ',';
      const hasHeader = c.hasHeader !== false;
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length === 0) { setPreviewData_([]); return; }
      const data = hasHeader
        ? lines.slice(1).map((line) => { const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, '')); const values = line.split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, '')); const row: DataRecord = {}; headers.forEach((h, i) => { const v = values[i]; row[h] = v === '' ? null : (Number.isFinite(Number(v)) && v !== '' ? Number(v) : v); }); return row; })
        : lines.map((line, idx) => { const values = line.split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, '')); const row: DataRecord = { _index: idx }; values.forEach((v, i) => { row[`col${i}`] = v === '' ? null : (Number.isFinite(Number(v)) && v !== '' ? Number(v) : v); }); return row; });
      setPreviewData_(data);
    } else if (c.type === 'jsonfile') {
      try {
        const parsed = JSON.parse(text);
        setPreviewData_(Array.isArray(parsed) ? parsed : [parsed]);
      } catch { setPreviewError('Invalid JSON'); setPreviewData_([]); }
    }
  }, [connections]);

  if (!conn && !showNewForm) {
    return (
      <div className="pg-dsm">
        <div className="pg-dsm-sidebar">
          <div className="pg-dsm-sidebar-header">
            <strong>Connections</strong>
            <button className="pg-dsm-add-btn" onClick={() => setShowNewForm(true)} title="New connection">+</button>
          </div>
          <input className="pg-dsm-search" placeholder="Search connections…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="pg-dsm-filter-row">
            {(['all', 'API', 'Database', 'Warehouse', 'File'] as const).map((cat) => (
              <button key={cat} className={`pg-dsm-filter-btn ${filterType === cat ? 'active' : ''}`} onClick={() => setFilterType(cat === 'all' ? 'all' : cat as ConnectionType | 'all')}>{cat === 'all' ? 'All' : cat}</button>
            ))}
          </div>
          <div className="pg-dsm-list">
            {Object.entries(grouped).map(([cat, conns]) => (
              <div key={cat} className="pg-dsm-group">
                <div className="pg-dsm-group-label">{cat}</div>
                {conns.map((c) => (
                  <button key={c.id} className={`pg-dsm-item ${c.id === activeConnectionId ? 'active' : ''}`} onClick={() => setActiveConnection(c.id)}>
                    <span className="pg-dsm-item-icon">{CONNECTION_TYPES[c.type]?.icon ?? '◇'}</span>
                    <span className="pg-dsm-item-info">
                      <strong>{c.name}</strong>
                      <small>{c.lastTestResult === 'success' ? '✓ Connected' : c.lastTestResult === 'error' ? '✗ Failed' : 'Not tested'}</small>
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(grouped).length === 0 && <div className="pg-dsm-empty">No connections found</div>}
          </div>
        </div>
        <div className="pg-dsm-main">
          <div className="pg-dsm-empty-state">
            <span className="pg-dsm-empty-icon">⊕</span>
            <h3>No connection selected</h3>
            <p>Create a new connection or select an existing one from the sidebar.</p>
            <button className="pg-primary-action" onClick={() => setShowNewForm(true)}>Create connection</button>
          </div>
        </div>
      </div>
    );
  }

  if (showNewForm) {
    return (
      <div className="pg-dsm">
        <div className="pg-dsm-sidebar">
          <div className="pg-dsm-sidebar-header">
            <strong>Connections</strong>
          </div>
          <input className="pg-dsm-search" placeholder="Search connections…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="pg-dsm-list">
            {connections.map((c) => (
              <button key={c.id} className="pg-dsm-item" onClick={() => { setShowNewForm(false); setActiveConnection(c.id); }}>
                <span className="pg-dsm-item-icon">{CONNECTION_TYPES[c.type]?.icon ?? '◇'}</span>
                <span className="pg-dsm-item-info"><strong>{c.name}</strong><small>{c.type}</small></span>
              </button>
            ))}
          </div>
        </div>
        <div className="pg-dsm-main">
          <div className="pg-dsm-form-header">
            <h3>New connection</h3>
          </div>
          <div className="pg-dsm-form">
            <div className="pg-dsm-field">
              <label>Type</label>
              <select value={newConnType} onChange={(e) => setNewConnType(e.target.value as ConnectionType)}>
                {Object.entries(CONNECTION_TYPES).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.icon} {meta.label}</option>
                ))}
              </select>
            </div>
            <div className="pg-dsm-type-desc">{CONNECTION_TYPES[newConnType].description}</div>
            <div className="pg-dsm-form-actions">
              <button className="pg-primary-action" onClick={handleCreate}>Create {CONNECTION_TYPES[newConnType].label} connection</button>
              <button onClick={() => setShowNewForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pg-dsm">
      <div className="pg-dsm-sidebar">
        <div className="pg-dsm-sidebar-header">
          <strong>Connections</strong>
          <button className="pg-dsm-add-btn" onClick={() => setShowNewForm(true)} title="New connection">+</button>
        </div>
        <input className="pg-dsm-search" placeholder="Search connections…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="pg-dsm-filter-row">
          {(['all', 'API', 'Database', 'Warehouse', 'File'] as const).map((cat) => (
            <button key={cat} className={`pg-dsm-filter-btn ${filterType === cat ? 'active' : ''}`} onClick={() => setFilterType(cat === 'all' ? 'all' : cat as ConnectionType | 'all')}>{cat === 'all' ? 'All' : cat}</button>
          ))}
        </div>
        <div className="pg-dsm-list">
          {connections.map((c) => (
            <button key={c.id} className={`pg-dsm-item ${c.id === activeConnectionId ? 'active' : ''}`} onClick={() => setActiveConnection(c.id)}>
              <span className="pg-dsm-item-icon">{CONNECTION_TYPES[c.type]?.icon ?? '◇'}</span>
              <span className="pg-dsm-item-info">
                <strong>{c.name}</strong>
                <small>{c.lastTestResult === 'success' ? '✓ Connected' : c.lastTestResult === 'error' ? '✗ Failed' : 'Not tested'}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="pg-dsm-main">
        <ConnectionForm conn={conn} onUpdate={updateConnection} onTest={handleTest} testing={testing} testResult={testResult} onRefreshSchema={handleRefreshSchema} />
        <div className="pg-dsm-tabs">
          <button className={activeTab === 'schema' ? 'active' : ''} onClick={() => setActiveTab('schema')}>Schema</button>
          <button className={activeTab === 'preview' ? 'active' : ''} onClick={() => setActiveTab('preview')}>Preview</button>
          <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>Settings</button>
        </div>
        {activeTab === 'schema' && <SchemaExplorer schema={schema} onRefresh={handleRefreshSchema} />}
        {activeTab === 'preview' && <DataPreview conn={conn} data={previewData_} loading={previewLoading} error={previewError} query={previewQuery} onQueryChange={setPreviewQuery} onRun={handlePreview} onFileImport={handleFileImport} />}
        {activeTab === 'settings' && <ConnectionSettings conn={conn} onUpdate={updateConnection} onDelete={() => { removeConnection(conn.id); closeDataSourceManager(); }} />}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  ConnectionForm                                                      */
/* ------------------------------------------------------------------ */

const ConnectionForm = memo(function ConnectionForm({ conn, onUpdate, onTest, testing, testResult, onRefreshSchema }: {
  conn: ConnectionConfig; onUpdate: (id: string, patch: Partial<ConnectionConfig>) => void; onTest: () => void; testing: boolean; testResult?: ConnectionTestResult; onRefreshSchema: () => void;
}) {
  const patch = (p: Partial<ConnectionConfig>) => onUpdate(conn.id, p);
  const typeFields = CONNECTION_TYPES[conn.type]?.fields ?? [];
  const showField = (field: string) => typeFields.includes(field);

  return (
    <div className="pg-dsm-conn-form">
      <div className="pg-dsm-conn-header">
        <span className="pg-dsm-conn-type-icon">{CONNECTION_TYPES[conn.type]?.icon ?? '◇'}</span>
        <input className="pg-dsm-conn-name" value={conn.name} onChange={(e) => patch({ name: e.target.value })} />
        <span className="pg-dsm-conn-type-badge">{conn.type}</span>
        <div className="pg-dsm-conn-actions">
          <button className={`pg-dsm-test-btn ${testing ? 'testing' : ''} ${testResult?.success === true ? 'success' : ''} ${testResult?.success === false ? 'error' : ''}`} onClick={onTest} disabled={testing}>
            {testing ? 'Testing…' : testResult?.success === true ? '✓ Connected' : testResult?.success === false ? '✗ Failed' : 'Test connection'}
          </button>
          <button onClick={onRefreshSchema} title="Refresh schema">↻</button>
        </div>
      </div>
      {testResult && <div className={`pg-dsm-test-result ${testResult.success ? 'success' : 'error'}`}><span>{testResult.message}</span>{testResult.latencyMs ? <small>{testResult.latencyMs}ms</small> : null}</div>}
      <div className="pg-dsm-conn-fields">
        <div className="pg-dsm-field"><label>Description</label><input value={conn.description ?? ''} onChange={(e) => patch({ description: e.target.value })} placeholder="Optional description" /></div>
        {showField('baseUrl') && <div className="pg-dsm-field"><label>Base URL</label><input value={conn.baseUrl ?? ''} onChange={(e) => patch({ baseUrl: e.target.value })} placeholder="https://api.example.com" /></div>}
        {showField('endpoint') && <div className="pg-dsm-field"><label>GraphQL Endpoint</label><input value={conn.endpoint ?? ''} onChange={(e) => patch({ endpoint: e.target.value })} placeholder="https://api.example.com/graphql" /></div>}
        {showField('authType') && <>
          <div className="pg-dsm-field"><label>Auth type</label><select value={conn.authType ?? 'none'} onChange={(e) => patch({ authType: e.target.value as ConnectionConfig['authType'] })}><option value="none">None</option><option value="bearer">Bearer token</option><option value="basic">Basic auth</option><option value="api-key">API key</option></select></div>
          {conn.authType === 'bearer' && <div className="pg-dsm-field"><label>Token</label><input type="password" value={conn.authToken ?? ''} onChange={(e) => patch({ authToken: e.target.value })} placeholder="Bearer token" /></div>}
          {conn.authType === 'basic' && <>
            <div className="pg-dsm-field"><label>Username</label><input value={conn.username ?? ''} onChange={(e) => patch({ username: e.target.value })} /></div>
            <div className="pg-dsm-field"><label>Password</label><input type="password" value={conn.password ?? ''} onChange={(e) => patch({ password: e.target.value })} /></div>
          </>}
          {conn.authType === 'api-key' && <>
            <div className="pg-dsm-field"><label>API key header</label><input value={conn.apiKeyHeader ?? 'X-API-Key'} onChange={(e) => patch({ apiKeyHeader: e.target.value })} /></div>
            <div className="pg-dsm-field"><label>API key</label><input type="password" value={conn.authToken ?? ''} onChange={(e) => patch({ authToken: e.target.value })} /></div>
          </>}
        </>}
        {showField('host') && <div className="pg-dsm-field"><label>Host</label><input value={conn.host ?? ''} onChange={(e) => patch({ host: e.target.value })} placeholder="localhost" /></div>}
        {showField('port') && <div className="pg-dsm-field"><label>Port</label><input type="number" value={conn.port ?? ''} onChange={(e) => patch({ port: Number(e.target.value) || undefined })} placeholder={String(CONNECTION_TYPES[conn.type]?.defaultPort ?? '')} /></div>}
        {showField('database') && <div className="pg-dsm-field"><label>Database</label><input value={conn.database ?? ''} onChange={(e) => patch({ database: e.target.value })} /></div>}
        {showField('schema') && <div className="pg-dsm-field"><label>Schema</label><input value={conn.schema ?? ''} onChange={(e) => patch({ schema: e.target.value })} placeholder="public" /></div>}
        {showField('authDb') && <div className="pg-dsm-field"><label>Auth database</label><input value={conn.authDb ?? ''} onChange={(e) => patch({ authDb: e.target.value })} placeholder="admin" /></div>}
        {showField('username') && <div className="pg-dsm-field"><label>Username</label><input value={conn.username ?? ''} onChange={(e) => patch({ username: e.target.value })} /></div>}
        {showField('password') && <div className="pg-dsm-field"><label>Password</label><input type="password" value={conn.password ?? ''} onChange={(e) => patch({ password: e.target.value })} /></div>}
        {showField('account') && <div className="pg-dsm-field"><label>Account</label><input value={conn.account ?? ''} onChange={(e) => patch({ account: e.target.value })} placeholder="xy12345.us-east-1" /></div>}
        {showField('warehouse') && <div className="pg-dsm-field"><label>Warehouse</label><input value={conn.warehouse ?? ''} onChange={(e) => patch({ warehouse: e.target.value })} /></div>}
        {showField('role') && <div className="pg-dsm-field"><label>Role</label><input value={conn.role ?? ''} onChange={(e) => patch({ role: e.target.value })} placeholder="PUBLIC" /></div>}
        {showField('projectId') && <div className="pg-dsm-field"><label>Project ID</label><input value={conn.projectId ?? ''} onChange={(e) => patch({ projectId: e.target.value })} /></div>}
        {showField('dataset') && <div className="pg-dsm-field"><label>Dataset</label><input value={conn.dataset ?? ''} onChange={(e) => patch({ dataset: e.target.value })} /></div>}
        {showField('keyFile') && <div className="pg-dsm-field"><label>Key file path</label><input value={conn.keyFile ?? ''} onChange={(e) => patch({ keyFile: e.target.value })} placeholder="/path/to/service-account.json" /></div>}
        {showField('fileUrl') && <div className="pg-dsm-field"><label>File URL</label><input value={conn.fileUrl ?? ''} onChange={(e) => patch({ fileUrl: e.target.value })} placeholder="https://example.com/data.csv" /></div>}
        {showField('delimiter') && <div className="pg-dsm-field"><label>Delimiter</label><input value={conn.delimiter ?? ','} onChange={(e) => patch({ delimiter: e.target.value })} placeholder="," /></div>}
        {showField('hasHeader') && <div className="pg-dsm-field"><label>Has header row</label><select value={conn.hasHeader !== false ? 'true' : 'false'} onChange={(e) => patch({ hasHeader: e.target.value === 'true' })}><option value="true">Yes</option><option value="false">No</option></select></div>}
        {showField('sheet') && <div className="pg-dsm-field"><label>Sheet name</label><input value={conn.sheet ?? ''} onChange={(e) => patch({ sheet: e.target.value })} placeholder="Sheet1" /></div>}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  SchemaExplorer                                                      */
/* ------------------------------------------------------------------ */

const SchemaExplorer = memo(function SchemaExplorer({ schema, onRefresh }: { schema?: SchemaInfo; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!schema || schema.tables.length === 0) {
    return (
      <div className="pg-dsm-schema-empty">
        <p>No schema available. Click Refresh to fetch the schema from the data source.</p>
        <button onClick={onRefresh}>Refresh schema</button>
      </div>
    );
  }
  const toggle = (name: string) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  return (
    <div className="pg-dsm-schema">
      <div className="pg-dsm-schema-header"><span>{schema.tables.length} table{schema.tables.length !== 1 ? 's' : ''}</span><small>Fetched {new Date(schema.fetchedAt).toLocaleTimeString()}</small></div>
      {schema.tables.map((table) => (
        <div key={table.name} className="pg-dsm-schema-table">
          <button className="pg-dsm-schema-table-head" onClick={() => toggle(table.name)}>
            <span className="pg-dsm-schema-arrow">{expanded[table.name] ? '▾' : '▸'}</span>
            <span className="pg-dsm-schema-table-icon">⊞</span>
            <span className="pg-dsm-schema-table-name">{table.name}</span>
            {table.rowCount !== undefined && <span className="pg-dsm-schema-table-count">{table.rowCount.toLocaleString()} rows</span>}
          </button>
          {expanded[table.name] && (
            <div className="pg-dsm-schema-columns">
              {table.columns.map((col) => (
                <div key={col.name} className="pg-dsm-schema-col">
                  <span className={`pg-dsm-schema-col-type ${col.primaryKey ? 'pk' : ''}`}>{col.primaryKey ? '🔑' : col.type}</span>
                  <span className="pg-dsm-schema-col-name">{col.name}</span>
                  {col.nullable && <span className="pg-dsm-schema-col-nullable">?</span>}
                </div>
              ))}
              {table.columns.length === 0 && <div className="pg-dsm-schema-no-cols">No column info available</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  DataPreview                                                         */
/* ------------------------------------------------------------------ */

const DataPreview = memo(function DataPreview({ conn, data, loading, error, query, onQueryChange, onRun, onFileImport }: {
  conn: ConnectionConfig; data: DataRecord[]; loading: boolean; error: string; query: string; onQueryChange: (q: string) => void; onRun: () => void; onFileImport: (id: string, text: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isFile = ['csv', 'excel', 'jsonfile'].includes(conn.type);
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') onFileImport(conn.id, reader.result); };
    reader.readAsText(file);
  }, [conn.id, onFileImport]);

  return (
    <div className="pg-dsm-preview">
      {!isFile && (
        <div className="pg-dsm-preview-query">
          <textarea value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Enter SQL query…" spellCheck={false} />
          <button className="pg-primary-action" onClick={onRun} disabled={loading}>{loading ? 'Running…' : 'Run query'}</button>
        </div>
      )}
      {isFile && (
        <div className="pg-dsm-preview-file">
          <button onClick={() => fileRef.current?.click()}>Choose file</button>
          <input ref={fileRef} type="file" accept=".csv,.json,.txt" onChange={handleFile} hidden />
          {conn.fileUrl && <small>URL: {conn.fileUrl}</small>}
        </div>
      )}
      {error && <div className="pg-dsm-preview-error">{error}</div>}
      {data.length > 0 ? (
        <div className="pg-dsm-preview-table-wrap">
          <table className="pg-dsm-preview-table">
            <thead><tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr></thead>
            <tbody>{data.slice(0, 100).map((row, i) => <tr key={i}>{columns.map((col) => <td key={col}>{String(row[col] ?? '')}</td>)}</tr>)}</tbody>
          </table>
          {data.length > 100 && <div className="pg-dsm-preview-more">Showing 100 of {data.length} rows</div>}
        </div>
      ) : !loading && !error ? (
        <div className="pg-dsm-preview-empty">No data. Run a query or import a file to see results.</div>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  ConnectionSettings                                                  */
/* ------------------------------------------------------------------ */

const ConnectionSettings = memo(function ConnectionSettings({ conn, onUpdate, onDelete }: {
  conn: ConnectionConfig; onUpdate: (id: string, patch: Partial<ConnectionConfig>) => void; onDelete: () => void;
}) {
  const patch = (p: Partial<ConnectionConfig>) => onUpdate(conn.id, p);
  return (
    <div className="pg-dsm-settings">
      <div className="pg-dsm-settings-section">
        <h4>Performance</h4>
        <div className="pg-dsm-settings-row">
          <div className="pg-dsm-field"><label>Timeout (ms)</label><input type="number" value={conn.timeout ?? 30000} onChange={(e) => patch({ timeout: Number(e.target.value) || 30000 })} min={1000} max={300000} step={1000} /></div>
          <div className="pg-dsm-field"><label>Retries</label><input type="number" value={conn.retries ?? 2} onChange={(e) => patch({ retries: Number(e.target.value) || 0 })} min={0} max={10} /></div>
        </div>
        <div className="pg-dsm-field"><label>Cache TTL (seconds)</label><input type="number" value={conn.cacheTTL ?? 60} onChange={(e) => patch({ cacheTTL: Number(e.target.value) || 0 })} min={0} max={86400} step={10} /></div>
      </div>
      <div className="pg-dsm-settings-section">
        <h4>Connection info</h4>
        <div className="pg-dsm-settings-info">
          <div><span>ID</span><code>{conn.id}</code></div>
          <div><span>Created</span><small>{new Date(conn.createdAt).toLocaleString()}</small></div>
          <div><span>Updated</span><small>{new Date(conn.updatedAt).toLocaleString()}</small></div>
          {conn.lastTested && <div><span>Last tested</span><small>{new Date(conn.lastTested).toLocaleString()} — {conn.lastTestResult}</small></div>}
          {conn.lastTestError && <div><span>Last error</span><small className="pg-dsm-error-text">{conn.lastTestError}</small></div>}
        </div>
      </div>
      <div className="pg-dsm-settings-section pg-dsm-settings-danger">
        <h4>Danger zone</h4>
        <p>Deleting this connection will remove it from all dashboards that reference it.</p>
        <button className="pg-dsm-delete-btn" onClick={onDelete}>Delete connection</button>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  EnterpriseControls                                                 */
/* ------------------------------------------------------------------ */

const EnterpriseControls = memo(function EnterpriseControls() {
  const [panel, setPanel] = useState<Panel>();
  const [notice, setNotice] = useState('');
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof browserDashboardRepository.listVersions>>>([]);
  const { dashboard, setDashboard, dataSourceManagerOpen, openDataSourceManager, closeDataSourceManager, dashboardListOpen, openDashboardList, closeDashboardList, saveCurrentDashboard, autosaveActive, toggleAutosave, currentMeta } = useBuilderStore();
  const close = useCallback(() => { setPanel(undefined); setNotice(''); }, []);
  const saveVersion = useCallback(async () => { const saved = await browserDashboardRepository.save({ workspaceId: localSession.workspaceId, dashboard, actorId: localSession.userId }); setVersions(await browserDashboardRepository.listVersions(localSession.workspaceId, dashboard.id)); setNotice(`Version ${saved.revision.revision} saved`); }, [dashboard]);
  const openVersions = useCallback(async () => { setPanel('versions'); setVersions(await browserDashboardRepository.listVersions(localSession.workspaceId, dashboard.id)); }, [dashboard.id]);
  const applyTemplate = useCallback((template: DashboardConfig) => { const next = clone(template); next.id = `dashboard-${Date.now()}`; setDashboard(next); close(); }, [setDashboard, close]);
  const update = useCallback((patch: Partial<DashboardConfig>) => setDashboard({ ...dashboard, ...patch }), [dashboard, setDashboard]);
  const handleCreateNew = useCallback(() => { const id = `dashboard-${Date.now()}`; const newDash = { id, title: 'Untitled dashboard', description: '', version: '1.0.0', theme: 'light' as const, widgets: [] }; dashboardManager.create(newDash, { title: 'Untitled dashboard' }); setDashboard(newDash); closeDashboardList(); }, [setDashboard, closeDashboardList]);
  const handleSelectDashboard = useCallback((config: DashboardConfig) => { setDashboard(config); closeDashboardList(); }, [setDashboard, closeDashboardList]);

  const panelTitle = useMemo(() => {
    if (panel === 'templates') return 'Start from a template';
    if (panel === 'versions') return 'Version history';
    if (panel === 'share') return 'Sharing and permissions';
    if (panel === 'collaborate') return 'Collaboration';
    if (panel === 'security') return 'Enterprise Security';
    if (panel === 'branding') return 'White-Label Branding';
    if (panel === 'plugins') return 'Plugin Marketplace';
    if (panel === 'ai') return 'AI Dashboard Assistant';
    if (panel === 'responsive') return 'Responsive Layouts';
    if (panel === 'admin') return 'Admin Portal';
    return 'Scheduled delivery';
  }, [panel]);

  const handleApplyAI = useCallback((config: DashboardConfig) => { setDashboard(config); close(); }, [setDashboard, close]);
  const handleBrandingTheme = useCallback(() => brandingManager.applyTheme(false), []);

  const toolbarItems = useMemo(() => [
    { id: 'dashboards', label: 'Dashboards', icon: '📋', onClick: openDashboardList },
    { id: 'templates', label: 'Templates', icon: '📑', onClick: () => setPanel('templates') },
    { id: 'versions', label: 'Versions', icon: '🕐', onClick: openVersions },
    { id: 'data', label: 'Data', icon: '⊞', onClick: openDataSourceManager },
    { id: 'share', label: 'Share', icon: '🔗', onClick: () => setPanel('share') },
    { id: 'collaborate', label: 'Collaborate', icon: '👥', onClick: () => setPanel('collaborate') },
    { id: 'security', label: 'Security', icon: '🔒', onClick: () => setPanel('security') },
    { id: 'branding', label: 'Branding', icon: '🎨', onClick: () => setPanel('branding') },
    { id: 'plugins', label: 'Plugins', icon: '🧩', onClick: () => setPanel('plugins') },
    { id: 'ai', label: 'AI', icon: '✨', onClick: () => setPanel('ai'), fontWeight: 600 },
    { id: 'responsive', label: 'Responsive', icon: '📱', onClick: () => setPanel('responsive') },
    { id: 'admin', label: 'Admin', icon: '⚙', onClick: () => setPanel('admin'), fontWeight: 600 },
    { id: 'schedule', label: 'Schedule', icon: '⏰', onClick: () => setPanel('schedule') },
    { id: 'export', label: 'Export PDF', icon: '📄', onClick: () => window.print() },
    { id: 'autosave', label: autosaveActive ? '● Auto' : '○ Manual', icon: autosaveActive ? '●' : '○', onClick: toggleAutosave, fontWeight: 400 },
  ], [openDashboardList, openVersions, openDataSourceManager, setPanel, autosaveActive, toggleAutosave]);

  const toolbarBadges = useMemo(() => {
    const badges: Record<string, string> = {};
    if (currentMeta) badges['versions'] = currentMeta.status === 'published' ? '✓' : '✎';
    return badges;
  }, [currentMeta]);

  const handleToolbarAction = useCallback((id: string) => {
    if (id === 'autosave') toggleAutosave();
  }, [toggleAutosave]);

  return (<>
    <WorkspaceToolbar items={toolbarItems} badges={toolbarBadges} />
    {dashboardListOpen && <div className="pg-modal-backdrop" role="presentation" onMouseDown={closeDashboardList}><section className="pg-dashboard-list-modal" role="dialog" aria-modal="true" aria-label="Dashboard list" onMouseDown={(e) => e.stopPropagation()}>
      <ErrorBoundary name="DashboardManager">
        <Suspense fallback={<PanelSpinner label="Loading Dashboards..." />}>
          <LazyDashboardManager onSelect={handleSelectDashboard} onCreateNew={handleCreateNew} />
        </Suspense>
      </ErrorBoundary>
    </section></div>}
    {panel && <div className="pg-modal-backdrop" role="presentation" onMouseDown={close}><section className="pg-enterprise-modal" role="dialog" aria-modal="true" aria-label={`${panel} dashboard settings`} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="pg-modal-kicker">Dashboard Studio</span><h2>{panelTitle}</h2></div><button aria-label="Close dialog" onClick={close}>Close</button></header>
      {notice && <p className="pg-modal-notice">{notice}</p>}
      {panel === 'templates' && <div className="pg-template-grid">{dashboardTemplates.map((template) => <button className="pg-template-card" key={template.id} onClick={() => applyTemplate(template.config)}><span style={{ background: template.previewColor }} /><strong>{template.name}</strong><small>{template.description}</small><em>{template.category}</em></button>)}</div>}
      {panel === 'versions' && <div className="pg-modal-stack"><p>Save named milestones locally today; replace the repository adapter with your authenticated API for team history.</p><button className="pg-primary-action" onClick={saveVersion}>Save current version</button>{versions.length ? versions.map((version) => <article className="pg-version-row" key={`${version.identity.dashboardId}-${version.revision.revision}`}><div><strong>Version {version.revision.revision}</strong><small>{new Date(version.revision.updatedAt).toLocaleString()}</small></div><button onClick={() => { setDashboard(clone(version.config)); close(); }}>Restore</button></article>) : <div className="pg-modal-empty">No saved versions yet.</div>}</div>}
      <ErrorBoundary name={panelTitle}>
        <Suspense fallback={<PanelSpinner label={panelTitle} />}>
          {panel === 'share' && <LazySharePanel dashboard={dashboard} onUpdate={(patch) => update(patch)} />}
          {panel === 'collaborate' && <LazyCollaborationPanel dashboardId={dashboard.id} dashboardTitle={dashboard.title} />}
          {panel === 'security' && <LazySecurityPanel />}
          {panel === 'branding' && <LazyBrandingPanel onThemeApplied={handleBrandingTheme} />}
          {panel === 'plugins' && <LazyPluginPanel />}
          {panel === 'ai' && <LazyAIPanel onApplyDashboard={handleApplyAI} />}
          {panel === 'responsive' && <LazyResponsivePanel />}
          {panel === 'admin' && <LazyAdminPanel />}
        </Suspense>
      </ErrorBoundary>
      {panel === 'schedule' && <div className="pg-modal-stack"><p>Schedule automatic delivery of this dashboard to team members.</p><div className="pg-dsm-field"><label>Enabled</label><select value={dashboard.schedule?.enabled ? 'true' : 'false'} onChange={(e) => update({ schedule: { ...dashboard.schedule, enabled: e.target.value === 'true', cadence: 'daily', recipients: [], format: 'pdf' } })}><option value="true">Yes</option><option value="false">No</option></select></div>{dashboard.schedule?.enabled && <><div className="pg-dsm-field"><label>Cadence</label><select value={dashboard.schedule.cadence} onChange={(e) => update({ schedule: { ...dashboard.schedule, cadence: e.target.value as 'daily' | 'weekly' | 'monthly' } })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div><div className="pg-dsm-field"><label>Format</label><select value={dashboard.schedule.format} onChange={(e) => update({ schedule: { ...dashboard.schedule, format: e.target.value as 'pdf' | 'png' } })}><option value="pdf">PDF</option><option value="png">PNG</option></select></div></>}</div>}
    </section></div>}
    {dataSourceManagerOpen && <div className="pg-modal-backdrop" role="presentation" onMouseDown={closeDataSourceManager}><section className="pg-enterprise-modal pg-dsm-modal" role="dialog" aria-modal="true" aria-label="Data Source Manager" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="pg-modal-kicker">Dashboard Studio</span><h2>Data Source Manager</h2></div><button aria-label="Close dialog" onClick={closeDataSourceManager}>Close</button></header><ErrorBoundary name="DataSourceManager"><DataSourceManager /></ErrorBoundary></section></div>}
  </>);
});

/** Restores the persisted dashboard before handing control to the existing builder. */
export function PersistentDashboardBuilder({ initialDashboard }: { initialDashboard: DashboardConfig }) {
  const [dashboard, setDashboard] = useState<DashboardConfig | undefined>();
  const { saveCurrentDashboard, autosaveActive } = useBuilderStore();
  useEffect(() => { let active = true; browserDashboardRepository.get(localSession.workspaceId, initialDashboard.id).then((stored) => { if (active) setDashboard(stored?.config ?? initialDashboard); }); return () => { active = false; }; }, [initialDashboard]);
  useEffect(() => { if (autosaveActive) autosaveController.start(() => saveCurrentDashboard()); return () => autosaveController.stop(); }, [autosaveActive, saveCurrentDashboard]);
  return dashboard ? (
    <ErrorBoundary name="DashboardBuilder" fallback={<div className="pg-empty">Dashboard failed to load. <button onClick={() => window.location.reload()}>Reload</button></div>}>
      <Suspense fallback={<PanelSpinner label="Loading Dashboard..." />}>
        <DashboardBuilder initialDashboard={dashboard} />
      </Suspense>
      <EnterpriseControls />
    </ErrorBoundary>
  ) : <div className="pg-empty">Loading dashboard…</div>;
}