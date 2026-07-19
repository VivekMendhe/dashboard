import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readJson, writeJson } from './utils';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

type DockPosition = 'top' | 'bottom' | 'left' | 'right' | 'float';

interface ToolbarState {
  dock: DockPosition;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  pinned: boolean;
  autoHide: boolean;
}

export interface ToolbarItem {
  id: string;
  label: string;
  icon: string;
  onClick: () => void;
  badge?: string;
  fontWeight?: number;
}

/* ================================================================== */
/*  Persistence                                                         */
/* ================================================================== */

const STORAGE_KEY = 'dg:workspace-toolbar:v1';
const DEFAULT_STATE: ToolbarState = {
  dock: 'top', x: 200, y: 80, width: 280, height: 400,
  collapsed: false, pinned: true, autoHide: false,
};
const loadState = (): ToolbarState => readJson(STORAGE_KEY, DEFAULT_STATE);
const saveState = (state: ToolbarState) => { try { writeJson(STORAGE_KEY, state); } catch { /* quota */ } };

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const SNAP_THRESHOLD = 32;
const COLLAPSED_SIZE = 46;
const EXPANDED_SIZE = 48;
const MIN_DOCK_SIZE = 180;
const MAX_DOCK_SIZE = 480;
const OVERFLOW_GAP = 48;

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const isHorizontalDock = (dock: DockPosition) => dock === 'top' || dock === 'bottom';
const isVerticalDock = (dock: DockPosition) => dock === 'left' || dock === 'right';

/* ================================================================== */
/*  WorkspaceToolbar                                                    */
/* ================================================================== */

export const WorkspaceToolbar = memo(function WorkspaceToolbar({
  items,
  badges,
}: {
  items: ToolbarItem[];
  badges?: Record<string, string>;
}) {
  /* ---- State ---- */
  const [state, setState] = useState<ToolbarState>(loadState);
  const [expanded, setExpanded] = useState(!state.collapsed);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [snapTarget, setSnapTarget] = useState<DockPosition | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  /* ---- Refs ---- */
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ sx: 0, sy: 0, sx2: 0, sy2: 0, sdock: 'top' as DockPosition, sPos: { x: 0, y: 0 } });
  const resizeState = useRef({ sw: 0, sh: 0, sx: 0, sy: 0 });
  const autoHideTimer = useRef<ReturnType<typeof setTimeout>>();
  const overflowRef = useRef<HTMLDivElement>(null);

  /* ---- Persist ---- */
  useEffect(() => { saveState(state); }, [state]);

  /* ---- Measure container for overflow ---- */
  useEffect(() => {
    const el = overflowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.dock, expanded, state.width, state.collapsed]);

  /* ---- Auto-hide ---- */
  const autoHideActive = state.autoHide && !state.pinned;
  const isVisible = !autoHideActive || hovered || dragging;

  useEffect(() => {
    if (!autoHideActive) return;
    if (hovered) { clearTimeout(autoHideTimer.current); return; }
    autoHideTimer.current = setTimeout(() => setHovered(false), 600);
    return () => clearTimeout(autoHideTimer.current);
  }, [hovered, autoHideActive]);

  /* ---- Overflow calculation ---- */
  const isDocked = state.dock !== 'float';
  const isH = isHorizontalDock(state.dock);
  const isV = isVerticalDock(state.dock);
  const isCollapsed = !expanded && isDocked;

  const { visibleItems, overflowItems } = useMemo(() => {
    if (!isDocked || !isCollapsed) return { visibleItems: items, overflowItems: [] as ToolbarItem[] };

    const available = isH ? containerSize.w : containerSize.h;
    if (available <= 0) return { visibleItems: items.slice(0, 5), overflowItems: items.slice(5) };

    const itemSize = 34;
    const maxFit = Math.max(3, Math.floor((available - OVERFLOW_GAP) / itemSize));
    return {
      visibleItems: items.slice(0, Math.min(maxFit, items.length)),
      overflowItems: items.slice(Math.min(maxFit, items.length)),
    };
  }, [items, isDocked, isCollapsed, isH, containerSize]);

  /* ---- Window-level drag ---- */
  const onDragStart = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,select,input,a,[role="button"]')) return;
    e.preventDefault();
    e.stopPropagation();

    const s = state;
    dragState.current = {
      sx: e.clientX, sy: e.clientY,
      sx2: s.dock === 'left' ? 0 : s.dock === 'right' ? window.innerWidth - (s.width || 280) : s.x,
      sy2: s.y,
      sdock: s.dock,
      sPos: { x: s.x, y: s.y },
    };
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const d = dragState.current;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;

      /* Detect snap targets */
      let target: DockPosition | null = null;
      if (ev.clientY <= SNAP_THRESHOLD) target = 'top';
      else if (ev.clientY >= window.innerHeight - SNAP_THRESHOLD) target = 'bottom';
      else if (ev.clientX <= SNAP_THRESHOLD) target = 'left';
      else if (ev.clientX >= window.innerWidth - SNAP_THRESHOLD) target = 'right';
      setSnapTarget(target);

      /* Move as float */
      const newX = clamp(d.sPos.x + (d.sdock === 'left' || d.sdock === 'right' ? dx : dx), 0, window.innerWidth - 100);
      const newY = clamp(d.sPos.y + dy, 0, window.innerHeight - 40);
      setState((prev) => ({ ...prev, dock: 'float', x: newX, y: newY, pinned: false }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragging(false);
      setSnapTarget((target) => {
        if (target) {
          setState((prev) => ({ ...prev, dock: target, pinned: true, x: 200, y: 80 }));
        }
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [state]);

  /* ---- Window-level resize ---- */
  const onResizeStart = useCallback((e: React.PointerEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { sw: state.width || 280, sh: state.height || 400, sx: e.clientX, sy: e.clientY };

    const onMove = (ev: PointerEvent) => {
      const r = resizeState.current;
      const dx = ev.clientX - r.sx;
      const dy = ev.clientY - r.sy;
      setState((prev) => {
        if (isVerticalDock(prev.dock)) {
          const newW = edge === 'right' ? clamp(r.sw + dx, MIN_DOCK_SIZE, MAX_DOCK_SIZE) : clamp(r.sw - dx, MIN_DOCK_SIZE, MAX_DOCK_SIZE);
          return { ...prev, width: newW };
        }
        const newH = edge === 'bottom' ? clamp(r.sh + dy, MIN_DOCK_SIZE, MAX_DOCK_SIZE) : clamp(r.sh - dy, MIN_DOCK_SIZE, MAX_DOCK_SIZE);
        return { ...prev, height: newH };
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [state.width, state.height]);

  /* ---- Actions ---- */
  const toggleCollapse = useCallback(() => {
    setExpanded((p) => {
      const next = !p;
      setState((s) => ({ ...s, collapsed: !next }));
      return next;
    });
  }, []);

  const togglePin = useCallback(() => setState((s) => ({ ...s, pinned: !s.pinned })), []);

  const toggleAutoHide = useCallback(() => setState((s) => ({ ...s, autoHide: !s.autoHide })), []);

  const dockTo = useCallback((pos: DockPosition) => {
    setState((s) => ({
      ...s, dock: pos, pinned: true,
      x: pos === 'float' ? clamp(s.x > 0 ? s.x : 200, 0, window.innerWidth - 200) : s.x,
      y: pos === 'float' ? clamp(s.y > 0 ? s.y : 80, 0, window.innerHeight - 80) : s.y,
    }));
  }, []);

  const floatFromDock = useCallback(() => {
    setState((s) => ({
      ...s, dock: 'float', pinned: false,
      x: s.dock === 'left' ? (s.width || 280) + 8 : s.dock === 'right' ? window.innerWidth - (s.width || 280) - 208 : 200,
      y: s.dock === 'top' ? (s.height ? Math.min(s.height, EXPANDED_SIZE) : EXPANDED_SIZE) + 8 : 80,
    }));
  }, []);

  /* ---- Close overflow on outside click ---- */
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  /* ---- Build inline styles ---- */
  const HOT_ZONE = 4;
  const toolbarStyle = useMemo((): React.CSSProperties => {
    const transition = dragging ? 'none' : 'transform 0.28s cubic-bezier(.4,0,.2,1), width 0.28s cubic-bezier(.4,0,.2,1), height 0.28s cubic-bezier(.4,0,.2,1), border-radius 0.2s ease';

    if (state.dock === 'float') {
      const w = state.width || 280;
      const h = state.height || 400;
      return {
        position: 'fixed', zIndex: 1000,
        left: state.x, top: state.y, width: w, height: h,
        borderRadius: 12,
        boxShadow: isVisible ? '0 12px 40px rgba(0,0,0,.15), 0 2px 8px rgba(0,0,0,.08)' : 'none',
        transition,
        opacity: isVisible ? 1 : 0,
        pointerEvents: 'auto',
        transform: isVisible ? 'none' : 'scale(0.95)',
      };
    }

    /* Docked — leave a HOT_ZONE px strip visible for auto-hide hover */
    const dockSize = isCollapsed ? COLLAPSED_SIZE : (isH ? EXPANDED_SIZE : (state.width || 280));
    const pos: React.CSSProperties = { position: 'fixed', zIndex: 1000, transition, pointerEvents: 'auto' };

    if (isH) {
      pos.left = 0; pos.right = 0; pos.height = dockSize;
      pos[state.dock] = 0;
      pos.borderRadius = state.dock === 'top' ? '0 0 10px 10px' : '10px 10px 0 0';
      pos.boxShadow = isVisible ? undefined : 'none';
      if (isVisible) {
        pos.transform = 'none';
      } else {
        pos.transform = state.dock === 'top' ? `translateY(calc(-100% + ${HOT_ZONE}px))` : `translateY(calc(100% - ${HOT_ZONE}px))`;
      }
    } else {
      pos.top = 0; pos.bottom = 0; pos.width = dockSize;
      pos[state.dock] = 0;
      pos.borderRadius = state.dock === 'left' ? '0 10px 10px 0' : '10px 0 0 10px';
      pos.boxShadow = isVisible ? undefined : 'none';
      if (isVisible) {
        pos.transform = 'none';
      } else {
        pos.transform = state.dock === 'left' ? `translateX(calc(-100% + ${HOT_ZONE}px))` : `translateX(calc(100% - ${HOT_ZONE}px))`;
      }
    }

    return pos;
  }, [state, dragging, isCollapsed, isVisible, isH, isV]);

  /* ---- Toolbar CSS classes ---- */
  const toolbarClass = [
    'wt-toolbar',
    isH ? 'wt-h' : 'wt-v',
    isCollapsed ? 'wt-collapsed' : 'wt-expanded',
    state.dock === 'float' ? 'wt-float' : 'wt-docked',
    dragging ? 'wt-dragging' : '',
  ].filter(Boolean).join(' ');

  /* ---- Content layout class ---- */
  const contentClass = [
    'wt-content',
    isH ? 'wt-content-h' : 'wt-content-v',
  ].join(' ');

  /* ---- Resize edge ---- */
  const resizeEdge = isV ? (state.dock === 'left' ? 'right' : 'left') : (state.dock === 'top' ? 'bottom' : 'top');

  return (
    <>
      {/* ---- Snap indicator line ---- */}
      {dragging && snapTarget && (
        <div className={`wt-snap-line wt-snap-${isHorizontalDock(snapTarget) ? 'h' : 'v'}`} style={{ [snapTarget]: 0 } as React.CSSProperties} />
      )}

      {/* ---- Main toolbar ---- */}
      <div
        ref={toolbarRef}
        className={toolbarClass}
        style={toolbarStyle}
        role="toolbar"
        aria-label="Workspace toolbar"
        onMouseEnter={() => autoHideActive && setHovered(true)}
        onMouseLeave={() => autoHideActive && setHovered(false)}
      >
        {/* Float title bar */}
        {state.dock === 'float' && (
          <div className="wt-titlebar">
            <span className="wt-titlebar-grip" onPointerDown={onDragStart}>⋮⋮</span>
            <span className="wt-titlebar-text">Tools</span>
            <div className="wt-titlebar-actions">
              <button className="wt-tb-btn" onClick={() => dockTo('top')} title="Dock top">↑</button>
              <button className="wt-tb-btn" onClick={() => dockTo('bottom')} title="Dock bottom">↓</button>
              <button className="wt-tb-btn" onClick={() => dockTo('left')} title="Dock left">←</button>
              <button className="wt-tb-btn" onClick={() => dockTo('right')} title="Dock right">→</button>
            </div>
          </div>
        )}

        {/* Drag zone (docked) — 6px strip on the inner edge */}
        {isDocked && (
          <div
            className={`wt-drag-strip wt-drag-strip-${state.dock}`}
            onPointerDown={onDragStart}
          />
        )}

        {/* Items */}
        <div ref={overflowRef} className={contentClass}>
          {visibleItems.map((item) => (
            <button
              key={item.id}
              className={`wt-item ${isCollapsed ? 'wt-item-icon-only' : ''}`}
              onClick={item.onClick}
              title={isCollapsed ? item.label : undefined}
              style={item.fontWeight ? { fontWeight: item.fontWeight } : undefined}
            >
              <span className="wt-item-icon">{item.icon}</span>
              {!isCollapsed && <span className="wt-item-label">{item.label}</span>}
              {badges?.[item.id] && <span className="wt-badge">{badges[item.id]}</span>}
            </button>
          ))}

          {/* Overflow */}
          {overflowItems.length > 0 && (
            <div className="wt-overflow-wrap">
              <button className="wt-item wt-overflow-trigger" onClick={() => setOverflowOpen((p) => !p)} title="More tools">
                <span className="wt-item-icon">⋯</span>
                {!isCollapsed && <span className="wt-item-label">More</span>}
              </button>
              {overflowOpen && (
                <div className="wt-overflow-menu">
                  {overflowItems.map((item) => (
                    <button key={item.id} className="wt-overflow-item" onClick={() => { item.onClick(); setOverflowOpen(false); }}>
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                      {badges?.[item.id] && <span className="wt-badge">{badges[item.id]}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="wt-controls">
          <button className="wt-ctrl-btn" onClick={toggleCollapse} title={expanded ? 'Collapse' : 'Expand'}>
            {isCollapsed ? '»' : '«'}
          </button>
          <button className={`wt-ctrl-btn ${state.pinned ? 'on' : ''}`} onClick={togglePin} title={state.pinned ? 'Unpin' : 'Pin'}>
            📌
          </button>
          <button className={`wt-ctrl-btn ${state.autoHide ? 'on' : ''}`} onClick={toggleAutoHide} title={state.autoHide ? 'Auto-hide off' : 'Auto-hide on'}>
            👁
          </button>
          {isDocked && (
            <button className="wt-ctrl-btn" onClick={floatFromDock} title="Float">⊞</button>
          )}
        </div>

        {/* Resize grip */}
        {isDocked && !isCollapsed && (
          <div
            className={`wt-resize wt-resize-${resizeEdge}`}
            onPointerDown={(e) => onResizeStart(e, resizeEdge)}
          />
        )}
      </div>
    </>
  );
});
