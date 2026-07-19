import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WhiteLabelConfig, BrandColors, BrandTypography, LogoConfig, CompanyBranding, DomainConfig, WorkspaceBranding, LicenseConfig, BrandPreset, LicenseType } from '@dashboard-generator/core';
import { brandingManager } from './branding-manager';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export interface BrandingPanelProps { orgId?: string; workspaceId?: string; onThemeApplied?: () => void; }
type BrandTab = 'overview' | 'logo' | 'colors' | 'typography' | 'css' | 'domain' | 'workspaces' | 'license';

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const FONT_OPTIONS = [
  'Inter, ui-sans-serif, system-ui, sans-serif',
  'Roboto, sans-serif',
  'Open Sans, sans-serif',
  'Lato, sans-serif',
  'Poppins, sans-serif',
  'Montserrat, sans-serif',
  'Source Sans Pro, sans-serif',
  'Nunito, sans-serif',
  'Playfair Display, serif',
  'Merriweather, serif',
  'Georgia, serif',
  'Fira Code, monospace',
  'JetBrains Mono, monospace',
  'Source Code Pro, monospace',
];
const COLOR_FIELDS: { key: keyof BrandColors; label: string }[] = [
  { key: 'primary', label: 'Primary' }, { key: 'secondary', label: 'Secondary' }, { key: 'accent', label: 'Accent' },
  { key: 'background', label: 'Background' }, { key: 'surface', label: 'Surface' }, { key: 'text', label: 'Text' },
  { key: 'mutedText', label: 'Muted Text' }, { key: 'border', label: 'Border' },
  { key: 'success', label: 'Success' }, { key: 'warning', label: 'Warning' }, { key: 'error', label: 'Error' }, { key: 'info', label: 'Info' },
];
const LICENSE_TYPES: { value: LicenseType; label: string; desc: string }[] = [
  { value: 'community', label: 'Community', desc: 'Free tier with basic features' },
  { value: 'professional', label: 'Professional', desc: 'For growing teams' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Full feature set' },
  { value: 'ultimate', label: 'Ultimate', desc: 'Unlimited everything' },
];

/* ================================================================== */
/*  BrandingPanel                                                       */
/* ================================================================== */

export function BrandingPanel({ onThemeApplied }: BrandingPanelProps) {
  const [activeTab, setActiveTab] = useState<BrandTab>('overview');
  const [, forceUpdate] = useState(0);
  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  useEffect(() => { brandingManager.seedDemoData(); }, []);

  const stats = useMemo(() => brandingManager.getBrandingStats(), [activeTab]);
  const wl = useMemo(() => brandingManager.getWhiteLabel(), [activeTab]);
  const license = useMemo(() => brandingManager.getLicense(), [activeTab]);
  const presets = useMemo(() => brandingManager.listPresets(), [activeTab]);

  const handleToggle = useCallback((enabled: boolean) => {
    brandingManager.updateWhiteLabel({ enabled });
    if (enabled) brandingManager.applyTheme(false);
    else brandingManager.resetTheme();
    onThemeApplied?.();
    refresh();
  }, [onThemeApplied, refresh]);

  const tabs: { key: BrandTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'logo', label: 'Logo & Brand' },
    { key: 'colors', label: 'Colors' },
    { key: 'typography', label: 'Typography' },
    { key: 'css', label: 'Custom CSS' },
    { key: 'domain', label: 'Domain' },
    { key: 'workspaces', label: 'Workspaces' },
    { key: 'license', label: 'License' },
  ];

  return (
    <div className="br-root">
      <div className="br-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`br-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <div className="br-content">
        {activeTab === 'overview' && <OverviewTab stats={stats} wl={wl} license={license} onToggle={handleToggle} />}
        {activeTab === 'logo' && <LogoTab wl={wl} onRefresh={() => { refresh(); onThemeApplied?.(); }} />}
        {activeTab === 'colors' && <ColorsTab wl={wl} presets={presets} onRefresh={() => { refresh(); onThemeApplied?.(); }} />}
        {activeTab === 'typography' && <TypographyTab wl={wl} onRefresh={() => { refresh(); onThemeApplied?.(); }} />}
        {activeTab === 'css' && <CssTab wl={wl} onRefresh={() => { refresh(); onThemeApplied?.(); }} />}
        {activeTab === 'domain' && <DomainTab wl={wl} onRefresh={refresh} />}
        {activeTab === 'workspaces' && <WorkspacesTab onRefresh={refresh} />}
        {activeTab === 'license' && <LicenseTab license={license} onRefresh={refresh} />}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Overview Tab                                                        */
/* ================================================================== */

function OverviewTab({ stats, wl, license, onToggle }: { stats: ReturnType<typeof brandingManager.getBrandingStats>; wl: WhiteLabelConfig; license: LicenseConfig; onToggle: (enabled: boolean) => void }) {
  return (
    <div className="br-overview">
      <div className="br-overview-row">
        <div className="br-stat-card">
          <span className="br-stat-label">White Label</span>
          <span className={`br-stat-badge ${wl.enabled ? 'ok' : ''}`}>{wl.enabled ? 'Active' : 'Off'}</span>
        </div>
        <div className="br-stat-card">
          <span className="br-stat-label">License</span>
          <span className="br-stat-value">{license.type}</span>
        </div>
        <div className="br-stat-card">
          <span className="br-stat-label">Features</span>
          <span className="br-stat-value">{stats.featureCount}</span>
        </div>
        <div className="br-stat-card">
          <span className="br-stat-label">Presets</span>
          <span className="br-stat-value">{stats.presetsCount}</span>
        </div>
      </div>
      <div className="br-toggle-row">
        <span>Enable White Label</span>
        <label className="br-toggle"><input type="checkbox" checked={wl.enabled} onChange={(e) => onToggle(e.target.checked)} /><span className="br-toggle-slider" /></label>
      </div>
      {wl.enabled && (
        <div className="br-overview-details">
          <div className="br-detail"><span>Company</span><span>{wl.company.name}</span></div>
          <div className="br-detail"><span>Logo</span><span>{wl.logo.url ? 'Custom' : 'Default'}</span></div>
          <div className="br-detail"><span>Primary Color</span><span className="br-color-swatch" style={{ background: wl.colors.primary }} /></div>
          <div className="br-detail"><span>Font</span><span style={{ fontFamily: wl.typography.fontFamily }}>{wl.typography.fontFamily.split(',')[0]}</span></div>
          <div className="br-detail"><span>Custom CSS</span><span>{stats.customCssLength > 0 ? `${stats.customCssLength} chars` : 'None'}</span></div>
          <div className="br-detail"><span>Custom Domain</span><span>{wl.domain.customDomain || 'None'}</span></div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Logo Tab                                                            */
/* ================================================================== */

function LogoTab({ wl, onRefresh }: { wl: WhiteLabelConfig; onRefresh: () => void }) {
  const [companyName, setCompanyName] = useState(wl.company.name);
  const [tagline, setTagline] = useState(wl.company.tagline ?? '');
  const [supportEmail, setSupportEmail] = useState(wl.company.supportEmail ?? '');
  const [logoUrl, setLogoUrl] = useState(wl.logo.url ?? '');
  const [logoAlt, setLogoAlt] = useState(wl.logo.alt);
  const [logoWidth, setLogoWidth] = useState(String(wl.logo.width));
  const [logoHeight, setLogoHeight] = useState(String(wl.logo.height));
  const [favicon, setFavicon] = useState(wl.logo.favicon ?? '');
  const handleSaveCompany = useCallback(() => {
    brandingManager.updateCompany({ name: companyName, tagline, supportEmail: supportEmail || undefined });
    onRefresh();
  }, [companyName, tagline, supportEmail, onRefresh]);
  const handleSaveLogo = useCallback(() => {
    brandingManager.updateLogo({ url: logoUrl || undefined, alt: logoAlt, width: Number(logoWidth) || 120, height: Number(logoHeight) || 32, favicon: favicon || undefined });
    onRefresh();
  }, [logoUrl, logoAlt, logoWidth, logoHeight, favicon, onRefresh]);
  return (
    <div className="br-section">
      <h4>Company Information</h4>
      <div className="br-form-grid">
        <div className="br-field"><label>Company Name</label><input className="br-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
        <div className="br-field"><label>Tagline</label><input className="br-input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Build beautiful dashboards" /></div>
        <div className="br-field"><label>Support Email</label><input className="br-input" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@company.com" /></div>
        <button className="br-btn-sm br-btn-primary" onClick={handleSaveCompany}>Save Company</button>
      </div>
      <h4>Logo</h4>
      <div className="br-logo-preview">
        {wl.logo.url ? <img src={wl.logo.url} alt={wl.logo.alt} style={{ maxHeight: wl.logo.height, maxWidth: wl.logo.width }} /> : <span className="br-logo-placeholder">{companyName || 'Logo'}</span>}
      </div>
      <div className="br-form-grid">
        <div className="br-field"><label>Logo URL</label><input className="br-input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" /></div>
        <div className="br-field"><label>Alt Text</label><input className="br-input" value={logoAlt} onChange={(e) => setLogoAlt(e.target.value)} /></div>
        <div className="br-field"><label>Width (px)</label><input className="br-input" type="number" value={logoWidth} onChange={(e) => setLogoWidth(e.target.value)} /></div>
        <div className="br-field"><label>Height (px)</label><input className="br-input" type="number" value={logoHeight} onChange={(e) => setLogoHeight(e.target.value)} /></div>
        <div className="br-field"><label>Favicon URL</label><input className="br-input" value={favicon} onChange={(e) => setFavicon(e.target.value)} placeholder="https://example.com/favicon.ico" /></div>
        <button className="br-btn-sm br-btn-primary" onClick={handleSaveLogo}>Save Logo</button>
      </div>
      <h4>Display Options</h4>
      <div className="br-toggles">
        <label className="br-check"><input type="checkbox" checked={wl.logo.showInToolbar} onChange={(e) => { brandingManager.updateLogo({ showInToolbar: e.target.checked }); onRefresh(); }} /><span>Show in Toolbar</span></label>
        <label className="br-check"><input type="checkbox" checked={wl.logo.showOnLogin} onChange={(e) => { brandingManager.updateLogo({ showOnLogin: e.target.checked }); onRefresh(); }} /><span>Show on Login</span></label>
        <label className="br-check"><input type="checkbox" checked={wl.logo.showOnExport} onChange={(e) => { brandingManager.updateLogo({ showOnExport: e.target.checked }); onRefresh(); }} /><span>Show on Export</span></label>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Colors Tab                                                          */
/* ================================================================== */

function ColorsTab({ wl, presets, onRefresh }: { wl: WhiteLabelConfig; presets: BrandPreset[]; onRefresh: () => void }) {
  const [colors, setColors] = useState<BrandColors>({ ...wl.colors });
  const handleColor = useCallback((key: keyof BrandColors, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  }, []);
  const handleSave = useCallback(() => {
    brandingManager.updateColors(colors);
    brandingManager.applyTheme(false);
    onRefresh();
  }, [colors, onRefresh]);
  const handlePreset = useCallback((presetId: string) => {
    const result = brandingManager.applyPreset(presetId);
    if (result) { setColors({ ...result.colors }); brandingManager.applyTheme(false); onRefresh(); }
  }, [onRefresh]);
  return (
    <div className="br-section">
      <h4>Color Palette</h4>
      <div className="br-color-grid">
        {COLOR_FIELDS.map((f) => (
          <div key={f.key} className="br-color-field">
            <label>{f.label}</label>
            <div className="br-color-input-row">
              <input type="color" className="br-color-picker" value={colors[f.key]} onChange={(e) => handleColor(f.key, e.target.value)} />
              <input className="br-input" value={colors[f.key]} onChange={(e) => handleColor(f.key, e.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <button className="br-btn-sm br-btn-primary" onClick={handleSave}>Apply Colors</button>
      <h4>Brand Presets</h4>
      <div className="br-presets-grid">
        {presets.map((p) => (
          <button key={p.id} className="br-preset-card" onClick={() => handlePreset(p.id)}>
            <div className="br-preset-colors">
              <span style={{ background: p.colors.primary }} /><span style={{ background: p.colors.secondary }} /><span style={{ background: p.colors.accent }} />
            </div>
            <span className="br-preset-name">{p.name}</span>
            <span className="br-preset-desc">{p.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Typography Tab                                                      */
/* ================================================================== */

function TypographyTab({ wl, onRefresh }: { wl: WhiteLabelConfig; onRefresh: () => void }) {
  const [fontFamily, setFontFamily] = useState(wl.typography.fontFamily);
  const [fontUrl, setFontUrl] = useState(wl.typography.fontUrl ?? '');
  const [headingFont, setHeadingFont] = useState(wl.typography.headingFont ?? '');
  const [monoFont, setMonoFont] = useState(wl.typography.monospaceFont ?? '');
  const [baseSize, setBaseSize] = useState(String(wl.typography.baseFontSize));
  const [lineHeight, setLineHeight] = useState(String(wl.typography.lineHeight));
  const handleSave = useCallback(() => {
    brandingManager.updateTypography({
      fontFamily, fontUrl: fontUrl || undefined, headingFont: headingFont || undefined,
      monospaceFont: monoFont || undefined, baseFontSize: Number(baseSize) || 14, lineHeight: Number(lineHeight) || 1.5,
    });
    brandingManager.applyTheme(false);
    onRefresh();
  }, [fontFamily, fontUrl, headingFont, monoFont, baseSize, lineHeight, onRefresh]);
  return (
    <div className="br-section">
      <h4>Font Settings</h4>
      <div className="br-form-grid">
        <div className="br-field">
          <label>Base Font Family</label>
          <select className="br-select" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
          </select>
        </div>
        <div className="br-field"><label>Custom Font URL</label><input className="br-input" value={fontUrl} onChange={(e) => setFontUrl(e.target.value)} placeholder="https://fonts.googleapis.com/css2?family=..." /></div>
        <div className="br-field">
          <label>Heading Font</label>
          <select className="br-select" value={headingFont} onChange={(e) => setHeadingFont(e.target.value)}>
            <option value="">Same as base</option>
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
          </select>
        </div>
        <div className="br-field">
          <label>Monospace Font</label>
          <select className="br-select" value={monoFont} onChange={(e) => setMonoFont(e.target.value)}>
            {FONT_OPTIONS.filter((f) => f.includes('mono') || f.includes('Code')).map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
          </select>
        </div>
        <div className="br-field"><label>Base Font Size (px)</label><input className="br-input" type="number" value={baseSize} onChange={(e) => setBaseSize(e.target.value)} min="10" max="24" /></div>
        <div className="br-field"><label>Line Height</label><input className="br-input" type="number" value={lineHeight} onChange={(e) => setLineHeight(e.target.value)} min="1" max="2.5" step="0.1" /></div>
      </div>
      <div className="br-typo-preview" style={{ fontFamily, fontSize: `${baseSize}px`, lineHeight }}>
        <p>The quick brown fox jumps over the lazy dog</p>
        <h5 style={{ fontFamily: headingFont || fontFamily }}>Heading Preview (H5)</h5>
        <code style={{ fontFamily: monoFont || 'monospace' }}>const x = 42;</code>
      </div>
      <button className="br-btn-sm br-btn-primary" onClick={handleSave}>Apply Typography</button>
    </div>
  );
}

/* ================================================================== */
/*  Custom CSS Tab                                                      */
/* ================================================================== */

function CssTab({ wl, onRefresh }: { wl: WhiteLabelConfig; onRefresh: () => void }) {
  const [css, setCss] = useState(wl.customCss);
  const [saved, setSaved] = useState(false);
  const handleSave = useCallback(() => {
    brandingManager.setCustomCss(css);
    brandingManager.applyTheme(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  }, [css, onRefresh]);
  return (
    <div className="br-section">
      <h4>Custom CSS</h4>
      <p className="br-hint">Add custom CSS to override any part of the UI. Use CSS variables like <code>var(--pg-primary)</code> for brand colors.</p>
      <textarea className="br-code-editor" value={css} onChange={(e) => setCss(e.target.value)} spellCheck={false} placeholder="/* Your custom CSS here */&#10;.pg-toolbar { background: var(--pg-primary); }" />
      <div className="br-form-row">
        <button className="br-btn-sm br-btn-primary" onClick={handleSave}>{saved ? 'Saved!' : 'Save & Apply'}</button>
        <button className="br-btn-sm" onClick={() => { setCss(''); brandingManager.setCustomCss(''); brandingManager.applyTheme(false); onRefresh(); }}>Clear</button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Domain Tab                                                          */
/* ================================================================== */

function DomainTab({ wl, onRefresh }: { wl: WhiteLabelConfig; onRefresh: () => void }) {
  const [customDomain, setCustomDomain] = useState(wl.domain.customDomain ?? '');
  const [subdomain, setSubdomain] = useState(wl.domain.subdomain ?? '');
  const [ssl, setSsl] = useState(wl.domain.sslEnabled);
  const [redirect, setRedirect] = useState(wl.domain.redirectFrom ?? '');
  const handleSave = useCallback(() => {
    brandingManager.updateDomain({ customDomain: customDomain || undefined, subdomain: subdomain || undefined, sslEnabled: ssl, redirectFrom: redirect || undefined });
    onRefresh();
  }, [customDomain, subdomain, ssl, redirect, onRefresh]);
  return (
    <div className="br-section">
      <h4>Domain Configuration</h4>
      <div className="br-form-grid">
        <div className="br-field"><label>Custom Domain</label><input className="br-input" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="dashboards.company.com" /></div>
        <div className="br-field"><label>Subdomain</label><input className="br-input" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="acme" /><span className="br-field-hint">.dashboardstudio.com</span></div>
        <div className="br-field"><label>Redirect From</label><input className="br-input" value={redirect} onChange={(e) => setRedirect(e.target.value)} placeholder="old-domain.com" /></div>
        <label className="br-check"><input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} /><span>SSL Enabled</span></label>
      </div>
      <button className="br-btn-sm br-btn-primary" onClick={handleSave}>Save Domain</button>
      {customDomain && (
        <div className="br-domain-info">
          <h5>DNS Configuration</h5>
          <p>Add a CNAME record pointing <code>{customDomain}</code> to <code>app.dashboardstudio.com</code></p>
          <div className="br-detail"><span>Status</span><span className="br-status-waiting">Awaiting DNS verification</span></div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Workspace Branding Tab                                              */
/* ================================================================== */

function WorkspacesTab({ onRefresh }: { onRefresh: () => void }) {
  const wl = brandingManager.getWhiteLabel();
  const [creating, setCreating] = useState(false);
  const [wsId, setWsId] = useState('');
  const [wsName, setWsName] = useState('');
  const [wsPrimary, setWsPrimary] = useState(wl.colors.primary);
  const allWb = useMemo(() => {
    const config = JSON.parse(localStorage.getItem('dg:branding:v1') ?? '{}');
    return (config.workspaceBranding ?? []) as WorkspaceBranding[];
  }, [onRefresh]);
  const handleCreate = useCallback(() => {
    if (!wsId.trim()) return;
    brandingManager.setWorkspaceBranding(wsId.trim(), { company: { name: wsName || wsId }, colors: { ...brandingManager.DEFAULT_COLORS, primary: wsPrimary } }, false);
    setWsId(''); setWsName(''); setCreating(false);
    onRefresh();
  }, [wsId, wsName, wsPrimary, onRefresh]);
  return (
    <div className="br-section">
      <h4>Workspace Branding</h4>
      <p className="br-hint">Override branding per workspace. Workspaces without custom branding inherit from the organization.</p>
      <button className="br-btn-sm br-btn-primary" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ Add Branding'}</button>
      {creating && (
        <div className="br-form-grid">
          <div className="br-field"><label>Workspace ID</label><input className="br-input" value={wsId} onChange={(e) => setWsId(e.target.value)} placeholder="ws-engineering" /></div>
          <div className="br-field"><label>Display Name</label><input className="br-input" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Engineering" /></div>
          <div className="br-field"><label>Primary Color</label><div className="br-color-input-row"><input type="color" className="br-color-picker" value={wsPrimary} onChange={(e) => setWsPrimary(e.target.value)} /><input className="br-input" value={wsPrimary} onChange={(e) => setWsPrimary(e.target.value)} /></div></div>
          <button className="br-btn-sm br-btn-primary" onClick={handleCreate}>Add</button>
        </div>
      )}
      {allWb.length === 0 ? <div className="br-empty">No workspace brandings configured</div> : (
        <div className="br-ws-list">
          {allWb.map((wb) => (
            <div key={wb.workspaceId} className="br-ws-card">
              <div className="br-ws-header">
                <span className="br-ws-color" style={{ background: wb.branding.colors?.primary ?? wl.colors.primary }} />
                <span className="br-ws-name">{wb.branding.company?.name ?? wb.workspaceId}</span>
                <span className="br-ws-id">{wb.workspaceId}</span>
                {wb.inheritOrgBranding && <span className="br-badge">Inherits Org</span>}
              </div>
              <div className="br-ws-actions">
                <button className="br-btn-xs" onClick={() => { brandingManager.deleteWorkspaceBranding(wb.workspaceId); onRefresh(); }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  License Tab                                                         */
/* ================================================================== */

function LicenseTab({ license, onRefresh }: { license: LicenseConfig; onRefresh: () => void }) {
  const [key, setKey] = useState(license.key);
  const [type, setType] = useState<LicenseType>(license.type);
  const handleActivate = useCallback(() => {
    brandingManager.activateLicense(key, type);
    onRefresh();
  }, [key, type, onRefresh]);
  const lic = brandingManager.getLicense();
  const limits = brandingManager.getLicenseLimits();
  const allFeatures: string[] = ['white_label', 'sso', 'audit_log', 'api_access', 'priority_support', 'custom_domain', 'advanced_security', 'collaboration', 'export', 'embedding', 'custom_themes', 'workspace_branding'];
  return (
    <div className="br-section">
      <h4>License</h4>
      <div className="br-license-status">
        <span className={`br-badge ${lic.status === 'active' ? 'br-badge-green' : 'br-badge-red'}`}>{lic.status}</span>
        <span className="br-license-type">{lic.type}</span>
      </div>
      <div className="br-form-grid">
        <div className="br-field"><label>License Key</label><input className="br-input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="DASH-XXXXXXXXXXXX" /></div>
        <div className="br-field">
          <label>Tier</label>
          <select className="br-select" value={type} onChange={(e) => setType(e.target.value as LicenseType)}>
            {LICENSE_TYPES.map((lt) => <option key={lt.value} value={lt.value}>{lt.label} — {lt.desc}</option>)}
          </select>
        </div>
        <button className="br-btn-sm br-btn-primary" onClick={handleActivate}>Activate</button>
      </div>
      <h4>Limits</h4>
      <div className="br-limits-grid">
        <div className="br-limit"><span>Max Users</span><span>{limits.maxUsers.toLocaleString()}</span></div>
        <div className="br-limit"><span>Max Dashboards</span><span>{limits.maxDashboards.toLocaleString()}</span></div>
        <div className="br-limit"><span>Max Workspaces</span><span>{limits.maxWorkspaces.toLocaleString()}</span></div>
        <div className="br-limit"><span>Max API Keys</span><span>{limits.maxApiKeys.toLocaleString()}</span></div>
      </div>
      <h4>Features</h4>
      <div className="br-features-grid">
        {allFeatures.map((f) => {
          const has = lic.features.includes(f as never);
          return (
            <div key={f} className={`br-feature-item ${has ? 'active' : ''}`}>
              <span className="br-feature-dot" />
              <span>{f.replace(/_/g, ' ')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
