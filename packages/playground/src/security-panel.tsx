import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { Organization, SecurityUser, Team, ApiKey, Secret, SecurityAuditEntry, RBACPolicy, Permission, SecurityRole, ResourceType, SSOProvider, OAuthProvider } from '@dashboard-generator/core';
import { securityManager } from './security-manager';
import { timeAgo, severityColor, statusColor, uid } from './utils';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export interface SecurityPanelProps { orgId?: string; }
type SecTab = 'overview' | 'organization' | 'users' | 'teams' | 'roles' | 'sso' | 'apikeys' | 'secrets';

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const ROLE_COLORS: Record<string, string> = { owner: '#f59e0b', admin: '#ef4444', editor: '#3b82f6', viewer: '#10b981', guest: '#6b7280' };
const RESOURCE_TYPES: ResourceType[] = ['organization', 'workspace', 'dashboard', 'datasource', 'team', 'user', 'settings', 'api_key', 'audit'];
const PERMISSION_ACTIONS = ['create', 'read', 'update', 'delete', 'share', 'export', 'manage', 'approve'] as const;
const SSO_PROVIDERS: { value: SSOProvider; label: string }[] = [{ value: 'okta', label: 'Okta' }, { value: 'azure_ad', label: 'Azure AD' }, { value: 'google_workspace', label: 'Google Workspace' }, { value: 'auth0', label: 'Auth0' }, { value: 'onelogin', label: 'OneLogin' }, { value: 'custom_saml', label: 'Custom SAML' }, { value: 'custom_oidc', label: 'Custom OIDC' }];
const OAUTH_PROVIDERS: { value: OAuthProvider; label: string }[] = [{ value: 'github', label: 'GitHub' }, { value: 'gitlab', label: 'GitLab' }, { value: 'google', label: 'Google' }, { value: 'microsoft', label: 'Microsoft' }, { value: 'custom', label: 'Custom' }];

/* ================================================================== */
/*  SecurityPanel                                                       */
/* ================================================================== */

export function SecurityPanel({ orgId }: SecurityPanelProps) {
  const [activeTab, setActiveTab] = useState<SecTab>('overview');
  const [, forceUpdate] = useState(0);
  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  useEffect(() => { securityManager.seedDemoData(); }, []);

  const stats = useMemo(() => securityManager.getSecurityStats(), [activeTab]);
  const orgs = useMemo(() => securityManager.listOrgs(), [activeTab]);
  const users = useMemo(() => securityManager.listUsers(orgId), [activeTab]);
  const teams = useMemo(() => securityManager.listTeams(orgId), [activeTab]);
  const apiKeys = useMemo(() => securityManager.listApiKeys(), [activeTab]);
  const secrets = useMemo(() => securityManager.listSecrets(), [activeTab]);
  const policies = useMemo(() => securityManager.listPolicies(), [activeTab]);
  const auditEntries = useMemo(() => securityManager.getAuditLog(orgId), [activeTab]);
  const ssoConfig = useMemo(() => securityManager.getSSOConfig(), [activeTab]);
  const samlConfig = useMemo(() => securityManager.getSAMLConfig(), [activeTab]);
  const oauthConfig = useMemo(() => securityManager.getOAuthConfig(), [activeTab]);
  const allPermissions = useMemo(() => securityManager.getAllPermissions(), []);

  const tabs: { key: SecTab; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'organization', label: 'Orgs' },
    { key: 'users', label: 'Users', badge: users.length },
    { key: 'teams', label: 'Teams', badge: teams.length },
    { key: 'roles', label: 'Roles' },
    { key: 'sso', label: 'SSO' },
    { key: 'apikeys', label: 'API Keys', badge: apiKeys.filter((k) => k.status === 'active').length },
    { key: 'secrets', label: 'Secrets', badge: secrets.length },
  ];

  return (
    <div className="sec-root">
      <div className="sec-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`sec-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}{t.badge !== undefined && t.badge > 0 && <span className="sec-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="sec-content">
        {activeTab === 'overview' && <OverviewTab stats={stats} auditEntries={auditEntries} />}
        {activeTab === 'organization' && <OrganizationTab orgs={orgs} onRefresh={refresh} />}
        {activeTab === 'users' && <UsersTab users={users} teams={teams} onRefresh={refresh} />}
        {activeTab === 'teams' && <TeamsTab teams={teams} users={users} orgId={orgId} onRefresh={refresh} />}
        {activeTab === 'roles' && <RolesTab policies={policies} allPermissions={allPermissions} onRefresh={refresh} />}
        {activeTab === 'sso' && <SSOTab ssoConfig={ssoConfig} samlConfig={samlConfig} oauthConfig={oauthConfig} onRefresh={refresh} />}
        {activeTab === 'apikeys' && <APIKeysTab apiKeys={apiKeys} onRefresh={refresh} />}
        {activeTab === 'secrets' && <SecretsTab secrets={secrets} users={users} onRefresh={refresh} />}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Overview Tab                                                        */
/* ================================================================== */

function OverviewTab({ stats, auditEntries }: { stats: ReturnType<typeof securityManager.getSecurityStats>; auditEntries: SecurityAuditEntry[] }) {
  const cards = [
    { label: 'Organizations', value: stats.orgCount, icon: 'O' },
    { label: 'Workspaces', value: stats.workspaceCount, icon: 'W' },
    { label: 'Users', value: stats.userCount, icon: 'U' },
    { label: 'Teams', value: stats.teamCount, icon: 'T' },
    { label: 'Active API Keys', value: stats.activeApiKeyCount, icon: 'K' },
    { label: 'Secrets', value: stats.secretCount, icon: 'S' },
    { label: 'Policies', value: stats.policyCount, icon: 'P' },
    { label: 'Audit Entries', value: stats.auditCount, icon: 'A' },
  ];
  return (
    <div className="sec-overview">
      <div className="sec-stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="sec-stat-card">
            <div className="sec-stat-icon">{c.icon}</div>
            <div className="sec-stat-info">
              <span className="sec-stat-value">{c.value}</span>
              <span className="sec-stat-label">{c.label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="sec-health-row">
        <div className={`sec-health-item ${stats.ssoEnabled ? 'ok' : 'warn'}`}>
          <span className="sec-health-dot" />SSO {stats.ssoEnabled ? 'Enabled' : 'Disabled'}
        </div>
        <div className={`sec-health-item ${stats.mfaRequired ? 'ok' : 'warn'}`}>
          <span className="sec-health-dot" />MFA {stats.mfaRequired ? 'Required' : 'Optional'}
        </div>
      </div>
      <div className="sec-section">
        <h4>Recent Activity</h4>
        {auditEntries.length === 0 ? <div className="sec-empty">No audit entries</div> : (
          <div className="sec-audit-list">
            {auditEntries.slice(0, 8).map((e) => (
              <div key={e.id} className="sec-audit-row">
                <span className="sec-audit-dot" style={{ background: severityColor(e.severity) ?? '#6b7280' }} />
                <span className="sec-audit-action">{e.action}</span>
                <span className="sec-audit-user">{e.userName}</span>
                <span className="sec-audit-time">{timeAgo(e.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Organization Tab                                                    */
/* ================================================================== */

function OrganizationTab({ orgs, onRefresh }: { orgs: Organization[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const handleCreate = useCallback(() => { if (!name.trim()) return; securityManager.createOrg(name.trim(), slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-')); setName(''); setSlug(''); setCreating(false); onRefresh(); }, [name, slug, onRefresh]);
  return (
    <div className="sec-section">
      <div className="sec-section-header">
        <h4>Organizations</h4>
        <button className="sec-btn-sm sec-btn-primary" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ New'}</button>
      </div>
      {creating && (
        <div className="sec-form-row">
          <input className="sec-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Organization name" />
          <input className="sec-input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" />
          <button className="sec-btn-sm sec-btn-primary" onClick={handleCreate}>Create</button>
        </div>
      )}
      {orgs.length === 0 ? <div className="sec-empty">No organizations</div> : orgs.map((org) => (
        <div key={org.id} className="sec-org-card">
          <div className="sec-org-header">
            <span className="sec-org-name">{org.name}</span>
            <span className="sec-org-slug">/{org.slug}</span>
            <button className="sec-btn-xs" onClick={() => setEditing(editing === org.id ? null : org.id)}>{editing === org.id ? 'Close' : 'Edit'}</button>
          </div>
          {editing === org.id && (
            <div className="sec-org-settings">
              <div className="sec-setting-row"><span>SSO Enabled</span><label className="sec-toggle"><input type="checkbox" checked={org.settings.ssoEnabled} onChange={(e) => { securityManager.updateOrg(org.id, { settings: { ...org.settings, ssoEnabled: e.target.checked } }); onRefresh(); }} /><span className="sec-toggle-slider" /></label></div>
              <div className="sec-setting-row"><span>Require MFA</span><label className="sec-toggle"><input type="checkbox" checked={org.settings.requireMFA} onChange={(e) => { securityManager.updateOrg(org.id, { settings: { ...org.settings, requireMFA: e.target.checked } }); onRefresh(); }} /><span className="sec-toggle-slider" /></label></div>
              <div className="sec-setting-row"><span>Session Timeout (min)</span><input className="sec-input-sm" type="number" value={org.settings.sessionTimeout} onChange={(e) => { securityManager.updateOrg(org.id, { settings: { ...org.settings, sessionTimeout: Number(e.target.value) } }); onRefresh(); }} /></div>
              <div className="sec-setting-row"><span>Max Users</span><input className="sec-input-sm" type="number" value={org.settings.maxUsers} onChange={(e) => { securityManager.updateOrg(org.id, { settings: { ...org.settings, maxUsers: Number(e.target.value) } }); onRefresh(); }} /></div>
              <div className="sec-setting-row"><span>Allowed Domains</span><input className="sec-input" value={org.settings.allowedDomains.join(', ')} onChange={(e) => { securityManager.updateOrg(org.id, { settings: { ...org.settings, allowedDomains: e.target.value.split(',').map((d) => d.trim()).filter(Boolean) } }); onRefresh(); }} placeholder="acme.com, corp.com" /></div>
              <div className="sec-setting-row"><span>IP Whitelist</span><input className="sec-input" value={org.settings.ipWhitelist.join(', ')} onChange={(e) => { securityManager.updateOrg(org.id, { settings: { ...org.settings, ipWhitelist: e.target.value.split(',').map((d) => d.trim()).filter(Boolean) } }); onRefresh(); }} placeholder="10.0.0.0/8, 192.168.1.0/24" /></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Users Tab                                                           */
/* ================================================================== */

function UsersTab({ users, teams, onRefresh }: { users: SecurityUser[]; teams: Team[]; onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<SecurityRole>('viewer');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<SecurityRole | 'all'>('all');
  const filtered = useMemo(() => users.filter((u) => { if (roleFilter !== 'all' && u.role !== roleFilter) return false; if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false; return true; }), [users, search, roleFilter]);
  const handleInvite = useCallback(() => { if (!inviteEmail.trim() || !inviteName.trim()) return; securityManager.createUser(inviteEmail.trim(), inviteName.trim(), users[0]?.orgId ?? 'org-demo', inviteRole); setInviteEmail(''); setInviteName(''); setCreating(false); onRefresh(); }, [inviteEmail, inviteName, inviteRole, users, onRefresh]);
  const getTeamNames = (teamIds: string[]) => teamIds.map((id) => teams.find((t) => t.id === id)?.name).filter(Boolean).join(', ');
  return (
    <div className="sec-section">
      <div className="sec-section-header">
        <h4>Users ({users.length})</h4>
        <button className="sec-btn-sm sec-btn-primary" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ Invite'}</button>
      </div>
      <div className="sec-toolbar">
        <input className="sec-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." />
        <div className="sec-filter-group">
          {(['all', 'owner', 'admin', 'editor', 'viewer', 'guest'] as const).map((r) => <button key={r} className={`sec-filter-btn ${roleFilter === r ? 'active' : ''}`} onClick={() => setRoleFilter(r)}>{r === 'all' ? 'All' : r}</button>)}
        </div>
      </div>
      {creating && (
        <div className="sec-form-grid">
          <input className="sec-input" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Full name" />
          <input className="sec-input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email" type="email" />
          <select className="sec-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as SecurityRole)}>
            {(['owner', 'admin', 'editor', 'viewer', 'guest'] as const).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="sec-btn-sm sec-btn-primary" onClick={handleInvite}>Invite</button>
        </div>
      )}
      <div className="sec-table-wrap">
        <table className="sec-table">
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Auth</th><th>Teams</th><th>Last Login</th><th /></tr></thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td><div className="sec-user-cell"><div className="sec-avatar-sm" style={{ background: ROLE_COLORS[u.role] }}>{u.name.charAt(0)}</div><div><span className="sec-user-name">{u.name}</span><span className="sec-user-email">{u.email}</span></div></div></td>
                <td><select className="sec-role-select" value={u.role} onChange={(e) => { securityManager.updateUser(u.id, { role: e.target.value as SecurityRole }); onRefresh(); }}>{(['owner', 'admin', 'editor', 'viewer', 'guest'] as const).map((r) => <option key={r} value={r}>{r}</option>)}</select></td>
                <td><span className="sec-status-badge" style={{ color: statusColor(u.status) }}>{u.status}</span></td>
                <td><span className="sec-auth-badge">{u.authMethod}</span></td>
                <td><span className="sec-teams-text">{getTeamNames(u.teamIds) || '-'}</span></td>
                <td><span className="sec-time-text">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</span></td>
                <td>
                  <div className="sec-row-actions">
                    {u.status !== 'suspended' ? <button className="sec-btn-xs sec-btn-warn" onClick={() => { securityManager.updateUser(u.id, { status: 'suspended' }); onRefresh(); }}>Suspend</button> : <button className="sec-btn-xs sec-btn-ok" onClick={() => { securityManager.updateUser(u.id, { status: 'active' }); onRefresh(); }}>Activate</button>}
                    <button className="sec-btn-xs sec-btn-danger" onClick={() => { securityManager.deleteUser(u.id); onRefresh(); }}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Teams Tab                                                           */
/* ================================================================== */

function TeamsTab({ teams, users, orgId, onRefresh }: { teams: Team[]; users: SecurityUser[]; orgId?: string; onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [editingMembers, setEditingMembers] = useState<string | null>(null);
  const handleCreate = useCallback(() => { if (!teamName.trim()) return; securityManager.createTeam(orgId ?? users[0]?.orgId ?? 'org-demo', teamName.trim(), teamDesc.trim() || undefined); setTeamName(''); setTeamDesc(''); setCreating(false); onRefresh(); }, [teamName, teamDesc, orgId, users, onRefresh]);
  const getUserName = (userId: string) => users.find((u) => u.id === userId)?.name ?? userId;
  return (
    <div className="sec-section">
      <div className="sec-section-header">
        <h4>Teams ({teams.length})</h4>
        <button className="sec-btn-sm sec-btn-primary" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ New Team'}</button>
      </div>
      {creating && (
        <div className="sec-form-row">
          <input className="sec-input" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" />
          <input className="sec-input" value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="Description (optional)" />
          <button className="sec-btn-sm sec-btn-primary" onClick={handleCreate}>Create</button>
        </div>
      )}
      {teams.length === 0 ? <div className="sec-empty">No teams</div> : (
        <div className="sec-team-grid">
          {teams.map((t) => (
            <div key={t.id} className="sec-team-card">
              <div className="sec-team-header">
                <div className="sec-team-color" style={{ background: t.color ?? '#3b82f6' }} />
                <span className="sec-team-name">{t.name}</span>
                <span className="sec-team-count">{t.memberIds.length} members</span>
              </div>
              {t.description && <p className="sec-team-desc">{t.description}</p>}
              <div className="sec-team-members">
                {t.memberIds.slice(0, 5).map((mid) => <span key={mid} className="sec-member-chip">{getUserName(mid)}</span>)}
                {t.memberIds.length > 5 && <span className="sec-member-chip sec-more">+{t.memberIds.length - 5}</span>}
              </div>
              <div className="sec-team-actions">
                <button className="sec-btn-xs" onClick={() => setEditingMembers(editingMembers === t.id ? null : t.id)}>{editingMembers === t.id ? 'Close' : 'Manage Members'}</button>
                <button className="sec-btn-xs sec-btn-danger" onClick={() => { securityManager.deleteTeam(t.id); onRefresh(); }}>Delete</button>
              </div>
              {editingMembers === t.id && (
                <div className="sec-member-editor">
                  {users.filter((u) => !t.memberIds.includes(u.id)).map((u) => (
                    <button key={u.id} className="sec-btn-xs sec-btn-add" onClick={() => { securityManager.addTeamMember(t.id, u.id); onRefresh(); }}>+ {u.name}</button>
                  ))}
                  {t.memberIds.map((mid) => (
                    <button key={mid} className="sec-btn-xs sec-btn-remove" onClick={() => { securityManager.removeTeamMember(t.id, mid); onRefresh(); }}>- {getUserName(mid)}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Roles Tab (Permission Matrix)                                       */
/* ================================================================== */

function RolesTab({ policies, allPermissions, onRefresh }: { policies: RBACPolicy[]; allPermissions: Permission[]; onRefresh: () => void }) {
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [policyDesc, setPolicyDesc] = useState('');
  const [policyEffect, setPolicyEffect] = useState<'allow' | 'deny'>('allow');
  const roles: SecurityRole[] = ['owner', 'admin', 'editor', 'viewer', 'guest'];
  const grouped = useMemo(() => {
    const g: Record<string, Permission[]> = {};
    allPermissions.forEach((p) => { (g[p.resource] ??= []).push(p); });
    return g;
  }, [allPermissions]);
  const rolePerms = useMemo(() => roles.map((r) => ({ role: r, perms: securityManager.getRolePermissions(r) })), []);
  const handleCreatePolicy = useCallback(() => { if (!policyName.trim()) return; securityManager.addPolicy({ name: policyName.trim(), description: policyDesc.trim() || undefined, effect: policyEffect, permissions: [], conditions: [], priority: policies.length + 1, enabled: true }); setPolicyName(''); setPolicyDesc(''); setCreatingPolicy(false); onRefresh(); }, [policyName, policyDesc, policyEffect, policies.length, onRefresh]);
  return (
    <div className="sec-section">
      <h4>Role Permission Matrix</h4>
      <div className="sec-matrix-wrap">
        <table className="sec-matrix">
          <thead>
            <tr><th>Permission</th>{roles.map((r) => <th key={r} style={{ color: ROLE_COLORS[r] }}>{r}</th>)}</tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([resource, perms]) => (
              <Fragment key={resource}>
                <tr className="sec-matrix-group"><td colSpan={roles.length + 1}>{resource}</td></tr>
                {perms.map((perm) => (
                  <tr key={perm.id}>
                    <td><span className="sec-perm-name">{perm.name}</span><span className="sec-perm-action">{perm.action}</span></td>
                    {roles.map((r) => {
                      const has = rolePerms.find((rp) => rp.role === r)?.perms?.permissions.some((p) => p.id === perm.id);
                      return <td key={r}><span className={`sec-matrix-check ${has ? 'yes' : ''}`}>{has ? '✓' : ''}</span></td>;
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sec-section" style={{ marginTop: 16 }}>
        <div className="sec-section-header">
          <h4>RBAC Policies</h4>
          <button className="sec-btn-sm sec-btn-primary" onClick={() => setCreatingPolicy(!creatingPolicy)}>{creatingPolicy ? 'Cancel' : '+ New Policy'}</button>
        </div>
        {creatingPolicy && (
          <div className="sec-form-grid">
            <input className="sec-input" value={policyName} onChange={(e) => setPolicyName(e.target.value)} placeholder="Policy name" />
            <input className="sec-input" value={policyDesc} onChange={(e) => setPolicyDesc(e.target.value)} placeholder="Description (optional)" />
            <select className="sec-select" value={policyEffect} onChange={(e) => setPolicyEffect(e.target.value as 'allow' | 'deny')}><option value="allow">Allow</option><option value="deny">Deny</option></select>
            <button className="sec-btn-sm sec-btn-primary" onClick={handleCreatePolicy}>Create</button>
          </div>
        )}
        {policies.length === 0 ? <div className="sec-empty">No policies defined</div> : policies.map((p) => (
          <div key={p.id} className="sec-policy-card">
            <div className="sec-policy-header">
              <span className="sec-policy-name">{p.name}</span>
              <span className={`sec-badge ${p.effect === 'allow' ? 'sec-badge-green' : 'sec-badge-red'}`}>{p.effect}</span>
              <span className="sec-policy-priority">P{p.priority}</span>
              <label className="sec-toggle"><input type="checkbox" checked={p.enabled} onChange={() => { securityManager.removePolicy(p.id); if (p.enabled) securityManager.addPolicy({ ...p, id: undefined as never, createdAt: undefined as never, enabled: false }); onRefresh(); }} /><span className="sec-toggle-slider" /></label>
              <button className="sec-btn-xs sec-btn-danger" onClick={() => { securityManager.removePolicy(p.id); onRefresh(); }}>Delete</button>
            </div>
            {p.description && <p className="sec-policy-desc">{p.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  SSO Tab                                                             */
/* ================================================================== */

function SSOTab({ ssoConfig, samlConfig, oauthConfig, onRefresh }: { ssoConfig?: import('@dashboard-generator/core').SSOConfig; samlConfig?: import('@dashboard-generator/core').SAMLConfig; oauthConfig?: import('@dashboard-generator/core').OAuthConfig; onRefresh: () => void }) {
  const [ssoProvider, setSsoProvider] = useState<SSOProvider>(ssoConfig?.provider ?? 'okta');
  const [ssoEnabled, setSsoEnabled] = useState(ssoConfig?.enabled ?? false);
  const [samlEnabled, setSamlEnabled] = useState(samlConfig?.enabled ?? false);
  const [oauthEnabled, setOauthEnabled] = useState(oauthConfig?.enabled ?? false);
  const [oauthProvider, setOauthProvider] = useState<OAuthProvider>(oauthConfig?.provider ?? 'github');
  return (
    <div className="sec-sso">
      <div className="sec-sso-section">
        <div className="sec-sso-header">
          <h4>SSO Configuration</h4>
          <label className="sec-toggle"><input type="checkbox" checked={ssoEnabled} onChange={(e) => { setSsoEnabled(e.target.checked); securityManager.configureSSO({ provider: ssoProvider, enabled: e.target.checked, entityId: ssoConfig?.entityId ?? '', ssoUrl: ssoConfig?.ssoUrl ?? '', certificate: ssoConfig?.certificate ?? '' }); onRefresh(); }} /><span className="sec-toggle-slider" /></label>
        </div>
        {ssoEnabled && (
          <div className="sec-form-grid">
            <div className="sec-field"><label>Provider</label><select className="sec-select" value={ssoProvider} onChange={(e) => setSsoProvider(e.target.value as SSOProvider)}>{SSO_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div className="sec-field"><label>Entity ID</label><input className="sec-input" defaultValue={ssoConfig?.entityId ?? ''} placeholder="https://your-app.com" /></div>
            <div className="sec-field"><label>SSO URL</label><input className="sec-input" defaultValue={ssoConfig?.ssoUrl ?? ''} placeholder="https://idp.example.com/sso" /></div>
            <div className="sec-field"><label>Certificate</label><textarea className="sec-textarea" defaultValue={ssoConfig?.certificate ?? ''} placeholder="-----BEGIN CERTIFICATE-----..." rows={3} /></div>
            <div className="sec-field"><label>Metadata URL</label><input className="sec-input" defaultValue={ssoConfig?.metadataUrl ?? ''} placeholder="https://idp.example.com/metadata" /></div>
          </div>
        )}
      </div>
      <div className="sec-sso-section">
        <div className="sec-sso-header">
          <h4>SAML</h4>
          <label className="sec-toggle"><input type="checkbox" checked={samlEnabled} onChange={(e) => { setSamlEnabled(e.target.checked); securityManager.configureSAML({ enabled: e.target.checked, issuer: samlConfig?.issuer ?? '', ssoUrl: samlConfig?.ssoUrl ?? '', certificate: samlConfig?.certificate ?? '', signRequests: true }); onRefresh(); }} /><span className="sec-toggle-slider" /></label>
        </div>
        {samlEnabled && (
          <div className="sec-form-grid">
            <div className="sec-field"><label>Issuer</label><input className="sec-input" defaultValue={samlConfig?.issuer ?? ''} placeholder="https://your-app.com" /></div>
            <div className="sec-field"><label>SSO URL</label><input className="sec-input" defaultValue={samlConfig?.ssoUrl ?? ''} placeholder="https://idp.example.com/saml/sso" /></div>
            <div className="sec-field"><label>SLO URL</label><input className="sec-input" defaultValue={samlConfig?.sloUrl ?? ''} placeholder="https://idp.example.com/saml/slo" /></div>
            <div className="sec-field"><label>Certificate</label><textarea className="sec-textarea" defaultValue={samlConfig?.certificate ?? ''} placeholder="-----BEGIN CERTIFICATE-----..." rows={3} /></div>
            <div className="sec-check"><input type="checkbox" defaultChecked={samlConfig?.signRequests ?? true} /><span>Sign Auth Requests</span></div>
          </div>
        )}
      </div>
      <div className="sec-sso-section">
        <div className="sec-sso-header">
          <h4>OAuth</h4>
          <label className="sec-toggle"><input type="checkbox" checked={oauthEnabled} onChange={(e) => { setOauthEnabled(e.target.checked); securityManager.configureOAuth({ provider: oauthProvider, enabled: e.target.checked, clientId: oauthConfig?.clientId ?? '', clientSecretRef: oauthConfig?.clientSecretRef ?? '', scopes: oauthConfig?.scopes ?? ['read:user'], redirectUri: oauthConfig?.redirectUri ?? window.location.origin + '/auth/callback' }); onRefresh(); }} /><span className="sec-toggle-slider" /></label>
        </div>
        {oauthEnabled && (
          <div className="sec-form-grid">
            <div className="sec-field"><label>Provider</label><select className="sec-select" value={oauthProvider} onChange={(e) => setOauthProvider(e.target.value as OAuthProvider)}>{OAUTH_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div className="sec-field"><label>Client ID</label><input className="sec-input" defaultValue={oauthConfig?.clientId ?? ''} placeholder="Client ID" /></div>
            <div className="sec-field"><label>Client Secret</label><input className="sec-input" type="password" defaultValue={oauthConfig?.clientSecretRef ?? ''} placeholder="Client Secret" /></div>
            <div className="sec-field"><label>Scopes</label><input className="sec-input" defaultValue={(oauthConfig?.scopes ?? []).join(', ')} placeholder="read:user, user:email" /></div>
            <div className="sec-field"><label>Redirect URI</label><input className="sec-input" defaultValue={oauthConfig?.redirectUri ?? ''} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  API Keys Tab                                                        */
/* ================================================================== */

function APIKeysTab({ apiKeys, onRefresh }: { apiKeys: ApiKey[]; onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState('dashboards:read, data:read');
  const [newKeyPlain, setNewKeyPlain] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const handleCreate = useCallback(() => { if (!keyName.trim()) return; securityManager.createApiKey(keyName.trim(), keyScopes.split(',').map((s) => s.trim()).filter(Boolean), 'current-user').then(({ apiKey, plainKey }) => { setKeyName(''); setKeyScopes('dashboards:read, data:read'); setNewKeyPlain(plainKey); setCreating(false); onRefresh(); }); }, [keyName, keyScopes, onRefresh]);
  const handleCopy = useCallback((text: string) => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }, []);
  return (
    <div className="sec-section">
      <div className="sec-section-header">
        <h4>API Keys ({apiKeys.length})</h4>
        <button className="sec-btn-sm sec-btn-primary" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ Generate Key'}</button>
      </div>
      {newKeyPlain && (
        <div className="sec-alert sec-alert-warn">
          <strong>Copy your API key now.</strong> It will not be shown again.
          <div className="sec-key-reveal">
            <code>{newKeyPlain}</code>
            <button className="sec-btn-sm" onClick={() => handleCopy(newKeyPlain)}>{copied ? 'Copied!' : 'Copy'}</button>
          </div>
          <button className="sec-btn-sm sec-btn-full" onClick={() => setNewKeyPlain(null)}>Done</button>
        </div>
      )}
      {creating && (
        <div className="sec-form-grid">
          <input className="sec-input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name (e.g. CI Pipeline)" />
          <input className="sec-input" value={keyScopes} onChange={(e) => setKeyScopes(e.target.value)} placeholder="Scopes (comma-separated)" />
          <button className="sec-btn-sm sec-btn-primary" onClick={handleCreate}>Generate</button>
        </div>
      )}
      {apiKeys.length === 0 ? <div className="sec-empty">No API keys</div> : (
        <div className="sec-table-wrap">
          <table className="sec-table">
            <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Status</th><th>Created</th><th>Last Used</th><th /></tr></thead>
            <tbody>
              {apiKeys.map((k) => (
                <tr key={k.id}>
                  <td><span className="sec-key-name">{k.name}</span></td>
                  <td><code className="sec-key-prefix">{k.keyPrefix}...****</code></td>
                  <td><div className="sec-scopes">{k.scopes.map((s) => <span key={s} className="sec-scope-chip">{s}</span>)}</div></td>
                  <td><span className="sec-status-badge" style={{ color: statusColor(k.status) }}>{k.status}</span></td>
                  <td><span className="sec-time-text">{timeAgo(k.createdAt)}</span></td>
                  <td><span className="sec-time-text">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : 'Never'}</span></td>
                  <td>
                    <div className="sec-row-actions">
                      {k.status === 'active' && <button className="sec-btn-xs sec-btn-warn" onClick={() => { securityManager.revokeApiKey(k.id); onRefresh(); }}>Revoke</button>}
                      <button className="sec-btn-xs sec-btn-danger" onClick={() => { securityManager.deleteApiKey(k.id); onRefresh(); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Secrets Tab                                                         */
/* ================================================================== */

function SecretsTab({ secrets, users, onRefresh }: { secrets: Secret[]; users: SecurityUser[]; onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  const [secName, setSecName] = useState('');
  const [secValue, setSecValue] = useState('');
  const [secDesc, setSecDesc] = useState('');
  const [secTags, setSecTags] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [rotating, setRotating] = useState<string | null>(null);
  const [rotValue, setRotValue] = useState('');
  const handleCreate = useCallback(() => { if (!secName.trim() || !secValue.trim()) return; securityManager.createSecret(secName.trim(), secValue.trim(), 'ws-demo', 'current-user', secDesc.trim() || undefined, secTags.split(',').map((t) => t.trim()).filter(Boolean)); setSecName(''); setSecValue(''); setSecDesc(''); setSecTags(''); setCreating(false); onRefresh(); }, [secName, secValue, secDesc, secTags, onRefresh]);
  const handleReveal = useCallback((id: string) => { if (revealed[id]) { setRevealed((prev) => { const next = { ...prev }; delete next[id]; return next; }); } else { const val = securityManager.decryptSecret(id); if (val) setRevealed((prev) => ({ ...prev, [id]: val })); } }, [revealed]);
  const handleRotate = useCallback(() => { if (!rotating || !rotValue.trim()) return; securityManager.rotateSecret(rotating, rotValue.trim()); setRotating(null); setRotValue(''); onRefresh(); }, [rotating, rotValue, onRefresh]);
  const getUserName = (userId: string) => users.find((u) => u.id === userId)?.name ?? userId;
  return (
    <div className="sec-section">
      <div className="sec-section-header">
        <h4>Secrets Vault ({secrets.length})</h4>
        <button className="sec-btn-sm sec-btn-primary" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ Add Secret'}</button>
      </div>
      {creating && (
        <div className="sec-form-grid">
          <input className="sec-input" value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="Secret name (e.g. DATABASE_URL)" />
          <input className="sec-input" value={secValue} onChange={(e) => setSecValue(e.target.value)} placeholder="Secret value" type="password" />
          <input className="sec-input" value={secDesc} onChange={(e) => setSecDesc(e.target.value)} placeholder="Description (optional)" />
          <input className="sec-input" value={secTags} onChange={(e) => setSecTags(e.target.value)} placeholder="Tags (comma-separated)" />
          <button className="sec-btn-sm sec-btn-primary" onClick={handleCreate}>Add Secret</button>
        </div>
      )}
      {rotating && (
        <div className="sec-alert sec-alert-warn">
          <strong>Rotate Secret</strong>
          <input className="sec-input" value={rotValue} onChange={(e) => setRotValue(e.target.value)} placeholder="New secret value" type="password" />
          <div className="sec-form-row"><button className="sec-btn-sm sec-btn-primary" onClick={handleRotate}>Rotate</button><button className="sec-btn-sm" onClick={() => { setRotating(null); setRotValue(''); }}>Cancel</button></div>
        </div>
      )}
      {secrets.length === 0 ? <div className="sec-empty">No secrets stored</div> : secrets.map((s) => (
        <div key={s.id} className="sec-secret-card">
          <div className="sec-secret-header">
            <span className="sec-secret-name">{s.name}</span>
            {s.tags.map((t) => <span key={t} className="sec-tag">{t}</span>)}
          </div>
          {s.description && <p className="sec-secret-desc">{s.description}</p>}
          <div className="sec-secret-value-row">
            <code className="sec-secret-value">{revealed[s.id] ?? '••••••••••••••••'}</code>
            <button className="sec-btn-xs" onClick={() => handleReveal(s.id)}>{revealed[s.id] ? 'Hide' : 'Reveal'}</button>
            <button className="sec-btn-xs sec-btn-warn" onClick={() => { setRotating(s.id); setRotValue(''); }}>Rotate</button>
            <button className="sec-btn-xs sec-btn-danger" onClick={() => { securityManager.deleteSecret(s.id); onRefresh(); }}>Delete</button>
          </div>
          <div className="sec-secret-meta">
            <span>Created {timeAgo(s.createdAt)}</span>
            {s.rotatedAt && <span>Rotated {timeAgo(s.rotatedAt)}</span>}
            <span>By {getUserName(s.createdBy)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
