// ---------------------------------------------------------------------------
// Native browser dialogs (window.confirm / alert / prompt) during an Operator run.
//
// Several app buttons guard themselves with window.confirm() — Delete magazine,
// Start over, the page rail's 🗑, delete blog post. A native dialog BLOCKS the
// page's JS thread, so the Operator (which lives in the same page) can never
// answer one: the run would hang behind a modal the user did not ask for. So
// while a run is active this module swaps in non-blocking stand-ins:
//
//   confirm(message)  → true ONLY when the current step was pre-approved by the
//                       user through a confirm card (grantPreApproval, set by
//                       clientTools when a confirm card resolves OK); otherwise
//                       false — the app treats it exactly like the user pressing
//                       Cancel. Either way the message is recorded.
//   alert(message)    → recorded, returns.
//   prompt(message)   → recorded, returns null (= Cancel). The Operator cannot
//                       type into a native prompt.
//
// Records are attributed to the tool call running when they fire (a "scope"),
// so the click tool can say "the app asked for confirmation; it was declined
// automatically", and the NEXT click on the same element turns the app's own
// message into a confirm card (declinedMessagesFor). Records that fire outside
// any tool call (an async confirm after a fetch) are queued and handed to the
// next tool result (takeUnreported).
//
// The originals are restored the moment the run goes idle, and while it is
// PAUSED (the user took over — their own click paused the run before its click
// handler ran) the real dialogs are used, so a person's own click is never
// answered for them.
// ---------------------------------------------------------------------------

import { useOperator } from '../operatorStore';

export interface NativeDialogRecord {
  type: 'confirm' | 'alert' | 'prompt';
  message: string;
  /** confirm: accepted / declined; alert: shown; prompt: unanswered (null). */
  result: 'accepted' | 'declined' | 'shown' | 'unanswered';
  /** confirm accepted because the user OK'd a confirm card for this step. */
  preApproved?: boolean;
  at: number;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

// ── pre-approval ─────────────────────────────────────────────────────────────

interface Approval {
  /** null = any confirm (a confirm card for the whole step was OK'd); else only
   *  these exact messages (the card showed the app's own wording). */
  match: string[] | null;
  /** Valid until this time; Infinity while the step that owns it runs. */
  until: number;
  /** The tool call it was granted in — it never outlives that call by more
   *  than the grace below, even if nobody releases it. */
  scope: ToolScope | null;
}

let approval: Approval | null = null;
const SCOPE_END_GRACE_MS = 1500;

/**
 * The user OK'd a confirm card: native confirms raised by this step answer OK.
 * Returns release(graceMs) — call it when the step finishes; the approval then
 * survives `graceMs` more for a confirm that follows asynchronously (after a
 * request), and is gone after that. (UiDriver.confirm grants one on every OK;
 * the end of the tool call caps any approval still open.)
 */
export function grantPreApproval(opts: { messages?: string[] } = {}): (graceMs?: number) => void {
  const mine: Approval = { match: opts.messages ? opts.messages.map(norm) : null, until: Infinity, scope };
  approval = mine;
  return (graceMs = 0) => {
    if (approval !== mine) return;
    if (graceMs <= 0) approval = null;
    else mine.until = Date.now() + graceMs;
  };
}

function isApproved(message: string): boolean {
  const a = approval;
  if (!a) return false;
  if (Date.now() > a.until) {
    approval = null;
    return false;
  }
  return a.match === null || a.match.includes(norm(message));
}

// ── scopes (one per client tool call) ────────────────────────────────────────

export interface ToolScope {
  tool: string;
  agentId?: string;
  el?: Element | null;
  /** controlKeys() of the clicked control (click scopes). */
  keys?: string[];
  records: NativeDialogRecord[];
}

let scope: ToolScope | null = null;

export function beginToolScope(tool: string, agentId?: string, el?: Element | null): ToolScope {
  const s: ToolScope = { tool, agentId, el, records: [] };
  scope = s;
  return s;
}

export function endToolScope(s: ToolScope): NativeDialogRecord[] {
  if (scope === s) scope = null;
  if (approval && approval.scope === s && approval.until === Infinity) {
    approval.until = Date.now() + SCOPE_END_GRACE_MS;
  }
  return s.records;
}

// Records outside any tool call, for the next tool result. Short-lived: a
// leftover from a run long ago would only confuse the model.
const UNREPORTED_TTL_MS = 5 * 60_000;
let unreported: NativeDialogRecord[] = [];

export function takeUnreported(): NativeDialogRecord[] {
  const now = Date.now();
  const out = unreported.filter((r) => now - r.at < UNREPORTED_TTL_MS);
  unreported = [];
  return out;
}

// ── per-element memory of declined confirms ─────────────────────────────────
//
// Click 1 on "Start over…" → the app's confirm is declined automatically and
// remembered here against the element. Click 2 on it → clientTools shows the
// user a confirm card with the app's own message; on OK that exact message is
// pre-approved and the click goes through.

const MEMORY_TTL_MS = 10 * 60_000;
/** A confirm that fires this long after a click (no tool running) is
 *  attributed to that click — e.g. a second confirm after a server refusal. */
const LATE_ATTRIBUTION_MS = 10_000;

interface Memory {
  messages: string[];
  at: number;
}
/** Keyed by the element, by its anchor id, and by "<path>|<label>" — a control
 *  inside a menu is a NEW element (and a new ref:N) every time the menu opens,
 *  so the label is what carries the memory across "reopen the menu, click again". */
const byEl = new WeakMap<Element, Memory>();
const byKey = new Map<string, Memory>();
let lastClick: { el: Element | null; keys: string[]; at: number } | null = null;

/** The string keys a control is remembered under (see above). */
export function controlKeys(agentId: string, label: string): string[] {
  const keys = [`label:${window.location.pathname}|${label.trim().toLowerCase()}`];
  if (!agentId.startsWith('ref:')) keys.unshift(`id:${agentId}`);
  return label.trim() ? keys : keys.filter((k) => k.startsWith('id:'));
}

/** clientTools calls this right before the click tool dispatches its click. */
export function noteClick(el: Element | null, keys: string[]): void {
  lastClick = { el, keys, at: Date.now() };
}

function remember(el: Element | null | undefined, keys: string[] | undefined, message: string): void {
  const add = (m: Memory | undefined): Memory => {
    const fresh = m && Date.now() - m.at < MEMORY_TTL_MS ? m : { messages: [], at: Date.now() };
    if (!fresh.messages.includes(message)) fresh.messages.push(message);
    fresh.at = Date.now();
    return fresh;
  };
  if (el) byEl.set(el, add(byEl.get(el)));
  for (const k of keys ?? []) byKey.set(k, add(byKey.get(k)));
}

/** App confirm messages auto-declined for this control lately. */
export function declinedMessagesFor(el: Element | null, keys: string[]): string[] {
  const now = Date.now();
  const m = (el && byEl.get(el)) || keys.map((k) => byKey.get(k)).find(Boolean);
  if (!m || now - m.at > MEMORY_TTL_MS) return [];
  return [...m.messages];
}

export function forgetDeclined(el: Element | null, keys: string[]): void {
  if (el) byEl.delete(el);
  for (const k of keys) byKey.delete(k);
}

// ── the stand-ins ───────────────────────────────────────────────────────────

type Originals = { confirm: typeof window.confirm; alert: typeof window.alert; prompt: typeof window.prompt };
let originals: Originals | null = null;
let patched: Originals | null = null;

function record(r: Omit<NativeDialogRecord, 'at'>): void {
  const full: NativeDialogRecord = { ...r, at: Date.now() };
  if (scope) scope.records.push(full);
  else {
    unreported.push(full);
    if (unreported.length > 10) unreported = unreported.slice(-10);
  }
  if (r.type === 'confirm' && r.result === 'declined') {
    if (scope?.tool === 'click') remember(scope.el, scope.keys, r.message);
    // Not inside a click (between calls, or during a readScreen / wait): a late
    // question from the last click — e.g. after the server refused the first
    // attempt. A named action's own confirms are its business, not a click's.
    else if (scope?.tool !== 'runAction' && lastClick && Date.now() - lastClick.at < LATE_ATTRIBUTION_MS) {
      remember(lastClick.el, lastClick.keys, r.message);
    }
  }
}

/** The user is in control (took over) → the real dialog, answered by them. */
const userInControl = () => useOperator.getState().status === 'paused';

function makeStandIns(orig: Originals): Originals {
  const confirm = (message?: unknown): boolean => {
    if (userInControl()) return orig.confirm.call(window, message as string);
    const msg = String(message ?? '');
    const ok = isApproved(msg);
    record({ type: 'confirm', message: msg, result: ok ? 'accepted' : 'declined', ...(ok ? { preApproved: true } : {}) });
    return ok;
  };
  const alert = (message?: unknown): void => {
    if (userInControl()) return orig.alert.call(window, message as string);
    record({ type: 'alert', message: String(message ?? ''), result: 'shown' });
  };
  const prompt = (message?: unknown, _default?: unknown): string | null => {
    if (userInControl()) return orig.prompt.call(window, message as string, _default as string);
    record({ type: 'prompt', message: String(message ?? ''), result: 'unanswered' });
    return null;
  };
  return { confirm, alert, prompt } as Originals;
}

function patch(): void {
  if (patched) return;
  originals = { confirm: window.confirm, alert: window.alert, prompt: window.prompt };
  patched = makeStandIns(originals);
  window.confirm = patched.confirm;
  window.alert = patched.alert;
  window.prompt = patched.prompt;
}

function restore(): void {
  if (!patched || !originals) return;
  // Only put back what is still ours — never clobber someone else's later patch.
  if (window.confirm === patched.confirm) window.confirm = originals.confirm;
  if (window.alert === patched.alert) window.alert = originals.alert;
  if (window.prompt === patched.prompt) window.prompt = originals.prompt;
  patched = null;
  originals = null;
  approval = null;
  scope = null;
}

/**
 * Install once (the panel does, next to the takeover guard). Patches while a
 * run is active, restores when it goes idle. Returns an uninstaller.
 */
export function installNativeDialogs(): () => void {
  const sync = (status: string) => (status === 'idle' ? restore() : patch());
  sync(useOperator.getState().status);
  const unsub = useOperator.subscribe((s, prev) => {
    if (s.status !== prev.status) sync(s.status);
  });
  return () => {
    unsub();
    restore();
  };
}

/** Records → the compact shape tool results carry (`appDialogs`). */
export function describeDialogs(records: NativeDialogRecord[]): Array<Record<string, unknown>> {
  return records.map((r) => {
    if (r.type === 'confirm') {
      return {
        type: 'confirm',
        message: r.message.slice(0, 600),
        answered: r.result === 'accepted' ? 'OK (the user approved this step)' : 'Cancel (declined automatically)',
      };
    }
    if (r.type === 'prompt') {
      return { type: 'prompt', message: r.message.slice(0, 600), answered: 'Cancel — The Stable Hand cannot type into a browser prompt; ask the user to do this step themselves.' };
    }
    return { type: 'alert', message: r.message.slice(0, 600) };
  });
}
