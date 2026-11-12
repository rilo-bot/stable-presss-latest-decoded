// ---------------------------------------------------------------------------
// Operator client tools — what the panel calls for every operator tool call the
// model makes (the server declares these tools WITHOUT `execute`; the browser
// runs them and streams the result back).
//
// The input/output shapes are the contract in contracts.ts (OPERATOR_CLIENT_TOOLS)
// and must stay in step with apps/server/src/lib/agent/operator/tools.ts.
//
// Design rules:
//   • NEVER throw. Every failure becomes { ok:false, error } written for the
//     model: say what went wrong and how to recover (what IS on this screen),
//     so it can self-correct instead of the run dying.
//   • Every tool call shows up in the step timeline in plain words, so the user
//     can follow along and see where something failed.
//   • Named actions (runAction) are the preferred path; click/type/select are
//     the fallback for anything a pack has not wrapped yet.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { AGENT_CONFIRM_ATTR, OPERATOR_CLIENT_TOOLS, humanizeActionName, type ActionOutcome, type UiDriver } from '../contracts';
// Pure path → "Magazine Builder" naming (no imports of its own), shared with the
// panel so the pill and the step list name a screen the same way.
import { shortPageName } from '../panel/pageContext';
import { useOperator } from '../operatorStore';
import { getAction, listActions } from './registry';
import { createUiDriver } from './uiDriver';
import { readScreen, pageTitle } from './snapshot';
import { findAgentEl, formControlOf, isAbortError, labelForId, labelOf } from './dom';
import {
  beginToolScope,
  controlKeys,
  declinedMessagesFor,
  describeDialogs,
  endToolScope,
  forgetDeclined,
  grantPreApproval,
  noteClick,
  takeUnreported,
  type NativeDialogRecord,
  type ToolScope,
} from './nativeDialogs';
import { pickAttachment, uploadToInput } from './upload';

type Fail = { ok: false; error: string; declined?: boolean };

const STOPPED: Fail = { ok: false, error: 'Stopped by the user.' };
const MAX_RESULT_CHARS = 20_000;

let driver: UiDriver | null = null;
const ui = (): UiDriver => (driver ??= createUiDriver());

export function isOperatorClientTool(name: string): boolean {
  return (OPERATOR_CLIENT_TOOLS as readonly string[]).includes(name);
}

// ── helpers ──────────────────────────────────────────────────────────────────

const errMsg = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.');

function formatIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  return issues
    .slice(0, 8)
    .map((i) => `${i.path.length ? i.path.map(String).join('.') : '(args)'}: ${i.message}`)
    .join('; ');
}

/** Results go back to the model as JSON: drop functions / DOM nodes, break
 *  cycles, and cap size so one action cannot blow the context window. */
function jsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || typeof v === 'boolean' || typeof v === 'number') {
      return typeof v === 'number' && !Number.isFinite(v) ? null : v;
    }
    if (typeof v === 'string') return v.length > 4000 ? `${v.slice(0, 4000)}…` : v;
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'undefined' || typeof v === 'function' || typeof v === 'symbol') return undefined;
    if (typeof Node !== 'undefined' && v instanceof Node) {
      const id = v instanceof Element ? v.getAttribute('data-agent-id') : null;
      return id ? `[element ${id}]` : '[element]';
    }
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
    if (v instanceof Error) return { error: v.message };
    if (typeof v !== 'object') return undefined;
    if (seen.has(v)) return '[circular]';
    if (depth > 8) return '[…]';
    seen.add(v);
    if (v instanceof Map) return walk(Object.fromEntries(v), depth);
    if (v instanceof Set) return walk([...v], depth);
    if (Array.isArray(v)) {
      const arr = v.slice(0, 200).map((x) => {
        const w = walk(x, depth + 1);
        return w === undefined ? null : w;
      });
      if (v.length > 200) arr.push(`… ${v.length - 200} more`);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const w = walk(x, depth + 1);
      if (w !== undefined) out[k] = w;
    }
    return out;
  };
  const safe = walk(value, 0);
  let json: string | undefined;
  try {
    json = JSON.stringify(safe);
  } catch {
    return '[unserialisable result]';
  }
  if (json && json.length > MAX_RESULT_CHARS) {
    return { truncated: true, preview: `${json.slice(0, MAX_RESULT_CHARS)}…` };
  }
  return safe;
}

/** Make sure a run is live (so the frame / pill / cursor show), then wait while
 *  paused. Returns STOPPED if the run was stopped. */
async function enter(): Promise<Fail | null> {
  const st = useOperator.getState();
  if (st.status === 'idle') st.startRun();
  try {
    await useOperator.getState().waitUntilRunning();
  } catch {
    return STOPPED;
  }
  return useOperator.getState().abortSignal().aborted ? STOPPED : null;
}

/** Mark a failed step — plus whatever step the failure actually happened in,
 *  since a later ui.step() auto-completes the earlier one. */
function failSteps(stepId: string, detail: string): void {
  const st = useOperator.getState();
  st.finishStep(stepId, 'error', detail);
  const steps = useOperator.getState().steps;
  const startIdx = steps.findIndex((s) => s.id === stepId);
  if (startIdx < 0) return;
  for (let i = steps.length - 1; i > startIdx; i--) {
    if (steps[i].status === 'running') {
      st.finishStep(steps[i].id, 'error', detail);
      break;
    }
  }
}

// ── Confirm before sensitive GENERIC clicks ─────────────────────────────────
// Named actions declare their own confirm(). A raw click / type-and-submit /
// select on an arbitrary control (an un-instrumented screen such as Settings)
// has no such declaration, so the runtime judges the control itself: a button
// whose label means publish / save / delete / send / invite / share … gets the
// same confirm card, as does a pack's explicit AGENT_CONFIRM_ATTR marker, a
// role picker (it saves on change) and Enter in a form-less, non-search field.
// The model cannot skip it — the user's OK is enforced here, not asked for in
// the prompt. Openers (menus, dialogs, '…' labels) and toggles (checkboxes,
// radios, tabs, options) are not sensitive: the Save / Confirm that follows
// them is.
// restore / unhide / verify put content back in front of the public; grant /
// assign / notify / announce / "Post comment" reach other people.
const SENSITIVE_LABEL =
  /\b(save|publish|unpublish|re-?publish|delete|remove|send|invite|share|submit|approve|reject|archive|reset|start over|revoke|deactivate|disable|enable|transfer|resend|email|go live|schedule|apply|confirm|overwrite|replace|clear all|discard|restore|unhide|verify|unverify|grant|assign|notify|announce|post (?:comment|reply|it|now))\b/i;
const NON_SENSITIVE_ROLES = new Set(['checkbox', 'radio', 'tab', 'option', 'switch', 'menuitemcheckbox', 'menuitemradio', 'combobox']);
/** Options of a listbox / menu — choosing one can itself be the write. */
const OPTION_ROLES = new Set(['option', 'menuitemradio', 'menuitemcheckbox']);
/** A picker whose CHOICE is the write: Team Members' role pill assigns the
 *  role the moment an option is picked — no Save follows it. Both the generic
 *  `select` and a raw `click` on its option bypassed every label check. */
const SENSITIVE_PICKER = /\b(roles?|permissions?|access level)\b/i;
/** …but a "Filter by role" list only narrows what is shown. */
const isSensitivePicker = (label: string) => SENSITIVE_PICKER.test(label) && !/\b(filter|search|sort|show)\b/i.test(label);

const isOpener = (el: HTMLElement) => !!el.getAttribute('aria-haspopup') || el.hasAttribute('aria-expanded');

/** The question a pack declared with AGENT_CONFIRM_ATTR on (or around) this
 *  control: '' = declared without wording, null = nothing declared. */
function declaredQuestion(el: Element | null): string | null {
  const host = el?.closest(`[${AGENT_CONFIRM_ATTR}]`);
  return host ? (host.getAttribute(AGENT_CONFIRM_ATTR) ?? '').trim() : null;
}

/** For an option: the listbox / menu it sits in — its label, and the trigger
 *  that opened it (aria-controls), since lists are usually portalled. */
function pickerOf(el: HTMLElement): { label: string; owner: HTMLElement | null } | null {
  const box = el.closest<HTMLElement>('[role="listbox"], [role="menu"]');
  if (!box) return null;
  const owner = box.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(box.id)}"]`) : null;
  const byIds = (box.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  const label = (box.getAttribute('aria-label') || byIds || (owner ? labelOf(owner) : '')).replace(/\s+/g, ' ').trim();
  return { label, owner };
}

/** Search / filter boxes: Enter there only looks things up. */
function isSearchField(el: HTMLElement): boolean {
  const c = formControlOf(el) ?? el;
  if (c instanceof HTMLInputElement && c.type === 'search') return true;
  const role = c.getAttribute('role') ?? el.getAttribute('role');
  if (role === 'searchbox' || role === 'combobox' || c.closest('[role="search"]')) return true;
  return /\b(search|find|filter|look ?up)\b/i.test(`${labelOf(el)} ${c.getAttribute('placeholder') ?? ''} ${c.getAttribute('name') ?? ''}`);
}

function isSensitiveControl(el: HTMLElement): boolean {
  if (isOpener(el)) return false;
  const role = el.getAttribute('role') ?? '';
  if (NON_SENSITIVE_ROLES.has(role)) return false;
  if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'text', 'search', 'email', 'number', 'url', 'tel', 'date', 'time', 'datetime-local'].includes(el.type)) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return false;
  const label = labelOf(el);
  if (!label || /(\.\.\.|…)\s*$/.test(label)) return false;
  return SENSITIVE_LABEL.test(label);
}

function whereOf(el: HTMLElement): string {
  const dlg = el.closest<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog');
  const t = dlg?.querySelector('h1, h2, h3, h4')?.textContent?.trim() || dlg?.getAttribute('aria-label');
  return t ? ` in “${t}”` : ` on ${shortPageName(window.location.pathname)}`;
}

type GenericTool = 'click' | 'type' | 'select';

/** The confirm question for a generic tool call, or null when it is safe.
 *  `extra` = type's submit flag, or select's chosen value. */
function sensitiveQuestion(tool: GenericTool, agentId: string, extra?: boolean | string): string | null {
  const el = findAgentEl(agentId);
  if (!el) return null; // the driver will report not-found
  const name = labelOf(el) || agentId;
  if (tool === 'click') {
    const picker = OPTION_ROLES.has(el.getAttribute('role') ?? '') ? pickerOf(el) : null;
    // A marker on an opener (the role pill's trigger) guards its CHOICES, not the opening.
    const declared = isOpener(el) ? null : declaredQuestion(el) ?? declaredQuestion(picker?.owner ?? null);
    if (declared !== null) return declared || `Click “${name}”${whereOf(el)}?`;
    if (isSensitiveControl(el)) return `Click “${name}”${whereOf(el)}?`;
    if (picker && isSensitivePicker(picker.label)) return `Choose “${name}” — ${picker.label}${whereOf(el)}?`;
    return null;
  }
  if (tool === 'select') {
    const declared = declaredQuestion(el);
    if (declared !== null) return declared || `Choose “${String(extra)}” in “${name}”${whereOf(el)}?`;
    return isSensitivePicker(name) ? `Choose “${String(extra)}” for “${name}”${whereOf(el)}?` : null;
  }
  if (!extra) return null;
  const declared = declaredQuestion(el);
  if (declared !== null) return declared || `Press Enter in “${name}”${whereOf(el)}?`;
  const form = el.closest('form');
  if (form) {
    const btn = form.querySelector<HTMLElement>('button[type="submit"], button:not([type]), input[type="submit"]');
    return btn && isSensitiveControl(btn) ? `Submit “${labelOf(btn)}”${whereOf(el)}?` : null;
  }
  // No form: Enter goes to the app's own key handler, which may just as well
  // post or publish (the Site Content ticker input puts a headline LIVE on
  // Enter) — so it is asked, unless the field is a search / filter box.
  return isSearchField(el) ? null : `Press Enter in “${name}”${whereOf(el)}?`;
}

/** A release for a granted native-confirm pre-approval (see nativeDialogs). */
type Release = { release: (graceMs?: number) => void; graceMs: number };

/**
 * Show the confirm card for a sensitive generic click / submit. Fail = stopped or
 * declined; a Release = the user said OK, and any window.confirm() the app raises
 * for this same step is answered OK too (they just approved the step) — call
 * release() when the step is over. null = not sensitive, nothing asked.
 */
async function confirmIfSensitive(tool: GenericTool, agentId: string, extra?: boolean | string): Promise<Fail | Release | null> {
  const q = sensitiveQuestion(tool, agentId, extra);
  if (!q) return null;
  const ok = await ui().confirm(q);
  if (useOperator.getState().abortSignal().aborted) return STOPPED;
  if (!ok) return { ok: false, error: 'The user declined — do not retry unless they ask.', declined: true } as Fail;
  // Short grace: a confirm that follows right after (behind a quick request)
  // belongs to the step the user approved; anything later is asked afresh.
  return { release: grantPreApproval(), graceMs: 1500 };
}

const DECLINED_NATIVE_ERROR =
  'The app asked for confirmation; it was declined automatically. If the user wants this, the runtime will show them a confirm card — click again.';

/**
 * The click tool, native-dialog aware:
 *   • the app's window.confirm() is answered OK only when the user OK'd a
 *     confirm card for this click (sensitive label, or a repeat click below);
 *   • a confirm declined automatically is reported as { ok:false, nativeConfirm }
 *     and remembered against the element, so the NEXT click on it shows the user
 *     the app's own question as a confirm card — OK → pre-approved → click.
 */
// An OK the click could not use yet. Answering the confirm card is a mousedown
// outside the app's open menu, so a control INSIDE a menu ("More ▸ Start over…")
// is gone by the time the user has said OK. The OK is held for the same control
// for a minute — re-open the menu, click again, and it goes through with no
// second card. Held ONLY in that case: an OK'd click that failed for another
// reason (disabled, stopped) must not let a later same-label control — the
// "Delete" of a different row — through without its own card.
const HOLD_MS = 60_000;
const held = new Map<string, { messages: string[] | null; until: number }>();

function heldFor(keys: string[]): { messages: string[] | null } | null {
  const now = Date.now();
  for (const k of keys) {
    const h = held.get(k);
    if (h && h.until > now) return h;
  }
  return null;
}
function hold(keys: string[], messages: string[] | null): void {
  for (const k of keys) held.set(k, { messages, until: Date.now() + HOLD_MS });
}
function unhold(keys: string[]): void {
  for (const k of keys) held.delete(k);
}

async function clickTool(agentId: string, scope: ToolScope): Promise<unknown> {
  const el0 = findAgentEl(agentId);
  const keys = controlKeys(agentId, el0 ? labelOf(el0) : '');
  scope.keys = keys;
  const asked = declinedMessagesFor(el0, keys);
  const kept = heldFor(keys);
  let approval: Release | null = null;
  /** What a card shown by THIS call approved: the app's own messages, null =
   *  the whole step, undefined = no card was shown. */
  let okd: string[] | null | undefined;

  if (kept) {
    // The user already said OK to exactly this a moment ago (see `held`).
    approval = kept.messages
      ? { release: grantPreApproval({ messages: kept.messages }), graceMs: 8000 }
      : { release: grantPreApproval(), graceMs: 1500 };
  } else if (asked.length) {
    const ok = await ui().confirm(asked.join('\n\n'));
    if (useOperator.getState().abortSignal().aborted) return STOPPED;
    if (!ok) return { ok: false, declined: true, error: 'The user declined — do not retry unless they ask.' };
    // Exactly the wording the user just read; a little longer grace, since a
    // second app question can follow a server refusal ("it is live — delete
    // anyway?") and was part of what they saw.
    approval = { release: grantPreApproval({ messages: asked }), graceMs: 8000 };
    okd = asked;
  } else {
    const gate = await confirmIfSensitive('click', agentId);
    if (gate && 'ok' in gate) return gate;
    approval = gate;
    if (gate) okd = null;
  }

  try {
    // The card closed the menu / popover the control lived in.
    if (okd !== undefined && !findAgentEl(agentId)) {
      hold(keys, okd);
      return {
        ok: false,
        error:
          `The user said OK, but answering the confirm card closed the menu or popover that “${el0 ? labelOf(el0) : agentId}” was in. ` +
          'Their OK is kept for 60 seconds: open the menu again and click the same item — it goes straight through, no second card.',
      };
    }
    const el = findAgentEl(agentId) ?? el0;
    scope.el = el;
    noteClick(el, keys);
    const out = await asStep(`Clicked “${labelForId(agentId)}”`, async () => {
      await ui().click(agentId);
      ui().flash(agentId);
      return { ok: true as const };
    });
    if (isFail(out)) return out;
    unhold(keys);
    const confirms = scope.records.filter((r) => r.type === 'confirm');
    const declined = confirms.filter((r) => r.result === 'declined');
    if (declined.length) {
      useOperator
        .getState()
        .pushStep(`The app asked to confirm — declined automatically: “${clipText(declined[0].message, 80)}”`, 'declined');
      return { ok: false, nativeConfirm: declined[0].message, error: DECLINED_NATIVE_ERROR };
    }
    if (confirms.some((r) => r.result === 'accepted')) forgetDeclined(el, keys);
    return out;
  } finally {
    approval?.release(approval.graceMs);
  }
}

const clipText = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Run one low-level tool as a visible step; errors → { ok:false }. */
async function asStep<T extends object>(label: string, fn: () => Promise<T>): Promise<T | Fail> {
  const st = useOperator.getState();
  const id = st.pushStep(label);
  try {
    const out = await fn();
    useOperator.getState().finishStep(id, 'done');
    return out;
  } catch (e) {
    if (isAbortError(e) || useOperator.getState().abortSignal().aborted) {
      useOperator.getState().finishStep(id, 'error', 'Stopped by the user.');
      return STOPPED;
    }
    const error = errMsg(e);
    useOperator.getState().finishStep(id, 'error', error);
    return { ok: false, error };
  }
}

function parse<S extends z.ZodType>(schema: S, input: unknown, tool: string): z.infer<S> | Fail {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  return { ok: false, error: `Invalid input for ${tool}: ${formatIssues(r.error.issues)}` };
}

const isFail = (v: unknown): v is Fail =>
  typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false;

// ── tool input schemas (mirror the server declarations) ──────────────────────

const S = {
  navigate: z.object({ path: z.string().min(1) }),
  readScreen: z.object({}).passthrough(),
  runAction: z.object({ name: z.string().min(1), args: z.unknown().optional() }),
  click: z.object({ agentId: z.string().min(1) }),
  type: z.object({
    agentId: z.string().min(1),
    text: z.string(),
    clear: z.boolean().optional(),
    submit: z.boolean().optional(),
  }),
  select: z.object({ agentId: z.string().min(1), value: z.string() }),
  waitFor: z.object({ agentId: z.string().min(1), timeoutMs: z.number().int().positive().max(60_000).optional() }),
  scrollTo: z.object({ agentId: z.string().min(1) }),
  upload: z.object({
    agentId: z.string().min(1),
    attachment: z.union([z.number().int().min(0), z.string().min(1)]).optional(),
  }),
};

// ── runAction ────────────────────────────────────────────────────────────────

async function runAction(input: unknown): Promise<ActionOutcome> {
  const p = parse(S.runAction, input, 'runAction');
  if (isFail(p)) return p;

  const def = getAction(p.name);
  if (!def) {
    const names = listActions().map((a) => a.name);
    return {
      ok: false,
      error:
        `Action "${p.name}" is not available on this screen (${window.location.pathname}). ` +
        `Available here: ${names.length ? names.join(', ') : 'none'}. ` +
        'Navigate to the screen that has it (see the catalog), then call readScreen.',
    };
  }

  const v = def.args.safeParse(p.args ?? {});
  if (!v.success) {
    return { ok: false, error: `Invalid arguments for "${def.name}": ${formatIssues(v.error.issues)}` };
  }
  const args = v.data;

  let stepId: string | null = null;
  let release: ((graceMs?: number) => void) | null = null;
  try {
    const question = def.confirm?.(args);
    if (question) {
      const ok = await ui().confirm(question);
      if (useOperator.getState().abortSignal().aborted) return STOPPED;
      if (!ok) return { ok: false, declined: true, error: 'The user declined — do not retry unless they ask.' };
      // The user approved THIS action: the app's own window.confirm() for it
      // (Delete magazine…, Start over…) answers OK while it runs.
      release = grantPreApproval();
    }
    stepId = useOperator.getState().pushStep(`${humanizeActionName(def.name)}…`);
    const result = await def.run(args, ui());
    useOperator.getState().finishStep(stepId, 'done');
    const safe = jsonSafe(result);
    return safe === undefined ? { ok: true } : { ok: true, result: safe };
  } catch (e) {
    const stopped = isAbortError(e) || useOperator.getState().abortSignal().aborted;
    const error = stopped ? STOPPED.error : errMsg(e);
    if (stepId) failSteps(stepId, error);
    return { ok: false, error };
  } finally {
    release?.(1500);
  }
}

// ── entry point ──────────────────────────────────────────────────────────────

/** Execute one operator client tool. Never throws. */
export async function executeClientTool(name: string, input: unknown): Promise<unknown> {
  if (!isOperatorClientTool(name)) {
    return { ok: false, error: `Unknown operator tool "${name}".` };
  }
  const stopped = await enter();
  if (stopped) return stopped;

  // Native window.confirm / alert / prompt raised while this call runs are
  // recorded against it (runtime/nativeDialogs.ts) and reported in its result.
  const agentId =
    input && typeof input === 'object' && typeof (input as { agentId?: unknown }).agentId === 'string'
      ? (input as { agentId: string }).agentId
      : undefined;
  const scope = beginToolScope(name, agentId);
  let result: unknown;
  try {
    result = await runTool(name, input, scope);
  } finally {
    endToolScope(scope);
  }
  return withAppDialogs(result, scope.records);
}

/** Attach the app's native dialogs (this call's + any raised between calls). */
function withAppDialogs(result: unknown, own: NativeDialogRecord[]): unknown {
  const between = takeUnreported();
  // A click that came back with nativeConfirm already says what its own were.
  const mine = result && typeof result === 'object' && 'nativeConfirm' in result ? [] : own;
  const all = [...between, ...mine];
  if (!all.length || !result || typeof result !== 'object' || Array.isArray(result)) return result;
  return { ...(result as Record<string, unknown>), appDialogs: describeDialogs(all) };
}

async function runTool(name: string, input: unknown, scope: ToolScope): Promise<unknown> {
  try {
    switch (name) {
      case 'readScreen': {
        const full = !!(input && typeof input === 'object' && (input as { full?: unknown }).full === true);
        return asStep(full ? 'Read the whole page' : 'Read the screen', async () => readScreen({ full }));
      }

      case 'runAction':
        return await runAction(input);

      case 'navigate': {
        const p = parse(S.navigate, input, 'navigate');
        if (isFail(p)) return p;
        if (!p.path.startsWith('/') || p.path.startsWith('//')) {
          return { ok: false, error: `Only in-app paths starting with "/" can be opened (got "${p.path}").` };
        }
        return asStep(`Opening ${shortPageName(p.path)}`, async () => {
          // The cursor pointed at an element of the PREVIOUS screen — park it out
          // of sight so it doesn't hover over the new page (or the panel).
          useOperator.getState().setCursor({ visible: false, label: undefined });
          await ui().navigate(p.path);
          return {
            ok: true as const,
            path: window.location.pathname + window.location.search,
            title: pageTitle(),
          };
        });
      }

      case 'click': {
        const p = parse(S.click, input, 'click');
        if (isFail(p)) return p;
        return await clickTool(p.agentId, scope);
      }

      case 'type': {
        const p = parse(S.type, input, 'type');
        if (isFail(p)) return p;
        const gate = await confirmIfSensitive('type', p.agentId, p.submit);
        if (gate && 'ok' in gate) return gate;
        try {
          return await asStep(`Typed into “${labelForId(p.agentId)}”`, async () => {
            await ui().type(p.agentId, p.text, { clear: p.clear, submit: p.submit });
            ui().flash(p.agentId);
            return { ok: true as const };
          });
        } finally {
          gate?.release(gate.graceMs);
        }
      }

      case 'upload': {
        const p = parse(S.upload, input, 'upload');
        if (isFail(p)) return p;
        let att: ReturnType<typeof pickAttachment>;
        try {
          att = pickAttachment(p.attachment);
        } catch (e) {
          return { ok: false, error: errMsg(e) };
        }
        return asStep(`Attached “${att.name}”`, () => uploadToInput(p.agentId, att));
      }

      case 'select': {
        const p = parse(S.select, input, 'select');
        if (isFail(p)) return p;
        // A role picker saves on change (see SENSITIVE_PICKER) — same card as a
        // sensitive click.
        const gate = await confirmIfSensitive('select', p.agentId, p.value);
        if (gate && 'ok' in gate) return gate;
        try {
          return await asStep(`Chose “${p.value}” in “${labelForId(p.agentId)}”`, async () => {
            await ui().select(p.agentId, p.value);
            ui().flash(p.agentId);
            return { ok: true as const };
          });
        } finally {
          gate?.release(gate.graceMs);
        }
      }

      case 'waitFor': {
        const p = parse(S.waitFor, input, 'waitFor');
        if (isFail(p)) return p;
        return asStep(`Waiting for “${labelForId(p.agentId)}”`, async () => {
          await ui().waitFor(p.agentId, p.timeoutMs);
          return { ok: true as const };
        });
      }

      case 'scrollTo': {
        const p = parse(S.scrollTo, input, 'scrollTo');
        if (isFail(p)) return p;
        return asStep(`Scrolled to “${labelForId(p.agentId)}”`, async () => {
          // Presence scrolls while moving the cursor; the nearest-scroll after
          // is a guarantee in case the visuals are unavailable (no-op if the
          // element is already in view).
          await ui().point(p.agentId);
          findAgentEl(p.agentId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          return { ok: true as const };
        });
      }
    }
  } catch (e) {
    if (isAbortError(e)) return STOPPED;
    return { ok: false, error: errMsg(e) };
  }
  return { ok: false, error: `Unknown operator tool "${name}".` };
}
