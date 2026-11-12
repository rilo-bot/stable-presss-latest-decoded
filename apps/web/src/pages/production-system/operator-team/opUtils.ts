// ---------------------------------------------------------------------------
// Small helpers shared by the Operator packs for the Team, Registers and
// Profile/Horse Studio screens (useTeamOperatorActions, useRolesOperatorActions,
// useRegisterOperatorActions, agent/profile/useStudioOperatorActions).
//
// None of these write anything. They let an action WAIT for the real UI to
// settle after the UiDriver clicked it (a store to refresh, a dialog to close,
// a toast to appear) and read back what happened, so run() can return
// verifiable JSON instead of guessing.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import { agentSel } from '@/agent/operator/contracts';
import { quoteRef } from '@/agent/operator/runtime/humanRef';

/** Keep the latest value in a ref — run() is async and must not read a stale
 *  render's props after an await. */
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

/** Poll `pred` until true (→ true) or the timeout passes (→ false). Throws an
 *  AbortError if the run is stopped. */
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
      /* a predicate reading half-rendered DOM — treat as not yet */
    }
    if (Date.now() >= end) return false;
    await sleep(intervalMs, signal);
  }
}

/** The anchored element, if it is in the DOM right now. */
export function anchor(agentId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(agentSel(agentId));
}

/** Loose key for matching names typed by a person or a model: lower-case,
 *  letters and digits only ("Sub-Editor" ≡ "sub editor" ≡ "sub_editor"). */
export function normKey(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Resolve free text against a list by an exact key first, then a unique
 *  partial match. Returns { hit } or { error } naming the candidates. */
export function resolveOne<T>(
  query: string,
  items: T[],
  keys: (item: T) => Array<string | undefined | null>,
  what: string,
  describe: (item: T) => string,
): { hit: T; error?: undefined } | { hit?: undefined; error: string } {
  const q = normKey(query);
  if (!q) return { error: `No ${what} given.` };
  const exact = items.filter((it) => keys(it).some((k) => normKey(k) === q));
  if (exact.length === 1) return { hit: exact[0] };
  if (exact.length > 1) {
    return { error: `${quoteRef(query, 'That id')} matches more than one ${what}: ${exact.slice(0, 8).map(describe).join('; ')}. Be more specific.` };
  }
  const partial = items.filter((it) => keys(it).some((k) => normKey(k).includes(q)));
  if (partial.length === 1) return { hit: partial[0] };
  if (partial.length > 1) {
    return { error: `${quoteRef(query, 'That id')} matches more than one ${what}: ${partial.slice(0, 8).map(describe).join('; ')}. Be more specific.` };
  }
  const sample = items.slice(0, 12).map(describe).join('; ');
  return { error: `No ${what} matches ${quoteRef(query)}.${sample ? ` Available: ${sample}.` : ''}` };
}

/**
 * Watch the sonner toaster. Call before driving the UI, then `collect()` after:
 * returns only toasts that appeared since — the app reports most outcomes
 * ("Invitation emailed to …", "Could not change the role.") as a toast, so this
 * is how an action reads back what the screen told the user.
 */
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

/** The first error toast's text in a collected batch, if any. */
export function firstError(toasts: Array<{ type: string; text: string }>): string | undefined {
  return toasts.find((t) => t.type === 'error')?.text;
}
