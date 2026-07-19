/* ================================================================== */
/*  Shared utilities                                                    */
/*  Single source of truth for helpers used across multiple services    */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Identity & Time                                                     */
/* ------------------------------------------------------------------ */

export const uid = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};
export const now = (): string => new Date().toISOString();

/** Cryptographically secure random token. */
export function secureToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/* ------------------------------------------------------------------ */
/*  localStorage persistence                                            */
/* ------------------------------------------------------------------ */

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn(`[Storage] Quota exceeded for key "${key}". Consider pruning old data.`);
    }
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function formatTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString() : '-';
}

export function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)} \u03bcs` : `${ms.toFixed(1)} ms`;
}

/** Best-precision relative time: seconds → minutes → hours → days → locale date. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const totalSeconds = Math.floor(diff / 1000);
  if (totalSeconds < 60) return 'just now';
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ago`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}h ago`;
  const totalDays = Math.floor(totalHours / 24);
  return totalDays < 30 ? `${totalDays}d ago` : new Date(iso).toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/*  Color constants                                                     */
/* ------------------------------------------------------------------ */

/** Standard palette used by charts and UI indicators. */
export const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'] as const;

const SEMVERITY_MAP: Record<string, string> = {
  critical: '#dc2626',
  error: '#ef4444',
  warn: '#f59e0b',
  warning: '#f59e0b',
  info: '#3b82f6',
  debug: '#94a3b8',
};

const STATUS_MAP: Record<string, string> = {
  healthy: '#10b981',
  active: '#10b981',
  approved: '#10b981',
  resolved: '#10b981',
  degraded: '#f59e0b',
  inactive: '#f59e0b',
  pending: '#f59e0b',
  trial: '#f59e0b',
  loading: '#3b82f6',
  down: '#ef4444',
  suspended: '#ef4444',
  revoked: '#ef4444',
  expired: '#ef4444',
  rejected: '#ef4444',
  error: '#ef4444',
  cancelled: '#6b7280',
  archived: '#6b7280',
  inactive_: '#6b7280',
};

export function severityColor(severity: string): string {
  return SEMVERITY_MAP[severity] ?? '#94a3b8';
}

export function statusColor(status: string): string {
  return STATUS_MAP[status] ?? '#94a3b8';
}

/* ------------------------------------------------------------------ */
/*  Class name helper                                                   */
/* ------------------------------------------------------------------ */

/** Builds a conditional class string, filtering out falsy values. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
