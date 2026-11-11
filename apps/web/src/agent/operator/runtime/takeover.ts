// ---------------------------------------------------------------------------
// Takeover guard — the user grabbing the wheel pauses the Operator.
//
// If the user clicks or types in the app while the Stablehand is working, the
// two of them would fight over the same UI (the Operator types into a field
// the user just focused, or clicks a button that has moved). So any REAL
// pointerdown / keydown outside the Operator's own chrome pauses the run with
// reason 'takeover'; the panel then offers Resume. Every UiDriver method waits
// on waitUntilRunning(), so the run halts at its next step.
//
// The driver's own events are synthetic (event.isTrusted === false), so they
// can never trip this. Clicks inside [data-operator-ui] (Stop, Resume, the
// confirm card, the chat box) are the user talking TO the Operator, not taking
// over. Bare modifier presses (Shift, Ctrl, …) are ignored so a screenshot
// shortcut or a stray Alt-tab does not pause the run.
// ---------------------------------------------------------------------------

import { OPERATOR_UI_ATTR } from '../contracts';
import { useOperator } from '../operatorStore';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS', 'AltGraph']);

function insideOperatorUi(e: Event): boolean {
  // composedPath() also sees through shadow roots, unlike target.closest().
  for (const n of e.composedPath()) {
    if (n instanceof Element && n.hasAttribute(OPERATOR_UI_ATTR)) return true;
  }
  return false;
}

/** Install the guard (once, e.g. from the panel). Returns an uninstaller. */
export function installTakeoverGuard(): () => void {
  const onEvent = (e: Event) => {
    if (!e.isTrusted) return;
    const st = useOperator.getState();
    if (st.status !== 'working') return;
    if (e instanceof KeyboardEvent && MODIFIER_KEYS.has(e.key)) return;
    if (insideOperatorUi(e)) return;
    st.pause('takeover');
  };
  // Capture phase on window: runs before app handlers that might stop
  // propagation (Radix, ProseMirror).
  window.addEventListener('pointerdown', onEvent, true);
  window.addEventListener('keydown', onEvent, true);
  return () => {
    window.removeEventListener('pointerdown', onEvent, true);
    window.removeEventListener('keydown', onEvent, true);
  };
}
