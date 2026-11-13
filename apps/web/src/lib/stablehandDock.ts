// ---------------------------------------------------------------------------
// The Stable Hand dock, for code that measures the screen in JS.
//
// On desktop the open assistant is docked on the right and the site is pushed
// left (index.css, "THE STABLE HAND DOCK"). CSS layouts follow --stablehand-w on
// their own; code that clamps something to `window.innerWidth` (a popover, a
// drag handle) asks here how much of the right edge the dock has taken.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

/** Where the assistant docks beside the site; below it, it is a bottom sheet. */
export const STABLEHAND_DOCK_QUERY = '(min-width: 1024px)';

/** `inset: 0` for an inline-styled full-screen overlay, stopping at the dock
 *  (the class version is `inset-stablehand`). */
export const STABLEHAND_INSET = '0 var(--stablehand-w, 0px) 0 0';

/** Pixels the docked Stable Hand takes from the right edge (0 when closed / small screens). */
export function stablehandReserve(): number {
  if (typeof document === 'undefined') return 0;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--stablehand-w');
    return parseFloat(v) || 0;
  } catch {
    return 0;
  }
}

/** True while the screen is wide enough to dock (the side panel, not the sheet). */
export function useStablehandDockLayout(): boolean {
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(STABLEHAND_DOCK_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(STABLEHAND_DOCK_QUERY);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return match;
}
