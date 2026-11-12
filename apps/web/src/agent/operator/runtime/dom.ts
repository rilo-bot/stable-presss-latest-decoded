// ---------------------------------------------------------------------------
// DOM helpers shared by the UiDriver, readScreen() and the client tools.
//
// Kept in one place so "visible", "the element for this agent id" and "the
// element's human label" mean EXACTLY the same thing in what the model is told
// (readScreen) and in what the driver then acts on — otherwise the model sees
// an element it cannot click, or clicks one it was never shown.
// ---------------------------------------------------------------------------

import { AGENT_ID_ATTR, AGENT_LABEL_ATTR, OPERATOR_UI_ATTR, agentSel } from '../contracts';
import { looksLikeId, nameFromAgentId } from './humanRef';

export const OPERATOR_UI_SEL = `[${OPERATOR_UI_ATTR}]`;

export const abortError = () => new DOMException('The Stablehand was stopped.', 'AbortError');

export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError') ||
    (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError')
  );
}

/** Inside the Operator's own chrome (panel, pill, cursor)? */
export function isOperatorUi(el: Element): boolean {
  return !!el.closest(OPERATOR_UI_SEL);
}

/** Rendered with a non-zero box and not visibility:hidden. A zero rect also
 *  covers display:none on the element or any ancestor. */
export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const cs = window.getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.visibility === 'collapse' || cs.display === 'none') return false;
  return true;
}

export function collapse(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ── Generic refs: the Operator can use ANY control, not only anchored ones ──
//
// Named actions + data-agent-id anchors are the precise path, but a screen
// nobody has instrumented yet (Settings, a new dialog, the per-page Fill /
// Adjust wands) must still be usable — "the Stablehand can do anything a person
// can". readScreen() therefore also lists every other visible interactive
// element under a short ref ("ref:12"), stamped on the element as
// data-agent-ref. A ref resolves exactly like an anchor id everywhere
// (click/type/select/waitFor/scrollTo + the ghost cursor), so nothing else in
// the runtime needs to know the difference.

export const AGENT_REF_ATTR = 'data-agent-ref';
export const REF_PREFIX = 'ref:';

const INTERACTIVE_SEL = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  'summary',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let refSeq = 0;
const refOf = new WeakMap<Element, string>();

/** True when an anchored element already stands for this control (the anchor
 *  is the element itself, or a wrapper whose single form control it is). */
function coveredByAnchor(el: HTMLElement): boolean {
  if (el.hasAttribute(AGENT_ID_ATTR)) return true;
  const host = el.closest<HTMLElement>(`[${AGENT_ID_ATTR}]`);
  if (!host) return false;
  return formControlOf(host) === el || editableOf(host) === el;
}

/**
 * Visible, un-anchored interactive elements (document order, capped), each
 * stamped with a stable data-agent-ref. Inner nodes of a contenteditable and
 * controls nested inside another interactive control (an icon <span
 * role=button> inside a <button>) are skipped so one thing on screen is one
 * entry.
 */
export function refElements(cap: number): Array<{ el: HTMLElement; ref: string }> {
  const out: Array<{ el: HTMLElement; ref: string }> = [];
  if (cap <= 0) return out;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SEL))) {
    if (out.length >= cap) break;
    if (isOperatorUi(el) || !isVisible(el) || coveredByAnchor(el)) continue;
    const parentInteractive = el.parentElement?.closest(INTERACTIVE_SEL);
    if (parentInteractive && !isOperatorUi(parentInteractive) && parentInteractive !== el) {
      // nested inside another control — the outer one is the thing to click
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
    }
    out.push({ el, ref: stampRef(el) });
  }
  return out;
}

/** Stamp (once) and return the element's generic ref, e.g. "ref:12". */
export function stampRef(el: HTMLElement): string {
  let ref = refOf.get(el);
  if (!ref) {
    ref = String(++refSeq);
    refOf.set(el, ref);
  }
  if (el.getAttribute(AGENT_REF_ATTR) !== ref) el.setAttribute(AGENT_REF_ATTR, ref);
  return `${REF_PREFIX}${ref}`;
}

// ── File inputs ─────────────────────────────────────────────────────────────
//
// Apps hide the real <input type="file"> (class="hidden") behind a styled button
// that calls input.click(). Clicking that button would open the OS file chooser,
// which nothing in the page can answer — so the `upload` tool sets the input's
// files directly, and readScreen lists the hidden input itself (role
// 'input:file') next to the visible control that stands for it.

const FILE_SEL = 'input[type="file" i]';
const BUTTONISH = 'button, [role="button"], label, a[href]';
const MAX_UP = 5;

const isFileInput = (el: Element): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.type.toLowerCase() === 'file';

/**
 * The visible element a person would press to reach this (possibly hidden) file
 * input: itself when visible, its <label>, a button right beside it, or the
 * nearest visible wrapper. null when nothing on screen stands for it (a closed
 * dialog's input, say) — then it is not "on screen" for the model either.
 */
export function fileInputProxy(input: HTMLInputElement): HTMLElement | null {
  if (isVisible(input)) return input;
  const lab = Array.from(input.labels ?? []).find(isVisible);
  if (lab) return lab;
  // A button/label right next to it (the common `<input hidden/><button/>`).
  for (const sib of [input.nextElementSibling, input.previousElementSibling]) {
    if (sib instanceof HTMLElement && isVisible(sib)) {
      const b = sib.matches(BUTTONISH) ? sib : sib.querySelector<HTMLElement>(BUTTONISH);
      if (b && isVisible(b)) return b;
    }
  }
  // Wrapped in a visible label / button-ish element.
  const wrap = input.parentElement?.closest<HTMLElement>(BUTTONISH);
  if (wrap && isVisible(wrap)) return wrap;
  // Else a visible parent whose only file input this is, with one button in it.
  let p: HTMLElement | null = input.parentElement;
  for (let i = 0; p && i < 2; i++) {
    if (isVisible(p)) {
      if (p.querySelectorAll(FILE_SEL).length !== 1) return null;
      const btns = Array.from(p.querySelectorAll<HTMLElement>(BUTTONISH)).filter(isVisible);
      return btns.length === 1 ? btns[0] : null;
    }
    p = p.parentElement;
  }
  return null;
}

/**
 * The file input an id refers to: the element itself, its single descendant
 * file input, its <label>'s control, or — for the styled button that opens a
 * hidden input — the one file input in its nearest wrapper.
 */
export function resolveFileInput(el: HTMLElement): HTMLInputElement | { error: string } {
  if (isFileInput(el)) return el;
  if (el instanceof HTMLLabelElement && el.control && isFileInput(el.control)) return el.control;
  const inner = Array.from(el.querySelectorAll<HTMLInputElement>(FILE_SEL)).filter((i) => !isOperatorUi(i));
  if (inner.length === 1) return inner[0];
  if (inner.length > 1) {
    return { error: `“${labelOf(el) || 'That element'}” holds ${inner.length} file inputs — call readScreen and pass the input's own id (role input:file).` };
  }
  let p: HTMLElement | null = el.parentElement;
  for (let i = 0; p && i < MAX_UP; i++, p = p.parentElement) {
    const found = Array.from(p.querySelectorAll<HTMLInputElement>(FILE_SEL)).filter((x) => !isOperatorUi(x));
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      // Several in this wrapper: the one this control stands for, if any.
      const mine = found.find((f) => fileInputProxy(f) === el);
      if (mine) return mine;
      break;
    }
  }
  return {
    error: `“${labelOf(el) || 'That element'}” is not a file input and none sits next to it. Call readScreen and pass an element whose role is input:file (or the button that opens it).`,
  };
}

/** Hidden file inputs whose label / button is on screen, with that stand-in.
 *  (Visible ones are already in refElements / the anchors.) */
export function hiddenFileInputs(cap: number): Array<{ input: HTMLInputElement; proxy: HTMLElement }> {
  const out: Array<{ input: HTMLInputElement; proxy: HTMLElement }> = [];
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>(FILE_SEL))) {
    if (out.length >= cap) break;
    if (isOperatorUi(input) || isVisible(input) || input.disabled) continue;
    const proxy = fileInputProxy(input);
    if (!proxy || isOperatorUi(proxy)) continue;
    out.push({ input, proxy });
  }
  return out;
}

/** All elements carrying this agent id (or generic ref), outside Operator chrome. */
function candidates(agentId: string): HTMLElement[] {
  const sel = agentId.startsWith(REF_PREFIX)
    ? `[${AGENT_REF_ATTR}="${CSS.escape(agentId.slice(REF_PREFIX.length))}"]`
    : agentSel(agentId);
  return Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => !isOperatorUi(el));
}

/** The element for an agent id: the visible one if several match (e.g. a
 *  desktop + mobile copy of the same control), else the first. */
export function findAgentEl(agentId: string): HTMLElement | null {
  const all = candidates(agentId);
  if (!all.length) return null;
  return all.find(isVisible) ?? all[0];
}

/** Only a VISIBLE element for this id (null otherwise). */
export function findVisibleAgentEl(agentId: string): HTMLElement | null {
  return candidates(agentId).find(isVisible) ?? null;
}

/** Visible anchors, document order, outside Operator chrome. */
export function visibleAgentEls(cap = Infinity): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[${AGENT_ID_ATTR}]`))) {
    if (out.length >= cap) break;
    if (isOperatorUi(el) || !isVisible(el)) continue;
    out.push(el);
  }
  return out;
}

/** Up to `cap` distinct visible agent ids — used in "not found" errors so the
 *  model can recover without another readScreen round-trip. */
export function visibleAgentIds(cap = 15): string[] {
  const ids: string[] = [];
  for (const el of visibleAgentEls()) {
    const id = el.getAttribute(AGENT_ID_ATTR);
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= cap) break;
  }
  return ids;
}

export function notFoundError(agentId: string, what = 'No element'): Error {
  const ids = visibleAgentIds(15);
  const isRef = agentId.startsWith(REF_PREFIX);
  return new Error(
    `${what} with ${isRef ? 'ref' : 'data-agent-id'} "${agentId}" on this screen (${window.location.pathname}). ` +
      (isRef
        ? 'Refs only live as long as the element — the screen has changed. Call readScreen for fresh refs.'
        : `Visible anchors: ${ids.length ? ids.join(', ') : 'none'}. Call readScreen to see what is here (it also lists un-anchored controls as ref:N).`),
  );
}

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isFormControl(el: Element): el is FormControl {
  return (
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  );
}

/** The form control an anchor refers to: the element itself, or — when the
 *  anchor sits on a wrapper — its single descendant input/textarea/select. */
export function formControlOf(el: Element): FormControl | null {
  if (isFormControl(el)) return el;
  const inner = el.querySelectorAll('input:not([type="hidden"]), textarea, select');
  return inner.length === 1 && isFormControl(inner[0]) ? inner[0] : null;
}

/** The contenteditable host an anchor refers to (itself or a descendant). */
export function editableOf(el: Element): HTMLElement | null {
  if (el instanceof HTMLElement && el.isContentEditable) {
    // climb to the editing host so selection math covers the whole editor
    let host: HTMLElement = el;
    while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
    return host;
  }
  const inner = el.querySelector<HTMLElement>('[contenteditable="true"], [contenteditable=""]');
  return inner && inner.isContentEditable ? inner : null;
}

/** An element's text with its pieces kept apart: textContent glues adjacent
 *  nodes, so a sidebar link "People" + its badge "3" read as "People3". Joining
 *  the text nodes with a space gives "People 3", which the model can match. */
function spacedText(el: Element): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent?.trim();
    if (t) parts.push(t);
    if (parts.length > 40) break;
  }
  return parts.join(' ');
}

function textOfIds(ids: string | null): string {
  if (!ids) return '';
  return collapse(
    ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' '),
  );
}

/** Human label for an element, ≤ 60 chars. */
export function labelOf(el: Element): string {
  const control = formControlOf(el);
  const raw =
    el.getAttribute(AGENT_LABEL_ATTR) ||
    el.getAttribute('aria-label') ||
    textOfIds(el.getAttribute('aria-labelledby')) ||
    el.getAttribute('placeholder') ||
    control?.getAttribute('aria-label') ||
    control?.getAttribute('placeholder') ||
    (control && 'labels' in control && control.labels?.[0] && spacedText(control.labels[0])) ||
    spacedText(el) ||
    el.getAttribute('title') ||
    '';
  return truncate(collapse(raw), 60);
}

/** Label for an agent id (for step text). With no label on screen it falls
 *  back to a humanised id with any record id taken out — "team.remove-6650f…"
 *  reads "Remove", never the raw id. */
export function labelForId(agentId: string): string {
  const el = findAgentEl(agentId);
  return (el && labelOf(el)) || nameFromAgentId(agentId);
}

/**
 * What a person sees for a value chosen in a <select>: the option's TEXT. The
 * model often passes the option's value, which can be a userId / horse id
 * ("Chose “6650f…”" → "Chose “Ahmed Khan”"). Never returns an id.
 */
export function optionTextFor(agentId: string, value: string): string {
  const el = findAgentEl(agentId);
  const control = el ? formControlOf(el) : null;
  if (control instanceof HTMLSelectElement) {
    const want = collapse(value).toLowerCase();
    const opt =
      Array.from(control.options).find((o) => collapse(o.value).toLowerCase() === want) ??
      Array.from(control.options).find((o) => collapse(o.textContent).toLowerCase() === want);
    const text = opt ? collapse(opt.textContent) : '';
    if (text) return truncate(text, 60);
  }
  return looksLikeId(value) ? 'the chosen option' : truncate(collapse(value), 60);
}

/**
 * The choices already made in the dialog / form a control sits in, by their
 * visible text: "Person to share with: Ahmed Khan". So a generic confirm card
 * for an un-instrumented "Share" button says WHO it shares with. '' if none.
 */
export function chosenContext(el: Element): string {
  const scope = el.closest('[role="dialog"], [role="alertdialog"], dialog, form');
  if (!scope) return '';
  const bits: string[] = [];
  for (const sel of Array.from(scope.querySelectorAll('select'))) {
    if (!sel.value || sel.disabled || !isVisible(sel)) continue;
    const text = collapse(sel.selectedOptions[0]?.textContent);
    if (!text || looksLikeId(text)) continue;
    const label = labelOf(sel);
    bits.push(label ? `${label}: ${truncate(text, 50)}` : truncate(text, 50));
    if (bits.length >= 2) break;
  }
  return bits.join('; ');
}

export function isDisabled(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled === true) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (el.hasAttribute('data-disabled')) return true;
  const control = formControlOf(el);
  if (control && control !== el && control.disabled) return true;
  return !!el.closest('fieldset:disabled');
}
