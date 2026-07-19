import type { DataRecord, DataSourceConfig, Datasource, LoadedData, Primitive } from '@dashboard-generator/core';

/* ------------------------------------------------------------------ */
/*  Existing datasources (backward-compatible)                          */
/* ------------------------------------------------------------------ */

export const staticDatasource: Datasource = { async load(config) { return { data: config.kind === 'static' ? config.data : [], refresh: async () => config.kind === 'static' ? config.data : [] }; } };

export interface DataGatewayRequest { connectionId: string; path?: string; method: 'GET' | 'POST'; params?: Record<string, Primitive>; body?: Record<string, unknown> }
export type DataGateway = (request: DataGatewayRequest) => Promise<DataRecord[]>;
let gateway: DataGateway | undefined;
/** Configure this once in the host application to execute named connections on a trusted server. */
export const configureDataGateway = (next?: DataGateway) => { gateway = next; };

const legacyRequest = async (config: Extract<DataSourceConfig, { kind: 'rest' }>) => {
  if (!config.url) throw new Error('A REST data source requires connectionId or legacy url.');
  const url = new URL(config.url, window.location.origin);
  Object.entries(config.params ?? {}).forEach(([name, value]) => { if (value !== null) url.searchParams.set(name, String(value)); });
  const response = await fetch(url.toString(), { method: config.method ?? 'GET', headers: config.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: config.method === 'POST' ? JSON.stringify(config.body ?? config.params ?? {}) : undefined });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  const body: unknown = await response.json();
  return Array.isArray(body) ? body as DataRecord[] : [];
};
export const restDatasource: Datasource = { async load(config) { if (config.kind !== 'rest') throw new Error('Invalid REST configuration'); const request = async () => {
  if (config.connectionId) { if (!gateway) throw new Error('No secure data gateway is configured for this connection.'); return gateway({ connectionId: config.connectionId, path: config.path, method: config.method ?? 'GET', params: config.params, body: config.body }); }
  return legacyRequest(config);
}; return { data: await request(), refresh: request }; } };

/* ------------------------------------------------------------------ */
/*  Gateway-routed datasources                                          */
/* ------------------------------------------------------------------ */

const gatewayDatasource = (kind: string): Datasource => ({
  async load(config) {
    if (config.kind !== kind) throw new Error(`Invalid ${kind} configuration`);
    if (!gateway) throw new Error(`No data gateway configured. A server-side gateway is required for ${kind} data sources.`);
    const cfg = config as { connectionId: string; query?: string; collection?: string; filter?: Record<string, unknown>; projection?: Record<string, unknown>; sort?: Record<string, 1 | -1>; limit?: number; variables?: Record<string, unknown>; params?: Primitive[] };
    const request = async () => {
      if (kind === 'mongodb') {
        return gateway!({ connectionId: cfg.connectionId, path: 'query', method: 'POST', body: { collection: cfg.collection, filter: cfg.filter, projection: cfg.projection, sort: cfg.sort, limit: cfg.limit } });
      }
      if (kind === 'graphql') {
        return gateway!({ connectionId: cfg.connectionId, path: 'graphql', method: 'POST', body: { query: cfg.query, variables: cfg.variables } });
      }
      return gateway!({ connectionId: cfg.connectionId, path: cfg.query, method: 'POST', body: cfg.params ? { params: cfg.params } : undefined });
    };
    return { data: await request(), refresh: request };
  }
});

export const graphqlDatasource = gatewayDatasource('graphql');
export const mysqlDatasource = gatewayDatasource('mysql');
export const postgresDatasource = gatewayDatasource('postgres');
export const sqlserverDatasource = gatewayDatasource('sqlserver');
export const oracleDatasource = gatewayDatasource('oracle');
export const mongodbDatasource = gatewayDatasource('mongodb');
export const snowflakeDatasource = gatewayDatasource('snowflake');
export const bigqueryDatasource = gatewayDatasource('bigquery');

/* ------------------------------------------------------------------ */
/*  File-based datasources (client-side parsing)                        */
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

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  return response.text();
};

export const csvDatasource: Datasource = {
  async load(config) {
    if (config.kind !== 'csv') throw new Error('Invalid CSV configuration');
    const request = async () => {
      if (config.fileUrl) { const text = await fetchText(config.fileUrl); return parseCSV(text, config.delimiter ?? ',', config.hasHeader !== false); }
      if (gateway && config.connectionId) return gateway({ connectionId: config.connectionId, path: '__preview__', method: 'POST' });
      return [];
    };
    return { data: await request(), refresh: request };
  }
};

export const excelDatasource: Datasource = {
  async load(config) {
    if (config.kind !== 'excel') throw new Error('Invalid Excel configuration');
    const request = async () => {
      if (gateway && config.connectionId) return gateway({ connectionId: config.connectionId, path: 'excel', method: 'POST', body: { sheet: config.sheet } });
      throw new Error('Excel parsing requires a server-side adapter.');
    };
    return { data: await request(), refresh: request };
  }
};

export const jsonFileDatasource: Datasource = {
  async load(config) {
    if (config.kind !== 'jsonfile') throw new Error('Invalid JSON file configuration');
    const request = async () => {
      if (config.fileUrl) {
        const text = await fetchText(config.fileUrl);
        const parsed: unknown = JSON.parse(text);
        return Array.isArray(parsed) ? parsed as DataRecord[] : typeof parsed === 'object' && parsed !== null ? [parsed as DataRecord] : [];
      }
      if (gateway && config.connectionId) return gateway({ connectionId: config.connectionId, path: '__preview__', method: 'POST' });
      return [];
    };
    return { data: await request(), refresh: request };
  }
};

/* ------------------------------------------------------------------ */
/*  Registry + loadData                                                 */
/* ------------------------------------------------------------------ */

import { registerDatasource, getDatasource } from '@dashboard-generator/core';

registerDatasource('static', staticDatasource);
registerDatasource('rest', restDatasource);
registerDatasource('graphql', graphqlDatasource);
registerDatasource('mysql', mysqlDatasource);
registerDatasource('postgres', postgresDatasource);
registerDatasource('sqlserver', sqlserverDatasource);
registerDatasource('oracle', oracleDatasource);
registerDatasource('mongodb', mongodbDatasource);
registerDatasource('snowflake', snowflakeDatasource);
registerDatasource('bigquery', bigqueryDatasource);
registerDatasource('csv', csvDatasource);
registerDatasource('excel', excelDatasource);
registerDatasource('jsonfile', jsonFileDatasource);

export async function loadData(config?: DataSourceConfig): Promise<LoadedData> {
  if (!config) return { data: [], refresh: async () => [] };
  // Backward-compatible fast paths
  if (config.kind === 'static') return staticDatasource.load(config);
  if (config.kind === 'rest') return restDatasource.load(config);
  // Dispatch via registry for all other kinds
  const ds = getDatasource(config.kind);
  if (ds) return ds.load(config);
  throw new Error(`Unknown data source kind: ${config.kind}`);
}
