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
