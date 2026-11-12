// ---------------------------------------------------------------------------
// Stablehand OPERATOR — shared contracts.
//
// The Operator is the global Stablehand upgraded so it can DO things in the app
// (for staff / invited users — `currentUser.isAdmin`), and SHOW it doing them:
// gold frame, "Stablehand is working here" pill, ghost cursor, highlights.
//
// Layers (each owns its own folder; they meet ONLY through this file and
// operatorStore.ts):
//
//   presence/   the visuals. Implements PresenceApi (presence/presenceApi.ts
//               exports `presence`). Renders <OperatorPresence/>.
//   runtime/    the hands + eyes. Action registry, useAgentAction(), the
//               UiDriver, readScreen(), and executeClientTool() which the panel
//               calls for every operator client-tool call from the model.
//   panel       components/AgentWidget.tsx — chat, step timeline, confirm cards,
//               Stop / Resume. Talks to POST /api/agent/operator.
//   packs       each product surface registers named actions with
//               useAgentAction() and marks key elements with data-agent-id.
//
// THE RULE (same as blogEditorBridge): an action never writes to the database
// by a private path. It drives the real UI, or calls the same store / REST
// route the UI calls — so the server still enforces RBAC as the user and undo
// still works.
// ---------------------------------------------------------------------------

import type { ZodType } from 'zod';

/** DOM attribute that anchors an element for the Operator. Stable, kebab/dot
 *  ids, e.g. data-agent-id="mag.share-button". Never derive from CSS/text. */
export const AGENT_ID_ATTR = 'data-agent-id';
/** Optional human label for an anchored element (falls back to aria-label /
 *  text content). */
export const AGENT_LABEL_ATTR = 'data-agent-label';
/** Mark ANY Operator chrome (panel, pill, cursor) with this attribute so
 *  readScreen() skips it and user clicks inside it are not a "takeover". */
export const OPERATOR_UI_ATTR = 'data-operator-ui';
/** Opt-in runtime confirm for a control whose click / Enter / pick IS an
 *  outward write its label does not give away — an "Add" that puts a headline
 *  on the live site, a picker that saves on change. Put it on the control (or
 *  a wrapper; for a listbox, on the trigger that opens it). Value = the
 *  question for the confirm card, or '' to let the runtime word it. Honoured
 *  by the generic click / type-with-submit / select tools; named actions
 *  declare their own confirm(). */
export const AGENT_CONFIRM_ATTR = 'data-agent-confirm';

/** CSS selector for an anchor id. */
export const agentSel = (agentId: string) => `[${AGENT_ID_ATTR}="${CSS.escape(agentId)}"]`;

// ── Client tools the MODEL calls (declared server-side without `execute`) ────
// Input / output shapes are the contract between apps/server
// lib/agent/operator/tools.ts and runtime/clientTools.ts. Keep in step.
//
//   navigate   { path: string }                         → { ok, path, title }
//   readScreen { }                                      → ScreenSnapshot
//   runAction  { name: string, args?: object }          → ActionOutcome
//   click      { agentId: string }                      → { ok } | { ok:false, error }
//   type       { agentId: string, text: string,
//                clear?: boolean, submit?: boolean }    → { ok } | { ok:false, error }
//   select     { agentId: string, value: string }       → { ok } | { ok:false, error }
//   waitFor    { agentId: string, timeoutMs?: number }  → { ok } | { ok:false, error }
//   scrollTo   { agentId: string }                      → { ok } | { ok:false, error }
//   upload     { agentId: string,
//                attachment?: number | string }        → { ok, fileName, size } | { ok:false, error }
//              (sets a file input to a file the user attached in the chat;
//               0 = the most recent message's first attachment, or a file name)
//
// Any result may also carry `appDialogs` — native window.confirm / alert /
// prompt calls the app made during (or since) the call; see
// runtime/nativeDialogs.ts. A click whose window.confirm was auto-declined
// returns { ok:false, nativeConfirm: "<the app's message>", error }.
export const OPERATOR_CLIENT_TOOLS = [
  'navigate',
  'readScreen',
  'runAction',
  'click',
  'type',
  'select',
  'waitFor',
  'scrollTo',
  'upload',
] as const;
export type OperatorClientTool = (typeof OPERATOR_CLIENT_TOOLS)[number];

/** 'magazine.sharePages' → 'Share pages'. The plain line a person reads in the
 *  pill and the step list — an action's `description` is written for the
 *  model (long, mentions arg shapes) and its dotted name is code. */
export function humanizeActionName(name: string): string {
  const verb = name.split('.').pop() || name;
  const words = verb.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type ActionOutcome =
  | { ok: true; result?: unknown }
  | { ok: false; error: string; declined?: boolean };

/** What readScreen() returns — compact text the model can reason over. */
export interface ScreenSnapshot {
  path: string;
  title: string;
  /** Named actions registered by the CURRENTLY MOUNTED screens. */
  actions: Array<{ name: string; description: string }>;
  /** Visible anchored elements (data-agent-id), in document order, capped. */
  elements: Array<{
    agentId: string;
    label: string;
    role?: string;
    value?: string;
    checked?: boolean;
    disabled?: boolean;
    /** File inputs (role 'input:file'): the accept attribute. */
    accept?: string;
  }>;
  /** Titles of open dialogs / drawers, if any. */
  dialogs: string[];
  /** Visible page text, trimmed (≤ ~1500 chars). UNTRUSTED user content. */
  text: string;
}

// ── Presence (implemented in presence/presenceApi.ts as `presence`) ──────────
export interface PresenceApi {
  /** Glide the gold ghost cursor to the element's centre (scrolling it into
   *  view first), show `label` in its bubble, and gold-outline the element.
   *  Resolves when the motion ends (instant under prefers-reduced-motion). */
  moveCursorTo(el: Element, label?: string, signal?: AbortSignal): Promise<void>;
  /** Click ripple at the cursor's current position. */
  clickPulse(): Promise<void>;
  /** Persistent gold outline on one element (null clears). */
  highlight(el: Element | null): void;
  /** Brief gold flash on an element that just changed. */
  flash(el: Element): void;
  /** Hide cursor + highlight (end of run). */
  hideCursor(): void;
}

// ── UiDriver — what an action's run() gets (implemented in runtime/) ─────────
// Every method: waits while the run is paused (user took over), throws an
// AbortError when the run is stopped, and drives the PresenceApi so the user
// SEES it. Element args are data-agent-id values.
export interface UiDriver {
  /** Move the cursor to an element (no click). */
  point(agentId: string, label?: string): Promise<HTMLElement>;
  /** Point, ripple, then a real click on the element. */
  click(agentId: string, label?: string): Promise<void>;
  /** Point, then type into an input / textarea / contenteditable so React sees
   *  it (native value setter + input events). Typewriter effect, chunked for
   *  long text. */
  type(agentId: string, text: string, opts?: { clear?: boolean; submit?: boolean }): Promise<void>;
  /** Set a <select> / combobox value. */
  select(agentId: string, value: string): Promise<void>;
  /** Wait until an anchored element is in the DOM and visible. */
  waitFor(agentId: string, timeoutMs?: number): Promise<HTMLElement>;
  /** Navigate in-app (react-router) and wait for the route to render. */
  navigate(path: string): Promise<void>;
  /** Resolve when location.pathname starts with prefix. */
  waitForRoute(prefix: string, timeoutMs?: number): Promise<void>;
  /** Gold flash on an element that just changed (no-op if absent). */
  flash(agentId: string): void;
  /** Add a line to the step timeline + pill ("Opening the share dialog"). */
  step(label: string): void;
  /** Progress bar in the pill for long jobs; null clears. */
  progress(p: { label: string; done: number; total: number } | null): void;
  /** Ask the user explicitly (confirm card in the panel). */
  confirm(summary: string): Promise<boolean>;
  /** Aborted when the user presses Stop. */
  signal: AbortSignal;
}

// ── Named actions (registered by screens via runtime/useAgentAction) ─────────
export interface OperatorActionDef<A = any> {
  /** Dotted, stable: '<pack>.<verb>' e.g. 'magazine.sharePages'. MUST match an
   *  entry in apps/server/src/lib/agent/operator/catalog/<pack>.ts. */
  name: string;
  /** One line, for readScreen(). */
  description: string;
  /** Validates the model's args BEFORE anything runs. */
  args: ZodType<A>;
  /** If this returns a string, the runtime shows it as a confirm card and only
   *  runs on the user's OK. REQUIRED for publish / unpublish / delete /
   *  share / unshare / send email or notification / invite / role changes. */
  confirm?: (args: A) => string | null;
  /** Do it. Return JSON-safe data the model can verify (e.g. the new state). */
  run: (args: A, ui: UiDriver) => Promise<unknown>;
}
