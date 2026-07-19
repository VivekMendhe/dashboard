import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';

/* ================================================================== */
/*  Loading Spinner                                                     */
/* ================================================================== */

export function PanelSpinner({ label }: { label?: string }) {
  return (
    <div className="pg-panel-loading" role="status" aria-busy="true" aria-label={label || 'Loading'}>
      <div className="pg-panel-spinner" />
      {label && <span className="pg-panel-loading-label">{label}</span>}
    </div>
  );
}

/* ================================================================== */
/*  Lazy Panel Registry                                                 */
/* ================================================================== */

type LazyPanelEntry = {
  component: LazyExoticComponent<ComponentType<Record<string, unknown>>>;
  loadingLabel: string;
};

const panelCache = new Map<string, LazyPanelEntry>();

function getOrCreateLazy(key: string, factory: () => Promise<{ default: ComponentType<Record<string, unknown>> }>, label: string): LazyPanelEntry {
  if (panelCache.has(key)) return panelCache.get(key)!;
  const entry: LazyPanelEntry = { component: lazy(factory), loadingLabel: label };
  panelCache.set(key, entry);
  return entry;
}

/* ================================================================== */
/*  Individual Lazy Panels                                              */
/* ================================================================== */

// Casts are required: ComponentType<SpecificProps> is not assignable to
// ComponentType<Record<string, unknown>> due to function parameter contravariance.

export const LazySharePanel = getOrCreateLazy(
  'share', () => import('./share-panel').then((m) => ({ default: m.SharePanel as ComponentType<Record<string, unknown>> })), 'Loading Share...',
);

export const LazyCollaborationPanel = getOrCreateLazy(
  'collab', () => import('./collaboration-panel').then((m) => ({ default: m.CollaborationPanel as ComponentType<Record<string, unknown>> })), 'Loading Collaboration...',
);

export const LazySecurityPanel = getOrCreateLazy(
  'security', () => import('./security-panel').then((m) => ({ default: m.SecurityPanel as ComponentType<Record<string, unknown>> })), 'Loading Security...',
);

export const LazyBrandingPanel = getOrCreateLazy(
  'branding', () => import('./branding-panel').then((m) => ({ default: m.BrandingPanel as ComponentType<Record<string, unknown>> })), 'Loading Branding...',
);

export const LazyPluginPanel = getOrCreateLazy(
  'plugins', () => import('./plugin-panel').then((m) => ({ default: m.PluginPanel as ComponentType<Record<string, unknown>> })), 'Loading Plugins...',
);

export const LazyAIPanel = getOrCreateLazy(
  'ai', () => import('./ai-panel').then((m) => ({ default: m.AIPanel as ComponentType<Record<string, unknown>> })), 'Loading AI...',
);

export const LazyDashboardManager = getOrCreateLazy(
  'dashboards', () => import('./dashboard-list').then((m) => ({ default: m.DashboardManager as ComponentType<Record<string, unknown>> })), 'Loading Dashboards...',
);

export const LazyQueryBuilder = getOrCreateLazy(
  'querybuilder', () => import('./query-builder').then((m) => ({ default: m.QueryBuilder as ComponentType<Record<string, unknown>> })), 'Loading Query Builder...',
);

export const LazyResponsivePanel = getOrCreateLazy(
  'responsive', () => import('./responsive-panel').then((m) => ({ default: m.ResponsivePanel as ComponentType<Record<string, unknown>> })), 'Loading Responsive...',
);

export const LazyAdminPanel = getOrCreateLazy(
  'admin', () => import('./admin-panel').then((m) => ({ default: m.AdminPanel as ComponentType<Record<string, unknown>> })), 'Loading Admin Portal...',
);

/* ================================================================== */
/*  Generic LazyPanel Wrapper                                           */
/* ================================================================== */

export function LazyPanel({ entry, fallback, ...props }: { entry: LazyPanelEntry; fallback?: React.ReactNode } & Record<string, unknown>) {
  const Fallback = fallback ?? <PanelSpinner label={entry.loadingLabel} />;
  return (
    <Suspense fallback={Fallback}>
      <entry.component {...props} />
    </Suspense>
  );
}

/* ================================================================== */
/*  useLazyPanel Hook – load panels on demand                           */
/* ================================================================== */

import { useCallback, useState } from 'react';

export function useLazyPanel(key: string, factory: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) {
  const [loaded, setLoaded] = useState<LazyExoticComponent<ComponentType<Record<string, unknown>>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (loaded || loading) return;
    setLoading(true);
    setError(null);
    factory()
      .then(() => {
        const entry = getOrCreateLazy(key, factory, `Loading ${key}...`);
        setLoaded(entry.component);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [key, factory, loaded, loading]);

  return { Component: loaded, loading, error, load };
}
