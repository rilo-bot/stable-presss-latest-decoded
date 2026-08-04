/**
 * Reader reactions — the client half of the one mechanism.
 *
 * One store for every surface that has a scale (blog posts, blog parts, stories,
 * bulletin issues), keyed by `targetType:targetId`. A post with parts loads all
 * of its bars in ONE request via `withParts`, which is what `parentId` exists
 * for on the server (see docs/REACTIONS-PLAN.md §5) — nine bars must not mean
 * nine round trips.
 *
 * NOT persisted. The reaction is the server's now: what you picked lives on your
 * account, so it follows you to another browser, and a stale localStorage copy
 * could only ever disagree with it.
 */
import { create } from 'zustand';

import { authFetch, authFetchRetry } from '@/lib/api';
import { EMOJI_SCALE, type EmojiKey } from '@/types/reactions';

export type ReactionTargetType = 'blog' | 'blogPart' | 'story' | 'bulletin';

export interface ReactionCounts {
  targetType: ReactionTargetType;
  targetId: string;
  /** All seven keys, always — zeros included. */
  counts: Record<EmojiKey, number>;
  /** Readers who reacted. Because identity is an account, this counts PEOPLE. */
  total: number;
  /** Your own pick, or null. Always null when signed out. */
  mine: EmojiKey | null;
}

export const reactionKey = (targetType: ReactionTargetType, targetId: string): string =>
  `${targetType}:${targetId}`;

function zeroCounts(): Record<EmojiKey, number> {
  return Object.fromEntries(EMOJI_SCALE.map((s) => [s.key, 0])) as Record<EmojiKey, number>;
}

/** An untouched target, so a bar can render before (or without) any data. */
export function emptyCounts(targetType: ReactionTargetType, targetId: string): ReactionCounts {
  return { targetType, targetId, counts: zeroCounts(), total: 0, mine: null };
}

/**
 * Coerce a server row. Missing keys become zeros rather than `undefined`, so a
 * response that ever loses a key renders a 0 instead of "NaN readers".
 */
function normalise(raw: unknown): ReactionCounts | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.targetType !== 'string' || typeof row.targetId !== 'string') return null;
  const src = (row.counts ?? {}) as Record<string, unknown>;
  const counts = zeroCounts();
  let total = 0;
  for (const step of EMOJI_SCALE) {
    const n = src[step.key];
    counts[step.key] = typeof n === 'number' && Number.isFinite(n) ? n : 0;
    total += counts[step.key];
  }
  const mine = EMOJI_SCALE.some((s) => s.key === row.mine) ? (row.mine as EmojiKey) : null;
  return {
    targetType: row.targetType as ReactionTargetType,
    targetId: row.targetId,
    counts,
    total,
    mine,
  };
}

interface ReactionState {
  byKey: Record<string, ReactionCounts>;
  /** Keys currently in flight, so a bar can disable itself mid-write. */
  pending: Record<string, boolean>;
  /** Per-key error, shown under the bar it belongs to. */
  errors: Record<string, string | null>;

  /** Counts for one target, and every part of it when `withParts`. */
  load: (targetType: ReactionTargetType, targetId: string, withParts?: boolean) => Promise<void>;
  /** Set or change your pick. Returns false when it did not stick. */
  react: (
    targetType: ReactionTargetType,
    targetId: string,
    emoji: EmojiKey,
    parentId?: string,
  ) => Promise<boolean>;
  /** Take your reaction back. */
  clear: (targetType: ReactionTargetType, targetId: string) => Promise<boolean>;
  /** Drop everything — called on sign-out, since `mine` belonged to that account. */
  reset: () => void;
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return 'Sign in to have your say.';
  // The server says "Not found" for anything unpublished, which is the right
  // answer to give an API and the wrong sentence to show a reader who is looking
  // at the thing. The pages hide the bar on a draft, so this only fires when
  // something is unpublished WHILE it is open.
  if (res.status === 404) return 'This is not open for reactions.';
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* a non-JSON body is not worth a second failure */
  }
  return fallback;
}

export const useReactionStore = create<ReactionState>((set, get) => ({
  byKey: {},
  pending: {},
  errors: {},

  load: async (targetType, targetId, withParts = false) => {
    if (!targetId) return;
    const params = new URLSearchParams({ targetType, targetId });
    if (withParts) params.set('withParts', '1');
    try {
      const res = await authFetchRetry(`/api/reactions?${params.toString()}`);
      if (!res.ok) return;
      const rows = (await res.json()) as unknown;
      if (!Array.isArray(rows)) return;
      const merged: Record<string, ReactionCounts> = {};
      for (const raw of rows) {
        const row = normalise(raw);
        if (row) merged[reactionKey(row.targetType, row.targetId)] = row;
      }
      set((s) => ({ byKey: { ...s.byKey, ...merged } }));
    } catch {
      // A failed load leaves the bar on its zeros. It says "be the first", which
      // is wrong-but-harmless; an error banner over a reaction bar is not.
    }
  },

  react: async (targetType, targetId, emoji, parentId) => {
    const key = reactionKey(targetType, targetId);
    const before = get().byKey[key] ?? emptyCounts(targetType, targetId);

    // Optimistic: move your own vote off the old step and onto the new one, and
    // only change `total` when you had no pick before. Reacting twice is a
    // CHANGE, not a second reader.
    const counts = { ...before.counts };
    if (before.mine) counts[before.mine] = Math.max(0, counts[before.mine] - 1);
    counts[emoji] = counts[emoji] + 1;
    const optimistic: ReactionCounts = {
      ...before,
      counts,
      total: before.mine ? before.total : before.total + 1,
      mine: emoji,
    };
    set((s) => ({
      byKey: { ...s.byKey, [key]: optimistic },
      pending: { ...s.pending, [key]: true },
      errors: { ...s.errors, [key]: null },
    }));

    try {
      const res = await authFetch(`/api/reactions/${targetType}/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parentId ? { emoji, parentId } : { emoji }),
      });
      if (!res.ok) {
        // Roll back to exactly what was there. Leaving the optimistic pick up
        // after a rejection is the one outcome worse than not recording it: the
        // reader believes they were counted.
        const message = await errorFrom(res, 'That reaction did not save.');
        set((s) => ({
          byKey: { ...s.byKey, [key]: before },
          pending: { ...s.pending, [key]: false },
          errors: { ...s.errors, [key]: message },
        }));
        return false;
      }
      const row = normalise(await res.json());
      set((s) => ({
        byKey: row ? { ...s.byKey, [key]: row } : s.byKey,
        pending: { ...s.pending, [key]: false },
      }));
      return true;
    } catch {
      set((s) => ({
        byKey: { ...s.byKey, [key]: before },
        pending: { ...s.pending, [key]: false },
        errors: { ...s.errors, [key]: 'Could not reach the server. Try again in a moment.' },
      }));
      return false;
    }
  },

  clear: async (targetType, targetId) => {
    const key = reactionKey(targetType, targetId);
    const before = get().byKey[key] ?? emptyCounts(targetType, targetId);
    if (!before.mine) return true;

    const counts = { ...before.counts };
    counts[before.mine] = Math.max(0, counts[before.mine] - 1);
    set((s) => ({
      byKey: { ...s.byKey, [key]: { ...before, counts, total: Math.max(0, before.total - 1), mine: null } },
      pending: { ...s.pending, [key]: true },
      errors: { ...s.errors, [key]: null },
    }));

    try {
      const res = await authFetch(`/api/reactions/${targetType}/${targetId}`, { method: 'DELETE' });
      if (!res.ok) {
        const message = await errorFrom(res, 'That did not clear.');
        set((s) => ({
          byKey: { ...s.byKey, [key]: before },
          pending: { ...s.pending, [key]: false },
          errors: { ...s.errors, [key]: message },
        }));
        return false;
      }
      const row = normalise(await res.json());
      set((s) => ({
        byKey: row ? { ...s.byKey, [key]: row } : s.byKey,
        pending: { ...s.pending, [key]: false },
      }));
      return true;
    } catch {
      set((s) => ({
        byKey: { ...s.byKey, [key]: before },
        pending: { ...s.pending, [key]: false },
        errors: { ...s.errors, [key]: 'Could not reach the server. Try again in a moment.' },
      }));
      return false;
    }
  },

  reset: () => set({ byKey: {}, pending: {}, errors: {} }),
}));
