import type { WhiteLabelConfig, BrandColors, BrandTypography, LogoConfig, DomainConfig, CompanyBranding, WorkspaceBranding, LicenseConfig, LicenseType, LicenseFeature, BrandPreset, BrandingConfig } from '@dashboard-generator/core';
import { uid, now, readJson, writeJson } from './utils';

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const STORAGE_KEY = 'dg:branding:v1';

const DEFAULT_COLORS: BrandColors = {
  primary: '#2563eb', secondary: '#7c3aed', accent: '#0ea5e9',
  background: '#f8fafc', surface: '#ffffff', text: '#0f172a', mutedText: '#64748b',
  border: '#e2e8f0', success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6',
};
const DEFAULT_DARK_COLORS: BrandColors = {
  primary: '#3b82f6', secondary: '#8b5cf6', accent: '#38bdf8',
  background: '#0f172a', surface: '#1e293b', text: '#f8fafc', mutedText: '#94a3b8',
  border: '#334155', success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#60a5fa',
};
const DEFAULT_TYPOGRAPHY: BrandTypography = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontUrl: '',
  headingFont: '',
  monospaceFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  baseFontSize: 14,
  lineHeight: 1.5,
};
const DEFAULT_LOGO: LogoConfig = {
  alt: 'Dashboard Studio', width: 120, height: 32,
  showInToolbar: true, showOnLogin: true, showOnExport: true,
};
const DEFAULT_COMPANY: CompanyBranding = { name: 'Dashboard Studio', tagline: 'Build beautiful dashboards' };
const DEFAULT_DOMAIN: DomainConfig = { sslEnabled: true };

const LICENSE_FEATURES: Record<LicenseType, LicenseFeature[]> = {
  community: ['export'],
  professional: ['export', 'collaboration', 'embedding', 'api_access', 'custom_themes'],
  enterprise: ['export', 'collaboration', 'embedding', 'api_access', 'custom_themes', 'white_label', 'sso', 'audit_log', 'custom_domain', 'advanced_security', 'workspace_branding', 'priority_support'],
  ultimate: ['export', 'collaboration', 'embedding', 'api_access', 'custom_themes', 'white_label', 'sso', 'audit_log', 'custom_domain', 'advanced_security', 'workspace_branding', 'priority_support'],
};
const LICENSE_LIMITS: Record<LicenseType, { maxUsers: number; maxDashboards: number; maxWorkspaces: number; maxApiKeys: number }> = {
  community: { maxUsers: 3, maxDashboards: 5, maxWorkspaces: 1, maxApiKeys: 2 },
  professional: { maxUsers: 25, maxDashboards: 50, maxWorkspaces: 5, maxApiKeys: 10 },
  enterprise: { maxUsers: 500, maxDashboards: 9999, maxWorkspaces: 100, maxApiKeys: 50 },
  ultimate: { maxUsers: 999999, maxDashboards: 999999, maxWorkspaces: 999999, maxApiKeys: 999999 },
};

const BRAND_PRESETS: BrandPreset[] = [
  { id: 'preset-ocean', name: 'Ocean', description: 'Cool blues and teals', colors: { ...DEFAULT_COLORS, primary: '#0284c7', secondary: '#0891b2', accent: '#06b6d4' }, typography: { ...DEFAULT_TYPOGRAPHY }, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'preset-forest', name: 'Forest', description: 'Natural greens', colors: { ...DEFAULT_COLORS, primary: '#16a34a', secondary: '#15803d', accent: '#22c55e' }, typography: { ...DEFAULT_TYPOGRAPHY }, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'preset-sunset', name: 'Sunset', description: 'Warm oranges and reds', colors: { ...DEFAULT_COLORS, primary: '#ea580c', secondary: '#dc2626', accent: '#f97316' }, typography: { ...DEFAULT_TYPOGRAPHY }, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'preset-midnight', name: 'Midnight', description: 'Dark purples', colors: { ...DEFAULT_COLORS, primary: '#7c3aed', secondary: '#6d28d9', accent: '#a78bfa', background: '#1e1b4b', surface: '#272554', text: '#e0e7ff', mutedText: '#a5b4fc', border: '#3730a3' }, typography: { ...DEFAULT_TYPOGRAPHY }, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'preset-corporate', name: 'Corporate', description: 'Professional grays', colors: { ...DEFAULT_COLORS, primary: '#1e293b', secondary: '#475569', accent: '#64748b' }, typography: { ...DEFAULT_TYPOGRAPHY }, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'preset-rose', name: 'Rose', description: 'Elegant pinks', colors: { ...DEFAULT_COLORS, primary: '#e11d48', secondary: '#be123c', accent: '#fb7185' }, typography: { ...DEFAULT_TYPOGRAPHY }, createdAt: '2025-01-01T00:00:00Z' },
];

/* ================================================================== */
/*  Storage                                                             */
/* ================================================================== */

function loadConfig(): BrandingConfig {
  const defaults: BrandingConfig = {
    whiteLabel: {
      enabled: false, company: { ...DEFAULT_COMPANY }, colors: { ...DEFAULT_COLORS },
      typography: { ...DEFAULT_TYPOGRAPHY }, logo: { ...DEFAULT_LOGO },
      domain: { ...DEFAULT_DOMAIN }, customCss: '', createdAt: now(), updatedAt: now(),
    },
    workspaceBranding: [], license: createDefaultLicense(), presets: [...BRAND_PRESETS],
  };
  return readJson(STORAGE_KEY, defaults);
}
function saveConfig(config: BrandingConfig): void { writeJson(STORAGE_KEY, config); }
function createDefaultLicense(): LicenseConfig {
  return {
    id: `lic-${uid()}`, key: `DASH-${Array.from({ length: 24 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('')}`,
    type: 'enterprise', status: 'active', orgId: 'org-demo',
    features: LICENSE_FEATURES.enterprise,
    ...LICENSE_LIMITS.enterprise,
    createdAt: now(), updatedAt: now(),
  };
}

/* ================================================================== */
/*  CSS Variable Injection                                              */
/* ================================================================== */

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function rgbAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function applyBrandingCSS(colors: BrandColors, typography: BrandTypography, logo: LogoConfig, dark: boolean): void {
  const root = document.documentElement;
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  const c = colors;
  set('--pg-primary', c.primary);
  set('--pg-secondary', c.secondary);
  set('--pg-accent', c.accent);
  set('--pg-blue', c.primary);
  set('--pg-blue-soft', rgbAlpha(c.primary, 0.04));
  set('--pg-success', c.success);
  set('--pg-warning', c.warning);
  set('--pg-danger', c.error);
  set('--pg-info', c.info);
  set('--pg-ink', dark ? c.text : c.text);
  set('--pg-muted', dark ? c.mutedText : c.mutedText);
  set('--pg-line', dark ? c.border : c.border);
  set('--pg-panel', dark ? c.surface : c.surface);
  set('--pg-canvas', dark ? c.background : c.background);
  set('--pg-text', c.text);
  set('--pg-surface', c.surface);
  set('--pg-font', typography.fontFamily);
  set('--pg-heading-font', typography.headingFont || typography.fontFamily);
  set('--pg-mono-font', typography.monospaceFont || 'ui-monospace, monospace');
  set('--pg-font-size', `${typography.baseFontSize}px`);
  set('--pg-line-height', String(typography.lineHeight));
  set('--pg-logo-width', `${logo.width}px`);
  set('--pg-logo-height', `${logo.height}px`);
}

function removeBrandingCSS(): void {
  const root = document.documentElement;
  const vars = ['--pg-primary', '--pg-secondary', '--pg-accent', '--pg-success', '--pg-warning', '--pg-danger', '--pg-info', '--pg-text', '--pg-surface', '--pg-font', '--pg-heading-font', '--pg-mono-font', '--pg-font-size', '--pg-line-height', '--pg-logo-width', '--pg-logo-height'];
  vars.forEach((v) => root.style.removeProperty(v));
}

/* ================================================================== */
/*  Font Loading                                                        */
/* ================================================================== */

const loadedFonts = new Set<string>();

function loadFont(url: string): void {
  if (!url || loadedFonts.has(url)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
  loadedFonts.add(url);
}

function loadGoogleFont(family: string): void {
  if (!family || loadedFonts.has(`gf:${family}`)) return;
  const familyParam = family.split(',')[0].trim().replace(/\s+/g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(`gf:${family}`);
}

/* ================================================================== */
/*  White-Label Config                                                  */
/* ================================================================== */

function getWhiteLabel(): WhiteLabelConfig { return loadConfig().whiteLabel; }
function updateWhiteLabel(patch: Partial<WhiteLabelConfig>): WhiteLabelConfig {
  const config = loadConfig();
  Object.assign(config.whiteLabel, patch, { updatedAt: now() });
  saveConfig(config);
  return config.whiteLabel;
}
function updateColors(colors: Partial<BrandColors>): WhiteLabelConfig {
  const config = loadConfig();
  Object.assign(config.whiteLabel.colors, colors);
  config.whiteLabel.updatedAt = now();
  saveConfig(config);
  return config.whiteLabel;
}
function updateTypography(typography: Partial<BrandTypography>): WhiteLabelConfig {
  const config = loadConfig();
  Object.assign(config.whiteLabel.typography, typography);
  config.whiteLabel.updatedAt = now();
  saveConfig(config);
  if (typography.fontUrl) loadFont(typography.fontUrl);
  if (typography.fontFamily) loadGoogleFont(typography.fontFamily);
  return config.whiteLabel;
}
function updateLogo(logo: Partial<LogoConfig>): WhiteLabelConfig {
  const config = loadConfig();
  Object.assign(config.whiteLabel.logo, logo);
  config.whiteLabel.updatedAt = now();
  saveConfig(config);
  return config.whiteLabel;
}
function updateCompany(company: Partial<CompanyBranding>): WhiteLabelConfig {
  const config = loadConfig();
  Object.assign(config.whiteLabel.company, company);
  config.whiteLabel.updatedAt = now();
  saveConfig(config);
  return config.whiteLabel;
}
function updateDomain(domain: Partial<DomainConfig>): WhiteLabelConfig {
  const config = loadConfig();
  Object.assign(config.whiteLabel.domain, domain);
  config.whiteLabel.updatedAt = now();
  saveConfig(config);
  return config.whiteLabel;
}
function setCustomCss(css: string): WhiteLabelConfig {
  const config = loadConfig();
  config.whiteLabel.customCss = css;
  config.whiteLabel.updatedAt = now();
  saveConfig(config);
  return config.whiteLabel;
}

/* ================================================================== */
/*  Theme Application                                                   */
/* ================================================================== */

let customStyleEl: HTMLStyleElement | null = null;

function applyTheme(dark: boolean): void {
  const wl = getWhiteLabel();
  if (!wl.enabled) { removeBrandingCSS(); removeCustomCss(); return; }
  applyBrandingCSS(wl.colors, wl.typography, wl.logo, dark);
  if (wl.fontUrl) loadFont(wl.fontUrl);
  if (wl.typography.fontFamily) loadGoogleFont(wl.typography.fontFamily);
  if (wl.typography.headingFont) loadGoogleFont(wl.typography.headingFont);
  applyCustomCss(wl.customCss);
}

function applyCustomCss(css: string): void {
  if (!customStyleEl) {
    customStyleEl = document.createElement('style');
    customStyleEl.id = 'dg-custom-branding';
    document.head.appendChild(customStyleEl);
  }
  customStyleEl.textContent = css;
}

function removeCustomCss(): void {
  if (customStyleEl) { customStyleEl.textContent = ''; }
}

function resetTheme(): void {
  removeBrandingCSS();
  removeCustomCss();
}

/* ================================================================== */
/*  Workspace Branding                                                  */
/* ================================================================== */

function setWorkspaceBranding(workspaceId: string, branding: Partial<WhiteLabelConfig>, inheritOrgBranding: boolean): WorkspaceBranding {
  const config = loadConfig();
  const existing = config.workspaceBranding.find((wb) => wb.workspaceId === workspaceId);
  if (existing) {
    Object.assign(existing.branding, branding);
    existing.inheritOrgBranding = inheritOrgBranding;
    existing.updatedAt = now();
  } else {
    config.workspaceBranding.push({ workspaceId, branding, inheritOrgBranding, updatedAt: now() });
  }
  saveConfig(config);
  return config.workspaceBranding.find((wb) => wb.workspaceId === workspaceId)!;
}
function getWorkspaceBranding(workspaceId: string): WorkspaceBranding | undefined {
  return loadConfig().workspaceBranding.find((wb) => wb.workspaceId === workspaceId);
}
function deleteWorkspaceBranding(workspaceId: string): boolean {
  const config = loadConfig();
  const idx = config.workspaceBranding.findIndex((wb) => wb.workspaceId === workspaceId);
  if (idx === -1) return false;
  config.workspaceBranding.splice(idx, 1);
  saveConfig(config);
  return true;
}
function resolveBranding(workspaceId?: string): WhiteLabelConfig {
  const config = loadConfig();
  if (workspaceId && config.whiteLabel.enabled) {
    const wb = config.workspaceBranding.find((w) => w.workspaceId === workspaceId);
    if (wb && !wb.inheritOrgBranding) {
      return { ...config.whiteLabel, ...wb.branding, colors: { ...config.whiteLabel.colors, ...wb.branding.colors }, typography: { ...config.whiteLabel.typography, ...wb.branding.typography }, logo: { ...config.whiteLabel.logo, ...wb.branding.logo }, company: { ...config.whiteLabel.company, ...wb.branding.company }, domain: { ...config.whiteLabel.domain, ...wb.branding.domain } };
    }
  }
  return config.whiteLabel;
}

/* ================================================================== */
/*  License Management                                                  */
/* ================================================================== */

function getLicense(): LicenseConfig { return loadConfig().license; }
function updateLicense(patch: Partial<LicenseConfig>): LicenseConfig {
  const config = loadConfig();
  Object.assign(config.license, patch, { updatedAt: now() });
  saveConfig(config);
  return config.license;
}
function activateLicense(key: string, type: LicenseType = 'enterprise'): LicenseConfig {
  const limits = LICENSE_LIMITS[type];
  return updateLicense({ key, type, status: 'active', features: LICENSE_FEATURES[type], ...limits });
}
function hasFeature(feature: LicenseFeature): boolean {
  const lic = getLicense();
  return lic.status === 'active' && lic.features.includes(feature);
}
function getLicenseLimits(): { maxUsers: number; maxDashboards: number; maxWorkspaces: number; maxApiKeys: number } {
  return LICENSE_LIMITS[getLicense().type];
}
function isLicenseValid(): boolean {
  const lic = getLicense();
  if (lic.status !== 'active') return false;
  if (lic.expiresAt && new Date(lic.expiresAt) < new Date()) return false;
  return true;
}

/* ================================================================== */
/*  Brand Presets                                                       */
/* ================================================================== */

function listPresets(): BrandPreset[] { return loadConfig().presets; }
function addPreset(name: string, description: string | undefined, colors: BrandColors, typography: BrandTypography): BrandPreset {
  const config = loadConfig();
  const preset: BrandPreset = { id: `preset-${uid()}`, name, description, colors: { ...colors }, typography: { ...typography }, createdAt: now() };
  config.presets.push(preset);
  saveConfig(config);
  return preset;
}
function deletePreset(id: string): boolean {
  const config = loadConfig();
  const idx = config.presets.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  config.presets.splice(idx, 1);
  saveConfig(config);
  return true;
}
function applyPreset(presetId: string): WhiteLabelConfig | undefined {
  const config = loadConfig();
  const preset = config.presets.find((p) => p.id === presetId);
  if (!preset) return undefined;
  config.whiteLabel.colors = { ...preset.colors };
  config.whiteLabel.typography = { ...preset.typography };
  config.whiteLabel.updatedAt = now();
  saveConfig(config);
  return config.whiteLabel;
}

/* ================================================================== */
/*  Stats                                                               */
/* ================================================================== */

function getBrandingStats(): { whitelabelEnabled: boolean; licenseType: LicenseType; licenseStatus: LicenseStatus; featureCount: number; presetsCount: number; workspaceBrandings: number; customCssLength: number; hasLogo: boolean; hasCustomDomain: boolean } {
  const config = loadConfig();
  return {
    whitelabelEnabled: config.whiteLabel.enabled,
    licenseType: config.license.type,
    licenseStatus: config.license.status,
    featureCount: config.license.features.length,
    presetsCount: config.presets.length,
    workspaceBrandings: config.workspaceBranding.length,
    customCssLength: config.whiteLabel.customCss.length,
    hasLogo: !!config.whiteLabel.logo.url,
    hasCustomDomain: !!config.whiteLabel.domain.customDomain,
  };
}

/* ================================================================== */
/*  Demo Data                                                           */
/* ================================================================== */

function seedDemoData(): void {
  const config = loadConfig();
  if (config.presets.length > 0) return;
  config.presets = [...BRAND_PRESETS];
  saveConfig(config);
}

/* ================================================================== */
/*  Export                                                               */
/* ================================================================== */

export const brandingManager = {
  getWhiteLabel, updateWhiteLabel, updateColors, updateTypography, updateLogo, updateCompany, updateDomain, setCustomCss,
  applyTheme, resetTheme,
  setWorkspaceBranding, getWorkspaceBranding, deleteWorkspaceBranding, resolveBranding,
  getLicense, updateLicense, activateLicense, hasFeature, getLicenseLimits, isLicenseValid,
  listPresets, addPreset, deletePreset, applyPreset,
  getBrandingStats, seedDemoData,
  DEFAULT_COLORS, DEFAULT_DARK_COLORS, DEFAULT_TYPOGRAPHY, DEFAULT_LOGO, BRAND_PRESETS,
};
