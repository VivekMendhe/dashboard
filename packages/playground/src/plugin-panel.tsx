import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PluginRegistration, PluginStoreItem, PluginManifest } from '@dashboard-generator/core';
import { pluginManager, demoPlugins, getPluginStats } from './plugin-sdk';
import { timeAgo } from './utils';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export interface PluginPanelProps {}
type PlgTab = 'marketplace' | 'installed' | 'details' | 'developer';

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const STATUS_COLORS: Record<string, string> = { installed: '#6b7280', active: '#10b981', inactive: '#f59e0b', error: '#ef4444', loading: '#3b82f6' };
const CATEGORY_LABELS: Record<string, string> = { widget: 'Widget', datasource: 'Datasource', theme: 'Theme', integration: 'Integration', analytics: 'Analytics', utility: 'Utility', visualization: 'Visualization', productivity: 'Productivity' };
const stars = (rating: number): string => '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));

/* ================================================================== */
/*  PluginPanel                                                         */
/* ================================================================== */

export function PluginPanel() {
  const [activeTab, setActiveTab] = useState<PlgTab>('marketplace');
  const [search, setSearch] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginStoreItem | null>(null);
  const [selectedInstalled, setSelectedInstalled] = useState<PluginRegistration | null>(null);
  const [, forceUpdate] = useState(0);
  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  useEffect(() => { demoPlugins.forEach((p) => { if (!pluginManager.isInstalled(p.manifest.id)) { pluginManager.register(p); } }); }, []);

  const stats = useMemo(() => getPluginStats(), [activeTab]);
  const catalog = useMemo(() => search ? pluginManager.searchCatalog(search) : pluginManager.getCatalog(), [search, activeTab]);
  const installed = useMemo(() => pluginManager.getAllRegistrations(), [activeTab]);

  const handleInstall = useCallback((item: PluginStoreItem) => {
    const demo = demoPlugins.find((p) => p.manifest.id === item.manifest.id);
    if (demo && !pluginManager.isInstalled(item.manifest.id)) {
      pluginManager.register(demo);
      pluginManager.activate(item.manifest.id);
    }
    refresh();
  }, [refresh]);

  const handleToggle = useCallback(async (pluginId: string) => {
    if (pluginManager.isActive(pluginId)) await pluginManager.deactivate(pluginId);
    else await pluginManager.activate(pluginId);
    refresh();
  }, [refresh]);

  const handleUninstall = useCallback(async (pluginId: string) => {
    if (pluginManager.isActive(pluginId)) await pluginManager.deactivate(pluginId);
    pluginManager.unregister(pluginId);
    setSelectedInstalled(null);
    refresh();
  }, [refresh]);

  const tabs: { key: PlgTab; label: string; badge?: number }[] = [
    { key: 'marketplace', label: 'Marketplace' },
    { key: 'installed', label: 'Installed', badge: installed.length },
    { key: 'details', label: 'Details' },
    { key: 'developer', label: 'Developer' },
  ];

  return (
    <div className="plg-root">
      <div className="plg-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`plg-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}{t.badge !== undefined && t.badge > 0 && <span className="plg-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="plg-content">
        {activeTab === 'marketplace' && <MarketplaceTab catalog={catalog} search={search} onSearch={setSearch} onSelect={(item) => { setSelectedPlugin(item); setActiveTab('details'); }} onInstall={handleInstall} stats={stats} />}
        {activeTab === 'installed' && <InstalledTab installed={installed} onToggle={handleToggle} onUninstall={handleUninstall} onSelect={(reg) => { setSelectedInstalled(reg); setActiveTab('details'); }} />}
        {activeTab === 'details' && <DetailsTab item={selectedPlugin} registration={selectedInstalled} onInstall={handleInstall} onToggle={handleToggle} onUninstall={handleUninstall} />}
        {activeTab === 'developer' && <DeveloperTab stats={stats} />}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Marketplace Tab                                                     */
/* ================================================================== */

function MarketplaceTab({ catalog, search, onSearch, onSelect, onInstall, stats }: { catalog: PluginStoreItem[]; search: string; onSearch: (q: string) => void; onSelect: (item: PluginStoreItem) => void; onInstall: (item: PluginStoreItem) => void; stats: ReturnType<typeof getPluginStats> }) {
  const [catFilter, setCatFilter] = useState<string>('all');
  const filtered = useMemo(() => catFilter === 'all' ? catalog : catalog.filter((p) => p.manifest.categories.includes(catFilter as never)), [catalog, catFilter]);
  return (
    <div className="plg-marketplace">
      <div className="plg-stats-row">
        <div className="plg-stat"><span className="plg-stat-val">{stats.totalInstalled}</span><span className="plg-stat-lbl">Installed</span></div>
        <div className="plg-stat"><span className="plg-stat-val">{stats.activeCount}</span><span className="plg-stat-lbl">Active</span></div>
        <div className="plg-stat"><span className="plg-stat-val">{catalog.length}</span><span className="plg-stat-lbl">Available</span></div>
      </div>
      <input className="plg-search" placeholder="Search plugins..." value={search} onChange={(e) => onSearch(e.target.value)} />
      <div className="plg-cat-filter">
        {['all', 'widget', 'datasource', 'theme', 'integration', 'utility', 'analytics', 'visualization'].map((c) => (
          <button key={c} className={`plg-cat-btn ${catFilter === c ? 'active' : ''}`} onClick={() => setCatFilter(c)}>{c === 'all' ? 'All' : CATEGORY_LABELS[c] ?? c}</button>
        ))}
      </div>
      {filtered.length === 0 ? <div className="plg-empty">No plugins found</div> : (
        <div className="plg-grid">
          {filtered.map((item) => (
            <div key={item.manifest.id} className="plg-card" onClick={() => onSelect(item)}>
              <div className="plg-card-icon">{item.manifest.icon ?? item.manifest.name.charAt(0)}</div>
              <div className="plg-card-info">
                <span className="plg-card-name">{item.manifest.name}</span>
                <span className="plg-card-desc">{item.manifest.description}</span>
                <div className="plg-card-meta">
                  <span className="plg-card-author">{item.manifest.author}</span>
                  <span className="plg-card-version">v{item.manifest.version}</span>
                  <span className="plg-card-rating">{stars(item.rating)} {item.rating}</span>
                </div>
                <div className="plg-card-tags">{item.manifest.tags.slice(0, 3).map((t) => <span key={t} className="plg-tag">{t}</span>)}</div>
              </div>
              <button className="plg-install-btn" onClick={(e) => { e.stopPropagation(); onInstall(item); }}>Install</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Installed Tab                                                       */
/* ================================================================== */

function InstalledTab({ installed, onToggle, onUninstall, onSelect }: { installed: PluginRegistration[]; onToggle: (id: string) => void; onUninstall: (id: string) => void; onSelect: (reg: PluginRegistration) => void }) {
  return (
    <div className="plg-installed">
      {installed.length === 0 ? (
        <div className="plg-empty-state">
          <div className="plg-empty-icon">P</div>
          <h4>No plugins installed</h4>
          <p>Browse the marketplace to discover and install plugins.</p>
        </div>
      ) : (
        <div className="plg-list">
          {installed.map((reg) => (
            <div key={reg.manifest.id} className="plg-installed-card" onClick={() => onSelect(reg)}>
              <div className="plg-installed-icon">{reg.manifest.icon ?? reg.manifest.name.charAt(0)}</div>
              <div className="plg-installed-info">
                <span className="plg-installed-name">{reg.manifest.name}</span>
                <span className="plg-installed-meta">v{reg.manifest.version} · {reg.manifest.author}</span>
                <span className="plg-installed-desc">{reg.manifest.description}</span>
                {reg.error && <span className="plg-installed-error">{reg.error}</span>}
              </div>
              <div className="plg-installed-actions">
                <span className="plg-status-badge" style={{ color: STATUS_COLORS[reg.status] }}>{reg.status}</span>
                <label className="plg-toggle" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={reg.status === 'active'} onChange={() => onToggle(reg.manifest.id)} disabled={reg.status === 'loading'} />
                  <span className="plg-toggle-slider" />
                </label>
                <button className="plg-btn-xs plg-btn-danger" onClick={(e) => { e.stopPropagation(); onUninstall(reg.manifest.id); }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Details Tab                                                         */
/* ================================================================== */

function DetailsTab({ item, registration, onInstall, onToggle, onUninstall }: { item: PluginStoreItem | null; registration: PluginRegistration | null; onInstall: (item: PluginStoreItem) => void; onToggle: (id: string) => void; onUninstall: (id: string) => void }) {
  const manifest: PluginManifest | undefined = item?.manifest ?? registration?.manifest;
  if (!manifest) return <div className="plg-empty">Select a plugin to view details</div>;
  const isInstalled = pluginManager.isInstalled(manifest.id);
  const isActive = pluginManager.isActive(manifest.id);
  return (
    <div className="plg-details">
      <div className="plg-details-header">
        <div className="plg-details-icon">{manifest.icon ?? manifest.name.charAt(0)}</div>
        <div className="plg-details-title">
          <h3>{manifest.name}</h3>
          <span className="plg-details-author">{manifest.author} · v{manifest.version}</span>
        </div>
        <div className="plg-details-actions">
          {!isInstalled ? (
            <button className="plg-btn-sm plg-btn-primary" onClick={() => item && onInstall(item)}>Install</button>
          ) : (
            <>
              <label className="plg-toggle"><input type="checkbox" checked={isActive} onChange={() => onToggle(manifest.id)} /><span className="plg-toggle-slider" /></label>
              <button className="plg-btn-sm plg-btn-danger" onClick={() => onUninstall(manifest.id)}>Uninstall</button>
            </>
          )}
        </div>
      </div>
      {item && (
        <div className="plg-details-stats">
          <span>{stars(item.rating)} {item.rating}</span>
          <span>{item.installs.toLocaleString()} installs</span>
          {item.featured && <span className="plg-badge plg-badge-blue">Featured</span>}
        </div>
      )}
      <p className="plg-details-desc">{manifest.description}</p>
      <div className="plg-details-section">
        <h5>Categories</h5>
        <div className="plg-details-tags">{manifest.categories.map((c) => <span key={c} className="plg-tag">{CATEGORY_LABELS[c] ?? c}</span>)}</div>
      </div>
      <div className="plg-details-section">
        <h5>Tags</h5>
        <div className="plg-details-tags">{manifest.tags.map((t) => <span key={t} className="plg-tag">{t}</span>)}</div>
      </div>
      <div className="plg-details-section">
        <h5>Permissions Required</h5>
        <div className="plg-details-tags">{manifest.permissions.map((p) => <span key={p} className="plg-tag plg-tag-perm">{p}</span>)}</div>
      </div>
      {manifest.dependencies.length > 0 && (
        <div className="plg-details-section">
          <h5>Dependencies</h5>
          {manifest.dependencies.map((d) => <div key={d.id} className="plg-dep"><span>{d.id}</span><span>v{d.version}{d.optional ? ' (optional)' : ''}</span></div>)}
        </div>
      )}
      {registration && (
        <div className="plg-details-section">
          <h5>Installation Info</h5>
          <div className="plg-details-info">
            <div className="plg-info-row"><span>Status</span><span className="plg-status-badge" style={{ color: STATUS_COLORS[registration.status] }}>{registration.status}</span></div>
            <div className="plg-info-row"><span>Installed</span><span>{timeAgo(registration.installedAt)}</span></div>
            {registration.activatedAt && <div className="plg-info-row"><span>Activated</span><span>{timeAgo(registration.activatedAt)}</span></div>}
            {registration.error && <div className="plg-info-row"><span>Error</span><span className="plg-error-text">{registration.error}</span></div>}
          </div>
        </div>
      )}
      {manifest.screenshots && manifest.screenshots.length > 0 && (
        <div className="plg-details-section">
          <h5>Screenshots</h5>
          <div className="plg-screenshots">{manifest.screenshots.map((s, i) => <img key={i} src={s} alt={`Screenshot ${i + 1}`} className="plg-screenshot" />)}</div>
        </div>
      )}
      {manifest.changelog && (
        <div className="plg-details-section">
          <h5>Changelog</h5>
          <div className="plg-changelog">{manifest.changelog}</div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Developer Tab                                                       */
/* ================================================================== */

function DeveloperTab({ stats }: { stats: ReturnType<typeof getPluginStats> }) {
  const [showManifest, setShowManifest] = useState(false);
  const sampleManifest: PluginManifest = {
    id: 'my-custom-plugin', name: 'My Custom Plugin', version: '1.0.0',
    description: 'A custom plugin example', author: 'Your Name',
    minPlatformVersion: '1.0.0', permissions: ['widgets', 'themes'],
    dependencies: [], tags: ['custom'], categories: ['widget'],
    createdAt: new Date().toISOString(),
  };
  const sampleCode = `import type { Plugin, PluginAPI } from '@dashboard-generator/core';

export const myPlugin: Plugin = {
  manifest: ${JSON.stringify(sampleManifest, null, 2).replace(/"/g, "'")},

  async activate(api: PluginAPI) {
    // Register a custom widget
    api.registerWidget({
      type: 'my-widget',
      name: 'My Widget',
      renderer: ({ data, theme }) => {
        return <div style={{ color: theme.primary }}>Hello!</div>;
      },
    });

    // Register a custom theme
    api.registerTheme('my-theme', {
      primary: '#ff6b6b',
      background: '#1a1a2e',
      surface: '#16213e',
      // ... other tokens
    });

    // Listen to events
    api.on('dashboard:loaded', (config) => {
      api.getLogger().info('Dashboard loaded!', config);
    });

    // Use scoped storage
    api.getStorage().set('lastRun', Date.now());
  },

  async deactivate() {
    // Cleanup resources
  },
};`;
  return (
    <div className="plg-developer">
      <div className="plg-dev-stats">
        <div className="plg-stat"><span className="plg-stat-val">{stats.activeCount}</span><span className="plg-stat-lbl">Active Plugins</span></div>
        <div className="plg-stat"><span className="plg-stat-val">{stats.themeCount}</span><span className="plg-stat-lbl">Custom Themes</span></div>
        <div className="plg-stat"><span className="plg-stat-val">{stats.editorCount}</span><span className="plg-stat-lbl">Property Editors</span></div>
        <div className="plg-stat"><span className="plg-stat-val">{stats.tabCount}</span><span className="plg-stat-lbl">Inspector Tabs</span></div>
      </div>
      <div className="plg-dev-section">
        <div className="plg-section-header">
          <h4>Plugin Manifest Schema</h4>
          <button className="plg-btn-xs" onClick={() => setShowManifest(!showManifest)}>{showManifest ? 'Hide' : 'Show'}</button>
        </div>
        {showManifest && <pre className="plg-code">{JSON.stringify(sampleManifest, null, 2)}</pre>}
      </div>
      <div className="plg-dev-section">
        <h4>Quick Start</h4>
        <pre className="plg-code">{sampleCode}</pre>
      </div>
      <div className="plg-dev-section">
        <h4>API Reference</h4>
        <div className="plg-api-list">
          <div className="plg-api-item"><code>registerWidget(def)</code><span>Register a custom widget renderer</span></div>
          <div className="plg-api-item"><code>registerWidgets(defs)</code><span>Bulk register multiple widgets</span></div>
          <div className="plg-api-item"><code>registerDatasource(kind, ds)</code><span>Register a custom data source adapter</span></div>
          <div className="plg-api-item"><code>registerTheme(id, tokens)</code><span>Register a custom theme</span></div>
          <div className="plg-api-item"><code>registerPropertyEditor(def)</code><span>Register a custom property editor</span></div>
          <div className="plg-api-item"><code>registerInspectorTab(tab)</code><span>Add a custom inspector tab</span></div>
          <div className="plg-api-item"><code>on(event, handler)</code><span>Subscribe to plugin events</span></div>
          <div className="plg-api-item"><code>emit(event, ...data)</code><span>Emit a custom event</span></div>
          <div className="plg-api-item"><code>getStorage()</code><span>Get scoped key-value storage</span></div>
          <div className="plg-api-item"><code>getLogger()</code><span>Get a scoped console logger</span></div>
          <div className="plg-api-item"><code>hasPermission(p)</code><span>Check if plugin has a permission</span></div>
        </div>
      </div>
      <div className="plg-dev-section">
        <h4>Permission Types</h4>
        <div className="plg-api-list">
          <div className="plg-api-item"><code>widgets</code><span>Register custom widget types</span></div>
          <div className="plg-api-item"><code>datasources</code><span>Register data source adapters</span></div>
          <div className="plg-api-item"><code>themes</code><span>Register custom themes</span></div>
          <div className="plg-api-item"><code>editors</code><span>Register property editors</span></div>
          <div className="plg-api-item"><code>inspector</code><span>Add inspector tabs</span></div>
          <div className="plg-api-item"><code>store</code><span>Access the plugin store</span></div>
          <div className="plg-api-item"><code>events</code><span>Subscribe to platform events</span></div>
          <div className="plg-api-item"><code>ui</code><span>Render custom UI components</span></div>
          <div className="plg-api-item"><code>network</code><span>Make external network requests</span></div>
        </div>
      </div>
    </div>
  );
}
