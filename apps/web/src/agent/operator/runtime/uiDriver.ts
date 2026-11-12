// ---------------------------------------------------------------------------
// UiDriver — the Operator's hands.
//
// Actions (and the low-level click/type/select client tools) drive the REAL UI
// through this, never a private path, so the server still enforces RBAC as the
// user and the user watches it happen:
//
//   • every method first waits while the run is paused (the user took over)
//     and throws an AbortError once Stop was pressed — so a long action halts
//     between steps, not after it has finished;
//   • every pointer action moves the gold ghost cursor (presence) first;
//   • events are dispatched the way a browser would, because component
//     libraries listen to different ones: Radix opens DropdownMenu / Select on
//     `pointerdown`, plain buttons on `click`, React inputs only notice a value
//     written through the NATIVE prototype setter followed by an `input` event.
//
// Synthetic events are untrusted (event.isTrusted === false), which is how the
// takeover guard tells our clicks apart from the user's.
// ---------------------------------------------------------------------------

import type { UiDriver } from '../contracts';
import { useOperator } from '../operatorStore';
import { presence } from '../presence/presenceApi';
import { getRouterNavigate } from './navigation';
import { grantPreApproval } from './nativeDialogs';
import { nameFromAgentId, quoteRef } from './humanRef';
import {
  OPERATOR_UI_SEL,
  abortError,
  collapse,
  editableOf,
  findAgentEl,
  findVisibleAgentEl,
  formControlOf,
  isAbortError,
  isDisabled,
  isVisible,
  labelOf,
  notFoundError,
} from './dom';

const DEFAULT_WAIT_MS = 8000;
/** Grace period for an element that is about to render (a dialog opening after
 *  the previous click) before we call it "not found". */
const LOOKUP_GRACE_MS = 1500;
const CHAR_DELAY_MS = 30;
const MAX_TYPE_MS = 2500;

// ── run-state guards ─────────────────────────────────────────────────────────

const currentSignal = () => useOperator.getState().abortSignal();

/** Wait while paused; throw AbortError once stopped. */
async function guard(): Promise<void> {
  await useOperator.getState().waitUntilRunning();
  if (currentSignal().aborted) throw abortError();
}

/** Abortable sleep. */
function sleep(ms: number, signal: AbortSignal = currentSignal()): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const t = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** One animation frame, but never hang in a background tab (rAF is paused). */
function frame(): Promise<void> {
  return new Promise((resolve) => {
    const t = window.setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      window.clearTimeout(t);
      resolve();
    });
  });
}

/** Let React commit + effects run after a navigation / big change. */
async function settle(): Promise<void> {
  await frame();
  await frame();
  await sleep(150);
}

/**
 * Resolve when `check()` returns a non-null value. Re-checks on DOM mutations,
 * every animation frame, and on a slow interval (rAF stops in background tabs;
 * CSS-only visibility changes do not mutate the DOM).
 */
function pollUntil<T>(
  check: () => T | null,
  timeoutMs: number,
  onTimeout: () => Error,
  signal: AbortSignal = currentSignal(),
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const first = check();
    if (first !== null) return resolve(first);

    let done = false;
    let raf = 0;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      mo.disconnect();
      cancelAnimationFrame(raf);
      window.clearInterval(iv);
      window.clearTimeout(to);
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    const tick = () => {
      if (done) return;
      let v: T | null = null;
      try {
        v = check();
      } catch (e) {
        finish(() => reject(e));
        return;
      }
      if (v !== null) finish(() => resolve(v as T));
    };
    const loop = () => {
      tick();
      if (!done) raf = requestAnimationFrame(loop);
    };
    const onAbort = () => finish(() => reject(abortError()));

    const mo = new MutationObserver(tick);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    raf = requestAnimationFrame(loop);
    const iv = window.setInterval(tick, 200);
    const to = window.setTimeout(() => finish(() => reject(onTimeout())), timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ── element lookup ───────────────────────────────────────────────────────────

/** The element for an agent id; waits a short grace period if it is not in the
 *  DOM yet, then throws with the visible anchors so the model can recover. */
async function resolveEl(agentId: string): Promise<HTMLElement> {
  const now = findVisibleAgentEl(agentId);
  if (now) return now;
  // Prefer waiting for a VISIBLE copy (a dialog animating in); if it never
  // shows, fall back to a hidden one (e.g. a visually-hidden file input is
  // still clickable), and only then report "not found".
  return pollUntil(
    () => findVisibleAgentEl(agentId),
    LOOKUP_GRACE_MS,
    () => notFoundError(agentId),
  ).catch((e) => {
    if (isAbortError(e)) throw e;
    const hidden = findAgentEl(agentId);
    if (hidden) return hidden;
    throw e;
  });
}

/** Presence is visual only: an exception there must never fail the action —
 *  except an abort, which must propagate. */
async function visual(fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (isAbortError(e)) throw e;
  }
}

// ── realistic event dispatch ─────────────────────────────────────────────────

function centre(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function isFocusable(el: HTMLElement): boolean {
  return el.tabIndex >= 0 || el.isContentEditable || formControlOf(el) === el;
}

/**
 * pointerover → pointermove → pointerdown → mousedown → (focus) → pointerup →
 * mouseup → click. Exactly ONE click event is dispatched; a MouseEvent `click`
 * runs the element's activation behaviour (link follow, checkbox toggle, form
 * submit) even when synthetic, so no extra el.click() is needed. Like a real
 * browser, a cancelled pointerdown suppresses the compat mouse events, and a
 * cancelled mousedown suppresses the focus change.
 */
function dispatchClick(el: HTMLElement): void {
  const { x, y } = centre(el);
  const mouse: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x + window.screenX,
    screenY: y + window.screenY,
    button: 0,
  };
  const pointer = (buttons: number): PointerEventInit => ({
    ...mouse,
    buttons,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    width: 1,
    height: 1,
    pressure: buttons ? 0.5 : 0,
  });

  el.dispatchEvent(new PointerEvent('pointerover', pointer(0)));
  el.dispatchEvent(new PointerEvent('pointermove', pointer(0)));
  const downOk = el.dispatchEvent(new PointerEvent('pointerdown', pointer(1)));
  if (downOk) {
    const mdOk = el.dispatchEvent(new MouseEvent('mousedown', { ...mouse, buttons: 1, detail: 1 }));
    if (mdOk && isFocusable(el) && el.isConnected) el.focus({ preventScroll: true });
  }
  // The pointerdown handler may have re-rendered / removed the node (Radix
  // opens a portal). Up + click still go to the original target, as in a
  // real browser where the press started.
  el.dispatchEvent(new PointerEvent('pointerup', pointer(0)));
  if (downOk) el.dispatchEvent(new MouseEvent('mouseup', { ...mouse, buttons: 0, detail: 1 }));
  el.dispatchEvent(new MouseEvent('click', { ...mouse, buttons: 0, detail: 1 }));
}

function dispatchKey(el: Element, key: string, code = key): void {
  const init: KeyboardEventInit = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...(key === 'Enter' ? { keyCode: 13, which: 13 } : key === 'Escape' ? { keyCode: 27, which: 27 } : {}),
  } as KeyboardEventInit;
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  if (key === 'Enter') el.dispatchEvent(new KeyboardEvent('keypress', { ...init, charCode: 13 }));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
}

// ── React-compatible value writes ────────────────────────────────────────────

/** React tracks the last value it rendered on the node; writing via
 *  `el.value = …` updates that tracker too, so React thinks nothing changed and
 *  swallows the input event. The PROTOTYPE setter bypasses the tracker. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fireInput(el: Element, data: string | null, inputType = 'insertText'): void {
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data, inputType }));
}

function fireChange(el: Element): void {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Split text so the typewriter takes ~30ms/char but never more than ~2.5s. */
function chunksOf(text: string): string[] {
  if (!text) return [];
  const maxChunks = Math.max(1, Math.floor(MAX_TYPE_MS / CHAR_DELAY_MS));
  const size = text.length <= maxChunks ? 1 : Math.ceil(text.length / maxChunks);
  const out: string[] = [];
  // Array.from keeps surrogate pairs (emoji) intact.
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(''));
  return out;
}

async function typeIntoControl(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  clear: boolean,
): Promise<void> {
  if (el.disabled) throw new Error(`“${labelOf(el) || 'This field'}” is disabled.`);
  if (el.readOnly) throw new Error(`“${labelOf(el) || 'This field'}” is read-only.`);
  el.focus({ preventScroll: true });
  let current = clear ? '' : el.value;
  if (clear && el.value !== '') {
    setNativeValue(el, '');
    fireInput(el, null, 'deleteContentBackward');
  }
  for (const chunk of chunksOf(text)) {
    await guard();
    current += chunk;
    setNativeValue(el, current);
    fireInput(el, chunk);
    await sleep(CHAR_DELAY_MS);
  }
  fireChange(el);
}

function selectContents(host: HTMLElement, collapseToEnd: boolean): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(host);
  if (collapseToEnd) range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** contenteditable (TipTap / ProseMirror): execCommand fires the beforeinput /
 *  input events those editors listen to, so their state stays in sync. */
async function typeIntoEditable(host: HTMLElement, text: string, clear: boolean): Promise<void> {
  host.focus({ preventScroll: true });
  // Clear → select everything so the first insert replaces it; otherwise
  // append at the end rather than wherever a stale caret was.
  selectContents(host, !clear);
  if (clear && !text) {
    document.execCommand('delete', false);
    return;
  }
  let first = true;
  for (const chunk of chunksOf(text)) {
    await guard();
    const lines = chunk.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) document.execCommand('insertParagraph', false);
      if (lines[i]) {
        const ok = document.execCommand('insertText', false, lines[i]);
        if (!ok && first) throw new Error('This editor did not accept typed text.');
        first = false;
      }
    }
    await sleep(CHAR_DELAY_MS);
  }
}

// ── select helpers ───────────────────────────────────────────────────────────

const OPTION_SEL =
  '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [cmdk-item]';

const norm = (s: string | null | undefined) => collapse(s).toLowerCase();

function visibleOptions(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(OPTION_SEL)).filter(
    (o) => !o.closest(OPERATOR_UI_SEL) && isVisible(o),
  );
}

function optionText(o: HTMLElement): string {
  return collapse(o.getAttribute('aria-label') || o.textContent);
}

function matchOption(options: HTMLElement[], value: string): HTMLElement | null {
  const want = norm(value);
  const exact = options.find(
    (o) => norm(optionText(o)) === want || norm(o.getAttribute('data-value')) === want,
  );
  if (exact) return exact;
  // Fall back to a UNIQUE partial match ("Editor" vs "Editor — can publish").
  const partial = options.filter((o) => norm(optionText(o)).includes(want));
  return partial.length === 1 ? partial[0] : null;
}

function listNames(names: string[]): string {
  const uniq = [...new Set(names.filter(Boolean))];
  const shown = uniq.slice(0, 30).map((n) => `“${n}”`);
  return shown.length ? shown.join(', ') + (uniq.length > 30 ? ', …' : '') : 'none';
}

// ── the driver ───────────────────────────────────────────────────────────────

const stripQuery = (path: string) => path.split(/[?#]/)[0] || '/';
const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

export function createUiDriver(): UiDriver {
  const point = async (agentId: string, label?: string): Promise<HTMLElement> => {
    await guard();
    const el = await resolveEl(agentId);
    await visual(() => presence.moveCursorTo(el, label ?? (labelOf(el) || undefined), currentSignal()));
    await guard();
    return el;
  };

  const click = async (agentId: string, label?: string): Promise<void> => {
    const el = await point(agentId, label);
    if (isDisabled(el)) throw new Error(`“${labelOf(el) || nameFromAgentId(agentId)}” is disabled right now.`);
    await visual(() => presence.clickPulse());
    await guard();
    dispatchClick(el);
    await frame();
  };

  const waitForRoute = async (prefix: string, timeoutMs = DEFAULT_WAIT_MS): Promise<void> => {
    await guard();
    const want = trimSlash(prefix);
    await pollUntil(
      () => (trimSlash(window.location.pathname).startsWith(want) ? true : null),
      timeoutMs,
      () =>
        new Error(
          `Timed out waiting for ${prefix} — the app is at ${window.location.pathname}` +
            ' (it may have redirected, e.g. no access or not signed in).',
        ),
    );
  };

  const driver: UiDriver = {
    point,
    click,

    async type(agentId, text, opts) {
      const anchor = await point(agentId);
      const clear = !!opts?.clear;
      const control = formControlOf(anchor);
      if (control instanceof HTMLSelectElement) {
        throw new Error(`“${labelOf(anchor) || nameFromAgentId(agentId)}” is a dropdown — use select, not type.`);
      }
      if (control) {
        await typeIntoControl(control, text, clear);
      } else {
        const host = editableOf(anchor);
        if (!host) throw new Error(`“${labelOf(anchor) || nameFromAgentId(agentId)}” is not a text field.`);
        await typeIntoEditable(host, text, clear);
      }
      if (opts?.submit) {
        await guard();
        const target: HTMLElement = control ?? editableOf(anchor) ?? anchor;
        const form = target.closest('form');
        if (form) {
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        } else {
          dispatchKey(target, 'Enter');
        }
        await frame();
      }
    },

    async select(agentId, value) {
      const anchor = await point(agentId);
      const control = formControlOf(anchor);

      if (control instanceof HTMLSelectElement) {
        if (control.disabled) throw new Error(`“${labelOf(anchor) || nameFromAgentId(agentId)}” is disabled right now.`);
        const want = norm(value);
        const opts = Array.from(control.options);
        const opt =
          opts.find((o) => norm(o.value) === want) ?? opts.find((o) => norm(o.textContent) === want);
        if (!opt) {
          throw new Error(
            `No option ${quoteRef(value, 'with that value')} in “${labelOf(anchor) || nameFromAgentId(agentId)}”. Options: ${listNames(
              opts.map((o) => collapse(o.textContent) || o.value),
            )}.`,
          );
        }
        control.focus({ preventScroll: true });
        setNativeValue(control, opt.value);
        fireInput(control, null, 'insertReplacementText');
        fireChange(control);
        return;
      }

      // Custom combobox / menu: open it (unless it already is), then click the
      // matching option — clicking an already-open Radix trigger CLOSES it.
      const trigger = anchor.matches('[aria-expanded]') ? anchor : anchor.querySelector('[aria-expanded]');
      if (trigger?.getAttribute('aria-expanded') !== 'true') await click(agentId);
      const option = await pollUntil(
        () => {
          const opts = visibleOptions();
          return opts.length ? matchOption(opts, value) : null;
        },
        2500,
        () => {
          const names = visibleOptions().map(optionText);
          // Close the menu so the screen is not left with a stray popover.
          const active = document.activeElement ?? document.body;
          dispatchKey(active, 'Escape');
          return new Error(
            names.length
              ? `No option ${quoteRef(value, 'with that value')} in “${labelOf(anchor) || nameFromAgentId(agentId)}”. Options: ${listNames(names)}.`
              : `Clicking “${labelOf(anchor) || nameFromAgentId(agentId)}” did not open a list of options.`,
          );
        },
      );
      await visual(() => presence.moveCursorTo(option, optionText(option), currentSignal()));
      await guard();
      if (isDisabled(option)) throw new Error(`Option “${optionText(option)}” is disabled.`);
      await visual(() => presence.clickPulse());
      dispatchClick(option);
      await frame();
    },

    async waitFor(agentId, timeoutMs = DEFAULT_WAIT_MS) {
      await guard();
      return pollUntil(
        () => findVisibleAgentEl(agentId),
        timeoutMs,
        () =>
          findAgentEl(agentId)
            ? new Error(`“${agentId}” is on the page but stayed hidden for ${Math.round(timeoutMs / 1000)}s.`)
            : notFoundError(agentId, `Timed out after ${Math.round(timeoutMs / 1000)}s: no visible element`),
      );
    },

    async navigate(path) {
      await guard();
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
        throw new Error(`Only in-app paths starting with "/" can be opened (got "${path}").`);
      }
      getRouterNavigate()(path);
      await waitForRoute(stripQuery(path));
      await settle();
    },

    waitForRoute,

    flash(agentId) {
      const el = findAgentEl(agentId);
      if (!el) return;
      try {
        presence.flash(el);
      } catch {
        /* visual only */
      }
    },

    step(label) {
      useOperator.getState().pushStep(label);
    },

    progress(p) {
      useOperator.getState().setProgress(p);
    },

    async confirm(summary) {
      await guard();
      const ok = await useOperator.getState().requestConfirm(summary);
      // The user approved this step: the app's own window.confirm() for it
      // (Delete…, Start over…, a rebuild) answers OK too — see nativeDialogs.
      // Capped at the end of the current tool call.
      if (ok) grantPreApproval();
      return ok;
    },

    // A getter: stop() + startRun() swap the controller, and a driver created
    // once must always hand out the CURRENT run's signal.
    get signal() {
      return currentSignal();
    },
  };

  return driver;
}
