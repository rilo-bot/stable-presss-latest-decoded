// ---------------------------------------------------------------------------
// Operator helpers shared by the Stories and Blog packs.
//
// The two AI studios (Story Studio, Blog Studio) are right-side drawers driven
// by a useChat hook inside the panel. An Operator action talks to them the way a
// person does — it TYPES into the drawer's composer and presses Send — and then
// needs to know when the studio has finished answering. The panels mirror their
// chat state (busy / messageCount / lastReply / error) into their UI stores for
// exactly that; `waitForStudioTurn` polls that mirror.
//
// Nothing here writes anything. Every write still happens inside the studio's
// own tool loop, through the same store calls and REST routes the UI uses.
// ---------------------------------------------------------------------------

import { agentSel } from '@/agent/operator/contracts';
import type { UiDriver } from '@/agent/operator/contracts';
import type { StudioChatMirror } from '@/stores/storyStudioUiStore';

const abortError = () => new DOMException('The Stable Hand was stopped.', 'AbortError');

/** Resolve after `ms`, or reject with an AbortError when the run is stopped. */
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

/**
 * Poll `probe` until it returns something truthy (returned) or the timeout
 * passes (null). Rejects with an AbortError when the run is stopped.
 */
export async function waitUntil<T>(
  probe: () => T | null | undefined | false,
  opts: { signal?: AbortSignal; timeoutMs?: number; intervalMs?: number } = {},
): Promise<T | null> {
  const { signal, timeoutMs = 15_000, intervalMs = 200 } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = probe();
    if (v) return v;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs, signal);
  }
}

/** Is an anchored element in the DOM right now? */
export function hasAnchor(agentId: string): boolean {
  return !!document.querySelector(agentSel(agentId));
}

/** The anchored element, if mounted. */
export function anchorEl<T extends Element = HTMLElement>(agentId: string): T | null {
  return document.querySelector<T>(agentSel(agentId));
}

/** Trim long text for a tool result (the model only needs the gist). */
export function clip(text: string, max = 3000): string {
  const t = (text ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export type StudioTurnOutcome<I> =
  | { status: 'done'; reply: string }
  | { status: 'interrupted'; reply: string; interrupt: I }
  | { status: 'error'; reply: string; error: string }
  | { status: 'timeout'; reply: string }
  | { status: 'not-started'; reply: string };

/**
 * Wait for the studio to finish the turn just sent.
 *
 * A turn can be several requests — the studio runs client tools and auto-resends
 * — so "not busy" must hold for `settleMs` before the turn counts as finished.
 * `interrupt` is checked on every tick and ends the wait early (a draft was
 * filed, or a confirm card is waiting on the human).
 */
export async function waitForStudioTurn<I>(
  read: () => StudioChatMirror,
  messageCountBefore: number,
  opts: {
    signal: AbortSignal;
    interrupt?: () => I | null | undefined;
    timeoutMs?: number;
    settleMs?: number;
  },
): Promise<StudioTurnOutcome<I>> {
  const { signal, interrupt, timeoutMs = 240_000, settleMs = 1_500 } = opts;

  // Phase 1 — the message has gone out (the user bubble lands immediately).
  const started = await waitUntil(
    () => {
      const hit = interrupt?.();
      if (hit) return true;
      const c = read();
      return c.busy || c.messageCount > messageCountBefore;
    },
    { signal, timeoutMs: 8_000 },
  );
  if (!started) return { status: 'not-started', reply: clip(read().lastReply) };

  // Phase 2 — the studio has gone quiet (and stayed quiet).
  const deadline = Date.now() + timeoutMs;
  let idleSince: number | null = null;
  for (;;) {
    const hit = interrupt?.();
    if (hit) return { status: 'interrupted', reply: clip(read().lastReply), interrupt: hit };
    const c = read();
    if (!c.busy && c.error) return { status: 'error', reply: clip(c.lastReply), error: c.error };
    if (c.busy) idleSince = null;
    else {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= settleMs) return { status: 'done', reply: clip(c.lastReply) };
    }
    if (Date.now() >= deadline) return { status: 'timeout', reply: clip(c.lastReply) };
    await sleep(250, signal);
  }
}

/** Type a message into a studio composer and press its Send button, visibly. */
export async function typeAndSend(ui: UiDriver, inputId: string, sendId: string, text: string): Promise<void> {
  await ui.type(inputId, text, { clear: true });
  // The Send button enables on the next render, once React has the text.
  await ui.waitFor(sendId, 3_000);
  await ui.click(sendId, 'Send');
}
