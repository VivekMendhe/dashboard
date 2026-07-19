import { useCallback, useMemo, useState } from 'react';
import type { DashboardWidget, GridPosition, ResponsivePositionMap } from '@dashboard-generator/core';
import { useBuilderStore } from './store';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export type Breakpoint = 'desktop' | 'laptop' | 'tablet' | 'mobile';

export interface BreakpointMeta {
  key: Breakpoint;
  label: string;
  icon: string;
  width: number;
  cols: number;
  description: string;
  scale: number;
}

export interface ResponsivePanelProps {}

/* ================================================================== */
/*  Breakpoint Definitions                                              */
/* ================================================================== */

export const BREAKPOINTS: BreakpointMeta[] = [
  { key: 'desktop', label: 'Desktop', icon: '\u2318', width: 1440, cols: 12, description: 'Full-width layout, 12 columns', scale: 1 },
  { key: 'laptop', label: 'Laptop', icon: '\u2319', width: 1024, cols: 12, description: 'Laptop screen, 12 columns', scale: 0.88 },
  { key: 'tablet', label: 'Tablet', icon: '\u25a6', width: 768, cols: 8, description: 'Tablet portrait, 8 columns', scale: 0.78 },
  { key: 'mobile', label: 'Mobile', icon: '\u25a8', width: 375, cols: 4, description: 'Mobile phone, 4 columns', scale: 0.52 },
];

export const BREAKPOINT_MAP = Object.fromEntries(BREAKPOINTS.map((bp) => [bp.key, bp])) as Record<Breakpoint, BreakpointMeta>;

/* ================================================================== */
/*  ResponsivePanel                                                     */
/* ================================================================== */

export function ResponsivePanel() {
  const { dashboard, viewport, update, updatePosition } = useBuilderStore();
  const [showGrid, setShowGrid] = useState(false);

  const setViewport = useCallback((bp: Breakpoint) => {
    useBuilderStore.setState({ viewport: bp });
  }, []);

  const widgetStats = useMemo(() => {
    const stats: Record<Breakpoint, { total: number; custom: number; inherited: number }> = {
      desktop: { total: 0, custom: 0, inherited: 0 },
      laptop: { total: 0, custom: 0, inherited: 0 },
      tablet: { total: 0, custom: 0, inherited: 0 },
      mobile: { total: 0, custom: 0, inherited: 0 },
    };
    for (const widget of dashboard.widgets) {
      if (widget.options?.hidden) continue;
      for (const bp of BREAKPOINTS) {
        stats[bp.key].total++;
        if (bp.key === 'desktop') {
          stats[bp.key].custom++;
        } else if (widget.positions?.[bp.key]) {
          stats[bp.key].custom++;
        } else {
          stats[bp.key].inherited++;
        }
      }
    }
    return stats;
  }, [dashboard.widgets]);

  const autoGeneratePositions = useCallback(() => {
    const updated = dashboard.widgets.map((widget) => {
      if (widget.options?.hidden) return widget;
      const desktop = widget.position;
      const positions: ResponsivePositionMap = { ...widget.positions };

      if (!positions.laptop) {
        positions.laptop = {
          x: Math.max(0, Math.round(desktop.x * 0.9)),
          y: desktop.y,
          w: Math.min(12, Math.max(2, Math.round(desktop.w * 0.95))),
          h: desktop.h,
          minW: desktop.minW, minH: desktop.minH, maxW: desktop.maxW, maxH: desktop.maxH,
        };
      }

      if (!positions.tablet) {
        const tabletCols = 8;
        positions.tablet = {
          x: Math.max(0, Math.round(desktop.x * (tabletCols / 12))),
          y: desktop.y,
          w: Math.min(tabletCols, Math.max(2, Math.round(desktop.w * (tabletCols / 12)))),
          h: desktop.h,
          minW: Math.min(2, desktop.minW ?? 2), minH: desktop.minH, maxW: tabletCols, maxH: desktop.maxH,
        };
      }

      if (!positions.mobile) {
        const mobileCols = 4;
        positions.mobile = {
          x: 0,
          y: desktop.y,
          w: Math.min(mobileCols, Math.max(1, Math.round(desktop.w * (mobileCols / 12)))),
          h: desktop.h + (desktop.w > 6 ? 1 : 0),
          minW: 1, minH: desktop.minH, maxW: mobileCols, maxH: desktop.maxH,
        };
      }

      return { ...widget, positions };
    });
    update(dashboard.id, { widgets: updated });
  }, [dashboard, update]);

  const resetAllPositions = useCallback(() => {
    const updated = dashboard.widgets.map((widget) => ({
      ...widget,
      positions: undefined,
    }));
    update(dashboard.id, { widgets: updated });
  }, [dashboard, update]);

  const resetBreakpoint = useCallback((bp: Breakpoint) => {
    if (bp === 'desktop') return;
    const updated = dashboard.widgets.map((widget) => {
      const positions = { ...widget.positions };
      delete positions[bp];
      return { ...widget, positions: Object.keys(positions).length ? positions : undefined };
    });
    update(dashboard.id, { widgets: updated });
  }, [dashboard, update]);

  return (
    <div className="resp-root">
      <div className="resp-breakpoints">
        {BREAKPOINTS.map((bp) => {
          const isActive = viewport === bp.key;
          const stats = widgetStats[bp.key];
          return (
            <button
              key={bp.key}
              className={`resp-bp-card ${isActive ? 'active' : ''}`}
              onClick={() => setViewport(bp.key)}
            >
              <div className="resp-bp-icon">{bp.icon}</div>
              <div className="resp-bp-info">
                <span className="resp-bp-label">{bp.label}</span>
                <span className="resp-bp-width">{bp.width}px &middot; {bp.cols} cols</span>
              </div>
              <div className="resp-bp-stats">
                <span className="resp-bp-custom">{stats.custom} custom</span>
                {stats.inherited > 0 && <span className="resp-bp-inherited">{stats.inherited} inherited</span>}
              </div>
              {isActive && <div className="resp-bp-active-dot" />}
            </button>
          );
        })}
      </div>

      <div className="resp-preview-bar">
        {BREAKPOINTS.map((bp) => {
          const isActive = viewport === bp.key;
          return (
            <div
              key={bp.key}
              className={`resp-preview-segment ${isActive ? 'active' : ''}`}
              style={{ flex: bp.width / 375 }}
              onClick={() => setViewport(bp.key)}
            >
              <span className="resp-preview-label">{bp.label}</span>
              <span className="resp-preview-size">{bp.width}px</span>
            </div>
          );
        })}
      </div>

      <div className="resp-info">
        <div className="resp-info-row">
          <span className="resp-info-label">Current Breakpoint</span>
          <span className="resp-info-value">{BREAKPOINT_MAP[viewport].label}</span>
        </div>
        <div className="resp-info-row">
          <span className="resp-info-label">Canvas Width</span>
          <span className="resp-info-value">{BREAKPOINT_MAP[viewport].width}px</span>
        </div>
        <div className="resp-info-row">
          <span className="resp-info-label">Grid Columns</span>
          <span className="resp-info-value">{BREAKPOINT_MAP[viewport].cols}</span>
        </div>
        <div className="resp-info-row">
          <span className="resp-info-label">Scale</span>
          <span className="resp-info-value">{Math.round(BREAKPOINT_MAP[viewport].scale * 100)}%</span>
        </div>
      </div>

      <div className="resp-actions">
        <h5>Layout Operations</h5>
        <button className="resp-action-btn" onClick={autoGeneratePositions}>
          Auto-generate for all breakpoints
        </button>
        {viewport !== 'desktop' && (
          <button className="resp-action-btn" onClick={() => resetBreakpoint(viewport)}>
            Reset {BREAKPOINT_MAP[viewport].label} to Desktop
          </button>
        )}
        <button className="resp-action-btn resp-action-danger" onClick={resetAllPositions}>
          Reset all to Desktop
        </button>
      </div>

      <div className="resp-widget-overview">
        <h5>Widget Layout Status</h5>
        <div className="resp-widget-list">
          {dashboard.widgets.filter((w) => !w.options?.hidden).map((widget) => (
            <WidgetLayoutRow key={widget.id} widget={widget} currentBp={viewport} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  WidgetLayoutRow                                                     */
/* ================================================================== */

function WidgetLayoutRow({ widget, currentBp }: { widget: DashboardWidget; currentBp: Breakpoint }) {
  const { updatePosition, viewport } = useBuilderStore();
  const pos = viewport === 'desktop' ? widget.position : widget.positions?.[viewport] ?? widget.position;
  const isCustom = viewport !== 'desktop' && widget.positions?.[viewport] !== undefined;

  const handleCopyDesktop = useCallback(() => {
    updatePosition(widget.id, { ...widget.position }, viewport);
  }, [widget, viewport, updatePosition]);

  const handleReset = useCallback(() => {
    const positions = { ...widget.positions };
    delete positions[viewport];
    useBuilderStore.getState().update(widget.id, { positions });
  }, [widget, viewport]);

  return (
    <div className={`resp-wl-row ${isCustom ? 'custom' : ''}`}>
      <div className="resp-wl-info">
        <span className="resp-wl-name">{widget.title || widget.type}</span>
        <span className="resp-wl-pos">{pos.x},{pos.y} {pos.w}\u00d7{pos.h}</span>
      </div>
      <div className="resp-wl-badges">
        {BREAKPOINTS.filter((bp) => bp.key !== 'desktop').map((bp) => {
          const has = !!widget.positions?.[bp.key];
          return <span key={bp.key} className={`resp-wl-dot ${has ? 'set' : ''}`} title={`${bp.label}: ${has ? 'custom' : 'inherited'}`} />;
        })}
      </div>
      <div className="resp-wl-actions">
        {isCustom ? (
          <button className="resp-wl-btn" onClick={handleReset} title="Reset to desktop">Reset</button>
        ) : viewport !== 'desktop' ? (
          <button className="resp-wl-btn" onClick={handleCopyDesktop} title="Copy desktop position">Copy</button>
        ) : null}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ResponsivePositionMap Editor                                        */
/* ================================================================== */

export function PositionMapEditor({ widget }: { widget: DashboardWidget }) {
  const { update, viewport } = useBuilderStore();

  const setPos = useCallback((bp: Breakpoint, pos: Partial<GridPosition>) => {
    if (bp === 'desktop') {
      update(widget.id, { position: { ...widget.position, ...pos } });
    } else {
      const current = widget.positions?.[bp] ?? widget.position;
      update(widget.id, { positions: { ...widget.positions, [bp]: { ...current, ...pos } } });
    }
  }, [widget, update]);

  const resetBp = useCallback((bp: Breakpoint) => {
    if (bp === 'desktop') return;
    const positions = { ...widget.positions };
    delete positions[bp];
    update(widget.id, { positions: Object.keys(positions).length ? positions : undefined });
  }, [widget, update]);

  return (
    <div className="resp-pme">
      {BREAKPOINTS.map((bp) => {
        const pos = bp.key === 'desktop' ? widget.position : widget.positions?.[bp.key] ?? widget.position;
        const isCustom = bp.key !== 'desktop' && widget.positions?.[bp.key] !== undefined;
        const isActive = viewport === bp.key;
        return (
          <div key={bp.key} className={`resp-pme-row ${isActive ? 'active' : ''} ${isCustom ? 'custom' : ''}`}>
            <span className="resp-pme-icon">{bp.icon}</span>
            <span className="resp-pme-label">{bp.label}</span>
            <span className="resp-pme-pos">{pos.x},{pos.y} {pos.w}\u00d7{pos.h}</span>
            {isCustom && <button className="resp-pme-reset" onClick={() => resetBp(bp.key)}>Reset</button>}
          </div>
        );
      })}
    </div>
  );
}
