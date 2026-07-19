import { useCallback, useRef, useState, useMemo, useEffect, memo } from 'react';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  width?: number | string;
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  className?: string;
  overscan?: number;
  onScroll?: (scrollTop: number) => void;
  keyExtractor?: (item: T, index: number) => string;
}

/* ================================================================== */
/*  VirtualList                                                         */
/* ================================================================== */

function VirtualListComponent<T>({
  items, itemHeight, height, width = '100%', renderItem, className = '', overscan = 3, onScroll, keyExtractor,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = useMemo(() => items.length * itemHeight, [items.length, itemHeight]);
  const startIndex = useMemo(() => Math.max(0, Math.floor(scrollTop / itemHeight) - overscan), [scrollTop, itemHeight, overscan]);
  const endIndex = useMemo(() => Math.min(items.length - 1, Math.ceil((scrollTop + height) / itemHeight) + overscan), [items.length, scrollTop, height, itemHeight, overscan]);
  const visibleItems = useMemo(() => items.slice(startIndex, endIndex + 1), [items, startIndex, endIndex]);

  const handleScroll = useCallback(() => {
    const st = containerRef.current?.scrollTop ?? 0;
    setScrollTop(st);
    onScroll?.(st);
  }, [onScroll]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div ref={containerRef} className={`pg-virtual-list ${className}`} style={{ height, width, overflow: 'auto' }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const index = startIndex + i;
          const key = keyExtractor ? keyExtractor(item, index) : String(index);
          const style: React.CSSProperties = { position: 'absolute', top: index * itemHeight, left: 0, right: 0, height: itemHeight };
          return <div key={key} style={style}>{renderItem(item, index, style)}</div>;
        })}
      </div>
    </div>
  );
}

export const VirtualList = memo(VirtualListComponent) as typeof VirtualListComponent;

/* ================================================================== */
/*  VirtualTable – table with virtualized rows                         */
/* ================================================================== */

export interface VirtualTableProps {
  columns: Array<{ key: string; label: string; width?: number; render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode }>;
  data: Array<Record<string, unknown>>;
  rowHeight?: number;
  height: number;
  className?: string;
}

export const VirtualTable = memo(function VirtualTable({ columns, data, rowHeight = 32, height, className = '' }: VirtualTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 5;

  const totalHeight = useMemo(() => data.length * rowHeight, [data.length, rowHeight]);
  const startIdx = useMemo(() => Math.max(0, Math.floor(scrollTop / rowHeight) - overscan), [scrollTop, rowHeight, overscan]);
  const endIdx = useMemo(() => Math.min(data.length - 1, Math.ceil((scrollTop + height) / rowHeight) + overscan), [data.length, scrollTop, height, rowHeight, overscan]);
  const visible = useMemo(() => data.slice(startIdx, endIdx + 1), [data, startIdx, endIdx]);

  return (
    <div className={`pg-virtual-table-wrap ${className}`} style={{ height, overflow: 'hidden', border: '1px solid var(--pg-line)', borderRadius: 8 }}>
      <div className="pg-virtual-table-header" style={{ display: 'flex', borderBottom: '1px solid var(--pg-line)', background: 'var(--pg-surface)', position: 'sticky', top: 0, zIndex: 2 }}>
        {columns.map((col) => (
          <div key={col.key} style={{ flex: col.width ? `0 0 ${col.width}px` : '1 1 0', padding: '6px 10px', font: '600 11px/1 Inter,ui-sans-serif,system-ui,sans-serif', color: 'var(--pg-muted)', borderRight: '1px solid var(--pg-line)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {col.label}
          </div>
        ))}
      </div>
      <div ref={containerRef} onScroll={() => setScrollTop(containerRef.current?.scrollTop ?? 0)} style={{ height: height - 36, overflow: 'auto' }}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visible.map((row, i) => {
            const idx = startIdx + i;
            return (
              <div key={idx} style={{ position: 'absolute', top: idx * rowHeight, left: 0, right: 0, height: rowHeight, display: 'flex', borderBottom: '1px solid var(--pg-line)', background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.02)' }}>
                {columns.map((col) => (
                  <div key={col.key} style={{ flex: col.width ? `0 0 ${col.width}px` : '1 1 0', padding: '6px 10px', font: '400 11px/1 Inter,ui-sans-serif,system-ui,sans-serif', color: 'var(--pg-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="pg-virtual-table-footer" style={{ padding: '4px 10px', borderTop: '1px solid var(--pg-line)', background: 'var(--pg-surface)', font: '400 10px/1 Inter,ui-sans-serif,system-ui,sans-serif', color: 'var(--pg-muted)' }}>
        {data.length.toLocaleString()} rows
      </div>
    </div>
  );
});

/* ================================================================== */
/*  useVirtualization Hook                                              */
/* ================================================================== */

export function useVirtualization(itemCount: number, itemHeight: number, containerHeight: number, overscan = 3) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(itemCount - 1, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
  const offsetY = startIndex * itemHeight;
  const totalHeight = itemCount * itemHeight;

  const scrollToIndex = useCallback((index: number) => {
    const el = containerRef.current;
    if (el) el.scrollTop = index * itemHeight;
  }, [itemHeight]);

  const visibleRange = useMemo(() => ({ start: startIndex, end: endIndex, offsetY, totalHeight }), [startIndex, endIndex, offsetY, totalHeight]);

  return { containerRef, scrollTop, setScrollTop, visibleRange, scrollToIndex, totalHeight };
}
