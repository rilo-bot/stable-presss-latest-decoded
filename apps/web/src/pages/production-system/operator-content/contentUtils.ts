// ---------------------------------------------------------------------------
// Shared bits for the CONTENT packs (Podcast, Instant Capture, Site Content).
//
// The generic helpers (useLive, waitUntil, toasts, name resolution) live in
// operator-team/opUtils and are re-exported here so each pack imports from one
// place. Nothing in this file writes anything.
// ---------------------------------------------------------------------------

import type { UiDriver } from '@/agent/operator/contracts';
import { anchor, sleep, waitUntil, watchToasts, firstError } from '../operator-team/opUtils';

export { anchor, firstError, normKey, resolveOne, sleep, useLive, waitUntil, watchToasts } from '../operator-team/opUtils';

/** Is the anchored element in the DOM right now? */
export const has = (agentId: string): boolean => anchor(agentId) !== null;

/** Click an anchor only if it is on screen; true when it was clicked. */
export async function clickIf(ui: UiDriver, agentId: string, label?: string): Promise<boolean> {
  if (!has(agentId)) return false;
  await ui.click(agentId, label);
  return true;
}

/**
 * After a click that fires an OPTIMISTIC store write: wait for the store to
 * show the change, then for the request to come back — the stores roll the
 * change back and raise an error toast when the server refuses it. Throws with
 * the app's own error text.
 *
 * `answered` (from watchRecord) says when the server's reply has landed in the
 * store; without it a fixed grace period stands in for that, which a slow
 * request can outlast.
 */
export async function settleOptimistic(
  ui: UiDriver,
  done: () => boolean,
  what: string,
  toasts: ReturnType<typeof watchToasts>,
  graceMs = 1200,
  answered?: () => boolean,
): Promise<void> {
  const ok = await waitUntil(() => done() || !!firstError(toasts.collect()), { timeoutMs: 8_000, signal: ui.signal });
  const err = firstError(toasts.collect());
  if (err) throw new Error(err);
  if (!ok) throw new Error(`${what} did not take effect — check the screen.`);
  if (answered) {
    const back = await waitUntil(() => answered() || !!firstError(toasts.collect()), { timeoutMs: 20_000, signal: ui.signal });
    if (!back && !firstError(toasts.collect())) throw new Error(`${what}: the server has not answered yet — check the screen in a moment.`);
  } else {
    await sleep(graceMs, ui.signal);
  }
  const late = firstError(toasts.collect());
  if (late) throw new Error(late);
  if (!done()) throw new Error(`${what} was rolled back (the server refused it).`);
}

/**
 * Watch one record's copy in a zustand store, from BEFORE an optimistic write.
 * The write swaps the record twice — the optimistic copy, then the server's
 * copy (or the rollback to the old one) — so `answered()` turns true once the
 * optimistic copy has itself been replaced. Subscribed, not polled: both swaps
 * can land inside one poll. Call `stop()` when done.
 */
export function watchRecord<S, T>(
  store: { getState: () => S; subscribe: (listener: (state: S) => void) => () => void },
  pick: (state: S) => T | undefined,
): { answered: () => boolean; stop: () => void } {
  let last = pick(store.getState());
  let swaps = 0;
  const stop = store.subscribe((state) => {
    const cur = pick(state);
    if (cur !== last) {
      last = cur;
      swaps += 1;
    }
  });
  return { answered: () => swaps >= 2, stop };
}

/** "a, b and c" for confirm cards. */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Trim long user text for a confirm card. */
export const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
