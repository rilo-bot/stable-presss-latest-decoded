// ---------------------------------------------------------------------------
// Magazine Builder v2 — Operator actions for the STUDIO
// (/production-system/magazine-v2/:id). Catalog twin:
// apps/server/src/lib/agent/operator/catalog/magazine.ts ('magazine-editor').
//
// HOW EACH ACTION ACTS, per THE RULE in agent/operator/contracts.ts:
//
//   driven visibly (ui.click / ui.type / ui.select on data-agent-id anchors):
//     goToPage, addPage, duplicatePage, addAiPages, addMorePages, rename,
//     sharePages, unshare, askStudio, applyStudioChanges, discardStudioChanges,
//     publish, unpublish, fillPage / adjustPage (the per-page AI wands above each
//     page on the canvas), setPageInPublish (that header's "publish" tick), undo,
//     redo, zoom, setCover, openReviewBoard, reviewPages,
//     and movePage when it is a single step (the tile's own ▲/▼ buttons).
//
//   Outcomes that the UI reports only as a toast (Fill/Adjust, the publish tick,
//   the cover, review moves) are read back from the toast the user saw
//   (shared.watchToasts) alongside the store.
//
//   the SAME store handler the button calls, with the cursor pointed at the
//   control first and the result flashed — only where clicking would hit a
//   window.confirm the Operator has already asked for in its own card:
//     deletePage (the tile's 🗑 asks window.confirm) → store.deletePage
//     movePage over more than one slot (drag-and-drop) → store.reorder
//
// Reads (status, listStaff) come from the editor store and the Share dialog's
// own GET. Server RBAC applies to every write exactly as it does for a click;
// the `enabled` flags below keep out of the model's list what the server would
// refuse this user: owner-only writes need ownership, studio writes need the
// magazine shared with you, and EVERY write needs the role's `magazine.edit`
// (publishing also `magazine.publish`). Outcomes the store reports only as a
// toast are read back from it — success is never assumed from "it went quiet".
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { UiDriver } from '@/agent/operator/contracts';
import { useEditorStore } from '../store';
import { buildStatus } from '../buildStatus';
import { columnOf, COLUMN_LABEL, COLUMN_ORDER, publishBlockedReason, readOnlyReason, submittablePages, type ReviewColumn } from '../review';
import { useOperatorJobs } from '@/agent/operator/runtime/jobs';
import { JOB_STARTED_NOTE, magazineBuildJobId, settlePreviousBuildJob, startMagazineBuildJob } from './magazineJobs';
import type { PageSummary, V2Collaborator } from '../api';
import { personDisplay } from '@/agent/operator/runtime/humanRef';
import {
  anchor,
  assertEnabled,
  clickIfPresent,
  collaboratorsOut,
  ensureRail,
  errorToasts,
  firstError,
  loadDirectory,
  matchPeople,
  openPageN,
  pageAt,
  pageListLabel,
  pageNo,
  pageNoOf,
  personLabelAsync,
  problemToasts,
  resolvePerson,
  revealToolbarItem,
  scopeNumbers,
  sleep,
  waitUntil,
  watchPageList,
  watchToasts,
  useRoleCanEditMagazines,
  type SeenToast,
} from './shared';

const get = () => useEditorStore.getState();
const editorRoute = (id: string) => `/production-system/magazine-v2/${id}`;
const isBuilding = () => {
  const s = get();
  return s.generating || s.issue?.status === 'processing';
};

/** The store once the magazine on screen has loaded. */
async function ready(ui: UiDriver) {
  return waitUntil(
    () => {
      const s = get();
      return !s.loading && s.issue ? s : null;
    },
    { signal: ui.signal, timeoutMs: 30_000, what: 'the magazine to load' },
  );
}

/** Refuse a page-structure change while a build runs: the server answers 409
 *  ("still processing") to every structural write until it finishes. */
function refuseWhileBuilding(what: string) {
  if (isBuilding()) {
    throw new Error(`Pages are still being built — ${what} once the build finishes (a [job-update] message arrives when it does).`);
  }
}

/**
 * Click a control whose store handler reports a refusal only as an error toast,
 * then wait for `done`. Fails FAST with the toast's own words instead of sitting
 * out the whole timeout (a 409 used to surface as "Timed out waiting for …").
 */
async function clickAndAwait(ui: UiDriver, agentId: string, label: string, done: () => boolean, what: string, timeoutMs = 20_000) {
  const toasts = watchToasts();
  try {
    await ui.click(agentId, label);
    await waitUntil(() => done() || !!firstError(toasts.peek()), { signal: ui.signal, timeoutMs, what });
  } finally {
    toasts.stop();
  }
  if (!done()) throw new Error(firstError(toasts.peek()) || `That did not work — ${what} never happened.`);
}

/** Open a dropdown (publish / More) unless its item is already showing. Clicking
 *  the trigger of an OPEN menu would close it, hence the check. */
async function openMenu(ui: UiDriver, trigger: string, item: string, label?: string) {
  if (anchor(item)) return;
  await ui.click(trigger, label);
  await ui.waitFor(item, 4000);
}

async function openShareDialog(ui: UiDriver) {
  if (anchor('mag.share-dialog')) return;
  ui.step('Opening the Share dialog');
  await openMenu(ui, 'mag.more-button', 'mag.share-button', 'More');
  await ui.click('mag.share-button', 'Share with staff…');
  await ui.waitFor('mag.share-dialog', 5000);
}

async function closeShareDialog(ui: UiDriver) {
  await clickIfPresent(ui, 'mag.share-close', 'Close');
}

/** The Magazine AI Studio pane open on its Chat tab (where the staged-changes
 *  tray and the composer live). Never starts a new chat — that would throw the
 *  staged changes away (store.newThread clears them). */
async function ensureStudioPanel(ui: UiDriver) {
  // The whole assistant pane can be toggled away from the toolbar.
  if (!anchor('mag.ai-tab-chat')) {
    await ui.click('mag.ai-toggle', 'AI');
    await ui.waitFor('mag.ai-tab-chat', 4000);
  }
  // The thread picker only renders on the Chat tab.
  if (!anchor('mag.ai-new-chat')) {
    await ui.click('mag.ai-tab-chat', 'Chat');
    await ui.waitFor('mag.ai-new-chat', 3000);
  }
}

/** The Magazine AI Studio composer, on screen and writable. */
async function ensureStudioComposer(ui: UiDriver) {
  if (anchor('mag.ai-input')) return;
  await ensureStudioPanel(ui);
  // Still no composer = a read-only conversation (someone else's, or the legacy
  // log). Start a fresh chat of our own, exactly as a person would.
  if (!anchor('mag.ai-input')) await clickIfPresent(ui, 'mag.ai-new-chat', 'Start a new chat');
  await ui.waitFor('mag.ai-input', 5000);
}

/** A collaborator already on this magazine matching a userId / email / name. */
function findCollaborator(person: string, cs: V2Collaborator[] | undefined): V2Collaborator | undefined {
  const q = person.trim().toLowerCase();
  const list = cs ?? [];
  return (
    list.find((c) => c.userId === person.trim() || c.email.toLowerCase() === q || (c.displayName || '').toLowerCase() === q) ??
    (() => {
      const partial = list.filter((c) => (c.displayName || '').toLowerCase().includes(q));
      return partial.length === 1 ? partial[0] : undefined;
    })()
  );
}

/** A collaborator as a confirm card / step names them: name → email. */
const collabName = (c: V2Collaborator) => personDisplay({ name: c.displayName, email: c.email });

/** Does this collaborator already have exactly these pages (null = all pages)? */
function hasScope(c: V2Collaborator, wantIds: string[] | null): boolean {
  if (!wantIds) return c.pageIds === 'all';
  if (c.pageIds === 'all') return false;
  const have = c.pageIds.map(String);
  const want = new Set(wantIds);
  return have.length === want.size && [...want].every((id) => have.includes(id));
}

/** Wait for a dialog's busy button to settle: gone (success closed it), or no
 *  longer busy after a grace period (validation refusal / server error). */
async function settle(ui: UiDriver, agentId: string, done: () => boolean, what: string) {
  const t0 = Date.now();
  await waitUntil(
    () => {
      if (done()) return true;
      const el = anchor(agentId);
      if (Date.now() - t0 > 900 && (!el || el.getAttribute('aria-busy') !== 'true')) return true;
      return false;
    },
    { signal: ui.signal, timeoutMs: 45_000, what },
  );
}

/** Live on Bulletins right now — see the note on magazine.unpublish. */
function isLiveIssue(issue: { publishedIssueId?: string | null; status?: string } | null | undefined): boolean {
  return !!issue?.publishedIssueId && issue.status === 'published';
}

/**
 * Why the server would refuse this publish (pages shared with someone that are
 * not approved, or edited since), or '' — the studio's own rule (review.ts,
 * mirrored from the server's publishGate). A full edition is judged on every
 * page; a selected publish only on the pages that would go out.
 */
function publishRefusal(pages?: number[]): string {
  const s = get();
  if (!pages) {
    const why = publishBlockedReason(s.issue, s.pages, 'full');
    return why ? `${why} Approve them on the review board first, or publish only the other pages.` : '';
  }
  const want = new Set(pages);
  const asIfTicked = s.pages.map((p) => ({ ...p, selectedForPublish: want.has(pageNo(p)) }));
  const why = publishBlockedReason(s.issue, asIfTicked, 'selected');
  return why ? `${why} Approve them on the review board first, or leave them out.` : '';
}

/** The page builder's count picker offers 1, 2, 3, 4 or 6 pages per build. */
const BUILD_BATCHES = [6, 4, 3, 2, 1] as const;

/** The biggest batch the builder takes that fits in `count`; the rest is added
 *  after this build finishes. (A plan of 7 pages used to fail its first call —
 *  the action only accepted 1, 2, 3, 4 or 6 — and showed the user a red error.) */
function firstBuildBatch(count: number): number {
  return BUILD_BATCHES.find((n) => n <= count) ?? 1;
}

const aiPagesCount = z.number().int().min(1).max(12);

/**
 * A larger request the user ALREADY approved in full. "Add 7 pages" asks once
 * ("6 now, the other 1 once these are done"); the follow-up call for the rest —
 * made after the [job-update] — must not ask a second time for the same pages.
 * Module-level so it survives the editor re-rendering; one magazine at a time,
 * and it expires so a stale approval can never cover a new request.
 */
let approvedRest: { issueId: string; count: number; topic: string; until: number } | null = null;
const topicKey = (t: string | undefined) => (t ?? '').trim().toLowerCase();

function restAlreadyApproved(count: number, topic: string | undefined): boolean {
  const a = approvedRest;
  if (!a || Date.now() > a.until) return false;
  return a.issueId === get().issueId && count <= a.count && a.topic === topicKey(topic);
}

function aiPagesConfirm(count: number, topic: string | undefined): string | null {
  if (isBuilding()) return null; // run() refuses before touching anything
  if (restAlreadyApproved(count, topic)) return null;
  const batch = firstBuildBatch(count);
  const rest = count - batch;
  const about = topic ? ` about “${topic.slice(0, 120)}”` : '';
  return rest > 0
    ? `Add ${count} new AI-designed pages${about} to this magazine? The builder makes up to 6 at a time: ${batch} now, the other ${rest} once those are done.`
    : `Add ${count} new AI-designed page${count === 1 ? '' : 's'}${about} to this magazine?`;
}

/** Start a build of `count` pages: the first batch now, and tell the model how many remain. */
async function startAiPagesBuild(ui: UiDriver, count: number, topic: string | undefined) {
  const batch = firstBuildBatch(count);
  const remaining = count - batch;
  const issueId = get().issueId;
  // The last build's background watch may not have noticed it ended yet; a new
  // build started now would be adopted by it (and lose its [job-update]).
  if (issueId) await settlePreviousBuildJob(issueId, ui.signal);
  const started = await submitAiPagesForm(ui, batch, topic);
  // The user approved the whole request: the rest is pre-approved for the follow-up call.
  approvedRest = remaining > 0 && issueId ? { issueId, count: remaining, topic: topicKey(topic), until: Date.now() + 2 * 60 * 60_000 } : null;
  return remaining > 0
    ? {
        ...started,
        requested: count,
        remaining,
        note:
          `${started.note} The builder adds 1, 2, 3, 4 or 6 pages at a time, so ${batch} of the ${count} requested were started. ` +
          `When the [job-update] for this build arrives, call this action again with count ${remaining} and the same topic (the user already approved them — no second question).`,
      }
    : started;
}

/** The page rail's AI popover is open: choose count/topic and press Generate.
 *  Confirms the server accepted the request, then hands the build to a
 *  background job and returns at once (see ./magazineJobs.ts). */
async function submitAiPagesForm(ui: UiDriver, count: number, topic: string | undefined) {
  await ui.select('mag.ai-pages-count', String(count));
  // The popover keeps whatever was typed into it last; a build with no topic must
  // not quietly reuse an old one.
  const topicBox = anchor('mag.ai-pages-topic') as HTMLInputElement | null;
  if (topic?.trim()) await ui.type('mag.ai-pages-topic', topic.trim(), { clear: true });
  else if (topicBox?.value.trim()) await ui.type('mag.ai-pages-topic', '', { clear: true });
  const pageCountBefore = get().pages.length;
  const toasts = watchToasts();
  try {
    await ui.click('mag.ai-pages-generate', 'Generate');
    // The store flips `generating` BEFORE its POST; a refusal (409 page cap,
    // 503 AI off…) clears it again with an error toast — possibly before a poll
    // ever saw it set. Success shows up as the issue going 'processing' on the
    // store's first poll.
    await waitUntil(() => get().generating || get().issue?.status === 'processing' || !!firstError(toasts.peek()), {
      signal: ui.signal,
      timeoutMs: 10_000,
      what: 'the build to start',
    });
    await softWait(ui, () => !get().generating || get().issue?.status === 'processing', 12_000);
    if (!get().generating && get().issue?.status !== 'processing') {
      throw new Error(firstError(toasts.peek()) || 'The build did not start — see the message on screen.');
    }
  } finally {
    toasts.stop();
  }
  const s = get();
  const job = s.issueId
    ? startMagazineBuildJob({ magazineId: s.issueId, title: s.issue?.title, mode: 'add', pageCountBefore, requested: count })
    : null;
  return {
    started: true,
    jobId: job?.id,
    count,
    topic: topic?.trim() || undefined,
    pageCountBefore,
    note: JOB_STARTED_NOTE,
  };
}

function top<T>(a: T[]): T | undefined {
  return a[a.length - 1];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A wait that may time out harmlessly — but a Stop still stops. */
async function softWait(ui: UiDriver, pred: () => unknown, timeoutMs: number): Promise<boolean> {
  try {
    await waitUntil(() => !!pred(), { signal: ui.signal, timeoutMs });
    return true;
  } catch (e) {
    if (ui.signal.aborted) throw e;
    return false;
  }
}

const toastLines = (ts: SeenToast[]) => ts.map((t) => `${t.type}: ${t.text}`);

/**
 * The confirm question for staged studio changes that must not land on a bare
 * "Use these changes", or null when none are staged: page deletions and a
 * layout rebuild can't be undone, and generate-pages starts an AI page build
 * (spends AI budget — the build magazine.addAiPages confirms). Before, only
 * deletions asked: a staged layout rebuild then hit the app's own
 * window.confirm with no OK behind it (auto-declined) while the action still
 * reported "applied", and a staged page build ran unasked.
 */
function stagedRiskQuestion(): string | null {
  const s = get();
  const parts: string[] = [];
  const removes = s.proposals.filter((p) => p.kind === 'remove-page').length;
  if (removes > 0) parts.push(`deleting ${removes} page${removes === 1 ? '' : 's'} (cannot be undone)`);
  const layout = s.proposals.find((p) => p.kind === 'apply-layout');
  if (layout) {
    const n = pageNoOf(s.pages, layout.pageId || s.proposalsPageId);
    parts.push(`rebuilding ${n ? `page ${n}` : 'the page'} in a new layout — everything on it is replaced (cannot be undone)`);
  }
  const gen = s.proposals.find((p) => p.kind === 'generate-pages');
  if (gen) parts.push(`having the AI design ${gen.count ? `${gen.count} new page${gen.count === 1 ? '' : 's'}` : 'new pages'}`);
  return parts.length ? `Apply the studio's changes, including ${parts.join('; ')}?` : null;
}

/** The open page's elements as the facts a Fill / Adjust pass can change —
 *  words, the box, a shape's opacity — if `pageId` is the open page. */
function elementFacts(pageId: string) {
  const p = get().page;
  if (!p || p.id !== pageId) return null;
  return new Map(
    p.elements.map((e) => [
      e.id,
      {
        type: e.type,
        role: e.text ? String(e.text.role) : '',
        content: e.text?.content ?? '',
        box: `${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.w)},${Math.round(e.h)},${Math.round(e.rotation ?? 0)}`,
        opacity: e.shape?.opacity,
      },
    ]),
  );
}

/** Why the user cannot change page n right now (a contributor's submitted /
 *  approved page), or '' — the same sentence the studio's lock banner shows. */
function pageLockReason(target: PageSummary): string {
  return readOnlyReason(get().issue, target);
}

/**
 * Press a page's Fill / Adjust wand (the per-page AI buttons above it on the
 * canvas) and follow the pass to the end. The store applies the server's edits
 * as ONE undo entry and reports only through a toast, so the result is the
 * before/after of the page plus the toast the user saw. Adjust also re-balances
 * the layout (moves boxes, removes sliver photos, lightens scrims) — those count
 * as changes too; only reporting the words called a re-balanced page "unchanged".
 */
async function runPageFormat(ui: UiDriver, mode: 'fill' | 'adjust', n: number) {
  const s0 = await ready(ui);
  const name = mode === 'fill' ? 'Fill' : 'Adjust';
  // A contributor's submitted/approved page: the server refuses the pass (409) —
  // say so before pressing anything.
  const lock = pageLockReason(pageAt(s0.pages, n));
  if (lock) throw new Error(lock);
  if (get().formatBusy) {
    ui.step('Waiting for the Fill/Adjust pass already running');
    await waitUntil(() => !get().formatBusy, { signal: ui.signal, timeoutMs: 180_000, what: 'the running Fill/Adjust pass to finish' });
  }
  const target = await openPageN(ui, n);
  const btn = `mag.page-${n}-${mode}`;
  await ui.waitFor(btn, 5000);
  assertEnabled(btn, `The ${name} button for page ${n} is not available right now.`);

  const before = elementFacts(target.id);
  const countBefore = get().page?.id === target.id ? get().page!.elements.length : null;
  const undoTop = top(get().undoStack);
  const toasts = watchToasts();
  let seen: SeenToast[] = [];
  let started = false;
  try {
    ui.step(mode === 'fill' ? `Filling page ${n} with AI` : `Tightening page ${n}'s text with AI`);
    await ui.click(btn, `${name} page ${n}`);
    started = await softWait(ui, () => get().formatBusy || toasts.peek().length > 0, 5000);
    await waitUntil(() => !get().formatBusy, { signal: ui.signal, timeoutMs: 180_000, intervalMs: 300, what: `the ${name} pass to finish` });
    // The outcome toast is raised just as the busy flag drops.
    await softWait(ui, () => toasts.peek().length > 0, 1500);
  } finally {
    seen = toasts.stop();
  }

  const after = elementFacts(target.id);
  const changes: Array<{ elementId: string; role: string; before: string; after: string }> = [];
  let moved = 0;
  let restyled = 0;
  let removed = 0;
  if (before && after) {
    for (const [id, a] of after) {
      const b = before.get(id);
      if (!b) continue;
      if (b.content !== a.content) changes.push({ elementId: id, role: a.role, before: clip(b.content, 80), after: clip(a.content, 160) });
      if (b.box !== a.box) moved++;
      if (b.opacity !== a.opacity) restyled++;
    }
    for (const id of before.keys()) if (!after.has(id)) removed++;
  }
  const anyChange = changes.length + moved + restyled + removed > 0;
  const errs = errorToasts(seen);
  if (!anyChange && errs.length > 0) throw new Error(errs.map((t) => t.text).join(' '));
  if (!started && seen.length === 0 && !anyChange) throw new Error(`The ${name} pass on page ${n} did not start — see the screen.`);
  if (anyChange) ui.flash(btn);
  const newTop = top(get().undoStack);
  return {
    page: n,
    mode,
    elementsBefore: countBefore,
    elementsAfter: get().page?.id === target.id ? get().page!.elements.length : null,
    textBlocksChanged: changes.length,
    boxesMovedOrResized: moved || undefined,
    scrimsRestyled: restyled || undefined,
    elementsRemoved: removed || undefined,
    changes: changes.slice(0, 12),
    moreChanges: changes.length > 12 ? changes.length - 12 : undefined,
    undo: newTop && newTop !== undoTop ? `One magazine.undo (Ctrl+Z) takes back ${newTop.label}.` : undefined,
    messages: toastLines(seen),
    note: anyChange ? undefined : 'Nothing on the page changed.',
  };
}

/** Undo / Redo through the toolbar button; resolves when that entry has moved stacks. */
async function runHistory(ui: UiDriver, dir: 'undo' | 'redo') {
  await ready(ui);
  const from = () => (dir === 'undo' ? get().undoStack : get().redoStack);
  const to = () => (dir === 'undo' ? get().redoStack : get().undoStack);
  const entry = top(from());
  if (!entry) throw new Error(dir === 'undo' ? 'There is nothing to undo.' : 'There is nothing to redo.');
  const btn = `mag.${dir}`;
  const verb = dir === 'undo' ? 'Undo' : 'Redo';
  await revealToolbarItem(ui, btn); // phone: it is in the More menu
  assertEnabled(btn, `${verb} is not available right now.`);
  const toasts = watchToasts();
  let seen: SeenToast[] = [];
  try {
    await ui.click(btn, `${verb} ${entry.label}`);
    // A replay that fails (wholly or partly) DROPS the entry and says so with a
    // WARNING toast, not an error — watching errors only sat out the whole minute
    // and reported a timeout.
    await waitUntil(
      () => top(to()) === entry || (problemToasts(toasts.peek()).length > 0 && !from().includes(entry)),
      { signal: ui.signal, timeoutMs: 60_000, what: `the ${dir} to finish` },
    );
  } finally {
    seen = toasts.stop();
  }
  const problems = problemToasts(seen).map((t) => t.text);
  if (top(to()) !== entry) {
    // "Undid what I could — 2 changes no longer applied." is a PARTIAL undo, not a failure.
    if (problems.some((t) => /what I could/i.test(t))) {
      return { [dir === 'undo' ? 'undid' : 'redid']: entry.label, partial: true, messages: problems, nextUndo: top(get().undoStack)?.label ?? null };
    }
    throw new Error(problems.join(' ') || `The ${dir} did not complete.`);
  }
  return {
    [dir === 'undo' ? 'undid' : 'redid']: entry.label,
    nextUndo: top(get().undoStack)?.label ?? null,
    nextRedo: top(get().redoStack)?.label ?? null,
    messages: seen.length ? toastLines(seen) : undefined,
  };
}

const zoomPercent = () => Math.round((get().zoomWidth / 1275) * 100);

/** Pages by review column (1-based), and which ones the open board lets you tick. */
function boardSummary() {
  const s = get();
  const cols: Record<ReviewColumn, number[]> = { in_progress: [], needs_changes: [], submitted: [], approved: [] };
  s.pages.forEach((p) => cols[columnOf(p)].push(pageNo(p)));
  return {
    columns: Object.fromEntries(COLUMN_ORDER.map((c) => [c, cols[c]])),
    staleApprovals: s.pages.flatMap((p) => (p.approvalStale ? [pageNo(p)] : [])),
    tickable: s.pages.flatMap((p) => (anchor(`mag.review-page-${pageNo(p)}-select`) ? [pageNo(p)] : [])),
  };
}

/** The board as a sentence ("In progress: 1, 2 · Submitted: 3") — for errors the user reads. */
function boardSentence(): string {
  const s = get();
  return COLUMN_ORDER.map((c) => {
    const nums = s.pages.filter((p) => columnOf(p) === c).map(pageNo);
    return nums.length ? `${COLUMN_LABEL[c]}: ${nums.join(', ')}` : '';
  })
    .filter(Boolean)
    .join(' · ');
}

/**
 * The pages the review board lets this user tick — the SAME rule as
 * ReviewBoard's `actionable`: the owner acts on submitted pages and on approvals
 * that went stale; a collaborator submits their own in-progress pages.
 */
function reviewTickable(isOwner: boolean): Set<string> {
  const s = get();
  if (isOwner) return new Set(s.pages.filter((p) => columnOf(p) === 'submitted' || p.approvalStale === true).map((p) => p.id));
  return new Set(submittablePages(s.issue, s.pages).map((p) => p.id));
}

async function openReviewBoard(ui: UiDriver, isOwner: boolean) {
  if (anchor('mag.review-dialog')) return;
  // Phone: the board button is in the More menu (the locked-page strip's link is not).
  if (!anchor('mag.locked-see-board')) await revealToolbarItem(ui, 'mag.review-board');
  const trigger = anchor('mag.review-board') ? 'mag.review-board' : anchor('mag.locked-see-board') ? 'mag.locked-see-board' : null;
  if (!trigger) {
    throw new Error(
      isOwner
        ? 'There is no review board button right now: nobody else is working on this magazine, so no page needs approving (review only applies to pages shared with someone). You can publish directly.'
        : 'The review board is not available to you on this magazine.',
    );
  }
  ui.step('Opening the review board');
  await ui.click(trigger, 'Review board');
  await ui.waitFor('mag.review-dialog', 4000);
}

const pagesArg = z.union([z.literal('all'), z.array(z.number().int().min(1)).min(1)]);

interface EditorPerms {
  /** issue.myRole === 'owner' (store.canManage). */
  isOwner: boolean;
  /** owner or collaborator (store.canEdit). */
  canEdit: boolean;
  /** staff permission `magazine.publish`. */
  mayPublish: boolean;
}

export function useMagazineEditorActions(input: EditorPerms): void {
  const roleCanEdit = useRoleCanEditMagazines();
  const perms = { ...input, roleCanEdit };
  const live = useRef(perms);
  live.current = perms;
  const { mayPublish } = perms;
  // What the server will actually accept from this user: role AND magazine access.
  const isOwner = perms.isOwner && roleCanEdit;
  const canEdit = perms.canEdit && roleCanEdit;

  // ── Read ─────────────────────────────────────────────────────────────────
  useAgentAction({
    name: 'magazine.status',
    description: 'What is open: title, id, your role, every page (number, id, review state), collaborators, publish state, build progress, and the AI Studio state.',
    args: z.object({}),
    run: async (_a, ui) => {
      const s = await ready(ui);
      const issue = s.issue!;
      const b = buildStatus(issue, s.adding);
      const curIdx = s.pages.findIndex((p) => p.id === s.currentPageId);
      return {
        id: issue.id,
        title: issue.title,
        route: editorRoute(issue.id),
        status: issue.status,
        myRole: issue.myRole ?? 'view-only',
        canEdit: live.current.canEdit && live.current.roleCanEdit,
        isOwner: live.current.isOwner,
        canPublish: live.current.isOwner && live.current.mayPublish && live.current.roleCanEdit,
        viewOnlyReason: !live.current.roleCanEdit
          ? 'Your role can open magazines but not edit them (no Magazine edit permission) — every change would be refused.'
          : !live.current.canEdit
            ? 'This magazine is not shared with you — view only.'
            : undefined,
        published: !!issue.publishedIssueId && issue.status === 'published',
        publishedIssueId: issue.publishedIssueId ?? null,
        needsRepublish: s.needsRepublish(),
        currentPage: curIdx >= 0 ? pageNo(s.pages[curIdx]) : null,
        pageCount: s.pages.length,
        pages: s.pages.map((p) => ({
          page: pageNo(p),
          id: p.id,
          // The open page's live element list beats the summary count, which
          // only refreshes on the next server round-trip (an applied studio
          // change looked like "still 11 elements").
          elements: s.page && s.page.id === p.id ? s.page.elements.length : p.elementCount,
          build: p.status,
          review: p.review ?? 'in_progress',
          approvalStale: !!p.approvalStale,
          selectedForPublish: p.selectedForPublish,
        })),
        collaborators: collaboratorsOut(issue.collaborators, s.pages),
        coverImage: issue.coverImage || null,
        zoomPercent: zoomPercent(),
        history: { nextUndo: top(s.undoStack)?.label ?? null, nextRedo: top(s.redoStack)?.label ?? null },
        fillAdjustRunning: s.formatBusy,
        generation: isBuilding()
          ? { building: true, headline: b.headline, done: b.count?.done ?? null, total: b.count?.total ?? null }
          : { building: false, error: issue.processingError || undefined },
        studio: {
          replying: s.chatBusy,
          pendingChanges: s.proposals.map((p) => ({ kind: p.kind, summary: p.summary })),
          pendingChangesOnPage: pageNoOf(s.pages, s.proposalsPageId),
        },
      };
    },
  });

  useAgentAction(
    {
      name: 'magazine.listStaff',
      description: 'Staff who can be invited to this magazine (userId, name, email, whether they already have access). Optional text filter.',
      args: z.object({ query: z.string().optional() }),
      run: async ({ query }, ui) => {
        const s = await ready(ui);
        const list = await loadDirectory(true);
        const q = (query ?? '').trim().toLowerCase();
        const cs = s.issue?.collaborators ?? [];
        return {
          staff: list
            .filter((e) => !q || (e.name || '').toLowerCase().includes(q) || e.email.toLowerCase().includes(q))
            .slice(0, 50)
            .map((e) => ({
              userId: e.userId,
              name: e.name || e.email,
              email: e.email,
              access: e.userId === s.issue?.ownerId ? 'owner' : cs.some((c) => c.userId === e.userId) ? 'collaborator' : 'none',
            })),
        };
      },
    },
    isOwner,
  );

  // ── Pages ────────────────────────────────────────────────────────────────
  useAgentAction({
    name: 'magazine.goToPage',
    description: 'Open a page (its number as printed on the canvas, "Page N") via the page rail.',
    args: z.object({ page: z.number().int().min(1) }),
    run: async ({ page }, ui) => {
      await ready(ui);
      // Waits for the canvas to settle on it, so the next step ("ask the studio",
      // "fill this page") acts on THIS page and not a neighbour the scroll passed.
      const target = await openPageN(ui, page);
      return { page, pageId: target.id, pageCount: get().pages.length };
    },
  });

  useAgentAction(
    {
      name: 'magazine.addPage',
      description: 'Add one blank page at the end and open it.',
      args: z.object({}),
      run: async (_a, ui) => {
        const s = await ready(ui);
        refuseWhileBuilding('add a page');
        const had = new Set(s.pages.map((p) => p.id));
        await ensureRail(ui);
        assertEnabled('mag.add-page', 'Adding a page is not available right now.');
        await clickAndAwait(ui, 'mag.add-page', 'Add a blank page', () => get().pages.length > had.size, 'the new page');
        // The new page by id — the store opens it a moment AFTER the list updates, so
        // "the open page" right now can still be the old one.
        const fresh = get().pages.find((p) => !had.has(p.id));
        if (fresh) await softWait(ui, () => get().currentPageId === fresh.id, 5000);
        const after = get();
        const n = pageNoOf(after.pages, fresh?.id) ?? after.pages.length;
        ui.flash(`mag.page-${n}`);
        return { newPage: n, opened: after.currentPageId === fresh?.id, pageCount: after.pages.length };
      },
    },
    isOwner,
  );

  useAgentAction(
    {
      name: 'magazine.addAiPages',
      description:
        'Have the AI design and add on-theme pages (count 1–12; optional topic). The builder adds 1, 2, 3, 4 or 6 per build, so a larger or odd count starts the biggest batch that fits and the result says how many remain. Starts the build and returns at once with a jobId — a [job-update] message arrives when the pages are done (no need to wait).',
      args: z.object({
        count: aiPagesCount,
        topic: z.string().max(300).optional(),
      }),
      // Generating pages writes new content into the magazine and spends AI
      // budget — the user approves it first (reported: pages were added from a
      // PDF instruction without asking).
      // No card while a build runs (run() refuses that before touching anything),
      // nor for the rest of a larger request the user already approved.
      confirm: ({ count, topic }) => aiPagesConfirm(count, topic),
      run: async ({ count, topic }, ui) => {
        await ready(ui);
        if (isBuilding()) throw new Error('A build is already running — a [job-update] message will arrive when it finishes; add more pages after that.');
        await ensureRail(ui);
        if (!anchor('mag.ai-pages-generate')) {
          assertEnabled('mag.add-ai-pages', 'Adding AI pages is not available right now.');
          await ui.click('mag.add-ai-pages', 'Add pages with AI');
          await ui.waitFor('mag.ai-pages-generate', 4000);
        }
        return startAiPagesBuild(ui, count, topic);
      },
    },
    isOwner,
  );

  useAgentAction(
    {
      name: 'magazine.addMorePages',
      description:
        'Press "Add more pages" (the gold banner after a first build; falls back to the page rail\'s AI button) to open the add-AI-pages popover. With count (1–12; the builder adds 1, 2, 3, 4 or 6 per build, so a larger or odd count starts the biggest batch that fits and the result says how many remain) and optional topic it also starts the build and returns at once with a jobId — a [job-update] message arrives when the pages are done.',
      args: z.object({
        count: aiPagesCount.optional(),
        topic: z.string().max(300).optional(),
      }),
      // Only a build (count given) creates content; just opening the popover is safe.
      confirm: ({ count, topic }) => (count ? aiPagesConfirm(count, topic) : null),
      run: async ({ count, topic }, ui) => {
        await ready(ui);
        if (isBuilding()) throw new Error('A build is already running — a [job-update] message will arrive when it finishes; add more pages after that.');
        if (!anchor('mag.ai-pages-generate')) {
          if (anchor('mag.add-more-pages')) {
            await ui.click('mag.add-more-pages', 'Add more pages');
          } else {
            await ensureRail(ui);
            assertEnabled('mag.add-ai-pages', 'Adding AI pages is not available right now.');
            await ui.click('mag.add-ai-pages', 'Add pages with AI');
          }
          await ui.waitFor('mag.ai-pages-generate', 4000);
        }
        if (!count) {
          return {
            opened: true,
            started: false,
            note: 'The "Add pages with AI" popover is open. Call magazine.addMorePages (or magazine.addAiPages) with count 1 to 12 to start the build.',
          };
        }
        return startAiPagesBuild(ui, count, topic);
      },
    },
    isOwner,
  );

  useAgentAction(
    {
      name: 'magazine.duplicatePage',
      description: 'Duplicate a page (1-based).',
      args: z.object({ page: z.number().int().min(1) }),
      run: async ({ page }, ui) => {
        const s = await ready(ui);
        pageAt(s.pages, page);
        refuseWhileBuilding('duplicate it');
        const had = new Set(s.pages.map((p) => p.id));
        await ensureRail(ui);
        await clickAndAwait(ui, `mag.page-${page}-duplicate`, `Duplicate page ${page}`, () => get().pages.length > had.size, 'the copy');
        const copyAt = pageNoOf(get().pages, get().pages.find((p) => !had.has(p.id))?.id) ?? 0;
        if (copyAt > 0) ui.flash(`mag.page-${copyAt}`);
        return { duplicated: page, copyIsPage: copyAt || null, pageCount: get().pages.length };
      },
    },
    isOwner,
  );

  useAgentAction(
    {
      name: 'magazine.deletePage',
      description: 'Delete a page (1-based). Permanent — page deletions cannot be undone.',
      args: z.object({ page: z.number().int().min(1) }),
      confirm: ({ page }) => {
        const s = get();
        // Real page number (not list position); no card for a page that isn't
        // there or the last page — run() refuses both before touching anything.
        const p = s.pages.find((x) => pageNo(x) === page);
        if (!p || s.pages.length <= 1 || isBuilding()) return null;
        const submitted = p.review === 'submitted' ? ' It was submitted for review — the submitter will be emailed.' : '';
        return `Delete page ${page} of “${s.issue?.title ?? 'this magazine'}”? This cannot be undone.${submitted}`;
      },
      run: async ({ page }, ui) => {
        const s = await ready(ui);
        const target = pageAt(s.pages, page);
        if (s.pages.length <= 1) throw new Error('A magazine needs at least one page.');
        refuseWhileBuilding('delete it');
        await ensureRail(ui);
        // The tile's own 🗑 raises window.confirm, which the card above already
        // asked — so point at it and call the same store handler it calls. (A
        // SUBMITTED page makes the store ask once more, naming the submitter; the
        // card's OK pre-approves that too.)
        await ui.point(`mag.page-${page}-delete`, `Delete page ${page}`);
        ui.step(`Deleting page ${page}`);
        const toasts = watchToasts();
        try {
          await get().deletePage(target.id);
        } finally {
          toasts.stop();
        }
        const gone = !get().pages.some((p) => p.id === target.id);
        if (!gone) throw new Error(firstError(toasts.peek()) || `Page ${page} was not deleted — see the message on screen.`);
        return { deleted: page, pageCount: get().pages.length };
      },
    },
    isOwner,
  );

  useAgentAction(
    {
      name: 'magazine.movePage',
      description: 'Move a page from one position to another (both 1-based).',
      args: z.object({ from: z.number().int().min(1), to: z.number().int().min(1) }),
      run: async ({ from, to }, ui) => {
        const s = await ready(ui);
        const target = pageAt(s.pages, from);
        pageAt(s.pages, to);
        if (from === to) return { page: to, pageCount: s.pages.length, moved: false };
        refuseWhileBuilding('move it');
        await ensureRail(ui);
        const landed = () => get().pages[to - 1]?.id === target.id;
        if (Math.abs(from - to) === 1) {
          const dir = to < from ? 'up' : 'down';
          await clickAndAwait(ui, `mag.page-${from}-${dir}`, `Move page ${from} ${dir}`, landed, 'the page to move');
        } else {
          // Multi-slot moves are a drag in the UI; call the handler the drop calls.
          await ui.point(`mag.page-${from}`, `Moving page ${from} to ${to}`);
          ui.step(`Moving page ${from} to position ${to}`);
          const toasts = watchToasts();
          try {
            await get().reorder(from - 1, to - 1);
          } finally {
            toasts.stop();
          }
          if (!landed()) throw new Error(firstError(toasts.peek()) || `Page ${from} did not move — see the message on screen.`);
        }
        ui.flash(`mag.page-${to}`);
        return { moved: true, from, to, order: get().pages.map((p, i) => ({ page: i + 1, id: p.id })) };
      },
    },
    isOwner,
  );

  // ── Magazine ─────────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.rename',
      description: "Rename the magazine (the title field in the studio's toolbar).",
      args: z.object({ title: z.string().trim().min(1).max(200) }),
      run: async ({ title }, ui) => {
        await ready(ui);
        const saved = () => get().issue?.title === title;
        const toasts = watchToasts();
        try {
          await ui.type('mag.title-input', title, { clear: true });
          // The field saves on blur, the way a person finishes editing it. If the
          // field never had focus there is no blur to fire, so fall back to the
          // handler that blur calls.
          anchor('mag.title-input')?.blur();
          if (!(await softWait(ui, () => saved() || firstError(toasts.peek()), 4000))) await get().rename(title);
          await softWait(ui, () => saved() || firstError(toasts.peek()), 10_000);
        } finally {
          toasts.stop();
        }
        if (!saved()) throw new Error(firstError(toasts.peek()) || 'The new title did not save — see the message on screen.');
        ui.flash('mag.title-input');
        return { title: get().issue?.title };
      },
    },
    isOwner,
  );

  // ── Sharing ──────────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.sharePages',
      description:
        "Share pages with a staff member (person = userId, email or name) through the Share dialog. New people are emailed a link; for someone who already has access this changes which pages they can edit.",
      args: z.object({ person: z.string().min(1), pages: pagesArg }),
      confirm: async ({ person, pages }) => {
        const s = get();
        // No card for page numbers that don't exist (run() refuses them before
        // touching anything) or for someone who already has exactly these pages
        // (run() returns unchanged).
        let wantIds: string[] | null = null;
        try {
          wantIds = pages === 'all' ? null : pages.map((n) => pageAt(s.pages, n).id);
        } catch {
          return null;
        }
        let existing = findCollaborator(person, s.issue?.collaborators);
        if (!existing) {
          // Resolve the way run() will (staff directory). No card when run() is
          // going to refuse anyway: nobody / several people match, or it is the
          // owner. Someone matched in the directory who IS already a collaborator
          // (a partial name that only matched their email) is a scope change.
          const list = await loadDirectory().catch(() => null);
          if (list) {
            const hits = matchPeople(list, person);
            if (hits.length !== 1 || hits[0]!.userId === s.issue?.ownerId) return null;
            existing = s.issue?.collaborators?.find((c) => c.userId === hits[0]!.userId);
          }
        }
        if (existing && hasScope(existing, wantIds)) return null;
        const what = pages === 'all' ? 'all pages' : pageListLabel(pages);
        const title = s.issue?.title || 'this magazine';
        if (existing) return `Change ${collabName(existing)}'s access on “${title}” to ${what}?`;
        // Not a collaborator yet — the model usually passes the userId it got
        // from findStaff, so look the NAME up (staff directory) rather than
        // printing the id. Reported: "Share pages 1–2 … with 6650f1a2…?".
        const who = await personLabelAsync(person, s.issue?.collaborators);
        return `Share ${what} of “${title}” with ${who}? They'll be emailed a link.`;
      },
      run: async ({ person, pages }, ui) => {
        const s = await ready(ui);
        const issue = s.issue!;
        const nums = pages === 'all' ? null : Array.from(new Set(pages)).sort((a, b) => a - b);
        const wantIds = nums ? nums.map((n) => pageAt(s.pages, n).id) : null;

        let existing = findCollaborator(person, issue.collaborators);
        let newPerson: { userId: string; email: string; name: string } | null = null;
        if (!existing) {
          const p = resolvePerson(await loadDirectory(), person);
          if (p.userId === issue.ownerId) throw new Error(`${personDisplay(p)} owns this magazine already.`);
          // Matched in the directory but already on the magazine (e.g. a partial name
          // that only matched their email): the Share dialog lists them under
          // "People with access", not in the new-person picker — so it is a scope change.
          existing = issue.collaborators?.find((c) => c.userId === p.userId);
          if (!existing) newPerson = { userId: p.userId, email: p.email, name: personDisplay(p) };
        }
        // Already exactly this access — nothing to save (confirm() asked nothing).
        if (existing && hasScope(existing, wantIds)) {
          return {
            unchanged: true,
            sharedWith: { userId: existing.userId, name: existing.displayName || existing.email, email: existing.email },
            pages: scopeNumbers(existing, s.pages),
          };
        }
        const who = existing ? { userId: existing.userId, email: existing.email, name: collabName(existing) } : newPerson!;

        await openShareDialog(ui);
        const matches = () => {
          const c = get().issue?.collaborators?.find((x) => x.userId === who.userId);
          return !!c && hasScope(c, wantIds);
        };

        const prefix = existing ? 'mag.share-edit' : 'mag.share';
        if (existing) {
          // "Change pages" toggles; on the row already being edited it reads Cancel.
          if (!(anchor('mag.share-edit-save') && anchor(`mag.share-edit-${who.userId}`)?.textContent?.includes('Cancel'))) {
            await ui.click(`mag.share-edit-${who.userId}`, `Change ${who.name}'s pages`);
          }
          await ui.waitFor('mag.share-edit-save', 4000);
        } else {
          ui.step(`Choosing ${who.name}`);
          // The picker appears once the staff list loads; a failed load or an
          // empty list shows a sentence instead — report that, not a timeout.
          const dialogText = () => (anchor('mag.share-dialog')?.textContent ?? '').replace(/\s+/g, ' ');
          await waitUntil(
            () => !!anchor('mag.share-person') || !!anchor('mag.share-retry') || /already has access|only staff member/i.test(dialogText()),
            { signal: ui.signal, timeoutMs: 15_000, what: 'the staff list to load' },
          );
          if (!anchor('mag.share-person')) {
            throw new Error(
              anchor('mag.share-retry')
                ? "The Share dialog couldn't load the staff list — see the message on screen."
                : `${who.name} can't be added from the Share dialog right now — it says: ${dialogText().slice(0, 160)}`,
            );
          }
          await ui.select('mag.share-person', who.email);
        }

        if (!nums) {
          await ui.click(`${prefix}-scope-all`, 'All pages');
        } else {
          await ui.click(`${prefix}-scope-pick`, 'Specific pages');
          await ui.waitFor(`${prefix}-pages-clear`, 3000);
          await ui.click(`${prefix}-pages-clear`, 'Clear');
          for (const n of nums) await ui.click(`${prefix}-page-${n}`, `Page ${n}`);
        }

        const submit = existing ? 'mag.share-edit-save' : 'mag.share-submit';
        assertEnabled(submit, 'The Share button is not available.');
        ui.step(existing ? `Saving ${who.name}'s pages` : `Sharing with ${who.name}`);
        const toasts = watchToasts();
        let seen: SeenToast[] = [];
        try {
          await ui.click(submit, existing ? 'Save pages' : 'Share & email link');
          await settle(ui, submit, () => matches() || !!firstError(toasts.peek()), 'the share to save');
          // The dialog re-reads the magazine after a share; if that re-read failed
          // the share still happened (the toast says so) — read it once more here.
          if (!matches() && !firstError(toasts.peek())) await get().refreshIssue();
        } finally {
          seen = toasts.stop();
        }
        if (!matches()) {
          // The share landed but the dialog's re-read failed ("Shared — the list below
          // may be a moment behind"): a success the store cannot show yet.
          const landed = !firstError(seen) && seen.some((t) => /now has|^shared|^saved/i.test(t.text));
          if (!landed) throw new Error(firstError(seen) || 'The share did not go through — see the message on screen.');
          await closeShareDialog(ui);
          return { sharedWith: { userId: who.userId, name: who.name, email: who.email }, pages: nums ?? 'all', note: 'Saved; the collaborator list could not refresh yet.', messages: toastLines(seen) };
        }
        const emailTrouble = seen.find((t) => t.type === 'warning' && /email didn.t send/i.test(t.text));
        const roleWarning = seen.find((t) => t.type === 'warning' && t !== emailTrouble);

        ui.flash(`mag.share-collab-${who.userId}`);
        await sleep(900, ui.signal);
        await closeShareDialog(ui);
        const after = get();
        const c = after.issue!.collaborators!.find((x) => x.userId === who.userId)!;
        return {
          sharedWith: { userId: who.userId, name: who.name, email: who.email },
          pages: scopeNumbers(c, after.pages),
          emailed: existing ? 'no (scope change only — the share email goes out the first time)' : emailTrouble ? `NO — ${emailTrouble.text}` : 'yes',
          warning: roleWarning?.text,
          collaborators: collaboratorsOut(after.issue?.collaborators, after.pages),
        };
      },
    },
    isOwner,
  );

  useAgentAction(
    {
      name: 'magazine.unshare',
      description: "Remove a collaborator's access to this magazine (person = userId, email or name).",
      args: z.object({ person: z.string().min(1) }),
      confirm: ({ person }) => {
        const s = get();
        // Not a collaborator → run() refuses before touching anything; no card.
        const c = findCollaborator(person, s.issue?.collaborators);
        if (!c) return null;
        return `Remove ${collabName(c)}'s access to “${s.issue?.title || 'this magazine'}”?`;
      },
      run: async ({ person }, ui) => {
        const s = await ready(ui);
        const c = findCollaborator(person, s.issue?.collaborators);
        // Named (staff directory), never the raw userId the model passed.
        if (!c) throw new Error(`${await personLabelAsync(person, s.issue?.collaborators)} is not a collaborator on this magazine.`);
        await openShareDialog(ui);
        const gone = () => !get().issue?.collaborators?.some((x) => x.userId === c.userId);
        const toasts = watchToasts();
        try {
          await ui.click(`mag.share-remove-${c.userId}`, `Remove ${collabName(c)}`);
          await waitUntil(() => gone() || !!firstError(toasts.peek()) || toasts.peek().some((t) => /^removed/i.test(t.text)), {
            signal: ui.signal,
            timeoutMs: 20_000,
            what: 'their access to be removed',
          });
          // Removed, but the dialog's re-read failed ("The list below may be a moment behind").
          if (!gone() && !firstError(toasts.peek())) await get().refreshIssue();
        } finally {
          toasts.stop();
        }
        if (!gone() && !toasts.peek().some((t) => /^removed/i.test(t.text))) {
          throw new Error(firstError(toasts.peek()) || `${collabName(c)}'s access was not removed — see the message on screen.`);
        }
        await sleep(500, ui.signal);
        await closeShareDialog(ui);
        const after = get();
        return { removed: { userId: c.userId, name: collabName(c) }, collaborators: collaboratorsOut(after.issue?.collaborators, after.pages) };
      },
    },
    isOwner,
  );

  // ── Magazine AI Studio ───────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.askStudio',
      description:
        "Type a request into the Magazine AI Studio chat (optionally after opening a page) and send it, like a person; waits for the reply. The studio STAGES changes — pass apply:true (or call magazine.applyStudioChanges) to use them.",
      args: z.object({
        prompt: z.string().min(1).max(4000),
        page: z.number().int().min(1).optional(),
        apply: z.boolean().optional(),
      }),
      run: async ({ prompt, page, apply }, ui) => {
        await ready(ui);
        // The studio works on the OPEN page: wait for the canvas to settle on it, or
        // the scroll-settle picker can hand the turn to a neighbouring page.
        if (page) await openPageN(ui, page);
        if (!get().currentPageId) throw new Error('No page is open yet — wait for the first page to build.');
        await ensureStudioComposer(ui);
        // The studio says up front when this page cannot be changed by this user (a
        // submitted/approved page, or a role without magazine.edit) and disables its
        // composer. Report that reason rather than typing into a disabled box.
        const blocked = anchor('mag.ai-send')?.getAttribute('data-studio-blocked');
        if (blocked) throw new Error(blocked);
        await waitUntil(() => !get().chatBusy, { signal: ui.signal, timeoutMs: 300_000, what: 'the studio to finish its previous reply' });

        const before = get().chat.length;
        ui.step('Asking the Magazine AI Studio');
        // Watch the studio's own toasts during the turn: when an attached image
        // can't be stored (e.g. the bucket's CORS doesn't allow this site's
        // address) the studio only DESCRIBES it to its AI, which can't place the
        // real file — and stages a look-alike instead (a solid-black image came
        // back as a black shape). That must stop the job, not be applied.
        const toasts = watchToasts();
        let seen: SeenToast[] = [];
        try {
          await ui.type('mag.ai-input', studioPrompt(prompt), { clear: true });
          assertEnabled('mag.ai-send', 'The studio cannot take a message right now.');
          await ui.click('mag.ai-send', 'Send');
          await waitForStudioTurn(ui, before, Date.now(), () => firstError(toasts.peek()));
        } finally {
          seen = toasts.stop();
        }
        const storageProblem = seen.find((t) => /couldn.t store|could not reach storage|can.t be placed/i.test(t.text));
        return finishStudioTurn(ui, storageProblem ? false : apply, seen, storageProblem?.text);
      },
    },
    canEdit,
  );

  /**
   * The studio works on the OPEN page (its composer tags the turn "PAGE n") and
   * reads any "page N" in the text as an absolute page of the magazine. A
   * page-scoped collaborator can't open other pages, so "set it as page 1's
   * background" got "I can't access page 1 from here". Any mention of the open
   * page — by its real number or its rail position — becomes "this page".
   */
  function studioPrompt(prompt: string): string {
    const s = get();
    const idx = s.pages.findIndex((p) => p.id === s.currentPageId);
    if (idx < 0) return prompt;
    const same = new Set([pageNo(s.pages[idx]), idx + 1]);
    return prompt
      .replace(/\b(?:the\s+)?page\s*(?:no\.?\s*|number\s*|#\s*)?(\d+)(['’]s)?\b/gi, (m, num: string, poss?: string) =>
        same.has(Number(num)) ? (poss ? "this page's" : 'this page') : m,
      )
      .replace(/\bthis page['’]s\b/g, "this page's");
  }

  /** What the studio composer is doing right now, read off its Send button
   *  (AiPanel sets data-studio-phase). 'ingesting' = uploading/reading an
   *  attachment before the message goes out — local state the store can't see. */
  function studioPhase(): 'ingesting' | 'replying' | 'idle' | 'unknown' {
    const btn = document.querySelector('[data-agent-id="mag.ai-send"]');
    const p = btn?.getAttribute('data-studio-phase');
    return p === 'ingesting' || p === 'replying' || p === 'idle' ? p : 'unknown';
  }

  /**
   * Wait until the studio has REALLY finished the turn: the attachment is read,
   * the message is in the thread and the reply is done. Uploading/reading counts
   * as progress, never as "not sent" — a big image can take a while (reported:
   * the Stable Hand gave up after 4s while the studio was still reading the
   * user's photo, then told the user the studio was "still working").
   * "Not sent" is concluded when the studio has sat idle for 20s with nothing
   * posted — or at once when the panel raised an error (an unreadable document
   * stops the turn before anything is posted).
   */
  async function waitForStudioTurn(ui: UiDriver, chatLenBefore: number, sentAt: number, errorNow?: () => string | undefined) {
    let shown: string | null = null;
    const note = (label: string) => {
      if (shown !== label) {
        shown = label;
        ui.step(label);
      }
    };
    // The studio is briefly idle between "reading the attachment" and
    // "replying" — only a SETTLED idle (1.5s) counts as the turn being over.
    let idleSince = 0;
    await waitUntil(
      () => {
        const st = get();
        const phase = studioPhase();
        if (phase === 'ingesting') {
          idleSince = 0;
          note('The studio is reading the attachment');
          return false;
        }
        if (st.chatBusy || phase === 'replying') {
          idleSince = 0;
          note('Waiting for the studio to reply');
          return false;
        }
        if (!idleSince) idleSince = Date.now();
        if (st.chat.length >= chatLenBefore + 2) return Date.now() - idleSince >= 1500;
        if (st.chat.length === chatLenBefore && Date.now() - idleSince >= 1500) {
          const err = errorNow?.();
          if (err) throw new Error(`The studio did not take the message: ${err}`);
          // Idle, nothing posted, nothing reading, nothing replying: nothing is in
          // flight. Waiting the full ten minutes would only hide that.
          if (Date.now() - sentAt > 20_000) {
            const box = document.querySelector<HTMLTextAreaElement | HTMLInputElement>('[data-agent-id="mag.ai-input"]');
            const stillTyped = !!box && 'value' in box && box.value.trim().length > 0;
            throw new Error(
              stillTyped
                ? 'The message was not sent — the studio composer did not accept it.'
                : 'The studio did not reply — nothing was posted. Check the studio panel, then try again.',
            );
          }
        }
        return false;
      },
      { signal: ui.signal, timeoutMs: 600_000, intervalMs: 500, what: "the studio's reply" },
    );
  }

  /** Read the finished turn; optionally press "Use these changes" and verify. */
  async function finishStudioTurn(ui: UiDriver, apply: boolean | undefined, toasts: SeenToast[] = [], storageProblem?: string) {
    const after = get();
    const reply = [...after.chat].reverse().find((m) => m.role === 'assistant')?.content ?? '';
    const onPage = pageNoOf(after.pages, after.proposalsPageId);
    const staged = after.proposals.map((p) => ({ kind: p.kind, summary: p.summary }));
    // The turn itself failed (server error, refusal): the store posts an apology and
    // raises an error toast — say so instead of "the studio staged no changes".
    const turnError = staged.length === 0 ? firstError(toasts) : undefined;
    let outcome: Awaited<ReturnType<typeof applyStaged>> | null = null;
    if (apply && staged.length > 0) {
      // Same question as magazine.applyStudioChanges (deletions, a layout
      // rebuild, an AI page build). An OK here also pre-approves the app's own
      // window.confirm for the rebuild / a submitted page's deletion.
      const risky = stagedRiskQuestion();
      if (risky && !(await ui.confirm(risky))) {
        return { reply: reply.slice(0, 2000), stagedChanges: staged, stagedOnPage: onPage, applied: false, declined: true };
      }
      outcome = await applyStaged(ui);
    }
    const applied = !!outcome;
    return {
      reply: reply.slice(0, 2000),
      stagedChanges: applied ? [] : staged,
      appliedChanges: applied ? staged : undefined,
      stagedOnPage: onPage,
      applied,
      partial: outcome?.partial || undefined,
      buildJobId: outcome?.buildJobId,
      appMessages: [...toasts, ...(outcome?.messages ?? [])].map((t) => t.text).filter((t, i, all) => all.indexOf(t) === i).slice(0, 8),
      storageProblem: storageProblem
        ? `${storageProblem} — the attached file never reached storage, so the studio could NOT place the real image; anything it staged is only a look-alike. Do NOT apply it. Tell the user the upload failed and why (usually the S3 bucket's CORS rule doesn't allow this site's address), and suggest discarding the staged changes.`
        : undefined,
      note: storageProblem
        ? 'NOT applied: the image upload failed (see storageProblem).'
        : turnError
          ? `The studio's turn FAILED: ${turnError} Nothing was staged or changed.`
          : outcome?.partial
            ? 'PARTLY applied — some changes were refused (see appMessages). Check the page with readScreen before reporting.'
            : applied
              ? `Applied — the changes are on the page now (undo with Ctrl+Z).${outcome?.buildJobId ? ' It also started an AI page build: a [job-update] message arrives when it finishes.' : ''} Check the page with readScreen before reporting.`
              : staged.length > 0
                ? 'Changes are STAGED, not on the page yet. If the user asked for this change, call magazine.applyStudioChanges now.'
                : 'The studio staged no changes — read its reply; it may need more detail.',
      pageCount: get().pages.length,
    };
  }

  // Recovery / follow-up: the studio is mid-turn (reading an attachment or
  // replying) or has finished with staged changes. Never leave the user with
  // "it's still working" — wait here, then finish the job.
  useAgentAction(
    {
      name: 'magazine.waitForStudio',
      description:
        'Wait (up to 10 minutes) for the Magazine AI Studio to finish what it is doing — reading an attachment, then replying — and return its reply and staged changes. With apply:true, then press "Use these changes" and confirm they are on the page. Use whenever the studio is still working on something you asked for.',
      args: z.object({ apply: z.boolean().optional() }),
      run: async ({ apply }, ui) => {
        await ready(ui);
        // The panel, NOT a fresh chat: a new chat would throw the staged changes away.
        await ensureStudioPanel(ui);
        const st = get();
        const phase = studioPhase();
        const busy = phase === 'ingesting' || phase === 'replying' || st.chatBusy;
        // While the attachment is still being read the message is not in the thread
        // yet (the turn adds 2); once it is replying, the message is (it adds 1).
        if (busy) await waitForStudioTurn(ui, phase === 'ingesting' ? st.chat.length : Math.max(0, st.chat.length - 1), Date.now());
        // Already idle: there is no turn to wait for — just report / apply.
        return finishStudioTurn(ui, apply);
      },
    },
    canEdit,
  );

  /**
   * Press "Use these changes" (on the page they belong to) and follow it to the
   * end. The apply reports only through a toast — all applied, some refused
   * (warning) or none (error) — and used to be called "applied" whatever it said.
   */
  async function applyStaged(ui: UiDriver): Promise<{ partial: boolean; messages: SeenToast[]; buildJobId?: string }> {
    const s = get();
    if (s.proposals.length === 0) throw new Error('The studio has no changes waiting.');
    const forPageId = s.proposalsPageId;
    if (forPageId && forPageId !== s.currentPageId) {
      const n = pageNoOf(s.pages, forPageId) ?? 0;
      if (n <= 0) throw new Error('The page those changes were for no longer exists.');
      await openPageN(ui, n);
    }
    // The tray lives on the Chat tab of the open studio pane.
    await ensureStudioPanel(ui);
    await ui.waitFor('mag.ai-apply', 4000);
    const layout = s.proposals.some((p) => p.kind === 'apply-layout');
    const gen = s.proposals.some((p) => p.kind === 'generate-pages');
    const pageCountBefore = get().pages.length;
    // A staged page build starts a NEW build — let the last one's watch finish first.
    if (gen && get().issueId) await settlePreviousBuildJob(get().issueId!, ui.signal);
    ui.step('Applying the studio’s changes');
    const toasts = watchToasts();
    let seen: SeenToast[] = [];
    try {
      await ui.click('mag.ai-apply', 'Use these changes');
      // The store applies only the set staged for the OPEN page; if the canvas
      // moved to another page meanwhile, the click does nothing at all.
      await waitUntil(() => get().proposals.length === 0 || (!!forPageId && get().currentPageId !== forPageId), {
        signal: ui.signal,
        timeoutMs: 120_000,
        what: 'the changes to apply',
      });
      if (get().proposals.length > 0) throw new Error('The canvas moved to another page before the changes could be applied — nothing was changed. Try again.');
      if (layout) {
        // A staged layout rebuild clears the proposals BEFORE it runs; follow the
        // rebuild itself so "applied" is not reported while it is still in flight.
        await softWait(ui, () => get().layoutBusy || toasts.peek().length > 0, 3000);
        await waitUntil(() => !get().layoutBusy, { signal: ui.signal, timeoutMs: 180_000, what: 'the layout rebuild to finish' });
      }
      // The closing toast is raised as the proposals clear (a rebuild's, as it lands).
      await softWait(ui, () => toasts.peek().length > 0, 2000);
    } finally {
      seen = toasts.stop();
    }
    const errs = errorToasts(seen);
    if (errs.length > 0) throw new Error(errs.map((t) => t.text).join(' '));
    if (layout && seen.length === 0) throw new Error('The layout rebuild did not run — nothing on the page changed.');
    const partial = seen.some((t) => t.type === 'warning' && /refused/i.test(t.text));
    // A staged "design N new pages" starts a real build: watch it like addAiPages does.
    let buildJobId: string | undefined;
    if (gen && isBuilding() && get().issueId) {
      buildJobId = startMagazineBuildJob({ magazineId: get().issueId!, title: get().issue?.title, mode: 'add', pageCountBefore }).id;
    }
    return { partial, messages: seen, buildJobId };
  }

  useAgentAction(
    {
      name: 'magazine.applyStudioChanges',
      description:
        'Press "Use these changes" on the changes the AI Studio has staged (undoable with Ctrl+Z, except page deletions and a layout rebuild — those, and an AI page build, ask the user first).',
      args: z.object({}),
      // Asks only for deletions / a layout rebuild / an AI page build (see stagedRiskQuestion).
      confirm: () => stagedRiskQuestion(),
      run: async (_a, ui) => {
        await ready(ui);
        const staged = get().proposals.map((p) => ({ kind: p.kind, summary: p.summary }));
        const out = await applyStaged(ui);
        return {
          applied: staged,
          partial: out.partial || undefined,
          messages: toastLines(out.messages),
          buildJobId: out.buildJobId,
          note: out.partial
            ? 'Some of the changes were refused (see messages) — check the page with readScreen.'
            : out.buildJobId
              ? 'Applied; an AI page build started in the background — a [job-update] message arrives when it finishes.'
              : undefined,
          pageCount: get().pages.length,
        };
      },
    },
    canEdit,
  );

  useAgentAction(
    {
      name: 'magazine.discardStudioChanges',
      description: `Press "Don't use these" to dismiss the AI Studio's staged changes (nothing on the page changes).`,
      args: z.object({}),
      run: async (_a, ui) => {
        await ready(ui);
        const n = get().proposals.length;
        if (n === 0) return { discarded: 0 };
        await ensureStudioPanel(ui);
        // The tray shows only on the page the changes are for; elsewhere, the same handler.
        if (!(await clickIfPresent(ui, 'mag.ai-discard', "Don't use these"))) get().discardProposals();
        return { discarded: n };
      },
    },
    canEdit,
  );

  // ── Publishing ───────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.publish',
      description:
        'Publish (or republish) to the public Bulletins newsstand: the full edition, or only the given 1-based pages (through "Publish selected pages…"). Refused with the reason when pages still need approval.',
      args: z.object({ pages: z.array(z.number().int().min(1)).min(1).optional() }),
      confirm: ({ pages }) => {
        const s = get();
        // run() refuses these before touching anything — no pointless card: a build
        // or a publish running, a page that isn't there, pages still awaiting approval.
        if (isBuilding() || s.publishing || (pages && pages.some((n) => !s.pages.some((p) => pageNo(p) === n)))) return null;
        if (publishRefusal(pages)) return null;
        const verb = isLiveIssue(s.issue) ? 'Republish' : 'Publish';
        const what = pages ? pageListLabel(pages) : `all ${s.pages.length} page${s.pages.length === 1 ? '' : 's'}`;
        return `${verb} ${what} of “${s.issue?.title ?? 'this magazine'}” to Bulletins? It will be public.`;
      },
      run: async ({ pages }, ui) => {
        const s = await ready(ui);
        if (isBuilding()) throw new Error('Pages are still being built — publish once the build finishes (a [job-update] message arrives when it does).');
        if (s.publishing) throw new Error('A publish is already running — wait for it to finish.');
        if (pages) for (const n of pages) pageAt(s.pages, n);
        // The server's approval gate, checked BEFORE ticking anything: the selected
        // path writes each page's publish tick, and those writes must not happen for
        // a publish that is then refused.
        const refusal = publishRefusal(pages);
        if (refusal) throw new Error(refusal);
        assertEnabled('mag.publish-button', 'Publishing is not available right now.');
        // A REPUBLISH that fails leaves the magazine 'published', so success is
        // judged by what the studio SAID (its success / error toast) and what moved.
        const was = { live: isLiveIssue(s.issue), id: s.issue?.publishedIssueId, at: s.issue?.publishedAt };
        const toasts = watchToasts();
        let seen: SeenToast[] = [];
        try {
          if (!pages) {
            await openMenu(ui, 'mag.publish-button', 'mag.publish-full', 'Publish');
            assertEnabled('mag.publish-full', 'The full edition cannot be published right now.');
            await ui.click('mag.publish-full', 'Publish full edition');
          } else {
            await openMenu(ui, 'mag.publish-button', 'mag.publish-selected', 'Publish');
            assertEnabled('mag.publish-selected', 'Selected pages cannot be published right now.');
            await ui.click('mag.publish-selected', 'Publish selected pages…');
            await ui.waitFor('mag.publish-dialog', 4000);
            const want = new Set(pages);
            ui.step(`Ticking ${pageListLabel(pages)}`);
            // Boxes are anchored by REAL page number (PublishDialog: index + 1). Each
            // tick is its own server write whose reply REPLACES the page list, so they
            // go one at a time: overlapping replies could land out of order and undo a
            // tick that was already saved.
            for (const n of get().pages.map(pageNo)) {
              const box = anchor(`mag.publish-page-${n}`) as HTMLInputElement | null;
              if (box && box.checked !== want.has(n)) {
                // The tick sets an optimistic list; the server's reply (or a rollback +
                // error toast) then replaces it again — that is the save landing.
                const lists = watchPageList();
                try {
                  await ui.click(`mag.publish-page-${n}`, `Page ${n}`);
                  await softWait(ui, () => lists.count() >= 2 || !!firstError(toasts.peek()), 10_000);
                } finally {
                  lists.stop();
                }
                const err = firstError(toasts.peek());
                if (err) throw new Error(err);
              }
            }
            await waitUntil(() => get().pages.every((p) => p.selectedForPublish === want.has(pageNo(p))), {
              signal: ui.signal,
              what: 'the page selection to save',
            });
            assertEnabled('mag.publish-confirm', 'Those pages cannot be published yet.');
            await ui.click('mag.publish-confirm', 'Publish');
          }

          ui.step('Publishing to Bulletins');
          await softWait(ui, () => get().publishing || toasts.peek().length > 0, 3000);
          await waitUntil(() => !get().publishing, { signal: ui.signal, timeoutMs: 180_000, what: 'publishing to finish' });
          // The success toast ("Published … to Bulletins.") follows the store's reply.
          await softWait(ui, () => toasts.peek().some((t) => /published/i.test(t.text)) || !!firstError(toasts.peek()), 2000);
        } finally {
          seen = toasts.stop();
        }
        const issueAfter = get().issue;
        const err = firstError(seen);
        if (err) throw new Error(`${was.live ? 'Republishing' : 'Publishing'} failed: ${err}`);
        const said = seen.some((t) => /published/i.test(t.text));
        const moved = !!issueAfter?.publishedIssueId && (issueAfter.publishedIssueId !== was.id || issueAfter.publishedAt !== was.at);
        if (!issueAfter || !isLiveIssue(issueAfter) || !(said || moved || !was.live)) {
          throw new Error(`${was.live ? 'Republishing' : 'Publishing'} failed — see the message on screen.`);
        }
        return {
          published: true,
          republished: was.live || undefined,
          scope: pages ? 'selected' : 'full',
          pages: pages ? [...pages].sort((a, b) => a - b) : 'all',
          publishedIssueId: issueAfter.publishedIssueId,
          publicRoute: `/bulletins/${issueAfter.publishedIssueId}`,
        };
      },
    },
    isOwner && mayPublish,
  );

  useAgentAction(
    {
      name: 'magazine.unpublish',
      description: 'Take the live edition off the Bulletins newsstand (the draft is kept).',
      args: z.object({}),
      // Not published → run() refuses before touching anything; no card.
      // LIVE is publishedIssueId AND status 'published': unpublish keeps the id (for a
      // one-click re-publish) and sets status back to 'ready'. Testing the id alone
      // offered to unpublish a pulled magazine and reported a SUCCESSFUL unpublish
      // as "Unpublish failed".
      confirm: () =>
        isLiveIssue(get().issue) ? `Unpublish “${get().issue?.title ?? 'this magazine'}” from Bulletins? Readers will no longer see it.` : null,
      run: async (_a, ui) => {
        const s = await ready(ui);
        if (!isLiveIssue(s.issue)) throw new Error('This magazine is not published.');
        if (s.publishing) throw new Error('A publish is already running — wait for it to finish.');
        await openMenu(ui, 'mag.publish-button', 'mag.unpublish', 'Publish');
        assertEnabled('mag.unpublish', 'Unpublish is not available right now.');
        const toasts = watchToasts();
        try {
          await ui.click('mag.unpublish', 'Unpublish');
          await softWait(ui, () => get().publishing || toasts.peek().length > 0, 3000);
          await waitUntil(() => !get().publishing, { signal: ui.signal, timeoutMs: 60_000, what: 'unpublishing to finish' });
        } finally {
          toasts.stop();
        }
        // Judged by the LIVE rule (see above), never by publishedIssueId alone.
        if (isLiveIssue(get().issue)) throw new Error(`Unpublish failed${firstError(toasts.peek()) ? `: ${firstError(toasts.peek())}` : ' — see the message on screen.'}`);
        return { published: false, status: get().issue?.status };
      },
    },
    isOwner && mayPublish,
  );

  // ── Build progress ───────────────────────────────────────────────────────
  useAgentAction({
    name: 'magazine.waitForGeneration',
    description:
      'OPTIONAL. Builds already report back by themselves with a [job-update] message. Use this only to glance at a build in progress: follows it for at most 60 seconds, then returns the current progress and its jobId.',
    args: z.object({}),
    run: async (_a, ui) => {
      await ready(ui);
      if (!isBuilding()) {
        const s = get();
        return { building: false, status: s.issue?.status, pageCount: s.pages.length, error: s.issue?.processingError || undefined };
      }
      // Make sure the build is watched in the background (a build the user
      // started by hand has no job yet), so a [job-update] comes either way.
      const first = get();
      const magId = first.issueId;
      // Re-joins the running job for this magazine if there is one (same id).
      // An add-pages run needs its starting count, or a first poll that lands before
      // the server flips to 'processing' reads as "finished, nothing added".
      const job = magId
        ? startMagazineBuildJob({
            magazineId: magId,
            title: first.issue?.title,
            mode: first.adding ? 'add' : 'new',
            pageCountBefore: first.adding ? first.pages.length : undefined,
          })
        : null;
      const end = Date.now() + 60_000;
      let lastPhase = '';
      try {
        while (isBuilding()) {
          const s = get();
          const b = buildStatus(s.issue, s.adding);
          if (b.phase !== lastPhase) {
            lastPhase = b.phase;
            ui.step(b.headline);
          }
          ui.progress(b.count ? { label: 'Building pages', done: b.count.done, total: b.count.total } : null);
          if (Date.now() > end) {
            return {
              building: true,
              jobId: job?.id,
              headline: b.headline,
              done: b.count?.done ?? null,
              total: b.count?.total ?? null,
              pageCount: s.pages.length,
              note: JOB_STARTED_NOTE,
            };
          }
          await sleep(1000, ui.signal);
        }
      } finally {
        ui.progress(null);
      }
      // The model just saw it finish here — its [job-update] would only repeat it.
      // Let the watch notice the end first (it polls every few seconds): a watch
      // left "running" but marked delivered would adopt the NEXT build and swallow
      // that build's [job-update].
      if (job && magId) {
        await settlePreviousBuildJob(magId, ui.signal);
        useOperatorJobs.getState().markDelivered(magazineBuildJobId(magId));
      }
      const s = get();
      return {
        building: false,
        status: s.issue?.status,
        pageCount: s.pages.length,
        error: s.issue?.status === 'failed' || s.issue?.processingError ? s.issue?.processingError || 'The build failed.' : undefined,
      };
    },
  });

  // ── Per-page AI wands (Fill / Adjust above every page on the canvas) ──────
  useAgentAction(
    {
      name: 'magazine.fillPage',
      description:
        "Press the page's Fill wand (above the page on the canvas): AI writes copy into empty text boxes and tightens crowded text. Waits for it; returns the text blocks it changed. Undoable with magazine.undo.",
      args: z.object({ page: z.number().int().min(1) }),
      run: async ({ page }, ui) => runPageFormat(ui, 'fill', page),
    },
    canEdit,
  );

  useAgentAction(
    {
      name: 'magazine.adjustPage',
      description:
        "Press the page's Adjust wand (above the page on the canvas): AI tightens crowded / overflowing text and re-balances an AI-built layout, without filling empty boxes. Waits for it; returns what changed. Undoable with magazine.undo.",
      args: z.object({ page: z.number().int().min(1) }),
      run: async ({ page }, ui) => runPageFormat(ui, 'adjust', page),
    },
    canEdit,
  );

  // ── The "publish" tick in each page's canvas header ──────────────────────
  useAgentAction(
    {
      name: 'magazine.setPageInPublish',
      description:
        'Tick or untick the "publish" box above a page on the canvas — whether it is included when publishing SELECTED pages (a full-edition publish always includes every page).',
      args: z.object({ page: z.number().int().min(1), include: z.boolean() }),
      run: async ({ page, include }, ui) => {
        const s = await ready(ui);
        const target = pageAt(s.pages, page);
        const selected = () => get().pages.filter((p) => p.selectedForPublish).map((p) => pageNo(p));
        if (target.selectedForPublish === include) return { page, included: include, changed: false, selectedPages: selected() };
        const box = `mag.page-${page}-publish-toggle`;
        await ui.waitFor(box, 5000);
        const value = () => get().pages.find((p) => p.id === target.id)?.selectedForPublish;
        const toasts = watchToasts();
        const lists = watchPageList();
        let seen: SeenToast[] = [];
        try {
          await ui.click(box, include ? `Include page ${page} when publishing` : `Leave page ${page} out of selected publishing`);
          // The tick is optimistic; the server's page list (or a rollback) then
          // REPLACES the array again — that second replacement is the save landing.
          await softWait(ui, () => lists.count() >= 2 || errorToasts(toasts.peek()).length > 0, 15_000);
        } finally {
          lists.stop();
          seen = toasts.stop();
        }
        if (value() !== include) {
          throw new Error(errorToasts(seen).map((t) => t.text).join(' ') || `Page ${page}'s publish selection did not save.`);
        }
        ui.flash(box);
        return { page, included: include, changed: true, selectedPages: selected() };
      },
    },
    isOwner,
  );

  // ── Toolbar: undo / redo / zoom ──────────────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.undo',
      description: "Press Undo in the studio toolbar (Ctrl+Z): takes back the last edit — one whole AI apply or Fill/Adjust pass counts as one. Page deletions can't be undone.",
      args: z.object({}),
      run: async (_a, ui) => runHistory(ui, 'undo'),
    },
    canEdit,
  );

  useAgentAction(
    {
      name: 'magazine.redo',
      description: 'Press Redo in the studio toolbar: re-applies the last undone edit.',
      args: z.object({}),
      run: async (_a, ui) => runHistory(ui, 'redo'),
    },
    canEdit,
  );

  useAgentAction({
    name: 'magazine.zoom',
    description: "Zoom the canvas with the toolbar's − / + buttons: action 'in' | 'out' for one step, or percent (about 22–110) to step to the nearest level. Returns the zoom %.",
    args: z.object({ percent: z.number().min(10).max(200).optional(), action: z.enum(['in', 'out']).optional() }),
    run: async ({ percent, action }, ui) => {
      await ready(ui);
      const before = zoomPercent();
      const step = async (dir: 'in' | 'out') => {
        const w = get().zoomWidth;
        await revealToolbarItem(ui, `mag.zoom-${dir}`); // phone: in the More menu (stays open between steps)
        await ui.click(`mag.zoom-${dir}`, dir === 'in' ? 'Zoom in' : 'Zoom out');
        await softWait(ui, () => get().zoomWidth !== w, 1000);
        return get().zoomWidth !== w;
      };
      if (action) await step(action);
      if (percent !== undefined) {
        // Same clamp as the store's setZoomWidth; each click is ±80px of page width.
        const want = Math.max(280, Math.min(1400, Math.round((percent / 100) * 1275)));
        for (let i = 0; i < 25; i++) {
          const diff = want - get().zoomWidth;
          if (Math.abs(diff) <= 40) break;
          if (!(await step(diff > 0 ? 'in' : 'out'))) break; // at the limit
        }
      }
      ui.flash('mag.zoom-level');
      return { zoomPercent: zoomPercent(), before, note: !action && percent === undefined ? 'Pass action or percent to change it.' : undefined };
    },
  });

  // ── Cover image (More ▸ Cover image…) ────────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.setCover',
      description:
        "Set the cover shown on the Bulletins newsstand card through the Cover dialog: page (use that page's picture), imageUrl (an https image), or reset:true (automatic, from page 1). Exactly one.",
      args: z.object({
        page: z.number().int().min(1).optional(),
        imageUrl: z.string().url().optional(),
        reset: z.boolean().optional(),
      }),
      run: async ({ page, imageUrl, reset }, ui) => {
        const s = await ready(ui);
        const chosen = [page !== undefined, !!imageUrl, !!reset].filter(Boolean).length;
        if (chosen !== 1) throw new Error('Give exactly one of page, imageUrl or reset:true.');
        if (page !== undefined) pageAt(s.pages, page);
        if (reset && !s.issue?.coverImage) return { coverImage: null, automatic: true, changed: false };

        if (!anchor('mag.cover-dialog')) {
          ui.step('Opening the Cover dialog');
          await openMenu(ui, 'mag.more-button', 'mag.cover-button', 'More');
          await ui.click('mag.cover-button', 'Cover image…');
          await ui.waitFor('mag.cover-dialog', 4000);
        }
        const coverBefore = s.issue?.coverImage ?? '';
        const toasts = watchToasts();
        let seen: SeenToast[] = [];
        try {
          if (reset) {
            await ui.click('mag.cover-reset', 'Reset to automatic');
            await settle(ui, 'mag.cover-dialog', () => !get().issue?.coverImage, 'the cover to reset');
          } else {
            if (page !== undefined) {
              await ui.click('mag.cover-tab-pages', 'Pages');
              await ui.waitFor(`mag.cover-page-${page}`, 3000);
              await ui.click(`mag.cover-page-${page}`, `Page ${page}`);
            } else {
              await ui.click('mag.cover-tab-upload', 'Upload / URL');
              await ui.type('mag.cover-url', imageUrl!, { clear: true });
              await ui.click('mag.cover-url-set', 'Set');
            }
            // Success closes the dialog; a refusal leaves it open with a toast.
            await settle(ui, 'mag.cover-dialog', () => !anchor('mag.cover-dialog'), 'the cover to save');
          }
          await softWait(ui, () => toasts.peek().length > 0, 1500);
        } finally {
          seen = toasts.stop();
        }
        const errs = errorToasts(seen);
        const after = get().issue?.coverImage ?? '';
        const ok = reset ? !after : !anchor('mag.cover-dialog') && errs.length === 0;
        await clickIfPresent(ui, 'mag.cover-close', 'Close');
        if (!ok) throw new Error(errs.map((t) => t.text).join(' ') || 'The cover was not changed — see the message on screen.');
        return { coverImage: after || null, automatic: !after, changed: after !== coverBefore || !!reset, messages: toastLines(seen) };
      },
    },
    isOwner,
  );

  // ── Review board ─────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'magazine.openReviewBoard',
      description:
        'Open the review board (pages in progress / needs changes / submitted / approved). Returns the pages in each column and which ones you can tick. Only offered when someone else works on the magazine.',
      args: z.object({}),
      run: async (_a, ui) => {
        await ready(ui);
        await openReviewBoard(ui, live.current.isOwner);
        return boardSummary();
      },
    },
    // A read: anyone the magazine is shared with (or its owner) can look.
    perms.canEdit,
  );

  useAgentAction(
    {
      name: 'magazine.reviewPages',
      description:
        "On the review board: owner → action 'approve' or 'sendBack' (note required) on submitted pages; collaborator → 'submit' finished pages to the owner. Ticks exactly those pages, writes the note, presses the button. Emails the people involved.",
      args: z.object({
        action: z.enum(['approve', 'sendBack', 'submit']),
        pages: z.array(z.number().int().min(1)).min(1),
        note: z.string().max(2000).optional(),
      }),
      confirm: ({ action, pages, note }) => {
        const s = get();
        // Moves run() refuses before touching anything get no card: the wrong
        // action for your role, sendBack without a note, a page that isn't there,
        // or a page the board won't let you tick (e.g. approving an in-progress page).
        if ((action === 'submit') === live.current.isOwner) return null;
        if (action === 'sendBack' && !note?.trim()) return null;
        const tickable = reviewTickable(live.current.isOwner);
        if (pages.some((n) => !s.pages.some((p) => pageNo(p) === n && tickable.has(p.id)))) return null;
        const what = pageListLabel(pages);
        const title = s.issue?.title ?? 'this magazine';
        if (action === 'approve') return `Approve ${what} of “${title}”? Whoever worked on ${pages.length === 1 ? 'it' : 'them'} is emailed.`;
        if (action === 'sendBack') return `Send ${what} of “${title}” back for changes with your note? Whoever worked on ${pages.length === 1 ? 'it' : 'them'} is emailed.`;
        return `Submit ${what} of “${title}” to the owner for review? The owner is emailed, and the ${pages.length === 1 ? 'page locks' : 'pages lock'} until reviewed.`;
      },
      run: async ({ action, pages, note }, ui) => {
        const s = await ready(ui);
        const owner = live.current.isOwner;
        if ((action === 'submit') === owner) {
          throw new Error(
            owner
              ? "As the owner you 'approve' or 'sendBack' pages — 'submit' is for collaborators."
              : "Only the magazine's owner approves or sends back pages — you can 'submit' yours for review.",
          );
        }
        if (action === 'sendBack' && !note?.trim()) throw new Error('Sending pages back needs a note saying what to change.');
        const want = new Set(pages);
        const ids = new Map([...want].map((n) => [n, pageAt(s.pages, n).id]));
        const verbed = action === 'approve' ? 'approved' : action === 'sendBack' ? 'sent back' : 'submitted';
        // Same rule as the board's tick boxes — refused BEFORE opening anything
        // (the confirm card above was not shown for these either).
        const tickable = reviewTickable(owner);
        const notTickable = [...want].filter((n) => !tickable.has(ids.get(n)!)).sort((a, b) => a - b);
        const tickableNums = s.pages.filter((p) => tickable.has(p.id)).map(pageNo);
        if (notTickable.length > 0) {
          throw new Error(
            `${pageListLabel(notTickable)} can't be ${verbed} right now. ` +
              `${owner ? 'Pages waiting for you' : 'Your pages ready to submit'}: ${tickableNums.length ? tickableNums.join(', ') : 'none'}. Board: ${boardSentence() || 'empty'}.`,
          );
        }

        await openReviewBoard(ui, owner);
        const blocked = [...want].filter((n) => !anchor(`mag.review-page-${n}-select`));
        if (blocked.length > 0) {
          const b = boardSummary();
          throw new Error(
            `${pageListLabel(blocked)} can't be ${verbed} right now. ` +
              `Pages you can tick: ${b.tickable.length ? b.tickable.join(', ') : 'none'}. Board: ${boardSentence() || 'empty'}.`,
          );
        }
        ui.step(`Ticking ${pageListLabel(pages)}`);
        // Boxes are anchored by REAL page number (ReviewBoard: index + 1). Looping
        // 1..pages.length missed a page-scoped collaborator's pages entirely (their
        // list is e.g. just page 3), so 'submit' ticked nothing.
        for (const n of get().pages.map(pageNo)) {
          const box = anchor(`mag.review-page-${n}-select`) as HTMLInputElement | null;
          if (box && box.checked !== want.has(n)) await ui.click(`mag.review-page-${n}-select`, `Page ${n}`);
        }
        if (note?.trim()) await ui.type('mag.review-note', note.trim(), { clear: true });

        const btn = action === 'approve' ? 'mag.review-approve' : action === 'sendBack' ? 'mag.review-send-back' : 'mag.review-submit';
        const goal: ReviewColumn = action === 'approve' ? 'approved' : action === 'sendBack' ? 'needs_changes' : 'submitted';
        assertEnabled(btn, 'That review button is not available right now.');
        const toasts = watchToasts();
        let seen: SeenToast[] = [];
        try {
          await ui.click(btn, action === 'approve' ? 'Approve' : action === 'sendBack' ? 'Send back' : 'Submit');
          await softWait(ui, () => get().reviewBusy || toasts.peek().length > 0, 3000);
          await waitUntil(() => !get().reviewBusy, { signal: ui.signal, timeoutMs: 60_000, what: 'the review to save' });
          await softWait(ui, () => toasts.peek().length > 0, 1500);
        } finally {
          seen = toasts.stop();
        }
        const landed = (n: number) => {
          const p = get().pages.find((x) => x.id === ids.get(n));
          return !!p && columnOf(p) === goal && (goal !== 'approved' || !p.approvalStale);
        };
        const moved = [...want].filter(landed).sort((a, b) => a - b);
        const notMoved = [...want].filter((n) => !landed(n)).sort((a, b) => a - b);
        const board = boardSummary();
        if (moved.length === 0) {
          throw new Error(errorToasts(seen).map((t) => t.text).join(' ') || 'Nothing moved on the review board — see the message on screen.');
        }
        await sleep(600, ui.signal);
        await clickIfPresent(ui, 'mag.review-close', 'Close');
        return { action, moved, notMoved, columns: board.columns, messages: toastLines(seen) };
      },
    },
    canEdit,
  );
}
