import { uid, now, readJson, writeJson } from './utils';

/* ================================================================== */
/*  Admin Portal Service                                                */
/*  Users, Orgs, Licenses, Usage, Analytics, Flags, Logs, Health, Stats */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type AdminUserRole = 'superadmin' | 'admin' | 'operator' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type OrgTier = 'community' | 'professional' | 'enterprise' | 'ultimate';
export type LicenseStatus = 'active' | 'expired' | 'suspended' | 'trial' | 'revoked';
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';
export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminUserRole;
  status: UserStatus;
  orgId?: string;
  lastLoginAt?: string;
  createdAt: string;
  mfaEnabled: boolean;
  apiCalls30d: number;
  storageBytes: number;
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  tier: OrgTier;
  userIds: string[];
  createdAt: string;
  licenseId?: string;
  settings: { maxDashboards: number; maxUsers: number; allowPublicDashboards: boolean; dataRetentionDays: number };
}

export interface AdminLicense {
  id: string;
  key: string;
  orgId: string;
  tier: OrgTier;
  status: LicenseStatus;
  features: string[];
  maxUsers: number;
  maxDashboards: number;
  maxWorkspaces: number;
  activatedAt: string;
  expiresAt?: string;
  createdAt: string;
}

export interface UsageRecord {
  orgId: string;
  period: string;
  apiCalls: number;
  storageBytes: number;
  computeMinutes: number;
  activeUsers: number;
  dashboardViews: number;
  dataTransferBytes: number;
}

export interface UsageSummary {
  totalApiCalls: number;
  totalStorageBytes: number;
  totalComputeMinutes: number;
  totalActiveUsers: number;
  totalDashboardViews: number;
  trend: { apiCalls: number; storage: number; users: number; views: number };
}

export interface AnalyticsSnapshot {
  period: string;
  activeUsers: number;
  newUsers: number;
  dashboardViews: number;
  avgSessionMinutes: number;
  topDashboards: { id: string; title: string; views: number }[];
  topWidgets: { type: string; count: number }[];
  userActivity: { hour: number; sessions: number }[];
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  orgWhitelist: string[];
  orgBlacklist: string[];
  createdAt: string;
  updatedAt: string;
  type: 'boolean' | 'percentage' | 'variant';
  variants?: string[];
  defaultVariant?: string;
}

export interface AdminLogEntry {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  source: string;
  message: string;
  details?: Record<string, unknown>;
  userId?: string;
  orgId?: string;
  requestId?: string;
  durationMs?: number;
}

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  uptime: number;
  lastCheck: string;
  details?: string;
}

export interface SystemHealth {
  cpu: { usage: number; cores: number; model: string };
  memory: { usedBytes: number; totalBytes: number; percentage: number };
  storage: { usedBytes: number; totalBytes: number; percentage: number };
  services: ServiceHealth[];
  lastUpdated: string;
  overallStatus: HealthStatus;
}

export interface DashboardStats {
  totalDashboards: number;
  publishedDashboards: number;
  draftDashboards: number;
  totalWidgets: number;
  widgetsByType: Record<string, number>;
  avgWidgetsPerDashboard: number;
  dashboardsByOrg: { orgId: string; orgName: string; count: number }[];
  mostActiveDashboards: { id: string; title: string; views: number; lastViewedAt: string }[];
  recentActivity: { action: string; dashboardId: string; dashboardTitle: string; userId: string; userName: string; timestamp: string }[];
}

export interface AdminConfig {
  users: AdminUser[];
  orgs: AdminOrg[];
  licenses: AdminLicense[];
  usage: UsageRecord[];
  flags: FeatureFlag[];
  logs: AdminLogEntry[];
  health: SystemHealth;
  dashboardStats: DashboardStats;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'dg:admin:v1';

const FEATURE_FLAGS_DEFAULTS: FeatureFlag[] = [
  { id: 'ff-1', key: 'ai_assistant', name: 'AI Dashboard Assistant', description: 'Enable AI-powered dashboard creation and suggestions', enabled: true, rolloutPercentage: 100, orgWhitelist: [], orgBlacklist: [], createdAt: '2025-01-15T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z', type: 'boolean' },
  { id: 'ff-2', key: 'real_time_collab', name: 'Real-time Collaboration', description: 'Live cursors and presence indicators for collaborative editing', enabled: true, rolloutPercentage: 80, orgWhitelist: [], orgBlacklist: [], createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-05-15T00:00:00Z', type: 'percentage' },
  { id: 'ff-3', key: 'plugin_marketplace', name: 'Plugin Marketplace', description: 'Install third-party widgets and themes from the marketplace', enabled: true, rolloutPercentage: 100, orgWhitelist: [], orgBlacklist: [], createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-06-10T00:00:00Z', type: 'boolean' },
  { id: 'ff-4', key: 'advanced_export', name: 'Advanced Export', description: 'Export dashboards as PDF, PNG, Excel with custom layouts', enabled: true, rolloutPercentage: 100, orgWhitelist: [], orgBlacklist: [], createdAt: '2025-01-20T00:00:00Z', updatedAt: '2025-04-20T00:00:00Z', type: 'boolean' },
  { id: 'ff-5', key: 'dark_mode_beta', name: 'Dark Mode (Beta)', description: 'Experimental dark theme for the entire dashboard builder', enabled: false, rolloutPercentage: 25, orgWhitelist: ['org-demo'], orgBlacklist: [], createdAt: '2025-04-01T00:00:00Z', updatedAt: '2025-06-15T00:00:00Z', type: 'variant', variants: ['light', 'dark', 'auto'], defaultVariant: 'light' },
  { id: 'ff-6', key: 'webhooks_v2', name: 'Webhooks V2', description: 'Enhanced webhook system with retry, filtering, and batching', enabled: false, rolloutPercentage: 0, orgWhitelist: [], orgBlacklist: [], createdAt: '2025-05-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z', type: 'boolean' },
  { id: 'ff-7', key: 'scheduled_reports', name: 'Scheduled Reports', description: 'Automated dashboard delivery via email on schedule', enabled: true, rolloutPercentage: 60, orgWhitelist: [], orgBlacklist: [], createdAt: '2025-02-15T00:00:00Z', updatedAt: '2025-05-20T00:00:00Z', type: 'percentage' },
];

/* ------------------------------------------------------------------ */
/*  Storage                                                             */
/* ------------------------------------------------------------------ */

function loadConfig(): AdminConfig {
  return readJson(STORAGE_KEY, createDefaults());
}
function saveConfig(config: AdminConfig): void { writeJson(STORAGE_KEY, config); }

/* ------------------------------------------------------------------ */
/*  Defaults / Seed Data                                                */
/* ------------------------------------------------------------------ */

function createDefaults(): AdminConfig {
  const users: AdminUser[] = [
    { id: 'u-1', email: 'admin@dashboard.io', name: 'Alice Chen', role: 'superadmin', status: 'active', orgId: 'org-1', lastLoginAt: '2025-06-19T08:30:00Z', createdAt: '2024-06-01T00:00:00Z', mfaEnabled: true, apiCalls30d: 4820, storageBytes: 2_147_483_648 },
    { id: 'u-2', email: 'bob@acme.com', name: 'Bob Martinez', role: 'admin', status: 'active', orgId: 'org-1', lastLoginAt: '2025-06-18T14:15:00Z', createdAt: '2024-08-15T00:00:00Z', mfaEnabled: true, apiCalls30d: 3150, storageBytes: 1_073_741_824 },
    { id: 'u-3', email: 'carol@globex.io', name: 'Carol Nguyen', role: 'operator', status: 'active', orgId: 'org-2', lastLoginAt: '2025-06-19T10:00:00Z', createdAt: '2024-10-01T00:00:00Z', mfaEnabled: false, apiCalls30d: 1200, storageBytes: 536_870_912 },
    { id: 'u-4', email: 'dave@initech.com', name: 'Dave Wilson', role: 'viewer', status: 'active', orgId: 'org-2', lastLoginAt: '2025-06-17T09:45:00Z', createdAt: '2025-01-10T00:00:00Z', mfaEnabled: false, apiCalls30d: 340, storageBytes: 67_108_864 },
    { id: 'u-5', email: 'eve@umbrella.co', name: 'Eve Park', role: 'admin', status: 'active', orgId: 'org-3', lastLoginAt: '2025-06-19T12:00:00Z', createdAt: '2025-02-20T00:00:00Z', mfaEnabled: true, apiCalls30d: 5600, storageBytes: 3_221_225_472 },
    { id: 'u-6', email: 'frank@wayne.io', name: 'Frank Rossi', role: 'operator', status: 'inactive', orgId: 'org-3', lastLoginAt: '2025-04-10T16:00:00Z', createdAt: '2025-03-01T00:00:00Z', mfaEnabled: false, apiCalls30d: 0, storageBytes: 0 },
    { id: 'u-7', email: 'grace@stark.io', name: 'Grace Kim', role: 'viewer', status: 'suspended', orgId: 'org-1', lastLoginAt: '2025-05-01T11:00:00Z', createdAt: '2025-04-01T00:00:00Z', mfaEnabled: false, apiCalls30d: 0, storageBytes: 0 },
    { id: 'u-8', email: 'hank@oscorp.io', name: 'Hank Lee', role: 'viewer', status: 'pending', createdAt: '2025-06-18T00:00:00Z', mfaEnabled: false, apiCalls30d: 0, storageBytes: 0 },
  ];

  const orgs: AdminOrg[] = [
    { id: 'org-1', name: 'Acme Corp', slug: 'acme', tier: 'enterprise', userIds: ['u-1', 'u-2', 'u-7'], createdAt: '2024-06-01T00:00:00Z', licenseId: 'lic-1', settings: { maxDashboards: 500, maxUsers: 100, allowPublicDashboards: true, dataRetentionDays: 365 } },
    { id: 'org-2', name: 'Globex Inc', slug: 'globex', tier: 'professional', userIds: ['u-3', 'u-4'], createdAt: '2024-10-01T00:00:00Z', licenseId: 'lic-2', settings: { maxDashboards: 50, maxUsers: 25, allowPublicDashboards: false, dataRetentionDays: 180 } },
    { id: 'org-3', name: 'Umbrella Co', slug: 'umbrella', tier: 'ultimate', userIds: ['u-5', 'u-6'], createdAt: '2025-02-20T00:00:00Z', licenseId: 'lic-3', settings: { maxDashboards: 9999, maxUsers: 9999, allowPublicDashboards: true, dataRetentionDays: 730 } },
  ];

  const licenses: AdminLicense[] = [
    { id: 'lic-1', key: 'DASH-ENT-ACME-2025-XXXX', orgId: 'org-1', tier: 'enterprise', status: 'active', features: ['export', 'collaboration', 'embedding', 'api_access', 'custom_themes', 'white_label', 'sso', 'audit_log', 'custom_domain', 'advanced_security', 'workspace_branding', 'priority_support'], maxUsers: 100, maxDashboards: 500, maxWorkspaces: 20, activatedAt: '2024-06-01T00:00:00Z', expiresAt: '2026-06-01T00:00:00Z', createdAt: '2024-05-15T00:00:00Z' },
    { id: 'lic-2', key: 'DASH-PRO-GLOBEX-2025-YYYY', orgId: 'org-2', tier: 'professional', status: 'active', features: ['export', 'collaboration', 'embedding', 'api_access', 'custom_themes'], maxUsers: 25, maxDashboards: 50, maxWorkspaces: 5, activatedAt: '2024-10-01T00:00:00Z', expiresAt: '2025-10-01T00:00:00Z', createdAt: '2024-09-15T00:00:00Z' },
    { id: 'lic-3', key: 'DASH-ULT-UMBRELLA-2025-ZZZZ', orgId: 'org-3', tier: 'ultimate', status: 'active', features: ['export', 'collaboration', 'embedding', 'api_access', 'custom_themes', 'white_label', 'sso', 'audit_log', 'custom_domain', 'advanced_security', 'workspace_branding', 'priority_support'], maxUsers: 999999, maxDashboards: 999999, maxWorkspaces: 999999, activatedAt: '2025-02-20T00:00:00Z', expiresAt: '2027-02-20T00:00:00Z', createdAt: '2025-02-15T00:00:00Z' },
    { id: 'lic-4', key: 'DASH-TRIAL-DEMO-2025-AAAA', orgId: 'org-demo', tier: 'community', status: 'trial', features: ['export'], maxUsers: 3, maxDashboards: 5, maxWorkspaces: 1, activatedAt: '2025-06-01T00:00:00Z', expiresAt: '2025-07-01T00:00:00Z', createdAt: '2025-06-01T00:00:00Z' },
  ];

  const usage: UsageRecord[] = [
    { orgId: 'org-1', period: '2025-06', apiCalls: 12400, storageBytes: 2_147_483_648, computeMinutes: 840, activeUsers: 3, dashboardViews: 4820, dataTransferBytes: 536_870_912 },
    { orgId: 'org-1', period: '2025-05', apiCalls: 11200, storageBytes: 2_000_000_000, computeMinutes: 720, activeUsers: 4, dashboardViews: 4200, dataTransferBytes: 480_000_000 },
    { orgId: 'org-2', period: '2025-06', apiCalls: 3400, storageBytes: 536_870_912, computeMinutes: 210, activeUsers: 2, dashboardViews: 1540, dataTransferBytes: 120_000_000 },
    { orgId: 'org-3', period: '2025-06', apiCalls: 18600, storageBytes: 3_221_225_472, computeMinutes: 1200, activeUsers: 1, dashboardViews: 8900, dataTransferBytes: 890_000_000 },
  ];

  const logs: AdminLogEntry[] = [
    { id: 'log-1', timestamp: '2025-06-19T12:01:00Z', severity: 'info', source: 'auth', message: 'User login successful', userId: 'u-1', requestId: 'req-001' },
    { id: 'log-2', timestamp: '2025-06-19T12:00:45Z', severity: 'info', source: 'api', message: 'Dashboard "Q2 Revenue" saved', userId: 'u-2', requestId: 'req-002', durationMs: 45 },
    { id: 'log-3', timestamp: '2025-06-19T11:58:00Z', severity: 'warn', source: 'scheduler', message: 'Scheduled export delayed by 12s', orgId: 'org-1', requestId: 'req-003', durationMs: 12000 },
    { id: 'log-4', timestamp: '2025-06-19T11:55:00Z', severity: 'error', source: 'datasource', message: 'Connection timeout to PostgreSQL', orgId: 'org-2', userId: 'u-3', requestId: 'req-004', durationMs: 30000, details: { host: 'db.globex.io', port: 5432 } },
    { id: 'log-5', timestamp: '2025-06-19T11:50:00Z', severity: 'info', source: 'plugin', message: 'Plugin "Sparkline Widget" installed', userId: 'u-5', requestId: 'req-005', durationMs: 120 },
    { id: 'log-6', timestamp: '2025-06-19T11:45:00Z', severity: 'debug', source: 'cache', message: 'Cache hit for dashboard list query', requestId: 'req-006', durationMs: 2 },
    { id: 'log-7', timestamp: '2025-06-19T11:40:00Z', severity: 'critical', source: 'storage', message: 'Disk usage exceeded 90% threshold', orgId: 'org-3', requestId: 'req-007', details: { usage: '91%', path: '/data/org-umbrella' } },
    { id: 'log-8', timestamp: '2025-06-19T11:30:00Z', severity: 'info', source: 'auth', message: 'SSO login via SAML for acme.corp', userId: 'u-1', requestId: 'req-008' },
    { id: 'log-9', timestamp: '2025-06-19T11:20:00Z', severity: 'warn', source: 'api', message: 'Rate limit approaching for org-2', orgId: 'org-2', requestId: 'req-009', details: { current: 850, limit: 1000 } },
    { id: 'log-10', timestamp: '2025-06-19T11:00:00Z', severity: 'info', source: 'system', message: 'System health check completed', requestId: 'req-010', durationMs: 340 },
  ];

  const health: SystemHealth = {
    cpu: { usage: 34, cores: 8, model: 'Intel Xeon E5-2686 v4' },
    memory: { usedBytes: 5_368_709_120, totalBytes: 16_106_127_360, percentage: 33 },
    storage: { usedBytes: 42_949_672_960, totalBytes: 107_374_182_400, percentage: 40 },
    services: [
      { name: 'API Gateway', status: 'healthy', latencyMs: 12, uptime: 99.98, lastCheck: '2025-06-19T12:00:00Z' },
      { name: 'Database', status: 'healthy', latencyMs: 3, uptime: 99.99, lastCheck: '2025-06-19T12:00:00Z' },
      { name: 'Cache', status: 'healthy', latencyMs: 1, uptime: 100, lastCheck: '2025-06-19T12:00:00Z' },
      { name: 'Scheduler', status: 'degraded', latencyMs: 245, uptime: 99.50, lastCheck: '2025-06-19T12:00:00Z', details: 'Export job queue backed up' },
      { name: 'File Storage', status: 'healthy', latencyMs: 8, uptime: 99.97, lastCheck: '2025-06-19T12:00:00Z' },
      { name: 'Search Index', status: 'healthy', latencyMs: 15, uptime: 99.95, lastCheck: '2025-06-19T12:00:00Z' },
    ],
    lastUpdated: '2025-06-19T12:00:00Z',
    overallStatus: 'degraded',
  };

  const dashboardStats: DashboardStats = {
    totalDashboards: 47,
    publishedDashboards: 32,
    draftDashboards: 15,
    totalWidgets: 312,
    widgetsByType: { kpi: 64, 'bar-chart': 48, 'line-chart': 42, 'pie-chart': 36, 'area-chart': 28, 'scatter-chart': 18, 'single-stat': 24, 'data-table': 20, 'text-markdown': 16, 'iframes': 8, 'image-widget': 6, 'gauge-chart': 2 },
    avgWidgetsPerDashboard: 6.6,
    dashboardsByOrg: [{ orgId: 'org-1', orgName: 'Acme Corp', count: 22 }, { orgId: 'org-2', orgName: 'Globex Inc', count: 10 }, { orgId: 'org-3', orgName: 'Umbrella Co', count: 15 }],
    mostActiveDashboards: [
      { id: 'd-1', title: 'Q2 Revenue Overview', views: 1240, lastViewedAt: '2025-06-19T11:30:00Z' },
      { id: 'd-2', title: 'Customer Analytics', views: 980, lastViewedAt: '2025-06-19T10:15:00Z' },
      { id: 'd-3', title: 'Infrastructure Monitor', views: 870, lastViewedAt: '2025-06-19T12:00:00Z' },
      { id: 'd-4', title: 'Sales Pipeline', views: 650, lastViewedAt: '2025-06-18T16:00:00Z' },
      { id: 'd-5', title: 'Marketing Campaigns', views: 520, lastViewedAt: '2025-06-18T09:00:00Z' },
    ],
    recentActivity: [
      { action: 'publish', dashboardId: 'd-1', dashboardTitle: 'Q2 Revenue Overview', userId: 'u-1', userName: 'Alice Chen', timestamp: '2025-06-19T11:30:00Z' },
      { action: 'edit', dashboardId: 'd-2', dashboardTitle: 'Customer Analytics', userId: 'u-2', userName: 'Bob Martinez', timestamp: '2025-06-19T10:15:00Z' },
      { action: 'share', dashboardId: 'd-3', dashboardTitle: 'Infrastructure Monitor', userId: 'u-5', userName: 'Eve Park', timestamp: '2025-06-19T09:00:00Z' },
      { action: 'create', dashboardId: 'd-6', dashboardTitle: 'New Churn Analysis', userId: 'u-3', userName: 'Carol Nguyen', timestamp: '2025-06-18T14:00:00Z' },
      { action: 'delete', dashboardId: 'd-old', dashboardTitle: 'Deprecated Report', userId: 'u-1', userName: 'Alice Chen', timestamp: '2025-06-18T08:00:00Z' },
    ],
  };

  return { users, orgs, licenses, usage, flags: [...FEATURE_FLAGS_DEFAULTS], logs, health, dashboardStats };
}

/* ================================================================== */
/*  Admin Service                                                       */
/* ================================================================== */

export const adminService = {

  /* ---- Users ---- */
  getUsers(): AdminUser[] { return loadConfig().users; },
  getUser(id: string): AdminUser | undefined { return loadConfig().users.find((u) => u.id === id); },
  createUser(data: Omit<AdminUser, 'id' | 'createdAt' | 'apiCalls30d' | 'storageBytes'>): AdminUser {
    const config = loadConfig();
    const user: AdminUser = { ...data, id: `u-${uid()}`, createdAt: now(), apiCalls30d: 0, storageBytes: 0 };
    config.users.push(user);
    saveConfig(config);
    return user;
  },
  updateUser(id: string, patch: Partial<AdminUser>): AdminUser | undefined {
    const config = loadConfig();
    const user = config.users.find((u) => u.id === id);
    if (!user) return undefined;
    Object.assign(user, patch);
    saveConfig(config);
    return user;
  },
  deleteUser(id: string): boolean {
    const config = loadConfig();
    const idx = config.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    config.users.splice(idx, 1);
    saveConfig(config);
    return true;
  },
  getUserStats(): { total: number; active: number; inactive: number; suspended: number; pending: number; mfaEnabled: number } {
    const users = loadConfig().users;
    return {
      total: users.length,
      active: users.filter((u) => u.status === 'active').length,
      inactive: users.filter((u) => u.status === 'inactive').length,
      suspended: users.filter((u) => u.status === 'suspended').length,
      pending: users.filter((u) => u.status === 'pending').length,
      mfaEnabled: users.filter((u) => u.mfaEnabled).length,
    };
  },

  /* ---- Organizations ---- */
  getOrgs(): AdminOrg[] { return loadConfig().orgs; },
  getOrg(id: string): AdminOrg | undefined { return loadConfig().orgs.find((o) => o.id === id); },
  createOrg(data: Omit<AdminOrg, 'id' | 'createdAt' | 'userIds'>): AdminOrg {
    const config = loadConfig();
    const org: AdminOrg = { ...data, id: `org-${uid()}`, userIds: [], createdAt: now() };
    config.orgs.push(org);
    saveConfig(config);
    return org;
  },
  updateOrg(id: string, patch: Partial<AdminOrg>): AdminOrg | undefined {
    const config = loadConfig();
    const org = config.orgs.find((o) => o.id === id);
    if (!org) return undefined;
    Object.assign(org, patch);
    saveConfig(config);
    return org;
  },
  deleteOrg(id: string): boolean {
    const config = loadConfig();
    const idx = config.orgs.findIndex((o) => o.id === id);
    if (idx === -1) return false;
    config.orgs.splice(idx, 1);
    saveConfig(config);
    return true;
  },

  /* ---- Licenses ---- */
  getLicenses(): AdminLicense[] { return loadConfig().licenses; },
  getLicense(id: string): AdminLicense | undefined { return loadConfig().licenses.find((l) => l.id === id); },
  createLicense(data: Omit<AdminLicense, 'id' | 'createdAt' | 'key'>): AdminLicense {
    const config = loadConfig();
    const key = `DASH-${data.tier.toUpperCase().slice(0, 3)}-${Date.now().toString(36).toUpperCase()}`;
    const lic: AdminLicense = { ...data, id: `lic-${uid()}`, key, createdAt: now() };
    config.licenses.push(lic);
    saveConfig(config);
    return lic;
  },
  updateLicense(id: string, patch: Partial<AdminLicense>): AdminLicense | undefined {
    const config = loadConfig();
    const lic = config.licenses.find((l) => l.id === id);
    if (!lic) return undefined;
    Object.assign(lic, patch);
    saveConfig(config);
    return lic;
  },
  revokeLicense(id: string): boolean {
    const config = loadConfig();
    const lic = config.licenses.find((l) => l.id === id);
    if (!lic) return false;
    lic.status = 'revoked';
    saveConfig(config);
    return true;
  },

  /* ---- Usage ---- */
  getUsage(): UsageRecord[] { return loadConfig().usage; },
  getUsageByOrg(orgId: string): UsageRecord[] { return loadConfig().usage.filter((u) => u.orgId === orgId); },
  getUsageSummary(): UsageSummary {
    const current = loadConfig().usage.filter((u) => u.period === '2025-06');
    const previous = loadConfig().usage.filter((u) => u.period === '2025-05');
    const sum = (arr: UsageRecord[], key: keyof UsageRecord) => arr.reduce((a, r) => a + (r[key] as number), 0);
    const currApi = sum(current, 'apiCalls');
    const prevApi = sum(previous, 'apiCalls');
    const currUsers = sum(current, 'activeUsers');
    const prevUsers = sum(previous, 'activeUsers');
    return {
      totalApiCalls: currApi,
      totalStorageBytes: sum(current, 'storageBytes'),
      totalComputeMinutes: sum(current, 'computeMinutes'),
      totalActiveUsers: currUsers,
      totalDashboardViews: sum(current, 'dashboardViews'),
      trend: {
        apiCalls: prevApi ? Math.round(((currApi - prevApi) / prevApi) * 100) : 0,
        storage: 0,
        users: prevUsers ? Math.round(((currUsers - prevUsers) / prevUsers) * 100) : 0,
        views: 0,
      },
    };
  },

  /* ---- Analytics ---- */
  getAnalytics(): AnalyticsSnapshot {
    const config = loadConfig();
    return {
      period: '2025-06',
      activeUsers: config.users.filter((u) => u.status === 'active').length,
      newUsers: config.users.filter((u) => u.createdAt >= '2025-06-01T00:00:00Z').length,
      dashboardViews: config.usage.reduce((a, u) => a + u.dashboardViews, 0),
      avgSessionMinutes: 24.5,
      topDashboards: config.dashboardStats.mostActiveDashboards.slice(0, 5),
      topWidgets: Object.entries(config.dashboardStats.widgetsByType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => ({ type, count })),
      userActivity: Array.from({ length: 24 }, (_, i) => ({ hour: i, sessions: Math.max(0, Math.round(40 * Math.exp(-((i - 14) ** 2) / 40) + Math.random() * 8)) })),
    };
  },

  /* ---- Feature Flags ---- */
  getFlags(): FeatureFlag[] { return loadConfig().flags; },
  getFlag(id: string): FeatureFlag | undefined { return loadConfig().flags.find((f) => f.id === id); },
  createFlag(data: Omit<FeatureFlag, 'id' | 'createdAt' | 'updatedAt'>): FeatureFlag {
    const config = loadConfig();
    const flag: FeatureFlag = { ...data, id: `ff-${uid()}`, createdAt: now(), updatedAt: now() };
    config.flags.push(flag);
    saveConfig(config);
    return flag;
  },
  updateFlag(id: string, patch: Partial<FeatureFlag>): FeatureFlag | undefined {
    const config = loadConfig();
    const flag = config.flags.find((f) => f.id === id);
    if (!flag) return undefined;
    Object.assign(flag, patch, { updatedAt: now() });
    saveConfig(config);
    return flag;
  },
  toggleFlag(id: string): FeatureFlag | undefined {
    const config = loadConfig();
    const flag = config.flags.find((f) => f.id === id);
    if (!flag) return undefined;
    flag.enabled = !flag.enabled;
    flag.updatedAt = now();
    saveConfig(config);
    return flag;
  },
  deleteFlag(id: string): boolean {
    const config = loadConfig();
    const idx = config.flags.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    config.flags.splice(idx, 1);
    saveConfig(config);
    return true;
  },

  /* ---- Logs ---- */
  getLogs(filters?: { severity?: LogSeverity; source?: string; search?: string; limit?: number }): AdminLogEntry[] {
    let logs = loadConfig().logs;
    if (filters?.severity) logs = logs.filter((l) => l.severity === filters.severity);
    if (filters?.source) logs = logs.filter((l) => l.source === filters.source);
    if (filters?.search) { const s = filters.search.toLowerCase(); logs = logs.filter((l) => l.message.toLowerCase().includes(s) || l.source.toLowerCase().includes(s)); }
    if (filters?.limit) logs = logs.slice(0, filters.limit);
    return logs;
  },
  addLog(entry: Omit<AdminLogEntry, 'id' | 'timestamp'>): AdminLogEntry {
    const config = loadConfig();
    const log: AdminLogEntry = { ...entry, id: `log-${uid()}`, timestamp: now() };
    config.logs.unshift(log);
    if (config.logs.length > 500) config.logs = config.logs.slice(0, 500);
    saveConfig(config);
    return log;
  },
  clearLogs(): void { const config = loadConfig(); config.logs = []; saveConfig(config); },
  getLogStats(): Record<LogSeverity, number> {
    const logs = loadConfig().logs;
    return {
      debug: logs.filter((l) => l.severity === 'debug').length,
      info: logs.filter((l) => l.severity === 'info').length,
      warn: logs.filter((l) => l.severity === 'warn').length,
      error: logs.filter((l) => l.severity === 'error').length,
      critical: logs.filter((l) => l.severity === 'critical').length,
    };
  },

  /* ---- System Health ---- */
  getHealth(): SystemHealth { return loadConfig().health; },
  refreshHealth(): SystemHealth {
    const config = loadConfig();
    const jitter = () => (Math.random() - 0.5) * 10;
    config.health.cpu.usage = Math.max(0, Math.min(100, config.health.cpu.usage + jitter()));
    config.health.memory.percentage = Math.max(0, Math.min(100, config.health.memory.percentage + jitter()));
    config.health.memory.usedBytes = Math.round(config.health.memory.totalBytes * config.health.memory.percentage / 100);
    for (const svc of config.health.services) {
      svc.latencyMs = Math.max(0, Math.round(svc.latencyMs + jitter()));
      svc.lastCheck = now();
    }
    config.health.lastUpdated = now();
    config.health.overallStatus = config.health.services.some((s) => s.status === 'down') ? 'down' : config.health.services.some((s) => s.status === 'degraded') ? 'degraded' : 'healthy';
    saveConfig(config);
    return config.health;
  },

  /* ---- Dashboard Statistics ---- */
  getDashboardStats(): DashboardStats { return loadConfig().dashboardStats; },
  getWidgetTypeDistribution(): { type: string; count: number; percentage: number }[] {
    const stats = loadConfig().dashboardStats;
    const total = stats.totalWidgets;
    return Object.entries(stats.widgetsByType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 }));
  },
};
