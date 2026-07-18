import type { DataRecord, DataSourceConfig, Datasource, LoadedData, Primitive } from '@dashboard-generator/core';
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
export async function loadData(config?: DataSourceConfig): Promise<LoadedData> { if (!config) return { data: [], refresh: async () => [] }; return config.kind === 'static' ? staticDatasource.load(config) : restDatasource.load(config); }
