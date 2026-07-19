import type { DashboardWidget, GridPosition } from '@dashboard-generator/core';

/* ------------------------------------------------------------------ */
/*  Layout tool operations – pure functions                              */
/*  All operate on arrays of selected widgets and return patched copies */
/* ------------------------------------------------------------------ */

/** Get the current position for a widget, respecting viewport. */
export const pos = (w: DashboardWidget, viewport: GridPosition extends infer _G ? 'desktop' | 'laptop' | 'tablet' | 'mobile' : never): GridPosition =>
  viewport === 'desktop' ? w.position : w.positions?.[viewport] ?? w.position;

/** Clone a widget array and apply a position patch to each selected widget. */
const patch = (
  widgets: DashboardWidget[],
  ids: Set<string>,
  fn: (w: DashboardWidget, p: GridPosition) => GridPosition,
  viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile',
): DashboardWidget[] =>
  widgets.map((w) => {
    if (!ids.has(w.id)) return w;
    const current = pos(w, viewport);
    const next = fn(w, current);
    if (viewport === 'desktop') return { ...w, position: next };
    return { ...w, positions: { ...w.positions, [viewport]: next } };
  });

/* ── Alignment ──────────────────────────────────────────────────── */

export function alignLeft(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 2) return widgets;
  const minX = Math.min(...selected.map((w) => pos(w, viewport).x));
  return patch(widgets, ids, (_w, p) => ({ ...p, x: minX }), viewport);
}

export function alignRight(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 2) return widgets;
  const maxRight = Math.max(...selected.map((w) => { const p = pos(w, viewport); return p.x + p.w; }));
  return patch(widgets, ids, (_w, p) => ({ ...p, x: Math.max(0, maxRight - p.w) }), viewport);
}

export function alignTop(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 2) return widgets;
  const minY = Math.min(...selected.map((w) => pos(w, viewport).y));
  return patch(widgets, ids, (_w, p) => ({ ...p, y: minY }), viewport);
}

export function alignBottom(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 2) return widgets;
  const maxBottom = Math.max(...selected.map((w) => { const p = pos(w, viewport); return p.y + p.h; }));
  return patch(widgets, ids, (_w, p) => ({ ...p, y: Math.max(0, maxBottom - p.h) }), viewport);
}

export function centerHorizontal(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 2) return widgets;
  const minX = Math.min(...selected.map((w) => pos(w, viewport).x));
  const maxRight = Math.max(...selected.map((w) => { const p = pos(w, viewport); return p.x + p.w; }));
  const midX = (minX + maxRight) / 2;
  return patch(widgets, ids, (_w, p) => ({ ...p, x: Math.max(0, Math.round(midX - p.w / 2)) }), viewport);
}

export function centerVertical(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 2) return widgets;
  const minY = Math.min(...selected.map((w) => pos(w, viewport).y));
  const maxBottom = Math.max(...selected.map((w) => { const p = pos(w, viewport); return p.y + p.h; }));
  const midY = (minY + maxBottom) / 2;
  return patch(widgets, ids, (_w, p) => ({ ...p, y: Math.max(0, Math.round(midY - p.h / 2)) }), viewport);
}

/* ── Equal size ─────────────────────────────────────────────────── */

export function equalWidth(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 2) return widgets;
  const avgW = Math.round(selected.reduce((sum, w) => sum + pos(w, viewport).w, 0) / selected.length);
  const clamped = Math.max(1, Math.min(12, avgW));
  return patch(widgets, ids, (_w, p) => ({ ...p, w: clamped }), viewport);
}

export function equalHeight(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 2) return widgets;
  const avgH = Math.round(selected.reduce((sum, w) => sum + pos(w, viewport).h, 0) / selected.length);
  const clamped = Math.max(1, avgH);
  return patch(widgets, ids, (_w, p) => ({ ...p, h: clamped }), viewport);
}

/* ── Distribution ───────────────────────────────────────────────── */

export function distributeHorizontally(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 3) return widgets;
  const sorted = [...selected].sort((a, b) => pos(a, viewport).x - pos(b, viewport).x);
  const first = pos(sorted[0], viewport);
  const last = pos(sorted[sorted.length - 1], viewport);
  const totalWidgetW = sorted.reduce((sum, w) => sum + pos(w, viewport).w, 0);
  const span = (last.x + last.w) - first.x;
  const gap = (span - totalWidgetW) / (sorted.length - 1);
  let cursor = first.x;
  const xMap = new Map<string, number>();
  for (const w of sorted) {
    xMap.set(w.id, Math.round(cursor));
    cursor += pos(w, viewport).w + gap;
  }
  return patch(widgets, ids, (w, p) => ({ ...p, x: Math.max(0, xMap.get(w.id) ?? p.x) }), viewport);
}

export function distributeVertically(widgets: DashboardWidget[], ids: Set<string>, viewport: 'desktop' | 'laptop' | 'tablet' | 'mobile'): DashboardWidget[] {
  const selected = widgets.filter((w) => ids.has(w.id));
  if (selected.length < 3) return widgets;
  const sorted = [...selected].sort((a, b) => pos(a, viewport).y - pos(b, viewport).y);
  const first = pos(sorted[0], viewport);
  const last = pos(sorted[sorted.length - 1], viewport);
  const totalWidgetH = sorted.reduce((sum, w) => sum + pos(w, viewport).h, 0);
  const span = (last.y + last.h) - first.y;
  const gap = (span - totalWidgetH) / (sorted.length - 1);
  let cursor = first.y;
  const yMap = new Map<string, number>();
  for (const w of sorted) {
    yMap.set(w.id, Math.round(cursor));
    cursor += pos(w, viewport).h + gap;
  }
  return patch(widgets, ids, (w, p) => ({ ...p, y: Math.max(0, yMap.get(w.id) ?? p.y) }), viewport);
}

/* ── Group / Ungroup ────────────────────────────────────────────── */

let groupCounter = 0;

export function groupWidgets(widgets: DashboardWidget[], ids: Set<string>): { widgets: DashboardWidget[]; groupId: string } {
  const groupId = `group-${Date.now()}-${++groupCounter}`;
  const updated = widgets.map((w) => {
    if (!ids.has(w.id)) return w;
    return { ...w, options: { ...w.options, groupId } };
  });
  return { widgets: updated, groupId };
}

export function ungroupWidgets(widgets: DashboardWidget[], ids: Set<string>): DashboardWidget[] {
  return widgets.map((w) => {
    if (!ids.has(w.id)) return w;
    if (!w.options?.groupId) return w;
    const { groupId: _, ...rest } = w.options;
    return { ...w, options: rest };
  });
}

/** Return IDs of all widgets that share a groupId with any of the selected IDs. */
export function getGroupMembers(widgets: DashboardWidget[], ids: Set<string>): string[] {
  const groupIds = new Set<string>();
  for (const w of widgets) {
    if (ids.has(w.id) && w.options?.groupId) groupIds.add(w.options.groupId as string);
  }
  if (groupIds.size === 0) return [];
  return widgets.filter((w) => groupIds.has(w.options?.groupId as string)).map((w) => w.id);
}

/* ── Lock / Unlock ──────────────────────────────────────────────── */

export function lockWidgets(widgets: DashboardWidget[], ids: Set<string>): DashboardWidget[] {
  return widgets.map((w) => ids.has(w.id) ? { ...w, options: { ...w.options, locked: true } } : w);
}

export function unlockWidgets(widgets: DashboardWidget[], ids: Set<string>): DashboardWidget[] {
  return widgets.map((w) => ids.has(w.id) ? { ...w, options: { ...w.options, locked: false } } : w);
}

/* ── Hide / Show ────────────────────────────────────────────────── */

export function hideWidgets(widgets: DashboardWidget[], ids: Set<string>): DashboardWidget[] {
  return widgets.map((w) => ids.has(w.id) ? { ...w, options: { ...w.options, hidden: true } } : w);
}

export function showWidgets(widgets: DashboardWidget[], ids: Set<string>): DashboardWidget[] {
  return widgets.map((w) => ids.has(w.id) ? { ...w, options: { ...w.options, hidden: false } } : w);
}
