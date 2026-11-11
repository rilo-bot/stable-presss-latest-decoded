// ---------------------------------------------------------------------------
// Presence-local state — what the overlays need that the shared operatorStore
// deliberately doesn't carry (DOM element refs are not run state).
//
//   highlight   the ONE element wearing the persistent gold ring
//   flashes     short-lived gold glow pulses (several may overlap)
//   cursorX/Y   framer-motion MotionValues the ghost cursor is drawn from.
//               presenceApi glides THESE (60fps, zero React renders) and only
//               writes the final x/y back to useOperator().cursor, so the store
//               stays the source of truth without re-rendering every frame.
//
// Only presence/* imports this file; other layers go through `presence`
// (PresenceApi) or useOperator.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { motionValue } from 'framer-motion';

export interface FlashEntry {
  id: number;
  el: Element;
}

interface PresenceOverlayState {
  highlight: Element | null;
  flashes: FlashEntry[];
  /** The working pill steps aside (fades, lets the pointer through) because the
   *  element the cursor is working on sits underneath it — e.g. a fixed top
   *  toolbar on a phone, which no amount of scrolling moves out from under it. */
  pillYield: boolean;
  setHighlight: (el: Element | null) => void;
  addFlash: (el: Element) => number;
  removeFlash: (id: number) => void;
  setPillYield: (pillYield: boolean) => void;
}

let flashSeq = 0;

export const usePresenceOverlay = create<PresenceOverlayState>((set, get) => ({
  highlight: null,
  flashes: [],
  pillYield: false,
  setPillYield: (pillYield) => {
    if (get().pillYield !== pillYield) set({ pillYield });
  },
  setHighlight: (highlight) => set({ highlight }),
  addFlash: (el) => {
    const id = ++flashSeq;
    // Cap so a runaway loop of flashes can never pile up DOM.
    set((s) => ({ flashes: [...s.flashes, { id, el }].slice(-12) }));
    return id;
  },
  removeFlash: (id) => set((s) => ({ flashes: s.flashes.filter((f) => f.id !== id) })),
}));

/** The ghost cursor's drawn position (the arrow TIP, viewport px). */
export const cursorX = motionValue(0);
export const cursorY = motionValue(0);

/** True while presenceApi owns the cursor motion values (a glide is running),
 *  so GhostCursor doesn't fight it by syncing to the store's x/y. */
export const glide = { active: false };

/** Stable per-element key, so overlays can key AnimatePresence by element. */
const elKeys = new WeakMap<Element, number>();
let elSeq = 0;
export function elementKey(el: Element): number {
  let k = elKeys.get(el);
  if (k === undefined) {
    k = ++elSeq;
    elKeys.set(el, k);
  }
  return k;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
