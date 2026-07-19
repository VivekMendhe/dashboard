import { useCallback, useMemo, useState } from 'react';
import type { AdminUser, AdminOrg, AdminLicense, FeatureFlag, AdminLogEntry, ServiceHealth } from './admin-service';
import { adminService } from './admin-service';
import { formatBytes as fmtBytes, formatNumber as fmtNum, formatPercent as fmtPct, formatTime as fmtTime, severityColor, statusColor } from './utils';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

type AdminTab = 'overview' | 'users' | 'orgs' | 'licenses' | 'usage' | 'analytics' | 'flags' | 'logs' | 'health' | 'stats';

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

const tierBadge = (t: string) => t === 'ultimate' ? 'bg-purple-100 text-purple-700' : t === 'enterprise' ? 'bg-blue-100 text-blue-700' : t === 'professional' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600';

/* ================================================================== */
/*  AdminPanel                                                          */
/* ================================================================== */

export function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const tabs: { key: AdminTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '\u2302' },
    { key: 'users', label: 'Users', icon: '\u263a' },
    { key: 'orgs', label: 'Orgs', icon: '\u2303' },
    { key: 'licenses', label: 'Licenses', icon: '\u2713' },
    { key: 'usage', label: 'Usage', icon: '\u2191' },
    { key: 'analytics', label: 'Analytics', icon: '\u2571' },
    { key: 'flags', label: 'Flags', icon: '\u2691' },
    { key: 'logs', label: 'Logs', icon: '\u2263' },
    { key: 'health', label: 'Health', icon: '\u2665' },
    { key: 'stats', label: 'Stats', icon: '\u2261' },
  ];

  return (
    <div className="adm-root">
      <div className="adm-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" id={`adm-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`adm-panel-${t.key}`} className={`adm-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <span className="adm-tab-icon">{t.icon}</span>
            <span className="adm-tab-label">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="adm-body" role="tabpanel" aria-label={`${tab} tab panel`}>
        <input className="adm-search" placeholder="Search admin..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {tab === 'overview' && <OverviewTab search={search} />}
        {tab === 'users' && <UsersTab search={search} />}
        {tab === 'orgs' && <OrgsTab search={search} />}
        {tab === 'licenses' && <LicensesTab search={search} />}
        {tab === 'usage' && <UsageTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'flags' && <FlagsTab search={search} />}
        {tab === 'logs' && <LogsTab search={search} />}
        {tab === 'health' && <HealthTab />}
        {tab === 'stats' && <StatsTab />}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Overview Tab                                                        */
/* ================================================================== */

function OverviewTab({ search }: { search: string }) {
  const stats = useMemo(() => adminService.getUserStats(), []);
  const orgs = useMemo(() => adminService.getOrgs(), []);
  const usage = useMemo(() => adminService.getUsageSummary(), []);
  const health = useMemo(() => adminService.getHealth(), []);
  const ds = useMemo(() => adminService.getDashboardStats(), []);
  const flags = useMemo(() => adminService.getFlags(), []);
  const logStats = useMemo(() => adminService.getLogStats(), []);

  return (
    <div className="adm-overview">
      <div className="adm-kpi-grid">
        <KpiCard label="Users" value={fmtNum(stats.total)} sub={`${stats.active} active`} color="#3b82f6" />
        <KpiCard label="Organizations" value={fmtNum(orgs.length)} sub={orgs.map((o) => o.tier).join(', ')} color="#8b5cf6" />
        <KpiCard label="API Calls (30d)" value={fmtNum(usage.totalApiCalls)} sub={`+${usage.trend.apiCalls}%`} color="#10b981" trend={usage.trend.apiCalls} />
        <KpiCard label="Active Users" value={fmtNum(usage.totalActiveUsers)} sub={`+${usage.trend.users}%`} color="#0ea5e9" trend={usage.trend.users} />
        <KpiCard label="Dashboards" value={fmtNum(ds.totalDashboards)} sub={`${ds.publishedDashboards} published`} color="#f59e0b" />
        <KpiCard label="Widgets" value={fmtNum(ds.totalWidgets)} sub={`${ds.avgWidgetsPerDashboard} avg/dashboard`} color="#ec4899" />
        <KpiCard label="System" value={health.overallStatus} sub={`${fmtPct(health.cpu.usage)} CPU`} color={statusColor(health.overallStatus)} />
        <KpiCard label="Feature Flags" value={fmtNum(flags.filter((f) => f.enabled).length)} sub={`${flags.filter((f) => !f.enabled).length} disabled`} color="#6366f1" />
      </div>
      <div className="adm-overview-row">
        <div className="adm-card">
          <h4>Log Summary</h4>
          <div className="adm-log-summary">
            {Object.entries(logStats).map(([sev, count]) => (
              <div key={sev} className="adm-log-sev"><span className="adm-dot" style={{ background: severityColor(sev) }} /><span>{sev}</span><strong>{count}</strong></div>
            ))}
          </div>
        </div>
        <div className="adm-card">
          <h4>Recent Activity</h4>
          <div className="adm-activity-list">
            {ds.recentActivity.map((a, i) => (
              <div key={i} className="adm-activity-row">
                <span className={`adm-badge adm-badge-${a.action}`}>{a.action}</span>
                <span className="adm-activity-title">{a.dashboardTitle}</span>
                <span className="adm-activity-user">{a.userName}</span>
                <span className="adm-activity-time">{fmtTime(a.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, trend }: { label: string; value: string; sub: string; color: string; trend?: number }) {
  return (
    <div className="adm-kpi" style={{ borderTopColor: color }}>
      <span className="adm-kpi-label">{label}</span>
      <span className="adm-kpi-value" style={{ color }}>{value}</span>
      <span className="adm-kpi-sub">{sub}{trend !== undefined && <span className={`adm-kpi-trend ${trend >= 0 ? 'pos' : 'neg'}`}>{trend >= 0 ? '\u25b2' : '\u25bc'} {Math.abs(trend)}%</span>}</span>
    </div>
  );
}

/* ================================================================== */
/*  Users Tab                                                           */
/* ================================================================== */

function UsersTab({ search }: { search: string }) {
  const [users, setUsers] = useState<AdminUser[]>(() => adminService.getUsers());
  const filtered = useMemo(() => {
    if (!search) return users;
    const s = search.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.role.includes(s));
  }, [users, search]);

  const toggleStatus = useCallback((id: string, status: AdminUser['status']) => {
    adminService.updateUser(id, { status });
    setUsers(adminService.getUsers());
  }, []);

  return (
    <div className="adm-card">
      <h4>Users ({filtered.length})</h4>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>MFA</th><th>API Calls</th><th>Storage</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td className="adm-td-name">{u.name}</td>
                <td className="adm-td-mono">{u.email}</td>
                <td><span className={`adm-badge adm-role-${u.role}`}>{u.role}</span></td>
                <td><span className="adm-status-dot" style={{ background: statusColor(u.status) }} />{u.status}</td>
                <td>{u.mfaEnabled ? <span className="adm-mfa-on">On</span> : <span className="adm-mfa-off">Off</span>}</td>
                <td className="adm-td-num">{fmtNum(u.apiCalls30d)}</td>
                <td className="adm-td-num">{fmtBytes(u.storageBytes)}</td>
                <td className="adm-td-time">{fmtTime(u.lastLoginAt)}</td>
                <td className="adm-td-actions">
                  {u.status === 'active' && <button className="adm-action-btn warn" onClick={() => toggleStatus(u.id, 'suspended')}>Suspend</button>}
                  {u.status === 'suspended' && <button className="adm-action-btn ok" onClick={() => toggleStatus(u.id, 'active')}>Activate</button>}
                  {u.status === 'inactive' && <button className="adm-action-btn ok" onClick={() => toggleStatus(u.id, 'active')}>Activate</button>}
                  {u.status === 'pending' && <button className="adm-action-btn ok" onClick={() => toggleStatus(u.id, 'active')}>Approve</button>}
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
/*  Organizations Tab                                                   */
/* ================================================================== */

function OrgsTab({ search }: { search: string }) {
  const [orgs, setOrgs] = useState<AdminOrg[]>(() => adminService.getOrgs());
  const filtered = useMemo(() => {
    if (!search) return orgs;
    const s = search.toLowerCase();
    return orgs.filter((o) => o.name.toLowerCase().includes(s) || o.slug.includes(s));
  }, [orgs, search]);

  return (
    <div className="adm-card">
      <h4>Organizations ({filtered.length})</h4>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Slug</th><th>Tier</th><th>Users</th><th>Max Dashboards</th><th>Retention</th><th>Created</th></tr></thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td className="adm-td-name">{o.name}</td>
                <td className="adm-td-mono">{o.slug}</td>
                <td><span className={`adm-badge ${tierBadge(o.tier)}`}>{o.tier}</span></td>
                <td className="adm-td-num">{o.userIds.length}</td>
                <td className="adm-td-num">{fmtNum(o.settings.maxDashboards)}</td>
                <td className="adm-td-num">{o.settings.dataRetentionDays}d</td>
                <td className="adm-td-time">{fmtTime(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Licenses Tab                                                        */
/* ================================================================== */

function LicensesTab({ search }: { search: string }) {
  const [licenses, setLicenses] = useState<AdminLicense[]>(() => adminService.getLicenses());
  const filtered = useMemo(() => {
    if (!search) return licenses;
    const s = search.toLowerCase();
    return licenses.filter((l) => l.key.toLowerCase().includes(s) || l.tier.includes(s) || l.status.includes(s));
  }, [licenses, search]);

  const revoke = useCallback((id: string) => {
    adminService.revokeLicense(id);
    setLicenses(adminService.getLicenses());
  }, []);

  return (
    <div className="adm-card">
      <h4>Licenses ({filtered.length})</h4>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Key</th><th>Tier</th><th>Status</th><th>Features</th><th>Users</th><th>Dashboards</th><th>Expires</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td className="adm-td-mono">{l.key}</td>
                <td><span className={`adm-badge ${tierBadge(l.tier)}`}>{l.tier}</span></td>
                <td><span className="adm-status-dot" style={{ background: statusColor(l.status) }} />{l.status}</td>
                <td className="adm-td-features">{l.features.length} features</td>
                <td className="adm-td-num">{fmtNum(l.maxUsers)}</td>
                <td className="adm-td-num">{fmtNum(l.maxDashboards)}</td>
                <td className="adm-td-time">{fmtTime(l.expiresAt)}</td>
                <td className="adm-td-actions">
                  {l.status === 'active' && <button className="adm-action-btn danger" onClick={() => revoke(l.id)}>Revoke</button>}
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
/*  Usage Tab                                                           */
/* ================================================================== */

function UsageTab() {
  const summary = useMemo(() => adminService.getUsageSummary(), []);
  const usage = useMemo(() => adminService.getUsage(), []);
  const orgs = useMemo(() => adminService.getOrgs(), []);
  const orgMap = useMemo(() => Object.fromEntries(orgs.map((o) => [o.id, o.name])), [orgs]);

  return (
    <div className="adm-usage">
      <div className="adm-kpi-grid">
        <KpiCard label="Total API Calls" value={fmtNum(summary.totalApiCalls)} sub={`${summary.trend.apiCalls >= 0 ? '+' : ''}${summary.trend.apiCalls}% vs last month`} color="#3b82f6" trend={summary.trend.apiCalls} />
        <KpiCard label="Total Storage" value={fmtBytes(summary.totalStorageBytes)} sub="Across all orgs" color="#8b5cf6" />
        <KpiCard label="Compute Minutes" value={fmtNum(summary.totalComputeMinutes)} sub="This period" color="#10b981" />
        <KpiCard label="Dashboard Views" value={fmtNum(summary.totalDashboardViews)} sub="This period" color="#f59e0b" />
      </div>
      <div className="adm-card">
        <h4>Usage by Organization</h4>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Organization</th><th>Period</th><th>API Calls</th><th>Storage</th><th>Compute</th><th>Active Users</th><th>Views</th></tr></thead>
            <tbody>
              {usage.map((u) => (
                <tr key={`${u.orgId}-${u.period}`}>
                  <td className="adm-td-name">{orgMap[u.orgId] ?? u.orgId}</td>
                  <td className="adm-td-mono">{u.period}</td>
                  <td className="adm-td-num">{fmtNum(u.apiCalls)}</td>
                  <td className="adm-td-num">{fmtBytes(u.storageBytes)}</td>
                  <td className="adm-td-num">{fmtNum(u.computeMinutes)} min</td>
                  <td className="adm-td-num">{u.activeUsers}</td>
                  <td className="adm-td-num">{fmtNum(u.dashboardViews)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Analytics Tab                                                       */
/* ================================================================== */

function AnalyticsTab() {
  const analytics = useMemo(() => adminService.getAnalytics(), []);
  const maxSessions = Math.max(...analytics.userActivity.map((h) => h.sessions), 1);

  return (
    <div className="adm-analytics">
      <div className="adm-kpi-grid">
        <KpiCard label="Active Users" value={fmtNum(analytics.activeUsers)} sub="Current period" color="#3b82f6" />
        <KpiCard label="New Users" value={fmtNum(analytics.newUsers)} sub="This period" color="#10b981" />
        <KpiCard label="Dashboard Views" value={fmtNum(analytics.dashboardViews)} sub="This period" color="#f59e0b" />
        <KpiCard label="Avg Session" value={`${analytics.avgSessionMinutes}m`} sub="Per user" color="#8b5cf6" />
      </div>
      <div className="adm-overview-row">
        <div className="adm-card">
          <h4>Top Dashboards</h4>
          <div className="adm-top-list">
            {analytics.topDashboards.map((d, i) => (
              <div key={d.id} className="adm-top-row">
                <span className="adm-top-rank">{i + 1}</span>
                <span className="adm-top-name">{d.title}</span>
                <span className="adm-top-val">{fmtNum(d.views)} views</span>
              </div>
            ))}
          </div>
        </div>
        <div className="adm-card">
          <h4>Top Widget Types</h4>
          <div className="adm-top-list">
            {analytics.topWidgets.map((w, i) => (
              <div key={w.type} className="adm-top-row">
                <span className="adm-top-rank">{i + 1}</span>
                <span className="adm-top-name">{w.type}</span>
                <span className="adm-top-val">{w.count} used</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="adm-card">
        <h4>User Activity (24h)</h4>
        <div className="adm-bar-chart">
          {analytics.userActivity.map((h) => (
            <div key={h.hour} className="adm-bar-col">
              <div className="adm-bar" style={{ height: `${(h.sessions / maxSessions) * 100}%` }} title={`${h.sessions} sessions`}>
                <span className="adm-bar-val">{h.sessions}</span>
              </div>
              <span className="adm-bar-label">{h.hour}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Feature Flags Tab                                                   */
/* ================================================================== */

function FlagsTab({ search }: { search: string }) {
  const [flags, setFlags] = useState<FeatureFlag[]>(() => adminService.getFlags());
  const filtered = useMemo(() => {
    if (!search) return flags;
    const s = search.toLowerCase();
    return flags.filter((f) => f.name.toLowerCase().includes(s) || f.key.includes(s));
  }, [flags, search]);

  const toggle = useCallback((id: string) => {
    adminService.toggleFlag(id);
    setFlags(adminService.getFlags());
  }, []);

  const updateRollout = useCallback((id: string, pct: number) => {
    adminService.updateFlag(id, { rolloutPercentage: pct });
    setFlags(adminService.getFlags());
  }, []);

  return (
    <div className="adm-card">
      <h4>Feature Flags ({filtered.length})</h4>
      <div className="adm-flags">
        {filtered.map((f) => (
          <div key={f.id} className={`adm-flag ${f.enabled ? 'on' : 'off'}`}>
            <div className="adm-flag-head">
              <button className={`adm-toggle ${f.enabled ? 'on' : ''}`} role="switch" aria-checked={f.enabled} aria-label={`Toggle ${f.name}`} onClick={() => toggle(f.id)}>
                <span className="adm-toggle-knob" />
              </button>
              <div className="adm-flag-info">
                <span className="adm-flag-name">{f.name}</span>
                <span className="adm-flag-key">{f.key}</span>
              </div>
              <span className="adm-flag-type">{f.type}</span>
            </div>
            <p className="adm-flag-desc">{f.description}</p>
            {f.type === 'percentage' && (
              <div className="adm-flag-rollout">
                <label>Rollout: {f.rolloutPercentage}%</label>
                <input type="range" min={0} max={100} value={f.rolloutPercentage} onChange={(e) => updateRollout(f.id, Number(e.target.value))} />
              </div>
            )}
            <div className="adm-flag-meta">
              <span>Created: {fmtTime(f.createdAt)}</span>
              <span>Updated: {fmtTime(f.updatedAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Logs Tab                                                            */
/* ================================================================== */

function LogsTab({ search }: { search: string }) {
  const [severity, setSeverity] = useState<string>('all');
  const [logs, setLogs] = useState<AdminLogEntry[]>(() => adminService.getLogs());
  const filtered = useMemo(() => {
    let result = logs;
    if (severity !== 'all') result = result.filter((l) => l.severity === severity);
    if (search) { const s = search.toLowerCase(); result = result.filter((l) => l.message.toLowerCase().includes(s) || l.source.toLowerCase().includes(s)); }
    return result;
  }, [logs, severity, search]);

  return (
    <div className="adm-logs">
      <div className="adm-logs-controls">
        <div className="adm-logs-sev-filter">
          {['all', 'debug', 'info', 'warn', 'error', 'critical'].map((s) => (
            <button key={s} className={`adm-sev-btn ${severity === s ? 'active' : ''}`} onClick={() => setSeverity(s)}>
              <span className="adm-dot" style={{ background: s === 'all' ? '#64748b' : severityColor(s) }} />{s}
            </button>
          ))}
        </div>
        <button className="adm-action-btn" onClick={() => { adminService.clearLogs(); setLogs([]); }}>Clear Logs</button>
      </div>
      <div className="adm-log-list">
        {filtered.map((l) => (
          <div key={l.id} className={`adm-log-row adm-log-${l.severity}`}>
            <span className="adm-log-time">{fmtTime(l.timestamp)}</span>
            <span className="adm-log-sev" style={{ color: severityColor(l.severity) }}>{l.severity.toUpperCase()}</span>
            <span className="adm-log-source">{l.source}</span>
            <span className="adm-log-msg">{l.message}</span>
            {l.durationMs !== undefined && <span className="adm-log-dur">{l.durationMs}ms</span>}
          </div>
        ))}
        {filtered.length === 0 && <div className="adm-empty">No logs match filters</div>}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Health Tab                                                          */
/* ================================================================== */

function HealthTab() {
  const [health, setHealth] = useState(() => adminService.getHealth());

  const refresh = useCallback(() => {
    setHealth(adminService.refreshHealth());
  }, []);

  const svcStatusIcon = (s: ServiceHealth['status']) => s === 'healthy' ? '\u2713' : s === 'degraded' ? '\u25d2' : s === 'down' ? '\u2717' : '?';

  return (
    <div className="adm-health">
      <div className="adm-health-header">
        <h4>System Health</h4>
        <button className="adm-action-btn" onClick={refresh}>Refresh</button>
        <span className="adm-health-overall" style={{ color: statusColor(health.overallStatus) }}>{health.overallStatus.toUpperCase()}</span>
        <span className="adm-health-time">Last check: {fmtTime(health.lastUpdated)}</span>
      </div>
      <div className="adm-kpi-grid">
        <div className="adm-health-metric">
          <span className="adm-health-metric-label">CPU</span>
          <div className="adm-gauge"><div className="adm-gauge-fill" style={{ width: `${health.cpu.usage}%`, background: health.cpu.usage > 80 ? '#ef4444' : health.cpu.usage > 60 ? '#f59e0b' : '#10b981' }} /></div>
          <span className="adm-health-metric-val">{fmtPct(health.cpu.usage)}</span>
          <span className="adm-health-metric-sub">{health.cpu.cores} cores &middot; {health.cpu.model}</span>
        </div>
        <div className="adm-health-metric">
          <span className="adm-health-metric-label">Memory</span>
          <div className="adm-gauge"><div className="adm-gauge-fill" style={{ width: `${health.memory.percentage}%`, background: health.memory.percentage > 80 ? '#ef4444' : health.memory.percentage > 60 ? '#f59e0b' : '#10b981' }} /></div>
          <span className="adm-health-metric-val">{fmtPct(health.memory.percentage)}</span>
          <span className="adm-health-metric-sub">{fmtBytes(health.memory.usedBytes)} / {fmtBytes(health.memory.totalBytes)}</span>
        </div>
        <div className="adm-health-metric">
          <span className="adm-health-metric-label">Storage</span>
          <div className="adm-gauge"><div className="adm-gauge-fill" style={{ width: `${health.storage.percentage}%`, background: health.storage.percentage > 80 ? '#ef4444' : health.storage.percentage > 60 ? '#f59e0b' : '#10b981' }} /></div>
          <span className="adm-health-metric-val">{fmtPct(health.storage.percentage)}</span>
          <span className="adm-health-metric-sub">{fmtBytes(health.storage.usedBytes)} / {fmtBytes(health.storage.totalBytes)}</span>
        </div>
      </div>
      <div className="adm-card">
        <h4>Services</h4>
        <div className="adm-svc-list">
          {health.services.map((svc) => (
            <div key={svc.name} className={`adm-svc-row adm-svc-${svc.status}`}>
              <span className="adm-svc-icon" style={{ color: statusColor(svc.status) }}>{svcStatusIcon(svc.status)}</span>
              <span className="adm-svc-name">{svc.name}</span>
              <span className="adm-svc-latency">{svc.latencyMs}ms</span>
              <span className="adm-svc-uptime">{fmtPct(svc.uptime)} uptime</span>
              {svc.details && <span className="adm-svc-details">{svc.details}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Dashboard Statistics Tab                                            */
/* ================================================================== */

function StatsTab() {
  const stats = useMemo(() => adminService.getDashboardStats(), []);
  const dist = useMemo(() => adminService.getWidgetTypeDistribution(), []);

  return (
    <div className="adm-stats">
      <div className="adm-kpi-grid">
        <KpiCard label="Total Dashboards" value={fmtNum(stats.totalDashboards)} sub={`${stats.publishedDashboards} published, ${stats.draftDashboards} drafts`} color="#3b82f6" />
        <KpiCard label="Total Widgets" value={fmtNum(stats.totalWidgets)} sub={`${stats.avgWidgetsPerDashboard} per dashboard`} color="#8b5cf6" />
      </div>
      <div className="adm-overview-row">
        <div className="adm-card">
          <h4>Dashboards by Organization</h4>
          <div className="adm-top-list">
            {stats.dashboardsByOrg.map((o) => (
              <div key={o.orgId} className="adm-top-row">
                <span className="adm-top-name">{o.orgName}</span>
                <span className="adm-top-val">{o.count} dashboards</span>
              </div>
            ))}
          </div>
        </div>
        <div className="adm-card">
          <h4>Widget Type Distribution</h4>
          <div className="adm-dist-list">
            {dist.map((d) => (
              <div key={d.type} className="adm-dist-row">
                <span className="adm-dist-name">{d.type}</span>
                <div className="adm-dist-bar-wrap">
                  <div className="adm-dist-bar" style={{ width: `${d.percentage}%` }} />
                </div>
                <span className="adm-dist-val">{d.count} ({d.percentage}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="adm-card">
        <h4>Most Active Dashboards</h4>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Title</th><th>Views</th><th>Last Viewed</th></tr></thead>
            <tbody>
              {stats.mostActiveDashboards.map((d) => (
                <tr key={d.id}>
                  <td className="adm-td-name">{d.title}</td>
                  <td className="adm-td-num">{fmtNum(d.views)}</td>
                  <td className="adm-td-time">{fmtTime(d.lastViewedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="adm-card">
        <h4>Recent Activity</h4>
        <div className="adm-activity-list">
          {stats.recentActivity.map((a, i) => (
            <div key={i} className="adm-activity-row">
              <span className={`adm-badge adm-badge-${a.action}`}>{a.action}</span>
              <span className="adm-activity-title">{a.dashboardTitle}</span>
              <span className="adm-activity-user">{a.userName}</span>
              <span className="adm-activity-time">{fmtTime(a.timestamp)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
