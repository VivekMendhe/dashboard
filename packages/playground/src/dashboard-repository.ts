import { validateDashboard, type DashboardConfig, type DashboardRole, type PersistedDashboard } from '@dashboard-generator/core';

/**
 * The browser repository is a development/offline adapter. Its API deliberately
 * matches a server repository so the builder never needs to know where data is stored.
 */
export interface DashboardRepository {
  get(workspaceId: string, dashboardId: string): Promise<PersistedDashboard | undefined>;
  save(input: { workspaceId: string; dashboard: DashboardConfig; actorId: string; expectedRevision?: number }): Promise<PersistedDashboard>;
  list(workspaceId: string): Promise<PersistedDashboard[]>;
  listVersions(workspaceId: string, dashboardId: string): Promise<PersistedDashboard[]>;
}

export interface WorkspaceSession { workspaceId: string; userId: string; role: DashboardRole }
export const localSession: WorkspaceSession = { workspaceId: 'personal', userId: 'local-user', role: 'admin' };

const key = 'dashboard-generator:repository:v1';
const historyKey = 'dashboard-generator:repository-history:v1';
const read = (): PersistedDashboard[] => {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]') as PersistedDashboard[]; return Array.isArray(value) ? value : []; } catch { return []; }
};
const write = (value: PersistedDashboard[]) => localStorage.setItem(key, JSON.stringify(value));
const readHistory = (): PersistedDashboard[] => { try { const value = JSON.parse(localStorage.getItem(historyKey) ?? '[]') as PersistedDashboard[]; return Array.isArray(value) ? value : []; } catch { return []; } };
const writeHistory = (value: PersistedDashboard[]) => localStorage.setItem(historyKey, JSON.stringify(value));

export const browserDashboardRepository: DashboardRepository = {
  async get(workspaceId, dashboardId) {
    const stored = read().find((item) => item.identity.workspaceId === workspaceId && item.identity.dashboardId === dashboardId && !item.deletedAt);
    if (stored) return stored;
    // Migration bridge for dashboards saved by the original toolbar.
    try { const legacy = JSON.parse(localStorage.getItem('dashboard-generator:autosave') ?? 'null') as DashboardConfig | null; if (legacy?.id === dashboardId) return { identity: { workspaceId, dashboardId, ownerId: localSession.userId }, config: validateDashboard(legacy), revision: { revision: 0, updatedAt: new Date(0).toISOString(), updatedBy: localSession.userId } }; } catch { /* ignore invalid legacy storage */ }
    return undefined;
  },
  async list(workspaceId) { return read().filter((item) => item.identity.workspaceId === workspaceId && !item.deletedAt).sort((a, b) => b.revision.updatedAt.localeCompare(a.revision.updatedAt)); },
  async listVersions(workspaceId, dashboardId) { return readHistory().filter((item) => item.identity.workspaceId === workspaceId && item.identity.dashboardId === dashboardId).sort((a, b) => b.revision.revision - a.revision.revision); },
  async save({ workspaceId, dashboard, actorId, expectedRevision }) {
    validateDashboard(dashboard);
    const entries = read();
    const index = entries.findIndex((item) => item.identity.workspaceId === workspaceId && item.identity.dashboardId === dashboard.id);
    const previous = entries[index];
    if (previous && expectedRevision !== undefined && previous.revision.revision !== expectedRevision) throw new Error('This dashboard was changed elsewhere. Reload before saving.');
    const record: PersistedDashboard = {
      identity: { workspaceId, dashboardId: dashboard.id, ownerId: previous?.identity.ownerId ?? actorId }, config: dashboard,
      revision: { revision: (previous?.revision.revision ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: actorId }
    };
    if (index >= 0) entries[index] = record; else entries.push(record);
    write(entries);
    writeHistory([...readHistory(), record].slice(-100));
    // Kept so existing users of the original prototype retain their local save.
    localStorage.setItem('dashboard-generator:autosave', JSON.stringify(dashboard));
    return record;
  }
};

export const canEditDashboard = (session: WorkspaceSession) => session.role === 'admin' || session.role === 'editor';
