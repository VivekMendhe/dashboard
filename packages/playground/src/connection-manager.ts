import type { ConnectionConfig, ConnectionTestResult, ConnectionType, DataRecord, DataGatewayRequest, DataGateway, SchemaColumn, SchemaInfo, SchemaTable } from '@dashboard-generator/core';

const STORAGE_KEY = 'dashboard-generator:connections:v1';
const SCHEMA_KEY = 'dashboard-generator:schemas:v1';
const CACHE_KEY = 'dashboard-generator:cache:v1';

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                                */
/* ------------------------------------------------------------------ */

const readConnections = (): ConnectionConfig[] => {
  try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ConnectionConfig[]; return Array.isArray(v) ? v : []; } catch { return []; }
};
const writeConnections = (v: ConnectionConfig[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
const readSchemas = (): Record<string, SchemaInfo> => {
  try { const v = JSON.parse(localStorage.getItem(SCHEMA_KEY) ?? '{}') as Record<string, SchemaInfo>; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
const writeSchemas = (v: Record<string, SchemaInfo>) => localStorage.setItem(SCHEMA_KEY, JSON.stringify(v));

/* ------------------------------------------------------------------ */
/*  Cache layer                                                         */
/* ------------------------------------------------------------------ */

interface CacheEntry { data: DataRecord[]; timestamp: number; ttlMs: number }
const cache = new Map<string, CacheEntry>();

const cacheKey = (connectionId: string, query: string) => `${connectionId}::${query}`;

const getCache = (connectionId: string, query: string, ttlMs: number): DataRecord[] | null => {
  const entry = cache.get(cacheKey(connectionId, query));
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttlMs) { cache.delete(cacheKey(connectionId, query)); return null; }
  return entry.data;
};

const setCache = (connectionId: string, query: string, data: DataRecord[], ttlMs: number) => {
  cache.set(cacheKey(connectionId, query), { data, timestamp: Date.now(), ttlMs });
};

const invalidateCacheForConnection = (connectionId: string) => {
  for (const key of cache.keys()) { if (key.startsWith(`${connectionId}::`)) cache.delete(key); }
};

/* ------------------------------------------------------------------ */
/*  Retry + timeout helpers                                             */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, retries: number, delayMs = 500): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) await sleep(delayMs * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    fn().then((result) => { clearTimeout(timer); resolve(result); }).catch((error) => { clearTimeout(timer); reject(error); });
  });
}

/* ------------------------------------------------------------------ */
/*  Gateway integration                                                 */
/* ------------------------------------------------------------------ */

let gateway: DataGateway | undefined;
export const configureConnectionGateway = (next?: DataGateway) => { gateway = next; };

const requestViaGateway = async (connectionId: string, path: string, method: 'GET' | 'POST', params?: Record<string, unknown>, body?: Record<string, unknown>): Promise<DataRecord[]> => {
  if (!gateway) throw new Error('No data gateway configured. Configure a server-side gateway to execute queries against remote data sources.');
  const gwParams: Record<string, string | number | boolean | null> = {};
  if (params) Object.entries(params).forEach(([k, v]) => { gwParams[k] = v as string | number | boolean | null; });
  const request: DataGatewayRequest = { connectionId, path, method, params: gwParams, body: body as Record<string, unknown> | undefined };
  return gateway(request);
};

/* ------------------------------------------------------------------ */
/*  Schema inference for file-based sources                             */
/* ------------------------------------------------------------------ */

const inferSchemaFromData = (data: DataRecord[], connectionId: string): SchemaInfo => {
  if (data.length === 0) return { connectionId, tables: [], fetchedAt: new Date().toISOString() };
  const keys = Object.keys(data[0]);
  const columns: SchemaColumn[] = keys.map((key) => {
    const sampleValues = data.slice(0, 50).map((r) => r[key]).filter((v) => v !== null && v !== undefined);
    let type = 'string';
    if (sampleValues.length > 0 && sampleValues.every((v) => typeof v === 'number')) type = 'number';
    else if (sampleValues.length > 0 && sampleValues.every((v) => typeof v === 'boolean')) type = 'boolean';
    else if (sampleValues.length > 0 && sampleValues.every((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) type = 'date';
    return { name: key, type, nullable: data.some((r) => r[key] === null || r[key] === undefined) };
  });
  return { connectionId, tables: [{ name: 'data', columns, rowCount: data.length }], fetchedAt: new Date().toISOString() };
};

/* ------------------------------------------------------------------ */
/*  File parsing helpers                                                */
/* ------------------------------------------------------------------ */

const parseCSV = (text: string, delimiter = ',', hasHeader = true): DataRecord[] => {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return [];
  if (hasHeader) {
    const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));
    return lines.slice(1).map((line) => {
      const values = line.split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, ''));
      const row: DataRecord = {};
      headers.forEach((h, i) => { const v = values[i]; row[h] = v === '' ? null : (Number.isFinite(Number(v)) && v !== '' ? Number(v) : v); });
      return row;
    });
  }
  return lines.map((line, idx) => {
    const values = line.split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: DataRecord = { _index: idx };
    values.forEach((v, i) => { row[`col${i}`] = v === '' ? null : (Number.isFinite(Number(v)) && v !== '' ? Number(v) : v); });
    return row;
  });
};

const parseJSONFile = (text: string, path?: string): DataRecord[] => {
  const parsed: unknown = JSON.parse(text);
  let data: unknown = parsed;
  if (path) { path.split('.').forEach((segment) => { if (data && typeof data === 'object') data = (data as Record<string, unknown>)[segment]; }); }
  return Array.isArray(data) ? (data as DataRecord[]) : typeof data === 'object' && data !== null ? [data as DataRecord] : [];
};

/* ------------------------------------------------------------------ */
/*  Connection Manager                                                  */
/* ------------------------------------------------------------------ */

export const connectionManager = {
  /** List all connections. */
  list(): ConnectionConfig[] { return readConnections(); },

  /** Get a single connection by ID. */
  get(id: string): ConnectionConfig | undefined { return readConnections().find((c) => c.id === id); },

  /** Create a new connection. */
  create(config: Omit<ConnectionConfig, 'createdAt' | 'updatedAt'>): ConnectionConfig {
    const now = new Date().toISOString();
    const connection: ConnectionConfig = { ...config, createdAt: now, updatedAt: now };
    const connections = readConnections();
    connections.push(connection);
    writeConnections(connections);
    return connection;
  },

  /** Update an existing connection. */
  update(id: string, patch: Partial<ConnectionConfig>): ConnectionConfig | undefined {
    const connections = readConnections();
    const idx = connections.findIndex((c) => c.id === id);
    if (idx === -1) return undefined;
    connections[idx] = { ...connections[idx], ...patch, id, updatedAt: new Date().toISOString() };
    writeConnections(connections);
    return connections[idx];
  },

  /** Remove a connection. */
  remove(id: string): boolean {
    const connections = readConnections();
    const filtered = connections.filter((c) => c.id !== id);
    if (filtered.length === connections.length) return false;
    writeConnections(filtered);
    invalidateCacheForConnection(id);
    const schemas = readSchemas();
    delete schemas[id];
    writeSchemas(schemas);
    return true;
  },

  /** Test a connection by executing a lightweight query. */
  async test(id: string): Promise<ConnectionTestResult> {
    const config = connectionManager.get(id);
    if (!config) return { success: false, message: 'Connection not found.' };
    const start = Date.now();
    try {
      const testQuery = getTestQuery(config);
      const data = await withRetry(() => withTimeout(() => executeQuery(config, testQuery), config.timeout ?? 30000), config.retries ?? 2);
      const latencyMs = Date.now() - start;
      const schema = inferSchemaFromData(data, id);
      connectionManager.update(id, { lastTested: new Date().toISOString(), lastTestResult: 'success', lastTestError: undefined });
      return { success: true, message: `Connected successfully in ${latencyMs}ms. Returned ${data.length} rows.`, latencyMs, schema };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      connectionManager.update(id, { lastTested: new Date().toISOString(), lastTestResult: 'error', lastTestError: message });
      return { success: false, message };
    }
  },

  /** Fetch schema for a connection. */
  async getSchema(id: string): Promise<SchemaInfo> {
    const cached = readSchemas()[id];
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 5 * 60 * 1000) return cached;
    const config = connectionManager.get(id);
    if (!config) return { connectionId: id, tables: [], fetchedAt: new Date().toISOString() };
    try {
      const schema = await fetchSchema(config);
      const schemas = readSchemas();
      schemas[id] = schema;
      writeSchemas(schemas);
      return schema;
    } catch {
      return { connectionId: id, tables: [], fetchedAt: new Date().toISOString() };
    }
  },

  /** Execute a query and return preview data. */
  async preview(id: string, query: string, limit = 100): Promise<DataRecord[]> {
    const config = connectionManager.get(id);
    if (!config) throw new Error('Connection not found');
    const limitedQuery = appendLimit(query, config.type, limit);
    const cached = getCache(id, limitedQuery, (config.cacheTTL ?? 60) * 1000);
    if (cached) return cached;
    const data = await withRetry(() => withTimeout(() => executeQuery(config, limitedQuery), config.timeout ?? 30000), config.retries ?? 2);
    setCache(id, limitedQuery, data, (config.cacheTTL ?? 60) * 1000);
    return data;
  },

  /** Execute a query (used by datasources at load time). */
  async execute(id: string, query: string, params?: Record<string, unknown>): Promise<DataRecord[]> {
    const config = connectionManager.get(id);
    if (!config) throw new Error(`Connection ${id} not found`);
    const cached = getCache(id, query, (config.cacheTTL ?? 0) * 1000);
    if (cached) return cached;
    const data = await withRetry(() => withTimeout(() => executeQuery(config, query, params), config.timeout ?? 30000), config.retries ?? 2);
    if (config.cacheTTL && config.cacheTTL > 0) setCache(id, query, data, config.cacheTTL * 1000);
    return data;
  },

  /** Invalidate cache for a connection. */
  invalidateCache(id: string) { invalidateCacheForConnection(id); },

  /** Get connection type metadata. */
  getTypeInfo(type: ConnectionType): { label: string; icon: string; fields: string[]; description: string } {
    return CONNECTION_TYPES[type] ?? { label: type, icon: '◇', fields: [], description: '' };
  },
};

/* ------------------------------------------------------------------ */
/*  Connection type metadata                                            */
/* ------------------------------------------------------------------ */

export const CONNECTION_TYPES: Record<ConnectionType, { label: string; icon: string; category: string; fields: string[]; description: string; defaultPort?: number }> = {
  rest: { label: 'REST API', icon: '⇄', category: 'API', fields: ['baseUrl', 'authType'], description: 'RESTful HTTP endpoints', defaultPort: 443 },
  graphql: { label: 'GraphQL', icon: '◆', category: 'API', fields: ['endpoint', 'authType'], description: 'GraphQL API endpoints', defaultPort: 443 },
  mysql: { label: 'MySQL', icon: '🐬', category: 'Database', fields: ['host', 'port', 'database', 'username', 'password'], description: 'MySQL / MariaDB', defaultPort: 3306 },
  postgres: { label: 'PostgreSQL', icon: '🐘', category: 'Database', fields: ['host', 'port', 'database', 'schema', 'username', 'password'], description: 'PostgreSQL', defaultPort: 5432 },
  sqlserver: { label: 'SQL Server', icon: '🏢', category: 'Database', fields: ['host', 'port', 'database', 'username', 'password'], description: 'Microsoft SQL Server', defaultPort: 1433 },
  oracle: { label: 'Oracle', icon: '🔴', category: 'Database', fields: ['host', 'port', 'database', 'username', 'password'], description: 'Oracle Database', defaultPort: 1521 },
  mongodb: { label: 'MongoDB', icon: '🍃', category: 'Database', fields: ['host', 'port', 'database', 'authDb', 'username', 'password'], description: 'MongoDB', defaultPort: 27017 },
  snowflake: { label: 'Snowflake', icon: '❄', category: 'Warehouse', fields: ['account', 'warehouse', 'database', 'schema', 'username', 'password', 'role'], description: 'Snowflake Data Cloud' },
  bigquery: { label: 'BigQuery', icon: '🔷', category: 'Warehouse', fields: ['projectId', 'dataset', 'keyFile'], description: 'Google BigQuery' },
  csv: { label: 'CSV File', icon: '📄', category: 'File', fields: ['fileUrl', 'delimiter', 'hasHeader'], description: 'Comma-separated values file' },
  excel: { label: 'Excel File', icon: '📊', category: 'File', fields: ['fileUrl', 'sheet'], description: 'Microsoft Excel spreadsheet' },
  jsonfile: { label: 'JSON File', icon: '{ }', category: 'File', fields: ['fileUrl', 'path'], description: 'JSON data file' },
};

/* ------------------------------------------------------------------ */
/*  Query execution                                                     */
/* ------------------------------------------------------------------ */

const getTestQuery = (config: ConnectionConfig): string => {
  switch (config.type) {
    case 'mysql': case 'postgres': case 'sqlserver': case 'oracle': return 'SELECT 1 AS test';
    case 'snowflake': case 'bigquery': return 'SELECT 1 AS test';
    case 'mongodb': return JSON.stringify({ collection: config.database ?? 'test', limit: 1 });
    case 'rest': return '/';
    case 'graphql': return '{ __typename }';
    case 'csv': case 'excel': case 'jsonfile': return '__preview__';
    default: return '';
  }
};

const appendLimit = (query: string, type: ConnectionType, limit: number): string => {
  if (['csv', 'excel', 'jsonfile'].includes(type)) return query;
  if (['mongodb'].includes(type)) return query;
  if (type === 'rest' || type === 'graphql') return query;
  const upper = query.trim().toUpperCase();
  if (upper.includes('LIMIT')) return query;
  if (upper.startsWith('SELECT')) return `${query.trim()} LIMIT ${limit}`;
  return query;
};

const executeQuery = async (config: ConnectionConfig, query: string, params?: Record<string, unknown>): Promise<DataRecord[]> => {
  switch (config.type) {
    case 'rest': {
      const url = new URL(query, config.baseUrl ?? window.location.origin);
      const headers: Record<string, string> = { ...config.headers };
      applyAuth(headers, config);
      const response = await fetch(url.toString(), { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const body: unknown = await response.json();
      return Array.isArray(body) ? body as DataRecord[] : body && typeof body === 'object' ? [body as DataRecord] : [];
    }
    case 'graphql': {
      const endpoint = config.endpoint ?? config.baseUrl ?? '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...config.headers };
      applyAuth(headers, config);
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ query, variables: params }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const json = await response.json();
      return json.data && typeof json.data === 'object' ? Object.values(json.data).find(Array.isArray) as DataRecord[] ?? [json.data as DataRecord] : [];
    }
    case 'mysql': case 'postgres': case 'sqlserver': case 'oracle': case 'snowflake': case 'bigquery':
      return requestViaGateway(config.id!, query, 'POST', params);
    case 'mongodb':
      return requestViaGateway(config.id!, 'query', 'POST', params ?? JSON.parse(query));
    case 'csv': {
      const text = config.fileUrl ? await fetchText(config.fileUrl) : query;
      return parseCSV(text, config.delimiter ?? ',', config.hasHeader !== false);
    }
    case 'excel': {
      throw new Error('Excel parsing requires a server-side adapter. Configure a gateway connection for Excel files.');
    }
    case 'jsonfile': {
      const text = config.fileUrl ? await fetchText(config.fileUrl) : query;
      return parseJSONFile(text, config.fileUrl ? undefined : undefined);
    }
    default: throw new Error(`Unsupported connection type: ${config.type}`);
  }
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  return response.text();
};

const applyAuth = (headers: Record<string, string>, config: ConnectionConfig) => {
  switch (config.authType) {
    case 'bearer': headers['Authorization'] = `Bearer ${config.authToken}`; break;
    case 'basic': headers['Authorization'] = `Basic ${btoa(`${config.username}:${config.password}`)}`; break;
    case 'api-key': headers[config.apiKeyHeader ?? 'X-API-Key'] = config.authToken ?? ''; break;
  }
};

/* ------------------------------------------------------------------ */
/*  Schema fetching                                                     */
/* ------------------------------------------------------------------ */

const fetchSchema = async (config: ConnectionConfig): Promise<SchemaInfo> => {
  const base: SchemaInfo = { connectionId: config.id, tables: [], fetchedAt: new Date().toISOString() };
  switch (config.type) {
    case 'mysql': {
      const data = await requestViaGateway(config.id, `SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${config.database}'`, 'POST');
      const tables: SchemaTable[] = await Promise.all(data.map(async (row) => {
        const cols = await requestViaGateway(config.id, `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${config.database}' AND TABLE_NAME = '${row.TABLE_NAME}' ORDER BY ORDINAL_POSITION`, 'POST');
        return { name: String(row.TABLE_NAME), columns: cols.map((c) => ({ name: String(c.COLUMN_NAME), type: String(c.DATA_TYPE), nullable: c.IS_NULLABLE === 'YES', primaryKey: c.COLUMN_KEY === 'PRI' })), rowCount: Number(row.TABLE_ROWS ?? 0) };
      }));
      return { ...base, tables };
    }
    case 'postgres': {
      const data = await requestViaGateway(config.id, `SELECT tablename, schemaname FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`, 'POST');
      const tables: SchemaTable[] = await Promise.all(data.map(async (row) => {
        const cols = await requestViaGateway(config.id, `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = '${row.schemaname}' AND table_name = '${row.tablename}' ORDER BY ordinal_position`, 'POST');
        return { name: String(row.tablename), schema: String(row.schemaname), columns: cols.map((c) => ({ name: String(c.column_name), type: String(c.data_type), nullable: c.is_nullable === 'YES' })) };
      }));
      return { ...base, tables };
    }
    case 'sqlserver': {
      const data = await requestViaGateway(config.id, "SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'", 'POST');
      const tables: SchemaTable[] = await Promise.all(data.map(async (row) => {
        const cols = await requestViaGateway(config.id, `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${row.TABLE_NAME}' ORDER BY ORDINAL_POSITION`, 'POST');
        return { name: String(row.TABLE_NAME), columns: cols.map((c) => ({ name: String(c.COLUMN_NAME), type: String(c.DATA_TYPE), nullable: c.IS_NULLABLE === 'YES' })), rowCount: Number(row.TABLE_ROWS ?? 0) };
      }));
      return { ...base, tables };
    }
    case 'oracle': {
      const data = await requestViaGateway(config.id, "SELECT TABLE_NAME FROM USER_TABLES ORDER BY TABLE_NAME", 'POST');
      const tables: SchemaTable[] = await Promise.all(data.map(async (row) => {
        const cols = await requestViaGateway(config.id, `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '${row.TABLE_NAME}' ORDER BY COLUMN_ID`, 'POST');
        return { name: String(row.TABLE_NAME), columns: cols.map((c) => ({ name: String(c.COLUMN_NAME), type: String(c.DATA_TYPE), nullable: c.NULLABLE === 'Y' })) };
      }));
      return { ...base, tables };
    }
    case 'mongodb': {
      const data = await requestViaGateway(config.id, 'listCollections', 'POST');
      const tables: SchemaTable[] = data.map((row) => ({ name: String(row.name ?? row.collection ?? ''), columns: [{ name: '_id', type: 'objectId', nullable: false, primaryKey: true }] }));
      return { ...base, tables };
    }
    case 'snowflake': {
      const data = await requestViaGateway(config.id, `SELECT TABLE_NAME, ROW_COUNT FROM ${config.database}.${config.schema ?? 'PUBLIC'}.INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`, 'POST');
      const tables: SchemaTable[] = data.map((row) => ({ name: String(row.TABLE_NAME), rowCount: Number(row.ROW_COUNT ?? 0), columns: [] }));
      return { ...base, tables };
    }
    case 'bigquery': {
      const data = await requestViaGateway(config.id, `SELECT table_name, row_count FROM \`${config.projectId}.${config.dataset}.__TABLES__\``, 'POST');
      const tables: SchemaTable[] = data.map((row) => ({ name: String(row.table_name), rowCount: Number(row.row_count ?? 0), columns: [] }));
      return { ...base, tables };
    }
    case 'csv': case 'excel': case 'jsonfile': {
      const data = config.fileUrl ? await executeQuery(config, '__preview__') : [];
      return inferSchemaFromData(data, config.id);
    }
    default: return base;
  }
};
