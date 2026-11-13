// ---------------------------------------------------------------------------
// presence — the Operator's VISIBLE hands (implements PresenceApi).
//
// The runtime's UiDriver calls these around every real DOM action so the user
// can watch The Stable Hand work: the gold ghost cursor glides to the target,
// the target wears a gold ring, a click ripples, a changed element flashes.
//
// Rules this file keeps:
//   - Overlay boxes only. We NEVER touch the target element's own style /
//     classes / attributes (the one exception is scrollIntoView, which moves
//     the page, not the element) — so app styling can't be corrupted and a
//     stopped run leaves nothing behind.
//   - The glide animates framer-motion MotionValues (presenceStore cursorX/Y),
//     not the zustand store, so it's 60fps with zero React renders; the final
//     x/y is written back to useOperator().cursor when the motion ends.
//   - Abort-aware: a stopped run rejects with an AbortError mid-scroll or
//     mid-glide, like every other UiDriver step.
//   - prefers-reduced-motion (or a hidden tab, where rAF is paused) = instant.
// ---------------------------------------------------------------------------

import { animate } from 'framer-motion';
import { stablehandReserve } from '@/lib/stablehandDock';
import type { PresenceApi } from '../contracts';
import { useOperator } from '../operatorStore';
import { cursorX, cursorY, glide, prefersReducedMotion, usePresenceOverlay } from './presenceStore';

/** Gentle ease-out (quint-ish): fast departure, soft landing like a hand. */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const FLASH_MS = 900;
const CLICK_MS = 220;
/** Space the pill occupies at the top of the viewport — an element hiding
 *  under it doesn't count as "fully visible". */
const TOP_PAD = 64;
const EDGE_PAD = 8;

const abortError = () => new DOMException('The Stable Hand was stopped.', 'AbortError');

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const instant = () => prefersReducedMotion() || (typeof document !== 'undefined' && document.hidden);

// ── Geometry ────────────────────────────────────────────────────────────────

/** Does the element need scrolling to be properly on screen? Elements taller /
 *  wider than the viewport count as visible once they span its middle. */
function scrollPlan(el: Element): ScrollIntoViewOptions | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null; // not rendered — scrolling won't help
  // The site's own width: the docked Stable Hand takes the right edge. A grid
  // cell scrolled out of its overflow-x container to the right (Roles &
  // Permissions on a laptop) is NOT on screen just because it is < innerWidth —
  // it sits under the panel; scrollIntoView brings it into the container's view.
  const vw = Math.max(320, window.innerWidth - stablehandReserve());
  const vh = window.innerHeight;

  const fitsV = r.height <= vh - TOP_PAD - EDGE_PAD;
  const okV = fitsV ? r.top >= TOP_PAD && r.bottom <= vh - EDGE_PAD : r.top <= vh * 0.4 && r.bottom >= vh * 0.6;
  const fitsH = r.width <= vw - EDGE_PAD * 2;
  const okH = fitsH ? r.left >= EDGE_PAD && r.right <= vw - EDGE_PAD : r.left <= vw * 0.4 && r.right >= vw * 0.6;
  if (okV && okH) return null;

  return {
    behavior: instant() ? 'auto' : 'smooth',
    block: okV ? 'nearest' : fitsV ? 'center' : 'start',
    inline: okH ? 'nearest' : fitsH ? 'center' : 'start',
  };
}

/** Centre of the element's VISIBLE part (so a huge element is pointed at where
 *  the user can actually see it), clamped inside the viewport. */
function targetPoint(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(r.left, 0);
  const right = Math.min(r.right, vw);
  const top = Math.max(r.top, 0);
  const bottom = Math.min(r.bottom, vh);
  const cx = right > left ? (left + right) / 2 : r.left + r.width / 2;
  const cy = bottom > top ? (top + bottom) / 2 : r.top + r.height / 2;
  return {
    x: Math.round(Math.min(Math.max(cx, 4), vw - 4)),
    y: Math.round(Math.min(Math.max(cy, 4), vh - 4)),
  };
}

/** Share of `t`'s area that `cover` hides (0..1). */
function coveredFraction(t: DOMRect, cover: DOMRect): number {
  const area = t.width * t.height;
  if (area <= 0) return 0;
  const w = Math.min(t.right, cover.right) - Math.max(t.left, cover.left);
  const h = Math.min(t.bottom, cover.bottom) - Math.max(t.top, cover.top);
  return w > 0 && h > 0 ? (w * h) / area : 0;
}

/** Is `t` hidden enough by `cover` that the user can't see it being worked on?
 *  Its centre under the cover, OR a quarter of it — a button whose lower half
 *  slips under the phone bottom sheet's top edge is still "covered", even
 *  though its centre peeks out. */
function isCovered(t: DOMRect, cover: DOMRect): boolean {
  const cx = t.left + t.width / 2;
  const cy = t.top + t.height / 2;
  const centre = cx >= cover.left && cx <= cover.right && cy >= cover.top && cy <= cover.bottom;
  return centre || coveredFraction(t, cover) >= 0.25;
}

/** Where a freshly shown cursor enters from: The Stable Hand launcher corner,
 *  so it reads as the assistant reaching out into the page. */
function originPoint(): { x: number; y: number } {
  return { x: window.innerWidth - 48, y: window.innerHeight - 48 };
}

/** Resolve once the element has stopped moving (smooth scroll finished, any
 *  nested scroller included) — 6 identical frames, capped at 1.5s. */
function waitForSettle(el: Element, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const key = () => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.left)},${Math.round(r.top)}`;
    };
    let last = key();
    let stable = 0;
    let raf = 0;
    const cleanup = () => {
      cancelAnimationFrame(raf);
      clearTimeout(cap);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cap = setTimeout(() => {
      cleanup();
      resolve();
    }, 1500);
    const tick = () => {
      const k = key();
      if (k === last) {
        if (++stable >= 6) {
          cleanup();
          resolve();
          return;
        }
      } else {
        stable = 0;
        last = k;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ── The glide ───────────────────────────────────────────────────────────────

/** The glide in flight, if any. A new glide supersedes it (the old promise
 *  resolves where the cursor got to — it was replaced, not stopped). */
let current: { cancel: () => void } | null = null;

function cancelGlide() {
  const c = current;
  current = null;
  c?.cancel();
}

function commitCursorPosition() {
  useOperator.getState().setCursor({ x: Math.round(cursorX.get()), y: Math.round(cursorY.get()) });
}

function glideTo(x: number, y: number, signal?: AbortSignal): Promise<void> {
  const sx = cursorX.get();
  const sy = cursorY.get();
  const dist = Math.hypot(x - sx, y - sy);
  if (dist < 1) {
    cursorX.set(x);
    cursorY.set(y);
    commitCursorPosition();
    return Promise.resolve();
  }
  // ~250ms for a hop, up to ~700ms across a wide screen.
  const ms = Math.min(700, Math.max(250, 220 + dist * 0.42));

  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const finish = (err?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      signal?.removeEventListener('abort', onAbort);
      if (current === handle) current = null;
      glide.active = false;
      commitCursorPosition();
      if (err) reject(err);
      else resolve();
    };

    // Any sync animation GhostCursor started on these values yields to us.
    cursorX.stop();
    cursorY.stop();
    glide.active = true;

    const controls = animate(0, 1, {
      duration: ms / 1000,
      ease: EASE_OUT,
      onUpdate: (t) => {
        cursorX.set(sx + (x - sx) * t);
        cursorY.set(sy + (y - sy) * t);
      },
      onComplete: () => {
        cursorX.set(x);
        cursorY.set(y);
        finish();
      },
    });

    const handle = {
      cancel: () => {
        controls.stop();
        finish();
      },
    };
    current = handle;

    const onAbort = () => {
      controls.stop();
      finish(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    // Belt-and-braces: if the frame loop stalls (tab backgrounded mid-glide),
    // land the cursor anyway so the run never hangs on a visual.
    const safety = setTimeout(() => {
      controls.stop();
      cursorX.set(x);
      cursorY.set(y);
      finish();
    }, ms + 500);
  });
}

// ── The API ─────────────────────────────────────────────────────────────────

export const presence: PresenceApi = {
  async moveCursorTo(el, label, signal) {
    throwIfAborted(signal);

    // 1. Bring it on screen (and let a smooth scroll finish before aiming).
    const plan = scrollPlan(el);
    if (plan) {
      el.scrollIntoView(plan);
      if (plan.behavior === 'smooth') await waitForSettle(el, signal);
    }
    throwIfAborted(signal);
    if (!el.isConnected) return; // re-rendered away while we scrolled

    // 1b. If the docked The Stable Hand panel covers the target (the editor's
    //     top-right toolbar sits under it), make the panel step aside so the
    //     user can SEE what is being clicked. Uses the panel's layout rect, so
    //     it works whether or not the panel is currently faded.
    const panel = document.querySelector('[data-operator-panel]');
    if (panel && !panel.contains(el)) {
      const covered = isCovered(el.getBoundingClientRect(), panel.getBoundingClientRect());
      const was = useOperator.getState().panelYield;
      useOperator.getState().setPanelYield(covered);
      if (covered && !was && !instant()) {
        await sleep(220);
        throwIfAborted(signal);
      }
    }

    // 1c. Same for the working pill: fixed top toolbars (the magazine editor's
    //     Back / Review / Publish on a phone) sit under it and can't be scrolled
    //     out. Any overlap counts — the pill is small and opaque.
    const pill = document.querySelector('[data-operator-pill]');
    const overlay = usePresenceOverlay.getState();
    if (pill && !pill.contains(el)) {
      overlay.setPillYield(coveredFraction(el.getBoundingClientRect(), pill.getBoundingClientRect()) > 0);
    } else if (overlay.pillYield) {
      overlay.setPillYield(false);
    }

    // 2. Show the cursor (entering from the launcher corner if it was hidden)
    //    and ring the target while we travel to it.
    cancelGlide();
    const op = useOperator.getState();
    if (!op.cursor.visible) {
      const o = originPoint();
      cursorX.stop();
      cursorY.stop();
      cursorX.set(o.x);
      cursorY.set(o.y);
    }
    usePresenceOverlay.getState().setHighlight(el);
    op.setCursor({ visible: true, label: label || undefined });

    // 3. Glide.
    const { x, y } = targetPoint(el);
    if (instant()) {
      cursorX.stop();
      cursorY.stop();
      cursorX.set(x);
      cursorY.set(y);
      commitCursorPosition();
      return;
    }
    await glideTo(x, y, signal);
  },

  async clickPulse() {
    const op = useOperator.getState();
    op.setCursor({ clickSeq: op.cursor.clickSeq + 1 });
    await sleep(prefersReducedMotion() ? 120 : CLICK_MS);
  },

  highlight(el) {
    usePresenceOverlay.getState().setHighlight(el && el.isConnected ? el : null);
  },

  flash(el) {
    if (!el.isConnected) return;
    const store = usePresenceOverlay.getState();
    const id = store.addFlash(el);
    setTimeout(() => usePresenceOverlay.getState().removeFlash(id), FLASH_MS + 50);
  },

  hideCursor() {
    cancelGlide();
    const op = useOperator.getState();
    if (op.cursor.visible || op.cursor.label !== undefined) op.setCursor({ visible: false, label: undefined });
    usePresenceOverlay.getState().setHighlight(null);
    usePresenceOverlay.getState().setPillYield(false);
  },
};
