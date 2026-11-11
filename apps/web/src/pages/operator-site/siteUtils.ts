// ---------------------------------------------------------------------------
// Small helpers for The Stable Hand's PUBLIC SITE + MEMBER AREA pack
// (pages/operator-site/*). Nothing here writes anything: they let an action
// wait for the real UI to settle after the UiDriver drove it, and read back
// what the screen now shows, so run() returns verifiable JSON.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import { agentSel } from '@/agent/operator/contracts';
import type { UiDriver } from '@/agent/operator/contracts';

/** Latest value in a ref — run() is async and must not read a stale render. */
export function useLive<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function abortError(): Error {
  const e = new Error('Stopped by the user.');
  e.name = 'AbortError';
  return e;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Poll `pred` until true (→ true) or the timeout passes (→ false). */
export async function waitUntil(
  pred: () => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {},
): Promise<boolean> {
  const { timeoutMs = 10_000, intervalMs = 120, signal } = opts;
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) throw abortError();
    try {
      if (pred()) return true;
    } catch {
      /* half-rendered DOM — not yet */
    }
    if (Date.now() >= end) return false;
    await sleep(intervalMs, signal);
  }
}

/** The anchored element, if it is in the DOM right now. */
export function anchor<T extends HTMLElement = HTMLElement>(agentId: string): T | null {
  return document.querySelector<T>(agentSel(agentId));
}

/** Loose match key: lower-case letters and digits only. */
export function normKey(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Resolve free text against a list: exact key first, then a unique partial. */
export function resolveOne<T>(
  query: string,
  items: T[],
  keys: (item: T) => Array<string | undefined | null>,
  what: string,
  describe: (item: T) => string,
): T {
  const q = normKey(query);
  if (!q) throw new Error(`No ${what} given.`);
  const exact = items.filter((it) => keys(it).some((k) => normKey(k) === q));
  if (exact.length === 1) return exact[0];
  const pool = exact.length > 1 ? exact : items.filter((it) => keys(it).some((k) => normKey(k).includes(q)));
  if (pool.length === 1) return pool[0];
  if (pool.length > 1) {
    throw new Error(`"${query}" matches more than one ${what}: ${pool.slice(0, 8).map(describe).join('; ')}. Be more specific.`);
  }
  const sample = items.slice(0, 12).map(describe).join('; ');
  throw new Error(`No ${what} matches "${query}".${sample ? ` Available: ${sample}.` : ''}`);
}

/** Toasts that appear after this call (the app reports outcomes as toasts). */
export function watchToasts(): { collect: () => Array<{ type: string; text: string }> } {
  const seen = new Set<Element>(document.querySelectorAll('[data-sonner-toast]'));
  return {
    collect: () =>
      [...document.querySelectorAll('[data-sonner-toast]')]
        .filter((el) => !seen.has(el))
        .map((el) => ({
          type: el.getAttribute('data-type') ?? 'default',
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        }))
        .filter((t) => t.text),
  };
}

export const firstError = (t: Array<{ type: string; text: string }>) => t.find((x) => x.type === 'error')?.text;

/** Trim long text for a tool result. */
export function clip(text: string | undefined | null, max = 600): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** HTML → plain text (for block bodies). */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** ISO-ish date → YYYY-MM-DD (or null). */
export function day(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Type a query into a real search box so the list visibly filters, then wait
 * for the page to apply it. `applied` reads the page's own state.
 */
export async function typeSearch(ui: UiDriver, agentId: string, query: string, applied: () => boolean): Promise<void> {
  await ui.type(agentId, query, { clear: true });
  await waitUntil(applied, { timeoutMs: 2500, signal: ui.signal });
  await sleep(150, ui.signal);
  ui.flash(agentId);
}

/** Type into a field and make sure React holds the value (date inputs reject
 *  partial keystrokes, so those are set in one go). */
export async function typeField(ui: UiDriver, agentId: string, value: string): Promise<void> {
  const host = anchor(agentId);
  const el = (host instanceof HTMLInputElement ? host : host?.querySelector('input')) as HTMLInputElement | null;
  if (el && el.type === 'date') await ui.point(agentId, value);
  else await ui.type(agentId, value, { clear: true });
  if (el && el.value !== value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
