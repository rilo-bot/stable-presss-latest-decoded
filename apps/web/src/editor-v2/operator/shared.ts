// ---------------------------------------------------------------------------
// Magazine Builder v2 — Operator pack helpers (shared by the home + editor
// action hooks).
//
// Nothing here writes anything. These are the small waits and lookups an action
// needs between driving the real UI (ui.click / ui.type) and reporting what
// happened: "is this anchor on screen right now", "wait until the store says the
// share landed", "who is 'Ahmed' in the staff directory".
//
// The staff directory is fetched through the SAME GET the Share dialog makes
// (api.staffDirectory → /api/staff/directory) and kept in a module cache, because
// an action's confirm(args) is synchronous and must be able to name the person
// ("Share page 2 with Ahmed Khan?") without a request of its own.
// ---------------------------------------------------------------------------

import { agentSel, type UiDriver } from '@/agent/operator/contracts';
import * as api from '../api';
import type { StaffEntry, V2Collaborator, PageSummary } from '../api';

/** The anchored element, if it is in the DOM right now (no waiting). */
export function anchor(agentId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(agentSel(agentId));
}

/** True when the anchor is present and not disabled. */
export function isEnabled(agentId: string): boolean {
  const el = anchor(agentId);
  return !!el && !(el as HTMLButtonElement).disabled;
}

const abortError = () => new DOMException('The Stable Hand was stopped.', 'AbortError');

/**
 * Poll `pred` until it returns a truthy value, the timeout passes (throws with
 * `what`), or the run is stopped (AbortError). Used for state the UI reaches
 * asynchronously — a store field after a request, a dialog after a click.
 */
export async function waitUntil<T>(
  pred: () => T | null | undefined | false,
  opts: { signal?: AbortSignal; timeoutMs?: number; intervalMs?: number; what?: string } = {},
): Promise<T> {
  const { signal, timeoutMs = 15_000, intervalMs = 200, what = 'the screen to update' } = opts;
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) throw abortError();
    const v = pred();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}.`);
    await sleep(intervalMs, signal);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * On a PHONE the studio folds its toolbar's undo/redo, zoom, review-board and
 * view-live controls into the More menu (same anchors). Before acting on one of
 * those, open More when the anchor is not already on screen. A no-op on tablet /
 * desktop, where they are toolbar buttons and `anchor(item)` is found at once.
 * Returns whether `item` is now present; when the menu turns out not to offer it,
 * the menu is closed again and false is returned (the caller reports why).
 */
export async function revealToolbarItem(ui: UiDriver, item: string, timeoutMs = 2500): Promise<boolean> {
  if (anchor(item)) return true;
  // Only a phone layout moves these into More (same breakpoint as the studio's
  // useIsPhone). Elsewhere a missing anchor genuinely means "not offered".
  if (window.matchMedia('(min-width: 768px)').matches) return false;
  const more = anchor('mag.more-button');
  if (!more) return false;
  if (more.getAttribute('aria-expanded') !== 'true') await ui.click('mag.more-button', 'More');
  try {
    await waitUntil(() => !!anchor(item), { signal: ui.signal, timeoutMs, what: item });
    return true;
  } catch (e) {
    if (ui.signal.aborted) throw e;
    if (anchor('mag.more-button')?.getAttribute('aria-expanded') === 'true') await ui.click('mag.more-button', 'More');
    return false;
  }
}

/** Click an anchor only if it is on screen; returns whether it clicked. */
export async function clickIfPresent(ui: UiDriver, agentId: string, label?: string): Promise<boolean> {
  if (!anchor(agentId)) return false;
  await ui.click(agentId, label);
  return true;
}

/** Refuse a disabled control WITH its reason (the UI puts it in `title`). */
export function assertEnabled(agentId: string, fallback: string): void {
  const el = anchor(agentId);
  if (!el) throw new Error(fallback);
  if ((el as HTMLButtonElement).disabled) {
    throw new Error(el.getAttribute('title') || fallback);
  }
}

// ── Toasts ───────────────────────────────────────────────────────────────────
//
// Several store handlers (Fill/Adjust, the page "publish" tick, the cover, review
// moves) report their outcome ONLY as a sonner toast. Reading the toast the user
// is shown is how an action learns what the click really did, without a private
// path. Toasts auto-dismiss after a few seconds, so this polls for the whole run
// instead of looking once at the end.

export interface SeenToast {
  /** sonner's data-type: success | error | warning | info | default | loading … */
  type: string;
  text: string;
}

/** Start collecting toasts that appear from now on. peek() reads the list so far;
 *  stop() ends the watch and returns it. Always stop() (try/finally). */
export function watchToasts(intervalMs = 150): { peek: () => SeenToast[]; stop: () => SeenToast[] } {
  const before = new Set(document.querySelectorAll('[data-sonner-toast]'));
  const seen = new Map<Element, SeenToast>();
  const scan = () => {
    document.querySelectorAll('[data-sonner-toast]').forEach((el) => {
      if (before.has(el)) return;
      const title = el.querySelector('[data-title]')?.textContent ?? '';
      const desc = el.querySelector('[data-description]')?.textContent ?? '';
      const text = [title, desc].map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' — ') || (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      seen.set(el, { type: el.getAttribute('data-type') || 'default', text: text.slice(0, 300) });
    });
  };
  scan();
  const t = window.setInterval(scan, intervalMs);
  const list = () => {
    scan();
    // Same message twice (re-render) collapses to one.
    const out: SeenToast[] = [];
    for (const v of seen.values()) if (!out.some((o) => o.text === v.text)) out.push(v);
    return out;
  };
  return {
    peek: list,
    stop: () => {
      window.clearInterval(t);
      return list();
    },
  };
}

export const errorToasts = (ts: SeenToast[]) => ts.filter((t) => t.type === 'error');

// ── Pages ────────────────────────────────────────────────────────────────────

/** "page 4" · "pages 4 and 5" · "pages 4, 5 and 9" — same wording as the Share dialog. */
export function pageListLabel(numbers: number[]): string {
  const n = Array.from(new Set(numbers)).sort((a, b) => a - b);
  if (n.length === 0) return 'no pages';
  if (n.length === 1) return `page ${n[0]}`;
  return `pages ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/**
 * A page's REAL number: index + 1 — what the canvas header prints ("Page 3"),
 * what the server's getMagazine reports and what the Magazine AI Studio means by
 * "page 3". The ONE numbering the Operator uses. It differs from the position in
 * `pages` for a page-scoped collaborator, who only receives their own pages:
 * their single page is "Page 3" at list position 1. Using the position made the
 * Stable Hand call it "page 1" and ask the studio about a page the user can't open.
 */
export function pageNo(p: PageSummary): number {
  return p.index + 1;
}

/** Real page number of a page id in this list (null when not visible here). */
export function pageNoOf(pages: PageSummary[], id: string | null | undefined): number | null {
  if (!id) return null;
  const p = pages.find((x) => x.id === id);
  return p ? pageNo(p) : null;
}

/** Real page number (as printed on the canvas) → the page, or a clear error
 *  listing the pages this user can actually open. */
export function pageAt(pages: PageSummary[], n: number): PageSummary {
  const p = pages.find((x) => pageNo(x) === n);
  if (!p) {
    if (pages.length === 0) throw new Error('This magazine has no pages yet.');
    const open = pages.map(pageNo);
    throw new Error(
      `There is no page ${n} you can open here. Pages available: ${open.join(', ')} (numbers as printed on the canvas, "Page N").`,
    );
  }
  return p;
}

/** A collaborator's scope as real page numbers (or 'all'), for results. */
export function scopeNumbers(c: V2Collaborator, pages: PageSummary[]): number[] | 'all' {
  if (c.pageIds === 'all') return 'all';
  const num = new Map(pages.map((p) => [p.id, pageNo(p)]));
  return c.pageIds
    .map((id) => num.get(String(id)))
    .filter((n): n is number => !!n)
    .sort((a, b) => a - b);
}

export function collaboratorsOut(cs: V2Collaborator[] | undefined, pages: PageSummary[]) {
  return (cs ?? []).map((c) => ({
    userId: c.userId,
    name: c.displayName || c.email,
    email: c.email,
    pages: scopeNumbers(c, pages),
  }));
}

// ── Staff directory (same GET as the Share dialog) ──────────────────────────

let directoryCache: StaffEntry[] | null = null;

export async function loadDirectory(force = false): Promise<StaffEntry[]> {
  if (directoryCache && !force) return directoryCache;
  const list = await api.staffDirectory();
  directoryCache = Array.isArray(list) ? list : [];
  return directoryCache;
}

export function cachedDirectory(): StaffEntry[] | null {
  return directoryCache;
}

/** Candidates for a free-text person reference: userId, email, or (part of) a name. */
export function matchPeople(list: StaffEntry[], person: string): StaffEntry[] {
  const q = person.trim().toLowerCase();
  if (!q) return [];
  const exact = list.filter((e) => e.userId === person.trim() || e.email.toLowerCase() === q || (e.name || '').toLowerCase() === q);
  if (exact.length > 0) return exact;
  return list.filter((e) => (e.name || '').toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
}

/** Exactly one staff member for `person`, or an error the model can act on. */
export function resolvePerson(list: StaffEntry[], person: string): StaffEntry {
  const hits = matchPeople(list, person);
  if (hits.length === 1) return hits[0]!;
  if (hits.length === 0) throw new Error(`No staff member matches “${person}”. Call magazine.listStaff to see who can be invited.`);
  throw new Error(
    `“${person}” matches ${hits.length} people: ${hits
      .slice(0, 8)
      .map((h) => `${h.name || h.email} <${h.email}> (userId ${h.userId})`)
      .join('; ')}. Ask which one, then pass their userId.`,
  );
}

/** Best-effort display name for confirm cards (synchronous — cache only). */
export function personLabel(person: string, collaborators: V2Collaborator[] | undefined): string {
  const c = (collaborators ?? []).find((x) => x.userId === person || x.email.toLowerCase() === person.trim().toLowerCase());
  if (c) return c.displayName || c.email;
  const list = directoryCache;
  if (list) {
    const hits = matchPeople(list, person);
    if (hits.length === 1) return hits[0]!.name || hits[0]!.email;
  }
  return person;
}
