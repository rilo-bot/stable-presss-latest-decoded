/**
 * Per-entity "skipped onboarding steps", persisted in localStorage (pure UI
 * state — no server/domain change). A skipped step counts as resolved so the
 * member can finish onboarding without it; the underlying field/box stays
 * editable so anything skipped can still be filled later.
 *
 * `scope` namespaces the key per entity (e.g. a horse id, or `party:<id>`) so a
 * horse and a party never share a skip set.
 */
const KEY = (scope: string) => `sp-onb-skip:${scope}`;

export function loadSkippedSteps(scope: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY(scope));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function persistSkippedSteps(scope: string, set: Set<string>) {
  try { localStorage.setItem(KEY(scope), JSON.stringify([...set])); } catch { /* storage unavailable — non-fatal */ }
}

/**
 * Whether the member has closed the guided onboarding journey for this entity.
 * Closing dismisses the centered focus overlay + mascot so they don't have to
 * skip all nine steps one by one; anything already entered is saved (fields
 * commit immediately), and the in-place editors + checklist stay available to
 * finish later. Persisted per scope so the journey doesn't re-pop on revisit.
 */
const DISMISS_KEY = (scope: string) => `sp-onb-dismissed:${scope}`;

export function loadGuideDismissed(scope: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY(scope)) === '1';
  } catch {
    return false;
  }
}

export function persistGuideDismissed(scope: string, dismissed: boolean) {
  try {
    if (dismissed) localStorage.setItem(DISMISS_KEY(scope), '1');
    else localStorage.removeItem(DISMISS_KEY(scope));
  } catch { /* storage unavailable — non-fatal */ }
}
