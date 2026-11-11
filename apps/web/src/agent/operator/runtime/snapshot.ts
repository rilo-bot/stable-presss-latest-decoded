// ---------------------------------------------------------------------------
// readScreen() — the Operator's eyes.
//
// Instead of screenshots, the model gets a compact, structured description of
// what the user can see right now: the named actions mounted screens have
// registered, the anchored (data-agent-id) elements with their labels / values
// / state, any open dialogs, and a trimmed slice of visible text. It is cheap
// enough to call after every meaningful step, which is how the model verifies
// its own work.
//
// Anything inside [data-operator-ui] (the panel, pill, cursor) is skipped so
// the model never "sees" — and then tries to act on — its own chrome. `text` is
// user content and is labelled UNTRUSTED in the contract; the server prompt
// must treat it as data, never instructions.
// ---------------------------------------------------------------------------

import type { ScreenSnapshot } from '../contracts';
import { AGENT_ID_ATTR } from '../contracts';
import { listActions } from './registry';
import {
  OPERATOR_UI_SEL,
  collapse,
  formControlOf,
  isDisabled,
  isOperatorUi,
  isVisible,
  labelOf,
  truncate,
  refElements,
  visibleAgentEls,
  hiddenFileInputs,
  stampRef,
} from './dom';

const MAX_ELEMENTS = 160;
/** Total elements incl. generic refs — anchored ones always come first. */
const MAX_TOTAL = 220;
const MAX_TEXT = 1500;
/** readScreen({ full: true }) — analytics tables, long articles, reports. */
const MAX_TEXT_FULL = 8000;
const MAX_VALUE = 80;

type SnapEl = ScreenSnapshot['elements'][number];

function roleOf(el: HTMLElement): string | undefined {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  if (el instanceof HTMLButtonElement) return 'button';
  if (el instanceof HTMLAnchorElement) return 'link';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase();
    if (t === 'checkbox' || t === 'radio') return t;
    if (t === 'button' || t === 'submit' || t === 'reset') return 'button';
    return `input:${t}`;
  }
  if (el.isContentEditable) return 'editor';
  // An anchor on a wrapper around a single control reports the control's role.
  const control = formControlOf(el);
  return control && control !== el ? roleOf(control) : undefined;
}

function valueOf(el: HTMLElement): string | undefined {
  const control = formControlOf(el);
  if (!control) return undefined;
  if (control instanceof HTMLInputElement) {
    const t = control.type.toLowerCase();
    if (t === 'checkbox' || t === 'radio' || t === 'file' || t === 'button' || t === 'submit') return undefined;
    if (t === 'password') return control.value ? '••••••' : '';
  }
  if (control instanceof HTMLSelectElement) {
    const opt = control.selectedOptions[0];
    return truncate(collapse(opt?.textContent) || control.value, MAX_VALUE);
  }
  return truncate(control.value, MAX_VALUE);
}

function checkedOf(el: HTMLElement): boolean | undefined {
  const control = formControlOf(el);
  if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
    return control.checked;
  }
  const aria = el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed');
  if (aria === 'true' || aria === 'mixed') return true;
  if (aria === 'false') return false;
  // Radix Switch / Checkbox / Toggle expose data-state as well.
  const ds = el.getAttribute('data-state');
  if (ds === 'checked' || ds === 'on') return true;
  if (ds === 'unchecked' || ds === 'off') return false;
  return undefined;
}

function describe(el: HTMLElement, ref?: string): SnapEl {
  const out: SnapEl = {
    agentId: ref ?? el.getAttribute(AGENT_ID_ATTR) ?? '',
    label: labelOf(el),
  };
  const role = roleOf(el);
  if (role) out.role = role;
  const value = valueOf(el);
  if (value !== undefined) out.value = value;
  const checked = checkedOf(el);
  if (checked !== undefined) out.checked = checked;
  if (isDisabled(el)) out.disabled = true;
  const control = formControlOf(el);
  if (control instanceof HTMLInputElement && control.type.toLowerCase() === 'file' && control.accept) {
    out.accept = truncate(control.accept, 80);
  }
  return out;
}

function openDialogs(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog[open]'),
  ).filter((d) => !isOperatorUi(d) && isVisible(d));
}

function dialogTitle(d: HTMLElement): string {
  const byIds = (d.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  const heading = d.querySelector('h1, h2, h3, h4, h5, h6, [data-dialog-title]');
  return truncate(
    collapse(byIds) || collapse(d.getAttribute('aria-label')) || collapse(heading?.textContent) || 'Untitled dialog',
    100,
  );
}

/** First visible <h1> (outside Operator chrome), else document.title. */
export function pageTitle(): string {
  for (const h of Array.from(document.querySelectorAll<HTMLElement>('h1'))) {
    if (isOperatorUi(h) || !isVisible(h)) continue;
    const t = collapse(h.textContent);
    if (t) return truncate(t, 120);
  }
  return document.title;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'NAV', 'SVG', 'IFRAME']);

/** Visible text under `root`, skipping nav / scripts / Operator chrome / hidden
 *  subtrees. Stops early once `budget` chars are collected so huge pages stay
 *  cheap. */
function visibleText(root: Element, budget: number, exclude: Element[] = []): string {
  const parts: string[] = [];
  let len = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      if (exclude.includes(el)) return NodeFilter.FILTER_REJECT;
      if (el.matches(OPERATOR_UI_SEL) || el.hasAttribute('hidden')) return NodeFilter.FILTER_REJECT;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none') return NodeFilter.FILTER_REJECT;
      // visibility is inherited but can be re-enabled on a child: skip only
      // this node's own text, keep walking its children.
      return NodeFilter.FILTER_SKIP;
    },
  });
  for (let n = walker.nextNode(); n && len < budget; n = walker.nextNode()) {
    if (n.nodeType !== Node.TEXT_NODE) continue;
    const parent = n.parentElement;
    if (parent && window.getComputedStyle(parent).visibility === 'hidden') continue;
    const t = collapse(n.nodeValue);
    if (!t) continue;
    parts.push(t);
    len += t.length + 1;
  }
  return parts.join(' ');
}

/** Structured description of what the user can see right now. */
export function readScreen(opts: { full?: boolean } = {}): ScreenSnapshot {
  const MAX = opts.full ? MAX_TEXT_FULL : MAX_TEXT;
  const anchored = visibleAgentEls(MAX_ELEMENTS).map((el) => describe(el));
  // Every other visible control, as ref:N — so an un-instrumented screen is
  // still fully operable (see dom.ts refElements).
  const generic = refElements(MAX_TOTAL - anchored.length).map(({ el, ref }) => describe(el, ref));
  // Hidden file inputs behind a styled "Upload…" button: listed as their own
  // entry (role input:file) so the model can use the `upload` tool on them.
  const listedIds = new Set([...anchored, ...generic].map((e) => e.agentId));
  const files = hiddenFileInputs(20)
    .map(({ input, proxy }) => {
      const agentId = input.getAttribute(AGENT_ID_ATTR) || stampRef(input);
      if (listedIds.has(agentId)) return null;
      const by = labelOf(proxy);
      const own = labelOf(input);
      const out: SnapEl = {
        agentId,
        label: truncate(`${own || by || 'File upload'}${by && own && own !== by ? ` (behind “${by}”)` : ''} — file input, use upload`, 100),
        role: 'input:file',
      };
      if (input.accept) out.accept = truncate(input.accept, 80);
      if (input.disabled) out.disabled = true;
      return out;
    })
    .filter((e): e is SnapEl => e !== null);
  const elements = [...anchored, ...generic, ...files];

  const actions = listActions().map((a) => ({ name: a.name, description: a.description }));

  const dialogs = openDialogs();

  // Open dialogs first: their content is portalled outside <main>, and it is
  // what the user is looking at.
  let text = '';
  for (const d of dialogs) {
    if (text.length >= MAX) break;
    text += (text ? ' ' : '') + visibleText(d, MAX - text.length);
  }
  const main = document.querySelector('main');
  const root = main && !isOperatorUi(main) ? main : document.body;
  if (text.length < MAX) {
    // Exclude the dialogs already read, in case one lives inside <main>.
    const rest = visibleText(root, MAX - text.length, dialogs);
    if (rest) text += (text ? ' · ' : '') + rest;
  }

  return {
    path: window.location.pathname + window.location.search,
    title: pageTitle(),
    actions,
    elements,
    dialogs: dialogs.map(dialogTitle),
    text: truncate(collapse(text), MAX),
  };
}
