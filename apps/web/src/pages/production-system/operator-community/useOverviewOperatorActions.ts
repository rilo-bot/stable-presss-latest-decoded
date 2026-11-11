// ---------------------------------------------------------------------------
// The Stable Hand Operator — OVERVIEW (/production-system/overview).
//
// Registered by OverviewScreen. Everything it reads is what the screen computed
// for this role (figures from the same buckets as the pipeline strip, attention
// rows already resolved + availability-checked, Start tiles already permission-
// filtered), so it can never name a link the person could not click.
//
//   overview.readOverview   brief, figures, ledger, Needs your attention,
//                           pipeline counts, Start-something cards, recent stories
//   overview.startSomething clicks a Start-something card
//   overview.openAttention  clicks a Needs-your-attention row
//   overview.refreshBrief   presses Refresh on the brief and returns the new text
//
// None of these write anything; opening a card is navigation.
// Catalog: apps/server/src/lib/agent/operator/catalog/community.ts.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { StageMeta } from '@/lib/workflow';
import type { Article } from '@/types/article';

import { normKey, resolveOne, useLive, waitUntil } from '../operator-team/opUtils';
import type { AttentionRow, Figure, LedgerEntry, StartTile } from '../overview/sections';

export interface OverviewOperatorInput {
  name: string;
  roleLabel: string;
  isContributor: boolean;
  brief: string | null;
  briefLoading: boolean;
  figures: Figure[];
  ledger: LedgerEntry[];
  attention: AttentionRow[];
  attentionLoading: boolean;
  attentionError: boolean;
  stages: StageMeta[];
  stageCounts: Record<string, number>;
  startTiles: StartTile[];
  recent: Article[];
  recentTitle: string;
}

/** Anchor ids — the Overview renders exactly these. */
export const overviewAnchor = {
  figure: (label: string) => `overview.figure-${slug(label)}`,
  ledger: (label: string) => `overview.ledger-${slug(label)}`,
  attention: (id: string) => `overview.attention-${id}`,
  stage: (status: string) => `overview.stage-${status}`,
  start: (key: string) => `overview.start-${key}`,
};

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const pathOf = (to: string) => to.split(/[?#]/)[0];

export function useOverviewOperatorActions(input: OverviewOperatorInput): void {
  const live = useLive(input);

  useAgentAction({
    name: 'overview.readOverview',
    description:
      'Read the Overview: the written brief, story figures, register ledger, Needs your attention items, pipeline counts, Start-something cards and recent stories.',
    args: z.object({}),
    run: async (_a, ui) => {
      await waitUntil(() => !live.current.attentionLoading, { timeoutMs: 15_000, signal: ui.signal });
      const s = live.current;
      return {
        greeting: { name: s.name, role: s.roleLabel, scope: s.isContributor ? 'Your stories only' : 'Whole newsroom' },
        brief: s.briefLoading && !s.brief ? null : s.brief,
        briefStatus: s.briefLoading ? 'writing' : s.brief ? 'ready' : 'offline (no AI key on the server)',
        figures: s.figures.map((f) => ({ label: f.label, value: f.value, hint: f.hint })),
        ledger: s.ledger.filter((l) => l.value > 0).map((l) => ({ label: l.label, value: l.value, opens: l.to ?? undefined })),
        needsAttention: s.attentionLoading
          ? 'still loading'
          : s.attentionError
            ? 'could not load (the panel says so — not the same as nothing waiting)'
            : s.attention.map((r) => ({ id: r.id, label: r.label, count: r.count, opens: r.to })),
        pipeline: s.stages.map((st) => ({ status: st.status, label: st.label, count: s.stageCounts[st.status] ?? 0 })),
        startSomething: s.startTiles.map((t) => ({ key: t.key, title: t.title, description: t.meta, opens: t.to })),
        recent: {
          title: s.recentTitle,
          stories: s.recent.map((a) => ({ id: a.id, title: a.title, author: a.author, category: a.category ?? 'General', stage: a.status })),
        },
        note: 'Filing a story is the "File a Story" button in the top bar, not a Start card.',
      };
    },
  });

  useAgentAction({
    name: 'overview.startSomething',
    description: 'Click a Start-something card (instant, blogs, magazine — by key or title) and open that screen.',
    args: z.object({ card: z.string().min(1) }),
    run: async (a, ui) => {
      const tiles = live.current.startTiles;
      if (!tiles.length) throw new Error('This role has no Start-something cards. Use "File a Story" in the top bar to start a story.');
      const r = resolveOne(a.card, tiles, (t) => [t.key, t.title], 'Start card', (t) => `${t.title} (${t.key})`);
      if (!r.hit) {
        if (/story|file/.test(normKey(a.card))) throw new Error('Filing a story is the "File a Story" button in the top bar, not a Start card.');
        throw new Error(r.error);
      }
      const tile = r.hit;
      await ui.click(overviewAnchor.start(tile.key), tile.title);
      await ui.waitForRoute(pathOf(tile.to), 8_000);
      return { ok: true, opened: tile.title, path: window.location.pathname };
    },
  });

  useAgentAction({
    name: 'overview.openAttention',
    description: 'Click a Needs-your-attention row (by id or label) to open the queue it points at.',
    args: z.object({ item: z.string().min(1) }),
    run: async (a, ui) => {
      await waitUntil(() => !live.current.attentionLoading, { timeoutMs: 15_000, signal: ui.signal });
      const rows = live.current.attention;
      if (live.current.attentionError) throw new Error('The attention list did not load — nothing to open.');
      if (!rows.length) throw new Error('Nothing is waiting on you right now — the list is empty.');
      const r = resolveOne(a.item, rows, (x) => [x.id, x.label], 'attention item', (x) => `${x.label} (${x.id})`);
      if (!r.hit) throw new Error(r.error);
      const row = r.hit;
      await ui.click(overviewAnchor.attention(row.id), row.label);
      await ui.waitForRoute(pathOf(row.to), 8_000);
      return { ok: true, opened: row.label, count: row.count, path: window.location.pathname };
    },
  });

  useAgentAction({
    name: 'overview.refreshBrief',
    description: 'Press Refresh on the Overview brief and return the newly written brief.',
    args: z.object({}),
    run: async (_a, ui) => {
      if (live.current.briefLoading) {
        await waitUntil(() => !live.current.briefLoading, { timeoutMs: 60_000, signal: ui.signal });
      } else {
        await ui.click('overview.refresh-brief', 'Refresh the brief');
        await waitUntil(() => live.current.briefLoading, { timeoutMs: 2_000, signal: ui.signal });
        await waitUntil(() => !live.current.briefLoading, { timeoutMs: 60_000, signal: ui.signal });
      }
      if (live.current.briefLoading) throw new Error('The brief is taking too long to write.');
      ui.flash('overview.brief');
      return { brief: live.current.brief ?? null, status: live.current.brief ? 'ready' : 'offline (no AI key on the server)' };
    },
  });
}
