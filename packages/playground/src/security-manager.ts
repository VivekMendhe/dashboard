import type { Organization, OrgSettings, Workspace, WorkspaceSettings, SecurityUser, Team, Permission, RolePermissions, RBACPolicy, PolicyCondition, SSOConfig, SAMLConfig, OAuthConfig, ApiKey, SecurityAuditEntry, Secret, EncryptionKey, SecretAccess, SecurityRole, ResourceType, PermissionAction, SecurityConfig } from '@dashboard-generator/core';
import { uid, now, secureToken, readJson, writeJson } from './utils';

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const STORAGE_KEY = 'dg:security:v1';
const ALL_PERMISSIONS: Permission[] = [
  { id: 'org.create', name: 'Create organizations', description: 'Create new organizations', resource: 'organization', action: 'create' },
  { id: 'org.read', name: 'View organizations', description: 'View organization details', resource: 'organization', action: 'read' },
  { id: 'org.update', name: 'Update organizations', description: 'Edit organization settings', resource: 'organization', action: 'update' },
  { id: 'org.delete', name: 'Delete organizations', description: 'Delete organizations', resource: 'organization', action: 'delete' },
  { id: 'org.manage', name: 'Manage organizations', description: 'Full organization management', resource: 'organization', action: 'manage' },
  { id: 'ws.create', name: 'Create workspaces', description: 'Create new workspaces', resource: 'workspace', action: 'create' },
  { id: 'ws.read', name: 'View workspaces', description: 'View workspace details', resource: 'workspace', action: 'read' },
  { id: 'ws.update', name: 'Update workspaces', description: 'Edit workspace settings', resource: 'workspace', action: 'update' },
  { id: 'ws.delete', name: 'Delete workspaces', description: 'Delete workspaces', resource: 'workspace', action: 'delete' },
  { id: 'ws.manage', name: 'Manage workspaces', description: 'Full workspace management', resource: 'workspace', action: 'manage' },
  { id: 'dash.create', name: 'Create dashboards', description: 'Create new dashboards', resource: 'dashboard', action: 'create' },
  { id: 'dash.read', name: 'View dashboards', description: 'View dashboards', resource: 'dashboard', action: 'read' },
  { id: 'dash.update', name: 'Update dashboards', description: 'Edit dashboards', resource: 'dashboard', action: 'update' },
  { id: 'dash.delete', name: 'Delete dashboards', description: 'Delete dashboards', resource: 'dashboard', action: 'delete' },
  { id: 'dash.share', name: 'Share dashboards', description: 'Share dashboards with others', resource: 'dashboard', action: 'share' },
  { id: 'dash.export', name: 'Export dashboards', description: 'Export dashboards to file', resource: 'dashboard', action: 'export' },
  { id: 'dash.approve', name: 'Approve dashboards', description: 'Approve dashboard publishing', resource: 'dashboard', action: 'approve' },
  { id: 'ds.create', name: 'Create data sources', description: 'Create new data sources', resource: 'datasource', action: 'create' },
  { id: 'ds.read', name: 'View data sources', description: 'View data source details', resource: 'datasource', action: 'read' },
  { id: 'ds.update', name: 'Update data sources', description: 'Edit data sources', resource: 'datasource', action: 'update' },
  { id: 'ds.delete', name: 'Delete data sources', description: 'Delete data sources', resource: 'datasource', action: 'delete' },
  { id: 'team.create', name: 'Create teams', description: 'Create new teams', resource: 'team', action: 'create' },
  { id: 'team.read', name: 'View teams', description: 'View team details', resource: 'team', action: 'read' },
  { id: 'team.update', name: 'Update teams', description: 'Edit team members and settings', resource: 'team', action: 'update' },
  { id: 'team.delete', name: 'Delete teams', description: 'Delete teams', resource: 'team', action: 'delete' },
  { id: 'user.create', name: 'Invite users', description: 'Invite new users', resource: 'user', action: 'create' },
  { id: 'user.read', name: 'View users', description: 'View user list and details', resource: 'user', action: 'read' },
  { id: 'user.update', name: 'Update users', description: 'Edit user roles and status', resource: 'user', action: 'update' },
  { id: 'user.delete', name: 'Remove users', description: 'Remove users from organization', resource: 'user', action: 'delete' },
  { id: 'settings.read', name: 'View settings', description: 'View security settings', resource: 'settings', action: 'read' },
  { id: 'settings.manage', name: 'Manage settings', description: 'Manage security settings', resource: 'settings', action: 'manage' },
  { id: 'key.create', name: 'Create API keys', description: 'Create new API keys', resource: 'api_key', action: 'create' },
  { id: 'key.read', name: 'View API keys', description: 'View API key details', resource: 'api_key', action: 'read' },
  { id: 'key.delete', name: 'Revoke API keys', description: 'Revoke API keys', resource: 'api_key', action: 'delete' },
  { id: 'audit.read', name: 'View audit log', description: 'View audit log entries', resource: 'audit', action: 'read' },
  { id: 'audit.export', name: 'Export audit log', description: 'Export audit log data', resource: 'audit', action: 'export' },
];

const DEFAULT_ROLE_PERMISSIONS: RolePermissions[] = [
  { role: 'owner', permissions: ALL_PERMISSIONS },
  { role: 'admin', permissions: ALL_PERMISSIONS.filter((p) => !['org.create', 'org.delete', 'org.manage'].includes(p.id)), inheritsFrom: 'owner' },
  { role: 'editor', permissions: ALL_PERMISSIONS.filter((p) => ['dash.create', 'dash.read', 'dash.update', 'dash.share', 'dash.export', 'ds.read', 'team.read', 'user.read', 'ws.read', 'settings.read', 'audit.read'].includes(p.id)), inheritsFrom: 'viewer' },
  { role: 'viewer', permissions: ALL_PERMISSIONS.filter((p) => p.action === 'read'), inheritsFrom: undefined },
  { role: 'guest', permissions: ALL_PERMISSIONS.filter((p) => p.action === 'read' && ['dashboard', 'workspace'].includes(p.resource)), inheritsFrom: undefined },
];

const hashKey = async (key: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `kh_${hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}_${key.slice(0, 4)}`;
};
/** Client-side obfuscation — NOT a replacement for server-side encryption, but prevents trivial localStorage reading. */
const ENCRYPTION_KEY = crypto.getRandomValues(new Uint8Array(32));
const simpleEncrypt = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  const encrypted = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    encrypted[i] = bytes[i] ^ ENCRYPTION_KEY[i % ENCRYPTION_KEY.length];
  }
  return btoa(String.fromCharCode(...encrypted));
};
const simpleDecrypt = (enc: string): string => {
  const encrypted = Uint8Array.from(atob(enc), c => c.charCodeAt(0));
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ ENCRYPTION_KEY[i % ENCRYPTION_KEY.length];
  }
  return new TextDecoder().decode(decrypted);
};

/* ================================================================== */
/*  Storage                                                             */
/* ================================================================== */

function loadConfig(): SecurityConfig {
  return readJson(STORAGE_KEY, { organizations: [], workspaces: [], users: [], teams: [], roles: [...DEFAULT_ROLE_PERMISSIONS], policies: [], apiKeys: [], auditLog: [], secrets: [], encryptionKeys: [], secretAccess: [] });
}
function saveConfig(config: SecurityConfig): void { writeJson(STORAGE_KEY, config); }

/* ================================================================== */
/*  Organizations                                                       */
/* ================================================================== */

function createOrg(name: string, slug: string, settings?: Partial<OrgSettings>): Organization {
  const config = loadConfig();
  const org: Organization = {
    id: `org-${uid()}`, name, slug,
    settings: { defaultRole: 'viewer', ssoEnabled: false, ipWhitelist: [], requireMFA: false, sessionTimeout: 480, maxUsers: 100, allowedDomains: [], ...settings },
    createdAt: now(), updatedAt: now(),
  };
  config.organizations.push(org);
  saveConfig(config);
  logAudit(config, org.id, 'system', 'organization', org.id, 'create', 'info', { name });
  return org;
}
function updateOrg(id: string, patch: Partial<Organization>): Organization | undefined {
  const config = loadConfig();
  const org = config.organizations.find((o) => o.id === id);
  if (!org) return undefined;
  Object.assign(org, patch, { updatedAt: now() });
  saveConfig(config);
  return org;
}
function deleteOrg(id: string): boolean {
  const config = loadConfig();
  const idx = config.organizations.findIndex((o) => o.id === id);
  if (idx === -1) return false;
  config.organizations.splice(idx, 1);
  config.workspaces = config.workspaces.filter((w) => w.orgId !== id);
  config.users = config.users.filter((u) => u.orgId !== id);
  config.teams = config.teams.filter((t) => t.orgId !== id);
  saveConfig(config);
  return true;
}
function listOrgs(): Organization[] { return loadConfig().organizations; }
function getOrg(id: string): Organization | undefined { return loadConfig().organizations.find((o) => o.id === id); }

/* ================================================================== */
/*  Workspaces                                                          */
/* ================================================================== */

function createWorkspace(orgId: string, name: string, description?: string, settings?: Partial<WorkspaceSettings>): Workspace {
  const config = loadConfig();
  const ws: Workspace = {
    id: `ws-${uid()}`, orgId, name, description,
    settings: { defaultRole: 'viewer', allowPublicDashboards: false, dataRetentionDays: 365, allowedConnectionTypes: [], ...settings },
    createdAt: now(), updatedAt: now(),
  };
  config.workspaces.push(ws);
  saveConfig(config);
  return ws;
}
function updateWorkspace(id: string, patch: Partial<Workspace>): Workspace | undefined {
  const config = loadConfig();
  const ws = config.workspaces.find((w) => w.id === id);
  if (!ws) return undefined;
  Object.assign(ws, patch, { updatedAt: now() });
  saveConfig(config);
  return ws;
}
function deleteWorkspace(id: string): boolean {
  const config = loadConfig();
  const idx = config.workspaces.findIndex((w) => w.id === id);
  if (idx === -1) return false;
  config.workspaces.splice(idx, 1);
  saveConfig(config);
  return true;
}
function listWorkspaces(orgId?: string): Workspace[] {
  const all = loadConfig().workspaces;
  return orgId ? all.filter((w) => w.orgId === orgId) : all;
}
function getWorkspace(id: string): Workspace | undefined { return loadConfig().workspaces.find((w) => w.id === id); }

/* ================================================================== */
/*  Users                                                               */
/* ================================================================== */

function createUser(email: string, name: string, orgId: string, role: SecurityRole = 'viewer', authMethod: AuthMethod = 'password'): SecurityUser {
  const config = loadConfig();
  const user: SecurityUser = {
    id: `usr-${uid()}`, email, name, orgId, role, authMethod,
    status: 'active', workspaceIds: [], teamIds: [],
    createdAt: now(), mfaEnabled: false,
  };
  config.users.push(user);
  saveConfig(config);
  return user;
}
function updateUser(id: string, patch: Partial<SecurityUser>): SecurityUser | undefined {
  const config = loadConfig();
  const user = config.users.find((u) => u.id === id);
  if (!user) return undefined;
  Object.assign(user, patch);
  saveConfig(config);
  return user;
}
function deleteUser(id: string): boolean {
  const config = loadConfig();
  const idx = config.users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  config.users.splice(idx, 1);
  config.teams.forEach((t) => { t.memberIds = t.memberIds.filter((m) => m !== id); });
  saveConfig(config);
  return true;
}
function listUsers(orgId?: string): SecurityUser[] {
  const all = loadConfig().users;
  return orgId ? all.filter((u) => u.orgId === orgId) : all;
}
function getUser(id: string): SecurityUser | undefined { return loadConfig().users.find((u) => u.id === id); }
type AuthMethod = 'password' | 'sso' | 'saml' | 'oauth' | 'api_key';

/* ================================================================== */
/*  Teams                                                               */
/* ================================================================== */

function createTeam(orgId: string, name: string, description?: string, color?: string): Team {
  const config = loadConfig();
  const team: Team = { id: `team-${uid()}`, orgId, name, description, color, memberIds: [], createdAt: now(), updatedAt: now() };
  config.teams.push(team);
  saveConfig(config);
  return team;
}
function updateTeam(id: string, patch: Partial<Team>): Team | undefined {
  const config = loadConfig();
  const team = config.teams.find((t) => t.id === id);
  if (!team) return undefined;
  Object.assign(team, patch, { updatedAt: now() });
  saveConfig(config);
  return team;
}
function deleteTeam(id: string): boolean {
  const config = loadConfig();
  const idx = config.teams.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  config.teams.splice(idx, 1);
  saveConfig(config);
  return true;
}
function addTeamMember(teamId: string, userId: string): boolean {
  const config = loadConfig();
  const team = config.teams.find((t) => t.id === teamId);
  if (!team || team.memberIds.includes(userId)) return false;
  team.memberIds.push(userId);
  team.updatedAt = now();
  const user = config.users.find((u) => u.id === userId);
  if (user && !user.teamIds.includes(teamId)) user.teamIds.push(teamId);
  saveConfig(config);
  return true;
}
function removeTeamMember(teamId: string, userId: string): boolean {
  const config = loadConfig();
  const team = config.teams.find((t) => t.id === teamId);
  if (!team) return false;
  team.memberIds = team.memberIds.filter((m) => m !== userId);
  team.updatedAt = now();
  const user = config.users.find((u) => u.id === userId);
  if (user) user.teamIds = user.teamIds.filter((t) => t !== teamId);
  saveConfig(config);
  return true;
}
function listTeams(orgId?: string): Team[] {
  const all = loadConfig().teams;
  return orgId ? all.filter((t) => t.orgId === orgId) : all;
}
function getTeam(id: string): Team | undefined { return loadConfig().teams.find((t) => t.id === id); }

/* ================================================================== */
/*  RBAC Engine                                                         */
/* ================================================================== */

function getRolePermissions(role: SecurityRole): RolePermissions | undefined { return loadConfig().roles.find((r) => r.role === role); }
function getAllPermissions(): Permission[] { return ALL_PERMISSIONS; }
function hasPermission(userId: string, resource: ResourceType, action: PermissionAction): boolean {
  const config = loadConfig();
  const user = config.users.find((u) => u.id === userId);
  if (!user) return false;
  const rolePerms = config.roles.find((r) => r.role === user.role);
  if (!rolePerms) return false;
  const baseHas = rolePerms.permissions.some((p) => p.resource === resource && (p.action === action || p.action === 'manage'));
  if (!baseHas) return false;
  const sortedPolicies = [...config.policies].filter((p) => p.enabled).sort((a, b) => b.priority - a.priority);
  for (const policy of sortedPolicies) {
    const matchesPerms = policy.permissions.some((p) => p.resource === resource && (p.action === action || p.action === 'manage'));
    if (!matchesPerms) continue;
    if (evaluateConditions(policy.conditions, user, config)) {
      return policy.effect === 'allow';
    }
  }
  return baseHas;
}
function evaluateConditions(conditions: PolicyCondition[], user: SecurityUser, config: SecurityConfig): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => {
    switch (c.type) {
      case 'team_member': return c.operator === 'in' ? user.teamIds.includes(c.value as string) : !user.teamIds.includes(c.value as string);
      case 'resource_owner': return c.operator === 'equals' ? user.role === 'owner' : user.role !== 'owner';
      case 'attribute': return c.operator === 'equals' ? (user as Record<string, unknown>)[c.field ?? ''] === c.value : (user as Record<string, unknown>)[c.field ?? ''] !== c.value;
      default: return true;
    }
  });
}
function addPolicy(policy: Omit<RBACPolicy, 'id' | 'createdAt'>): RBACPolicy {
  const config = loadConfig();
  const entry: RBACPolicy = { ...policy, id: `pol-${uid()}`, createdAt: now() };
  config.policies.push(entry);
  saveConfig(config);
  return entry;
}
function removePolicy(id: string): boolean {
  const config = loadConfig();
  const idx = config.policies.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  config.policies.splice(idx, 1);
  saveConfig(config);
  return true;
}
function listPolicies(): RBACPolicy[] { return loadConfig().policies; }

/* ================================================================== */
/*  SSO / SAML / OAuth                                                  */
/* ================================================================== */

function configureSSO(cfg: Partial<SSOConfig>): SSOConfig {
  const config = loadConfig();
  const sso: SSOConfig = { provider: 'okta', enabled: false, entityId: '', ssoUrl: '', certificate: '', attributeMapping: { email: 'email', name: 'name' }, ...cfg, createdAt: config.sso?.createdAt ?? now() } as SSOConfig;
  config.sso = sso;
  saveConfig(config);
  return sso;
}
function getSSOConfig(): SSOConfig | undefined { return loadConfig().sso; }
function configureSAML(cfg: Partial<SAMLConfig>): SAMLConfig {
  const config = loadConfig();
  const saml: SAMLConfig = { enabled: false, issuer: '', ssoUrl: '', certificate: '', signRequests: true, attributeMapping: { email: 'email', name: 'name' }, ...cfg, createdAt: config.saml?.createdAt ?? now() } as SAMLConfig;
  config.saml = saml;
  saveConfig(config);
  return saml;
}
function getSAMLConfig(): SAMLConfig | undefined { return loadConfig().saml; }
function configureOAuth(cfg: Partial<OAuthConfig>): OAuthConfig {
  const config = loadConfig();
  const oauth: OAuthConfig = { provider: 'github', clientId: '', clientSecretRef: '', scopes: ['read:user', 'user:email'], redirectUri: window.location.origin + '/auth/callback', enabled: false, ...cfg, createdAt: config.oauth?.createdAt ?? now() } as OAuthConfig;
  config.oauth = oauth;
  saveConfig(config);
  return oauth;
}
function getOAuthConfig(): OAuthConfig | undefined { return loadConfig().oauth; }

/* ================================================================== */
/*  API Keys                                                            */
/* ================================================================== */

async function createApiKey(name: string, scopes: string[], createdBy: string, expiresAt?: string): Promise<{ apiKey: ApiKey; plainKey: string }> {
  const config = loadConfig();
  const rawKey = `sk_live_${secureToken(40)}`;
  const apiKey: ApiKey = {
    id: `key-${uid()}`, name, keyHash: await hashKey(rawKey), keyPrefix: rawKey.slice(0, 12),
    scopes, expiresAt, createdBy, status: 'active', createdAt: now(),
  };
  config.apiKeys.push(apiKey);
  saveConfig(config);
  return { apiKey, plainKey: rawKey };
}
function revokeApiKey(id: string): boolean {
  const config = loadConfig();
  const key = config.apiKeys.find((k) => k.id === id);
  if (!key) return false;
  key.status = 'revoked';
  saveConfig(config);
  return true;
}
async function validateApiKey(plainKey: string): Promise<ApiKey | undefined> {
  const config = loadConfig();
  const hash = await hashKey(plainKey);
  const key = config.apiKeys.find((k) => k.keyHash === hash);
  if (!key || key.status !== 'active') return undefined;
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) { key.status = 'expired'; saveConfig(config); return undefined; }
  key.lastUsedAt = now();
  saveConfig(config);
  return key;
}
function listApiKeys(): ApiKey[] { return loadConfig().apiKeys; }
function deleteApiKey(id: string): boolean {
  const config = loadConfig();
  const idx = config.apiKeys.findIndex((k) => k.id === id);
  if (idx === -1) return false;
  config.apiKeys.splice(idx, 1);
  saveConfig(config);
  return true;
}

/* ================================================================== */
/*  Audit Log                                                           */
/* ================================================================== */

function logAudit(config: SecurityConfig, orgId: string, userId: string, resource: ResourceType, resourceId: string, action: string, severity: 'info' | 'warning' | 'critical' | 'security', details: Record<string, unknown> = {}): SecurityAuditEntry {
  const user = config.users.find((u) => u.id === userId);
  const entry: SecurityAuditEntry = {
    id: `audit-${uid()}`, orgId, userId, userName: user?.name ?? userId,
    action, resource, resourceId, details, severity, timestamp: now(),
  };
  config.auditLog.unshift(entry);
  if (config.auditLog.length > 2000) config.auditLog.length = 2000;
  saveConfig(config);
  return entry;
}
function getAuditLog(orgId?: string, limit = 100): SecurityAuditEntry[] {
  const all = loadConfig().auditLog;
  const filtered = orgId ? all.filter((e) => e.orgId === orgId) : all;
  return filtered.slice(0, limit);
}
function getAuditStats(orgId?: string): { total: number; bySeverity: Record<string, number>; byAction: Record<string, number>; recent: SecurityAuditEntry[] } {
  const entries = getAuditLog(orgId, 500);
  const bySeverity: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  entries.forEach((e) => { bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1; byAction[e.action] = (byAction[e.action] ?? 0) + 1; });
  return { total: entries.length, bySeverity, byAction, recent: entries.slice(0, 10) };
}

/* ================================================================== */
/*  Secrets Management                                                  */
/* ================================================================== */

function createEncryptionKey(name: string, algorithm: EncryptionAlgorithm = 'AES-256-GCM'): EncryptionKey {
  const config = loadConfig();
  config.encryptionKeys.forEach((k) => { if (k.status === 'active') k.status = 'rotating'; });
  const key: EncryptionKey = { id: `ek-${uid()}`, name, algorithm, status: 'active', createdAt: now() };
  config.encryptionKeys.push(key);
  saveConfig(config);
  return key;
}
function getActiveKey(): EncryptionKey | undefined { return loadConfig().encryptionKeys.find((k) => k.status === 'active'); }
function rotateEncryptionKey(id: string): EncryptionKey | undefined {
  const config = loadConfig();
  const key = config.encryptionKeys.find((k) => k.id === id);
  if (!key) return undefined;
  key.status = 'retired';
  key.rotatedAt = now();
  const newKey = createEncryptionKey(`${key.name} (rotated)`, key.algorithm);
  saveConfig(config);
  return newKey;
}
function listEncryptionKeys(): EncryptionKey[] { return loadConfig().encryptionKeys; }

function createSecret(name: string, value: string, workspaceId: string, createdBy: string, description?: string, tags: string[] = []): Secret {
  const config = loadConfig();
  const key = getActiveKey() ?? createEncryptionKey('Default Key');
  const secret: Secret = {
    id: `sec-${uid()}`, name, description, encryptedValue: simpleEncrypt(value),
    keyId: key.id, workspaceId, createdBy, tags,
    createdAt: now(), updatedAt: now(),
  };
  config.secrets.push(secret);
  saveConfig(config);
  return secret;
}
function getSecret(id: string): Secret | undefined { return loadConfig().secrets.find((s) => s.id === id); }
function decryptSecret(id: string): string | undefined {
  const secret = getSecret(id);
  if (!secret) return undefined;
  try { return simpleDecrypt(secret.encryptedValue); } catch { return undefined; }
}
function updateSecret(id: string, patch: Partial<Secret>): Secret | undefined {
  const config = loadConfig();
  const secret = config.secrets.find((s) => s.id === id);
  if (!secret) return undefined;
  Object.assign(secret, patch, { updatedAt: now() });
  saveConfig(config);
  return secret;
}
function deleteSecret(id: string): boolean {
  const config = loadConfig();
  const idx = config.secrets.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  config.secrets.splice(idx, 1);
  config.secretAccess = config.secretAccess.filter((a) => a.secretId !== id);
  saveConfig(config);
  return true;
}
function rotateSecret(id: string, newValue: string): Secret | undefined {
  const config = loadConfig();
  const secret = config.secrets.find((s) => s.id === id);
  if (!secret) return undefined;
  secret.encryptedValue = simpleEncrypt(newValue);
  secret.rotatedAt = now();
  secret.updatedAt = now();
  saveConfig(config);
  return secret;
}
function listSecrets(workspaceId?: string): Secret[] {
  const all = loadConfig().secrets;
  return workspaceId ? all.filter((s) => s.workspaceId === workspaceId) : all;
}
function grantSecretAccess(secretId: string, userId: string, userName: string, accessLevel: SecretAccessLevel = 'read'): SecretAccess {
  const config = loadConfig();
  const access: SecretAccess = { secretId, userId, userName, grantedAt: now(), accessLevel };
  config.secretAccess = config.secretAccess.filter((a) => !(a.secretId === secretId && a.userId === userId));
  config.secretAccess.push(access);
  saveConfig(config);
  return access;
}
function revokeSecretAccess(secretId: string, userId: string): boolean {
  const config = loadConfig();
  const idx = config.secretAccess.findIndex((a) => a.secretId === secretId && a.userId === userId);
  if (idx === -1) return false;
  config.secretAccess.splice(idx, 1);
  saveConfig(config);
  return true;
}
function getSecretAccess(secretId: string): SecretAccess[] { return loadConfig().secretAccess.filter((a) => a.secretId === secretId); }

/* ================================================================== */
/*  Demo Data                                                           */
/* ================================================================== */

async function seedDemoData(): Promise<void> {
  const config = loadConfig();
  if (config.organizations.length > 0) return;

  const org = createOrg('Acme Corporation', 'acme', { ssoEnabled: true, ssoProvider: 'okta', requireMFA: true, allowedDomains: ['acme.com'] });
  const ws1 = createWorkspace(org.id, 'Engineering', 'Engineering dashboards');
  const ws2 = createWorkspace(org.id, 'Marketing', 'Marketing analytics');
  const alice = createUser('alice@acme.com', 'Alice Chen', org.id, 'owner');
  const bob = createUser('bob@acme.com', 'Bob Williams', org.id, 'admin');
  const carol = createUser('carol@acme.com', 'Carol Davis', org.id, 'editor');
  const dave = createUser('dave@acme.com', 'Dave Johnson', org.id, 'viewer');
  const team1 = createTeam(org.id, 'Platform', 'Platform engineering', '#2563eb');
  const team2 = createTeam(org.id, 'Data', 'Data analytics', '#7c3aed');
  addTeamMember(team1.id, alice.id); addTeamMember(team1.id, bob.id);
  addTeamMember(team2.id, carol.id); addTeamMember(team2.id, dave.id);
  configureSSO({ provider: 'okta', enabled: true, entityId: 'https://acme.okta.com', ssoUrl: 'https://acme.okta.com/app/sso', certificate: 'MIIDpDCCAoygAwIBAgIGAX...', attributeMapping: { email: 'mail', name: 'displayName', groups: 'memberOf', role: 'appRole' } });
  configureSAML({ enabled: true, issuer: 'https://acme.com', ssoUrl: 'https://acme.com/saml/sso', sloUrl: 'https://acme.com/saml/slo', certificate: 'MIIDqTCCApGgAwIBAgIB...', signRequests: true, attributeMapping: { email: 'email', name: 'cn', groups: 'memberOf' } });
  configureOAuth({ provider: 'github', clientId: 'Iv1.abc123def456', clientSecretRef: 'gh-secret-ref', scopes: ['read:user', 'user:email', 'read:org'], redirectUri: 'https://app.acme.com/auth/github/callback', enabled: true });
  const { plainKey: apiKey1 } = await createApiKey('Production API', ['dashboards:read', 'dashboards:write', 'data:read'], alice.id);
  const { plainKey: apiKey2 } = await createApiKey('CI/CD Pipeline', ['dashboards:read', 'dashboards:write'], bob.id);
  await createApiKey('Staging API', ['dashboards:read'], carol.id);
  const key = createEncryptionKey('Primary Key');
  const sec1 = createSecret('DATABASE_URL', 'postgresql://admin:s3cret@db.acme.com:5432/analytics', ws1.id, alice.id, 'Primary database connection', ['database', 'production']);
  const sec2 = createSecret('REDIS_URL', 'redis://:p@ssw0rd@cache.acme.com:6379', ws1.id, alice.id, 'Redis cache', ['cache', 'production']);
  const sec3 = createSecret('STRIPE_KEY', 'sk_live_51Hb2KdJ8g...', ws2.id, bob.id, 'Stripe payment key', ['payment', 'production']);
  createSecret('SMTP_PASSWORD', 'smtp-p@ss!', ws2.id, carol.id, 'Email service password', ['email']);
  grantSecretAccess(sec1.id, bob.id, 'Bob Williams', 'read');
  grantSecretAccess(sec1.id, carol.id, 'Carol Davis', 'read');
  grantSecretAccess(sec3.id, dave.id, 'Dave Johnson', 'read');
  addPolicy({ name: 'Team-only data sources', description: 'Only Platform team can manage data sources', effect: 'allow', permissions: [{ id: 'ds.manage', name: 'Manage DS', description: '', resource: 'datasource', action: 'manage' }], conditions: [{ type: 'team_member', operator: 'in', value: team1.id }], priority: 10, enabled: true });
  addPolicy({ name: 'Guest read-only', description: 'Guests can only view dashboards', effect: 'deny', permissions: [{ id: 'dash.update', name: 'Update dash', description: '', resource: 'dashboard', action: 'update' }], conditions: [{ type: 'attribute', operator: 'equals', field: 'role', value: 'guest' }], priority: 20, enabled: true });
  const auditActions = ['user.login', 'dashboard.create', 'dashboard.publish', 'secret.rotate', 'apikey.create', 'team.member_add', 'settings.update', 'user.role_change', 'workspace.create', 'secret.access'];
  const users = [alice, bob, carol, dave];
  for (let i = 0; i < 20; i++) {
    const u = users[i % users.length];
    const action = auditActions[i % auditActions.length];
    const severity = action.includes('secret') || action.includes('apikey') ? 'security' : action.includes('login') || action.includes('role') ? 'warning' : 'info';
    logAudit(config, org.id, u.id, action.startsWith('dashboard') ? 'dashboard' : action.startsWith('team') ? 'team' : action.startsWith('secret') ? 'dashboard' : action.startsWith('apikey') ? 'api_key' : action.startsWith('workspace') ? 'workspace' : 'user', `${u.id}-${i}`, action, severity as 'info' | 'warning' | 'critical' | 'security', { index: i });
  }
}

/* ================================================================== */
/*  Stats                                                               */
/* ================================================================== */

function getSecurityStats(): { orgCount: number; workspaceCount: number; userCount: number; teamCount: number; apiKeyCount: number; activeApiKeyCount: number; secretCount: number; policyCount: number; auditCount: number; ssoEnabled: boolean; mfaRequired: boolean } {
  const config = loadConfig();
  return {
    orgCount: config.organizations.length,
    workspaceCount: config.workspaces.length,
    userCount: config.users.length,
    teamCount: config.teams.length,
    apiKeyCount: config.apiKeys.length,
    activeApiKeyCount: config.apiKeys.filter((k) => k.status === 'active').length,
    secretCount: config.secrets.length,
    policyCount: config.policies.length,
    auditCount: config.auditLog.length,
    ssoEnabled: config.sso?.enabled ?? false,
    mfaRequired: config.organizations.some((o) => o.settings.requireMFA),
  };
}

/* ================================================================== */
/*  Export                                                               */
/* ================================================================== */

export const securityManager = {
  createOrg, updateOrg, deleteOrg, listOrgs, getOrg,
  createWorkspace, updateWorkspace, deleteWorkspace, listWorkspaces, getWorkspace,
  createUser, updateUser, deleteUser, listUsers, getUser,
  createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember, listTeams, getTeam,
  getRolePermissions, getAllPermissions, hasPermission, addPolicy, removePolicy, listPolicies,
  configureSSO, getSSOConfig, configureSAML, getSAMLConfig, configureOAuth, getOAuthConfig,
  createApiKey, revokeApiKey, validateApiKey, listApiKeys, deleteApiKey,
  logAudit, getAuditLog, getAuditStats,
  createEncryptionKey, rotateEncryptionKey, getActiveKey, listEncryptionKeys,
  createSecret, getSecret, decryptSecret, updateSecret, deleteSecret, rotateSecret, listSecrets,
  grantSecretAccess, revokeSecretAccess, getSecretAccess,
  seedDemoData, getSecurityStats,
};
