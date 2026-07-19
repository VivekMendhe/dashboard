import type { DashboardWidget, GridPosition } from '@dashboard-generator/core';

/* ------------------------------------------------------------------ */
/*  Grid constants – mirrors react-grid-layout configuration            */
/* ------------------------------------------------------------------ */

export const GRID_COLS = 12;
export const ROW_HEIGHT = 82;
export const MARGIN = 12;
export const CONTAINER_PADDING = 12;

/** Default snap tolerance in grid units. */
export const SNAP_TOLERANCE = 0.35;

/* ------------------------------------------------------------------ */
/*  Pixel rect                                                          */
/* ------------------------------------------------------------------ */

export interface PixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** Convert a grid position to pixel-space bounds. */
export function gridToPixel(pos: GridPosition, containerWidth: number): PixelRect {
  const colW = (containerWidth - 2 * CONTAINER_PADDING - (GRID_COLS - 1) * MARGIN) / GRID_COLS;
  const left = CONTAINER_PADDING + pos.x * (colW + MARGIN);
  const top = CONTAINER_PADDING + pos.y * (ROW_HEIGHT + MARGIN);
  const width = pos.w * colW + (pos.w - 1) * MARGIN;
  const height = pos.h * ROW_HEIGHT + (pos.h - 1) * MARGIN;
  return { left, top, right: left + width, bottom: top + height, width, height, centerX: left + width / 2, centerY: top + height / 2 };
}

/** Convert a pixel X offset back to the nearest grid column. */
export function pixelToGridX(px: number, containerWidth: number): number {
  const colW = (containerWidth - 2 * CONTAINER_PADDING - (GRID_COLS - 1) * MARGIN) / GRID_COLS;
  return Math.round((px - CONTAINER_PADDING) / (colW + MARGIN));
}

/** Convert a pixel Y offset back to the nearest grid row. */
export function pixelToGridY(px: number): number {
  return Math.round((px - CONTAINER_PADDING) / (ROW_HEIGHT + MARGIN));
}

/* ------------------------------------------------------------------ */
/*  Guide types                                                         */
/* ------------------------------------------------------------------ */

export type GuideAxis = 'horizontal' | 'vertical';

export interface SnapGuide {
  /** 'horizontal' = a line running left-to-right, 'vertical' = top-to-bottom. */
  axis: GuideAxis;
  /** Pixel position along the perpendicular axis. */
  position: number;
  /** Start pixel position along the guide's own axis. */
  start: number;
  /** End pixel position along the guide's own axis. */
  end: number;
  /** The grid-unit value the dragged widget snapped to (for snapping the final position). */
  snapValue?: number;
}

export interface DistanceLabel {
  /** Midpoint X of the label. */
  x: number;
  /** Midpoint Y of the label. */
  y: number;
  /** Display text (pixel distance). */
  text: string;
  /** Axis the distance is measured along. */
  axis: GuideAxis;
}

export interface SnapResult {
  /** Snapped grid position for the dragged widget. */
  snapped: GridPosition;
  /** Active guide lines to render. */
  guides: SnapGuide[];
  /** Distance indicator labels between close edges. */
  distances: DistanceLabel[];
}

/* ------------------------------------------------------------------ */
/*  Alignment detection                                                */
/* ------------------------------------------------------------------ */

interface EdgeCandidate {
  axis: GuideAxis;
  /** Position of the aligned edge in pixels. */
  guidePos: number;
  /** Start of the guide line. */
  lineStart: number;
  /** End of the guide line. */
  lineEnd: number;
  /** How many grid units to shift the dragged widget by. */
  snapDeltaX: number;
  snapDeltaY: number;
}

/**
 * Compute alignment guides and snapped position for a widget being dragged.
 *
 * @param dragged     Current (proposed) grid position of the widget being dragged.
 * @param dragId      ID of the widget being dragged (excluded from peer checks).
 * @param widgets     All dashboard widgets.
 * @param containerWidth  Pixel width of the grid container.
 * @param tolerance   Snap tolerance in grid units.
 */
export function computeSnapGuides(
  dragged: GridPosition,
  dragId: string,
  widgets: DashboardWidget[],
  containerWidth: number,
  tolerance: number = SNAP_TOLERANCE,
): SnapResult {
  const draggedRect = gridToPixel(dragged, containerWidth);
  const tolerancePx = tolerance * ((containerWidth - 2 * CONTAINER_PADDING - (GRID_COLS - 1) * MARGIN) / GRID_COLS + MARGIN);

  const candidates: EdgeCandidate[] = [];
  const distances: DistanceLabel[] = [];

  for (const widget of widgets) {
    if (widget.id === dragId) continue;
    const other = gridToPixel(widget.position, containerWidth);

    // --- Vertical guides (x-axis snapping) ---

    // Left-to-left
    tryAlign('vertical', draggedRect.left, other.left, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
    // Left-to-right
    tryAlign('vertical', draggedRect.left, other.right, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
    // Right-to-left
    tryAlign('vertical', draggedRect.right, other.left, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
    // Right-to-right
    tryAlign('vertical', draggedRect.right, other.right, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
    // Center X
    tryAlign('vertical', draggedRect.centerX, other.centerX, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);

    // --- Horizontal guides (y-axis snapping) ---

    // Top-to-top
    tryAlign('horizontal', draggedRect.top, other.top, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
    // Top-to-bottom
    tryAlign('horizontal', draggedRect.top, other.bottom, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
    // Bottom-to-top
    tryAlign('horizontal', draggedRect.bottom, other.top, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
    // Bottom-to-bottom
    tryAlign('horizontal', draggedRect.bottom, other.bottom, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
    // Center Y
    tryAlign('horizontal', draggedRect.centerY, other.centerY, 0, 0, dragged, other, draggedRect, candidates, distances, tolerancePx);
  }

  // --- Equal spacing detection ---
  computeEqualSpacing(dragged, dragId, widgets, containerWidth, candidates, tolerancePx);

  // Apply best snap: pick closest candidate per axis
  let bestVertical: EdgeCandidate | null = null;
  let bestHorizontal: EdgeCandidate | null = null;
  let bestDistV = Infinity;
  let bestDistH = Infinity;

  for (const c of candidates) {
    if (c.axis === 'vertical') {
      const d = Math.abs(c.guidePos - (c.snapDeltaX !== 0 ? draggedRect.left : draggedRect.centerX));
      if (d < bestDistV) { bestDistV = d; bestVertical = c; }
    } else {
      const d = Math.abs(c.guidePos - (c.snapDeltaY !== 0 ? draggedRect.top : draggedRect.centerY));
      if (d < bestDistH) { bestDistH = d; bestHorizontal = c; }
    }
  }

  const snappedX = Math.max(0, Math.min(GRID_COLS - dragged.w, dragged.x + (bestVertical?.snapDeltaX ?? 0)));
  const snappedY = Math.max(0, dragged.y + (bestHorizontal?.snapDeltaY ?? 0));
  const snapped: GridPosition = { ...dragged, x: snappedX, y: snappedY };

  // Build final guide lines from best candidates
  const guides: SnapGuide[] = [];
  const snappedRect = gridToPixel(snapped, containerWidth);

  if (bestVertical && bestDistV <= tolerancePx) {
    const yMin = Math.min(snappedRect.top, ...widgets.filter((w) => w.id !== dragId).map((w) => gridToPixel(w.position, containerWidth).top));
    const yMax = Math.max(snappedRect.bottom, ...widgets.filter((w) => w.id !== dragId).map((w) => gridToPixel(w.position, containerWidth).bottom));
    guides.push({
      axis: 'vertical',
      position: bestVertical.guidePos,
      start: Math.min(yMin, snappedRect.top) - 20,
      end: Math.max(yMax, snappedRect.bottom) + 20,
    });
  }
  if (bestHorizontal && bestDistH <= tolerancePx) {
    const xMin = Math.min(snappedRect.left, ...widgets.filter((w) => w.id !== dragId).map((w) => gridToPixel(w.position, containerWidth).left));
    const xMax = Math.max(snappedRect.right, ...widgets.filter((w) => w.id !== dragId).map((w) => gridToPixel(w.position, containerWidth).right));
    guides.push({
      axis: 'horizontal',
      position: bestHorizontal.guidePos,
      start: Math.min(xMin, snappedRect.left) - 20,
      end: Math.max(xMax, snappedRect.right) + 20,
    });
  }

  // Filter distance labels to only show those relevant to active guides
  const activeDistances = distances.filter((d) => {
    if (d.axis === 'vertical' && bestVertical && bestDistV <= tolerancePx) return true;
    if (d.axis === 'horizontal' && bestHorizontal && bestDistH <= tolerancePx) return true;
    return false;
  });

  return { snapped, guides, distances: activeDistances };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function tryAlign(
  axis: GuideAxis,
  draggedEdge: number,
  otherEdge: number,
  _snapDX: number,
  _snapDY: number,
  dragged: GridPosition,
  other: PixelRect,
  draggedRect: PixelRect,
  candidates: EdgeCandidate[],
  distances: DistanceLabel[],
  tolerancePx: number,
) {
  const diff = draggedEdge - otherEdge;
  if (Math.abs(diff) <= tolerancePx) {
    const snapDeltaX = axis === 'vertical' ? Math.round(diff / (draggedRect.width / dragged.w || draggedRect.width)) : 0;
    const snapDeltaY = axis === 'horizontal' ? Math.round(diff / (draggedRect.height / dragged.h || draggedRect.height)) : 0;

    candidates.push({
      axis,
      guidePos: otherEdge,
      lineStart: axis === 'vertical' ? Math.min(draggedRect.top, other.top) : Math.min(draggedRect.left, other.left),
      lineEnd: axis === 'vertical' ? Math.max(draggedRect.bottom, other.bottom) : Math.max(draggedRect.right, other.right),
      snapDeltaX,
      snapDeltaY,
    });

    // Distance label between the two edges
    if (Math.abs(diff) > 1) {
      const midX = axis === 'vertical' ? otherEdge : (Math.min(draggedEdge, otherEdge) + Math.abs(diff) / 2);
      const midY = axis === 'horizontal' ? otherEdge : (Math.min(draggedEdge, otherEdge) + Math.abs(diff) / 2);
      distances.push({
        x: midX,
        y: midY,
        text: `${Math.abs(Math.round(diff))}px`,
        axis,
      });
    }
  }
}

function computeEqualSpacing(
  dragged: GridPosition,
  dragId: string,
  widgets: DashboardWidget[],
  containerWidth: number,
  candidates: EdgeCandidate[],
  tolerancePx: number,
) {
  const draggedRect = gridToPixel(dragged, containerWidth);
  const colW = (containerWidth - 2 * CONTAINER_PADDING - (GRID_COLS - 1) * MARGIN) / GRID_COLS;

  // Group widgets by similar Y rows (within 1 row tolerance)
  const sameRow = widgets.filter((w) => {
    if (w.id === dragId) return false;
    return Math.abs(w.position.y - dragged.y) <= 1 && Math.abs(w.position.y + w.position.h - dragged.y - dragged.h) <= 1;
  });

  if (sameRow.length >= 2) {
    // Sort by x position
    const sorted = [...sameRow].sort((a, b) => a.position.x - b.position.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const gapA = sorted[i + 1].position.x - (sorted[i].position.x + sorted[i].position.w);
      const gapB = dragged.x - (sorted[i].position.x + sorted[i].position.w);
      if (Math.abs(gapA - gapB) <= tolerancePx / colW && gapB > 0) {
        const targetX = sorted[i].position.x + sorted[i].position.w + gapA;
        if (targetX + dragged.w <= GRID_COLS) {
          const delta = targetX - dragged.x;
          const snapPx = delta * (colW + MARGIN);
          candidates.push({
            axis: 'vertical',
            guidePos: gridToPixel({ ...dragged, x: targetX }, containerWidth).left,
            lineStart: draggedRect.top - 10,
            lineEnd: draggedRect.bottom + 10,
            snapDeltaX: delta,
            snapDeltaY: 0,
          });
        }
      }
    }
  }

  // Same for horizontal spacing
  const sameCol = widgets.filter((w) => {
    if (w.id === dragId) return false;
    return Math.abs(w.position.x - dragged.x) <= 1 && Math.abs(w.position.x + w.position.w - dragged.x - dragged.w) <= 1;
  });

  if (sameCol.length >= 2) {
    const sorted = [...sameCol].sort((a, b) => a.position.y - b.position.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const gapA = sorted[i + 1].position.y - (sorted[i].position.y + sorted[i].position.h);
      const gapB = dragged.y - (sorted[i].position.y + sorted[i].position.h);
      if (Math.abs(gapA - gapB) <= tolerancePx / (ROW_HEIGHT + MARGIN) && gapB > 0) {
        const targetY = sorted[i].position.y + sorted[i].position.h + gapA;
        const delta = targetY - dragged.y;
        candidates.push({
          axis: 'horizontal',
          guidePos: gridToPixel({ ...dragged, y: targetY }, containerWidth).top,
          lineStart: draggedRect.left - 10,
          lineEnd: draggedRect.right + 10,
          snapDeltaX: 0,
          snapDeltaY: delta,
        });
      }
    }
  }
}
