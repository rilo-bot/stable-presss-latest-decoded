// ---------------------------------------------------------------------------
// Magazine Builder v2 — Operator pack helpers (shared by the home + editor
// action hooks).
//
// Nothing here writes anything. These are the small waits and lookups an action
// needs between driving the real UI (ui.click / ui.type) and reporting what
// happened: "is this anchor on screen right now", "open page 3 and let the canvas
// settle", "wait until the store says the share landed", "who is 'Ahmed' in the
// staff directory".
//
// The staff directory is fetched through the SAME GET the Share dialog makes
// (/api/staff/directory) and cached in agent/operator/runtime/people.ts, shared
// with every pack. A confirm card must name the person ("Share page 2 with
// Ahmed Khan?"), never their userId — for someone who is not loaded yet the
// confirm is async and looks them up (personLabelAsync).
// ---------------------------------------------------------------------------

import { agentSel, type UiDriver } from '@/agent/operator/contracts';
import { actionError, personDisplayWithEmail, quoteRef } from '@/agent/operator/runtime/humanRef';
import {
  cachedStaffDirectory,
  loadStaffDirectory,
  personLabel as resolvePersonLabel,
  personLabelNow,
} from '@/agent/operator/runtime/people';
import { useAuthStore } from '@/stores/authStore';
import { useEditorStore } from '../store';
import type { StaffEntry, V2Collaborator, PageSummary } from '../api';

/**
 * Staff permission `magazine.edit` (fails open when the access payload is
 * missing, exactly like the studio's own "view only" label and the AI Studio's
 * lock). The server gates EVERY write in the Magazine Builder on it — a share, a
 * rename, a page, a publish, a studio turn — so without it the magazine is
 * view-only even for its owner or a collaborator, and the write actions are not
 * offered. (Deleting the whole magazine needs `magazine.delete` instead.)
 */
export function useRoleCanEditMagazines(): boolean {
  return useAuthStore((st) => {
    const held = st.currentUser?.access?.permissions;
    return !held || held.includes('magazine.edit');
  });
}

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
/** Errors AND warnings — several store paths report a refusal as a warning
 *  ("Couldn't undo that — the page has changed since."). */
export const problemToasts = (ts: SeenToast[]) => ts.filter((t) => t.type === 'error' || t.type === 'warning');
/** The first error toast's text, if one has appeared. */
export const firstError = (ts: SeenToast[]): string | undefined => errorToasts(ts)[0]?.text;

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

/**
 * Count how often the store's page list is REPLACED from now on. A publish tick
 * (store.setPageSelected) replaces it twice: the optimistic list at once, then the
 * server's reply (or the rollback that comes with an error toast). Comparing array
 * identity after the click raced a fast reply — counting the replacements cannot.
 */
export function watchPageList(): { count: () => number; stop: () => void } {
  let n = 0;
  const unsub = useEditorStore.subscribe((s, prev) => {
    if (s.pages !== prev.pages) n++;
  });
  return { count: () => n, stop: unsub };
}

/** Open the page rail if it is collapsed (it starts collapsed). */
export async function ensureRail(ui: UiDriver): Promise<void> {
  if (anchor('mag.pages-rail')) return;
  await ui.click('mag.pages-show', 'Show the pages');
  await ui.waitFor('mag.pages-rail', 5000);
}

/**
 * Open page n (its REAL number) through the rail, skipped when it is already the
 * open page, and let the canvas settle. The canvas's scroll-settle picker makes
 * whichever page is nearest the middle the active one ~120ms after a scroll
 * stops, so right after the rail's smooth scroll it can still land on a
 * neighbour — and everything that acts on "the open page" (the studio, Use these
 * changes, Copy a page exactly) would then act on the wrong one. So: wait for the
 * scroll to settle, CHECK the open page again, and re-open it once if it moved.
 */
export async function openPageN(ui: UiDriver, n: number): Promise<PageSummary> {
  const st = () => useEditorStore.getState();
  const target = pageAt(st().pages, n);
  const isOpen = () => st().currentPageId === target.id && st().page?.id === target.id;
  // Already open (nothing scrolls, nothing to settle), else up to two tries.
  for (let attempt = 0; attempt < 2 && !isOpen(); attempt++) {
    await ensureRail(ui);
    await ui.click(`mag.page-${n}`, `Page ${n}`);
    await waitUntil(isOpen, { signal: ui.signal, what: `page ${n} to open` });
    await sleep(700, ui.signal);
  }
  if (!isOpen()) throw new Error(`Page ${n} would not stay open — the canvas kept moving to another page. Try again.`);
  return target;
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
// One cache for every Operator pack (agent/operator/runtime/people.ts), so a
// name looked up for one confirm card is there for the next.

export async function loadDirectory(force = false): Promise<StaffEntry[]> {
  return loadStaffDirectory(force);
}

export function cachedDirectory(): StaffEntry[] | null {
  return cachedStaffDirectory();
}

/** Candidates for a free-text person reference: userId, email, or (part of) a name. */
export function matchPeople(list: StaffEntry[], person: string): StaffEntry[] {
  const q = person.trim().toLowerCase();
  if (!q) return [];
  const exact = list.filter((e) => e.userId === person.trim() || e.email.toLowerCase() === q || (e.name || '').toLowerCase() === q);
  if (exact.length > 0) return exact;
  return list.filter((e) => (e.name || '').toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
}

/** Exactly one staff member for `person`, or an error the model can act on.
 *  The message names people only (the user reads it under the step); the
 *  candidates' userIds ride in the error's model-only `detail`. */
export function resolvePerson(list: StaffEntry[], person: string): StaffEntry {
  const hits = matchPeople(list, person);
  if (hits.length === 1) return hits[0]!;
  if (hits.length === 0) throw new Error(`No staff member matches ${quoteRef(person)}. Call magazine.listStaff to see who can be invited.`);
  const shown = hits.slice(0, 8);
  throw actionError(
    `${quoteRef(person, 'That reference')} matches ${hits.length} people: ${shown.map((h) => personDisplayWithEmail(h)).join('; ')}. Ask which one, then pass their userId (see detail).`,
    { candidates: shown.map((h) => ({ userId: h.userId, name: h.name || null, email: h.email })) },
  );
}

/** The collaborators as people records (displayName is their name). */
const asPeople = (cs: V2Collaborator[] | undefined) => (cs ?? []).map((c) => ({ userId: c.userId, name: c.displayName, email: c.email }));

/** Display name for a confirm card from what is loaded already (sync).
 *  Name → email → "this staff member"; never the raw userId. */
export function personLabel(person: string, collaborators: V2Collaborator[] | undefined): string {
  return personLabelNow(person, asPeople(collaborators));
}

/** Display name for a confirm card, fetching the staff directory when the
 *  person is not loaded yet (someone who is not a collaborator). Never throws. */
export function personLabelAsync(person: string, collaborators: V2Collaborator[] | undefined): Promise<string> {
  return resolvePersonLabel(person, asPeople(collaborators));
}
