import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { perfMonitor, useFPS, useMemoryUsage, globalCache, type PerfEntry } from './perf-utils';
import { formatBytes, formatMs } from './utils';

/* ================================================================== */
/*  PerfMonitorPanel                                                    */
/* ================================================================== */

export function PerfMonitorPanel() {
  const [, setTick] = useState(0);
  const fps = useFPS();
  const memory = useMemoryUsage();
  const [expanded, setExpanded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    intervalRef.current = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const stats = useMemo(() => perfMonitor.getStats(), [expanded]);
  const entries = useMemo(() => perfMonitor.getEntries().slice(-50).reverse(), [expanded]);

  return (
    <div className="pm-root">
      <button className="pm-toggle" onClick={() => setExpanded(!expanded)}>
        <span className="pm-fps">{fps} FPS</span>
        {memory && <span className="pm-mem">{formatBytes(memory.used)}</span>}
        <span className="pm-cache">{globalCache.size} cached</span>
        <span className="pm-arrow">{expanded ? '\u25b4' : '\u25be'}</span>
      </button>
      {expanded && (
        <div className="pm-dropdown">
          <div className="pm-section">
            <h5>System</h5>
            <div className="pm-grid">
              <div className="pm-stat"><span className="pm-val">{fps}</span><span className="pm-lbl">FPS</span></div>
              {memory && <>
                <div className="pm-stat"><span className="pm-val">{formatBytes(memory.used)}</span><span className="pm-lbl">JS Heap</span></div>
                <div className="pm-stat"><span className="pm-val">{formatBytes(memory.total)}</span><span className="pm-lbl">Total</span></div>
                <div className="pm-stat"><span className="pm-val">{formatBytes(memory.limit)}</span><span className="pm-lbl">Limit</span></div>
              </>}
              <div className="pm-stat"><span className="pm-val">{globalCache.size}</span><span className="pm-lbl">Cache</span></div>
            </div>
          </div>
          {Object.keys(stats.avgByType).length > 0 && (
            <div className="pm-section">
              <h5>Average Render Times</h5>
              <div className="pm-list">
                {Object.entries(stats.avgByType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, avg]) => (
                  <div key={name} className="pm-row"><span className="pm-name">{name.replace('render:', '')}</span><span className="pm-dur">{formatMs(avg)}</span></div>
                ))}
              </div>
            </div>
          )}
          {stats.slowest.length > 0 && (
            <div className="pm-section">
              <h5>Recent Operations</h5>
              <div className="pm-list">
                {entries.slice(0, 10).map((e, i) => (
                  <div key={i} className="pm-row"><span className="pm-name">{e.name}</span><span className="pm-dur">{formatMs(e.duration)}</span></div>
                ))}
              </div>
            </div>
          )}
          <button className="pm-clear" onClick={() => { perfMonitor.clear(); globalCache.clear(); setTick((n) => n + 1); }}>Clear metrics</button>
        </div>
      )}
    </div>
  );
}
