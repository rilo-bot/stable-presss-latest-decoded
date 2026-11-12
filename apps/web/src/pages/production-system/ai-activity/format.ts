/**
 * AI Activity — number and time formatting, shared by the AI Activity screens
 * and the Stable Hand run log (StablehandActivityScreen).
 */
import { SIDE_NAV, navPath } from '../../newsroom/constants';

export function usd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n >= 10_000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

export function tokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function duration(ms: number): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return rest ? `${m}m ${rest}s` : `${m}m`;
}

export const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
export const DAY_UTC = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const FULL_DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** "Today 14:05", "Yesterday 09:12", "Nov 3, 16:40". */
export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return `Today ${TIME.format(d)}`;
  if (d.getTime() >= startOfToday - 86_400_000) return `Yesterday ${TIME.format(d)}`;
  return `${DAY.format(d)}, ${TIME.format(d)}`;
}

/** "3 min ago", "5 h ago", "4 days ago" — for a card's "last used". */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'Never';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86_400);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

export function fullDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : FULL_DAY.format(d);
}

/** `anthropic/claude-sonnet-5.5` → `claude-sonnet-5.5`. */
export const shortModel = (m: string) => m.split('/').pop() || m;

/** A production-system path reads as its sidebar label; anything else as the path. */
export function screenName(path: string): string {
  if (!path) return '—';
  const clean = path.split(/[?#]/)[0];
  const item = SIDE_NAV.find((i) => clean === navPath(i) || clean.startsWith(`${navPath(i)}/`));
  if (item) return clean === navPath(item) ? item.label : `${item.label} ›`;
  return clean;
}

export function cacheLine(t: { inputTokens: number; cachedInputTokens: number }): string {
  if (t.inputTokens === 0) return 'No input yet';
  const pct = Math.round((t.cachedInputTokens / t.inputTokens) * 100);
  return `${pct}% of input served from cache`;
}
