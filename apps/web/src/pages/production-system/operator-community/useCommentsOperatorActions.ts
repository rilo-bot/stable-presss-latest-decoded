// ---------------------------------------------------------------------------
// The Stable Hand Operator — COMMENTS pack (/production-system/comments).
//
// Registered by CommentModerationScreen while it is mounted. Every write drives
// the screen's own controls, the way an editor does it:
//
//   community.removeComment   Remove → types the reason → "Remove it"
//   community.restoreComment  Restore (on the Removed tab)
//   community.deleteComment   Delete → "Yes, delete"
//
// so the screen's own act() makes the same POST /api/comments/:id/hide|restore
// or DELETE /api/comments/:id call, and the server re-checks comments.edit /
// comments.delete as the signed-in user. All three change what readers see, so
// all three define confirm().
//
// The screen has no "approve" (a reported comment simply stays up until someone
// removes it — nothing is auto-hidden) and no ban, so neither exists here.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/community.ts — keep the
// names and arg shapes in step.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import { z } from 'zod';

import type { UiDriver } from '@/agent/operator/contracts';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { can } from '@/lib/permissions';
import { EMOJI_SCALE, SIDE_LABEL, sideOf, type EmojiKey } from '@/types/reactions';

import { anchor, useLive, waitUntil } from '../operator-team/opUtils';

export type CommentFilter = 'reported' | 'hidden' | 'all';

/** The screen's queue row (structurally the same as its QueueRow). */
export interface ModerationRow {
  id: string;
  body: string;
  emoji: EmojiKey;
  authorName: string;
  isStaff: boolean;
  createdAt: string;
  editedAt?: string;
  hidden: boolean;
  reportCount: number;
  hiddenReason?: string;
  targetType: string;
  targetTitle: string;
  targetHref: string;
}

export interface CommentsOperatorInput {
  filter: CommentFilter;
  items: ModerationRow[];
  reportedCount: number;
  hiddenCount: number;
  truncated: number;
  state: 'loading' | 'ready' | 'error';
  /** Bumped every time a queue load finishes (ok or not). */
  loads: number;
  busyId: string | null;
  error: string | null;
}

const FILTER_LABEL: Record<CommentFilter, string> = { reported: 'Reported', hidden: 'Removed', all: 'Everything' };
const TYPE_LABEL: Record<string, string> = { story: 'Story', blog: 'Blog post', bulletin: 'Edition' };

/** Anchor ids — the screen renders exactly these. */
export const commentAnchor = {
  filter: (f: CommentFilter) => `community.filter-${f}`,
  card: (id: string) => `community.comment-${id}`,
  remove: (id: string) => `community.remove-${id}`,
  reason: (id: string) => `community.reason-${id}`,
  removeConfirm: (id: string) => `community.remove-confirm-${id}`,
  removeCancel: (id: string) => `community.remove-cancel-${id}`,
  restore: (id: string) => `community.restore-${id}`,
  del: (id: string) => `community.delete-${id}`,
  deleteConfirm: (id: string) => `community.delete-confirm-${id}`,
  deleteCancel: (id: string) => `community.delete-cancel-${id}`,
};

const excerpt = (s: string, n = 70) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function rowJson(r: ModerationRow) {
  const step = EMOJI_SCALE.find((s) => s.key === r.emoji);
  return {
    id: r.id,
    author: r.authorName,
    staff: r.isStaff || undefined,
    stance: step ? `${step.emoji} ${step.label} (${SIDE_LABEL[sideOf(r.emoji)]})` : r.emoji,
    body: excerpt(r.body, 600),
    reports: r.reportCount,
    removed: r.hidden,
    removedReason: r.hiddenReason || undefined,
    on: { type: TYPE_LABEL[r.targetType] ?? r.targetType, title: r.targetTitle, href: r.targetHref || undefined },
    postedAt: r.createdAt,
    edited: r.editedAt ? true : undefined,
  };
}

/** "the comment by Jo Bloggs on “Title” (“first words…”)" — for confirm cards. */
function describe(r: ModerationRow | undefined, id: string): string {
  if (!r) return `comment ${id}`;
  return `the comment by ${r.authorName} on “${excerpt(r.targetTitle, 60)}” (“${excerpt(r.body, 80)}”)`;
}

const idArg = z.object({ id: z.string().min(1).describe('Comment id, from community.listComments') });
const removeArg = z.object({
  id: z.string().min(1).describe('Comment id, from community.listComments'),
  reason: z.string().trim().min(1).max(300).describe('Why it is removed — recorded for staff, never shown to readers'),
});
const listArg = z.object({ filter: z.enum(['reported', 'hidden', 'all']).optional() });

export function useCommentsOperatorActions(input: CommentsOperatorInput): void {
  const live = useLive(input);
  // Every row seen on any tab, so a confirm card can name a comment that is not
  // on the tab showing right now (the action switches tab after the OK).
  const seen = useRef(new Map<string, ModerationRow>());
  for (const r of input.items) seen.current.set(r.id, r);
  const known = (id: string) => live.current.items.find((r) => r.id === id) ?? seen.current.get(id);
  const canView = can('comments.view');
  const canEdit = can('comments.edit');
  const canDelete = can('comments.delete');

  const snapshot = () => {
    const s = live.current;
    return {
      filter: s.filter,
      filterLabel: FILTER_LABEL[s.filter],
      reportedCount: s.reportedCount,
      removedCount: s.hiddenCount,
      shown: s.items.length,
      truncated: s.truncated || undefined,
      loadError: s.state === 'error' ? 'The queue did not load.' : undefined,
      items: s.items.map(rowJson),
    };
  };

  /** Wait for the queue load in flight (if any) to finish. */
  async function settle(ui: UiDriver, loadsBefore?: number) {
    if (loadsBefore !== undefined) {
      await waitUntil(() => live.current.loads > loadsBefore, { timeoutMs: 20_000, signal: ui.signal });
    }
    await waitUntil(() => live.current.state !== 'loading', { timeoutMs: 20_000, signal: ui.signal });
    if (live.current.state === 'loading') throw new Error('The comments queue is taking too long to load.');
  }

  /** Switch the tab visibly (no-op when already on it) and wait for its list. */
  async function showFilter(ui: UiDriver, f: CommentFilter) {
    if (live.current.filter === f) {
      await settle(ui);
      return;
    }
    const before = live.current.loads;
    await ui.click(commentAnchor.filter(f), FILTER_LABEL[f]);
    await waitUntil(() => live.current.filter === f, { timeoutMs: 3_000, signal: ui.signal });
    await settle(ui, before);
  }

  /** The row on screen, switching to `fallback` tab when it is not listed here. */
  async function findRow(ui: UiDriver, id: string, fallback: CommentFilter): Promise<ModerationRow> {
    await settle(ui);
    let row = live.current.items.find((r) => r.id === id);
    if (!row && live.current.filter !== fallback) {
      ui.step(`Looking for the comment in ${FILTER_LABEL[fallback]}`);
      await showFilter(ui, fallback);
      row = live.current.items.find((r) => r.id === id);
    }
    if (!row) {
      throw new Error(
        `No comment with id "${id}" in the ${FILTER_LABEL[live.current.filter]} list. Call community.listComments (filter "all") for the ids.`,
      );
    }
    await ui.point(commentAnchor.card(id), row.authorName);
    return row;
  }

  /** After a write: wait for the row's spinner to start and stop, then report. */
  async function finishWrite(ui: UiDriver, id: string, loadsBefore: number) {
    await waitUntil(() => live.current.busyId === id || live.current.loads > loadsBefore, {
      timeoutMs: 3_000,
      signal: ui.signal,
    });
    await waitUntil(() => live.current.busyId === null, { timeoutMs: 20_000, signal: ui.signal });
    if (live.current.busyId !== null) throw new Error('The server is taking too long — check the Comments screen.');
    if (live.current.error) throw new Error(live.current.error);
    await settle(ui);
  }

  useAgentAction(
    {
      name: 'community.listComments',
      description:
        'Read the comment moderation queue (Reported / Removed / Everything): ids, author, text, stance, report count, where it was posted.',
      args: listArg,
      run: async (a, ui) => {
        if (a.filter) await showFilter(ui, a.filter);
        else await settle(ui);
        return snapshot();
      },
    },
    canView,
  );

  useAgentAction(
    {
      name: 'community.removeComment',
      description: 'Remove (hide) a comment with a reason: readers see "removed by an editor". Reversible.',
      args: removeArg,
      confirm: (a) => {
        const row = known(a.id);
        return `Remove ${describe(row, a.id)}? Readers will see a note that an editor removed it. Reason (staff only): “${a.reason}”.`;
      },
      run: async (a, ui) => {
        const row = await findRow(ui, a.id, 'all');
        if (row.hidden) return { ok: true, unchanged: true, note: 'That comment is already removed.', comment: rowJson(row) };
        await ui.click(commentAnchor.remove(a.id), 'Remove');
        await ui.waitFor(commentAnchor.reason(a.id), 3_000);
        await ui.type(commentAnchor.reason(a.id), a.reason, { clear: true });
        const enabled = await waitUntil(
          () => !(anchor(commentAnchor.removeConfirm(a.id)) as HTMLButtonElement | null)?.disabled,
          { timeoutMs: 2_000, signal: ui.signal },
        );
        if (!enabled) throw new Error('The "Remove it" button did not enable — the reason did not reach the field.');
        const before = live.current.loads;
        await ui.click(commentAnchor.removeConfirm(a.id), 'Remove it');
        await finishWrite(ui, a.id, before);
        const after = live.current.items.find((r) => r.id === a.id);
        if (after && !after.hidden) throw new Error('The comment is still visible — the removal did not go through.');
        return { ok: true, removed: { ...rowJson(row), removed: true, removedReason: a.reason }, queue: snapshot() };
      },
    },
    canEdit,
  );

  useAgentAction(
    {
      name: 'community.restoreComment',
      description: 'Restore a removed comment (puts it back in the thread and clears the reason).',
      args: idArg,
      confirm: (a) => {
        const row = known(a.id);
        return `Restore ${describe(row, a.id)}? It goes back on the public thread straight away.`;
      },
      run: async (a, ui) => {
        const row = await findRow(ui, a.id, 'hidden');
        if (!row.hidden) return { ok: true, unchanged: true, note: 'That comment is not removed.', comment: rowJson(row) };
        const before = live.current.loads;
        await ui.click(commentAnchor.restore(a.id), 'Restore');
        await finishWrite(ui, a.id, before);
        const after = live.current.items.find((r) => r.id === a.id);
        if (after?.hidden) throw new Error('The comment is still removed — the restore did not go through.');
        return { ok: true, restored: { ...rowJson(row), removed: false, removedReason: undefined }, queue: snapshot() };
      },
    },
    canEdit,
  );

  useAgentAction(
    {
      name: 'community.deleteComment',
      description: 'Delete a comment entirely (no note in the thread, cannot be restored). Prefer removeComment.',
      args: idArg,
      confirm: (a) => {
        const row = known(a.id);
        return `Delete ${describe(row, a.id)} permanently? Unlike removing, it leaves no note in the thread and cannot be put back.`;
      },
      run: async (a, ui) => {
        const row = await findRow(ui, a.id, 'all');
        await ui.click(commentAnchor.del(a.id), 'Delete');
        await ui.waitFor(commentAnchor.deleteConfirm(a.id), 3_000);
        const before = live.current.loads;
        await ui.click(commentAnchor.deleteConfirm(a.id), 'Yes, delete');
        await finishWrite(ui, a.id, before);
        if (live.current.items.some((r) => r.id === a.id)) {
          throw new Error('The comment is still listed — the delete did not go through.');
        }
        return { ok: true, deleted: rowJson(row), queue: snapshot() };
      },
    },
    canDelete,
  );
}
