/* ================================================================== */
/*  LRU Cache with TTL                                                  */
/* ================================================================== */

export class LRUCache<K, V> {
  private map = new Map<K, { value: V; expiresAt: number }>();
  private order: K[] = [];

  constructor(
    private maxEntries = 100,
    private defaultTTL = 60_000,
  ) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.delete(key); return undefined; }
    this.order = this.order.filter((k) => k !== key);
    this.order.push(key);
    return entry.value;
  }

  set(key: K, value: V, ttl = this.defaultTTL): void {
    if (this.map.has(key)) this.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + ttl });
    this.order.push(key);
    if (this.order.length > this.maxEntries) {
      const oldest = this.order.shift()!;
      this.map.delete(oldest);
    }
  }

  has(key: K): boolean { return this.get(key) !== undefined; }

  delete(key: K): void { this.map.delete(key); this.order = this.order.filter((k) => k !== key); }

  clear(): void { this.map.clear(); this.order = []; }

  get size(): number { return this.map.size; }

  entries(): Array<[K, V]> {
    const now = Date.now();
    return this.order
      .filter((k) => { const e = this.map.get(k); return e && now <= e.expiresAt; })
      .map((k) => [k, this.map.get(k)!.value]);
  }
}

export const globalCache = new LRUCache<string, unknown>(200, 120_000);

/* ================================================================== */
/*  Request Deduplication / Coalescing                                  */
/* ================================================================== */

interface PendingRequest<T> {
  promise: Promise<T>;
  refCount: number;
  key: string;
}

const pendingMap = new Map<string, PendingRequest<unknown>>();

export function dedupeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = pendingMap.get(key) as PendingRequest<T> | undefined;
  if (existing) {
    existing.refCount++;
    return existing.promise;
  }

  const entry: PendingRequest<T> = {
    key,
    refCount: 1,
    promise: fn().finally(() => {
      if (--entry.refCount <= 0) pendingMap.delete(key);
    }),
  };

  pendingMap.set(key, entry as PendingRequest<unknown>);
  return entry.promise;
}

export function clearPendingRequests(): void { pendingMap.clear(); }

/* ================================================================== */
/*  Performance Monitor                                                 */
/* ================================================================== */

export interface PerfEntry {
  name: string;
  duration: number;
  timestamp: number;
  details?: Record<string, unknown>;
}

class PerfMonitor {
  private entries: PerfEntry[] = [];
  private marks = new Map<string, number>();
  private maxEntries = 500;

  mark(name: string): void { this.marks.set(name, performance.now()); }

  measure(name: string, startMark?: string, details?: Record<string, unknown>): number {
    const start = startMark ? this.marks.get(startMark) : this.marks.get(name);
    const end = performance.now();
    const duration = start !== undefined ? end - start : 0;
    this.marks.delete(name);
    if (startMark) this.marks.delete(startMark);
    this.entries.push({ name, duration, timestamp: Date.now(), details });
    if (this.entries.length > this.maxEntries) this.entries = this.entries.slice(-this.maxEntries);
    return duration;
  }

  getEntries(name?: string): PerfEntry[] {
    return name ? this.entries.filter((e) => e.name === name) : [...this.entries];
  }

  getAverage(name: string): number {
    const matching = this.entries.filter((e) => e.name === name);
    if (matching.length === 0) return 0;
    return matching.reduce((sum, e) => sum + e.duration, 0) / matching.length;
  }

  getStats(): { totalEntries: number; avgByType: Record<string, number>; slowest: PerfEntry[] } {
    const nameSet = new Set(this.entries.map((e) => e.name));
    const avgByType: Record<string, number> = {};
    nameSet.forEach((n) => { avgByType[n] = this.getAverage(n); });
    return {
      totalEntries: this.entries.length,
      avgByType,
      slowest: [...this.entries].sort((a, b) => b.duration - a.duration).slice(0, 10),
    };
  }

  clear(): void { this.entries = []; this.marks.clear(); }
}

export const perfMonitor = new PerfMonitor();

/* ================================================================== */
/*  React Memoization Helpers                                           */
/* ================================================================== */

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';

export function useStableCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T;
}

export function useShallowCompare<T>(value: T): T {
  const ref = useRef(value);
  if (!shallowEqual(ref.current, value)) ref.current = value;
  return ref.current;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useThrottled<T extends (...args: never[]) => unknown>(fn: T, delay: number): T {
  const lastCall = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall.current >= delay) {
      lastCall.current = now;
      fn(...args);
    } else {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastCall.current = Date.now();
        fn(...args);
      }, delay - (now - lastCall.current));
    }
  }, [fn, delay]) as T;
}

/* ================================================================== */
/*  FPS Counter                                                         */
/* ================================================================== */

export function useFPS(): number {
  const [fps, setFps] = useState(0);
  const frames = useRef<number[]>([]);

  useEffect(() => {
    let active = true;
    let rafId: number;
    const loop = (time: number) => {
      if (!active) return;
      frames.current.push(time);
      const cutoff = time - 1000;
      frames.current = frames.current.filter((t) => t > cutoff);
      setFps(frames.current.length);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => { active = false; cancelAnimationFrame(rafId); };
  }, []);

  return fps;
}

/* ================================================================== */
/*  Memory Usage                                                        */
/* ================================================================== */

export function useMemoryUsage(): { used: number; total: number; limit: number } | null {
  const [memory, setMemory] = useState<{ used: number; total: number; limit: number } | null>(null);

  useEffect(() => {
    const mem = (performance as Record<string, unknown>)['memory'] as { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } | undefined;
    if (!mem) return;
    const update = () => setMemory({ used: mem.usedJSHeapSize, total: mem.totalJSHeapSize, limit: mem.jsHeapSizeLimit });
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, []);

  return memory;
}

/* ================================================================== */
/*  Render Counter Hook                                                 */
/* ================================================================== */

export function useRenderCount(componentName: string): number {
  const count = useRef(0);
  count.current++;
  if (process.env.NODE_ENV === 'development') {
    perfMonitor.measure(`render:${componentName}`, undefined, { count: count.current });
  }
  return count.current;
}

/* ================================================================== */
/*  Web Worker Wrapper                                                  */
/* ================================================================== */

export class TypedWorker<TInput, TOutput> {
  private worker: Worker | null = null;
  private pendingMap = new Map<string, { resolve: (v: TOutput) => void; reject: (e: Error) => void }>();

  constructor(private factory: () => Worker) {}

  run(input: TInput): Promise<TOutput> {
    if (!this.worker) this.worker = this.factory();
    return new Promise<TOutput>((resolve, reject) => {
      const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.pendingMap.set(id, { resolve, reject });
      this.worker!.postMessage({ id, input });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingMap.forEach((p) => p.reject(new Error('Worker terminated')));
    this.pendingMap.clear();
  }

  get isRunning(): boolean { return this.pendingMap.size > 0; }
}
