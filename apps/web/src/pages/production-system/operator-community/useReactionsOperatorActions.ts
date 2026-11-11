// ---------------------------------------------------------------------------
// The Stable Hand Operator — EMOJI ANALYTICS pack
// (/production-system/emoji-analytics).
//
// Registered by EmojiAnalyticsScreen while it is mounted. Read-only:
//
//   analytics.readReactions       the figures the screen is showing right now,
//                                 derived from the SAME report + deriveDashboard
//                                 the page renders (never re-fetched, never
//                                 invented), plus "most reactions" rankings so
//                                 "which story got the most reactions?" has a
//                                 real answer.
//   analytics.setReactionFilters  clicks the screen's own Date range / Content
//                                 type / Who counts / Rank by controls, waits for
//                                 the report for those filters, then reads it.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/community.ts.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import type { UiDriver } from '@/agent/operator/contracts';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { can } from '@/lib/permissions';

import {
  CONTENT_TYPES, DATE_RANGES, EMOJI_KEYS, avgStep, stepFor, typeLabel,
  type ContentType, type Dashboard, type DateRangeId, type EmojiKey, type ItemStat,
  type ReactionsReport,
} from '../emoji-analytics/data';
import { normKey, useLive, waitUntil } from '../operator-team/opUtils';

export type RankBy = 'score' | EmojiKey;
export type Audience = 'readers' | 'everyone';

export interface ReactionsOperatorInput {
  rangeId: DateRangeId;
  from: string;
  to: string;
  types: ContentType[];
  audience: Audience;
  rank: RankBy;
  state: 'loading' | 'ready' | 'error';
  /** Key of the filters the report on screen was loaded for… */
  loadedKey: string;
  /** …and of the filters the controls are set to now. Equal = up to date. */
  currentKey: string;
  report: ReactionsReport;
  dashboard: Dashboard;
  leaders: ItemStat[];
  minReactions: number;
}

/** Anchor ids — the screen renders exactly these. */
export const reactionsAnchor = {
  range: (id: DateRangeId) => `analytics.range-${id}`,
  type: (id: ContentType | 'all') => `analytics.type-${id}`,
  audience: (a: Audience) => `analytics.audience-${a}`,
  rank: (r: RankBy) => `analytics.rank-${r}`,
};

/** One string per filter set — the screen stamps the loaded report with it. */
export const reactionsKey = (from: string, to: string, typeKey: string, includeStaff: boolean) =>
  `${from}|${to}|${typeKey}|${includeStaff ? 1 : 0}`;

const round1 = (n: number) => Math.round(n * 10) / 10;

const TYPE_ALIASES: Record<string, ContentType> = {
  story: 'story', stories: 'story', news: 'story', article: 'story', articles: 'story',
  blog: 'blog', blogs: 'blog', post: 'blog', posts: 'blog', blogpost: 'blog', blogposts: 'blog',
  blogpart: 'blogPart', blogparts: 'blogPart', part: 'blogPart', parts: 'blogPart',
  bulletin: 'bulletin', bulletins: 'bulletin', magazine: 'bulletin', magazines: 'bulletin', edition: 'bulletin', editions: 'bulletin', issue: 'bulletin', issues: 'bulletin',
};

function contentType(raw: string): ContentType {
  const hit = TYPE_ALIASES[normKey(raw)];
  if (!hit) throw new Error(`Unknown content type "${raw}". Use: ${CONTENT_TYPES.map((t) => t.id).join(', ')}.`);
  return hit;
}

function rankKey(raw: string): RankBy {
  const k = normKey(raw);
  if (k === 'score' || k === 'total' || k === 'totalscore') return 'score';
  const step = EMOJI_KEYS.map(stepFor).find((s) => normKey(s.key) === k || normKey(s.label) === k || s.emoji === raw.trim());
  if (!step) throw new Error(`Unknown rank "${raw}". Use "score" or one of: ${EMOJI_KEYS.join(', ')}.`);
  return step.key;
}

function itemJson(s: ItemStat, rank?: number) {
  const avg = avgStep(s.split.avgScore);
  return {
    ...(rank ? { rank } : {}),
    title: s.item.title,
    type: typeLabel(s.item.type),
    partOf: s.item.parentTitle || undefined,
    category: s.item.category || undefined,
    publishedAt: s.item.publishedAt,
    reactions: s.split.reactions,
    score: s.split.score,
    avgScore: round1(s.split.avgScore),
    averagesAs: `${avg.emoji} ${avg.label}`,
    forPct: s.split.forPct,
    againstPct: s.split.againstPct,
    counts: Object.fromEntries(EMOJI_KEYS.map((k, i) => [k, s.split.counts[i] ?? 0])),
  };
}

const typeArg = z.enum(['story', 'blog', 'blogPart', 'bulletin']);
const readArgs = z.object({
  top: z.number().int().min(1).max(50).optional(),
  type: typeArg.optional(),
});
const setArgs = z.object({
  range: z.enum(['7', '30', '90', 'all']).optional(),
  types: z.array(z.string()).optional(),
  audience: z.enum(['readers', 'everyone']).optional(),
  rankBy: z.string().optional(),
  top: z.number().int().min(1).max(50).optional(),
});

export function useReactionsOperatorActions(input: ReactionsOperatorInput): void {
  const live = useLive(input);
  const enabled = can('emoji-analytics.view');

  /** Wait until the report on screen is the one for the current controls. */
  async function settle(ui: UiDriver) {
    const ok = await waitUntil(
      () => live.current.state === 'error' || (live.current.state === 'ready' && live.current.loadedKey === live.current.currentKey),
      { timeoutMs: 25_000, signal: ui.signal },
    );
    if (!ok) throw new Error('The reactions report is taking too long to load.');
    if (live.current.state === 'error') throw new Error('The reactions report did not load (the screen says so too).');
  }

  function read(top = 10, type?: ContentType) {
    const s = live.current;
    const d = s.dashboard;
    const range = DATE_RANGES.find((r) => r.id === s.rangeId);
    const avg = avgStep(d.overall.avgScore);
    const pool = type ? d.items.filter((i) => i.item.type === type) : d.items;
    const mostReactions = [...pool]
      .sort((a, b) => b.split.reactions - a.split.reactions || b.split.score - a.split.score)
      .slice(0, top)
      .map((x, i) => itemJson(x, i + 1));
    const highestScore = [...pool]
      .sort((a, b) => b.split.score - a.split.score)
      .slice(0, top)
      .map((x, i) => itemJson(x, i + 1));
    return {
      range: { id: s.rangeId, label: range?.label, from: s.from, to: s.to, basis: 'reactions made inside this window' },
      contentTypes: s.types.length ? s.types.map(typeLabel) : 'Everything',
      whoCounts: s.audience === 'readers' ? 'Readers (staff reactions excluded)' : 'Everyone (staff included)',
      staffReactionsExcluded: s.audience === 'readers' ? d.staffExcluded : 0,
      totals: {
        reactions: d.reactions,
        readers: d.reactors,
        totalScore: d.overall.score,
        avgScore: round1(d.overall.avgScore),
        averagesAs: d.reactions ? `${avg.emoji} ${avg.label}` : null,
        mood: d.moodVerdict,
        forPct: d.overall.forPct,
        middlePct: d.overall.middlePct,
        againstPct: d.overall.againstPct,
        reactedItems: d.coverage.reacted,
        publishedItems: d.coverage.published,
      },
      emoji: d.emojiRows.map((r, i) => ({
        key: r.key,
        emoji: r.emoji,
        label: r.label,
        weight: r.weight,
        count: r.count,
        pct: r.pct,
        scoreContribution: d.overall.contributions[i] ?? 0,
      })),
      topEmoji: d.reactions ? { key: d.topEmoji.key, emoji: d.topEmoji.emoji, label: d.topEmoji.label, count: d.topEmoji.count } : null,
      leaderboardOnScreen: {
        rankedBy: s.rank === 'score' ? 'score' : `${stepFor(s.rank).emoji} ${stepFor(s.rank).label}`,
        minReactions: s.minReactions,
        rows: s.leaders.map((x, i) => itemJson(x, i + 1)),
      },
      ...(type ? { filteredTo: typeLabel(type) } : {}),
      mostReactions,
      highestScore,
      byType: d.byType.map((t) => ({
        type: t.label,
        published: t.published,
        reactions: t.split.reactions,
        score: t.split.score,
        avgScore: round1(t.split.avgScore),
        forPct: t.split.forPct,
        againstPct: t.split.againstPct,
      })),
      truncatedItems: d.truncated || undefined,
      note:
        'Reactions only — there is no view, dwell-time or referrer tracking. mostReactions/highestScore rank EVERY reacted item in the window (no minimum); the on-screen leaderboard only ranks items with ' +
        `${s.minReactions}+ reactions. Shortest window is the last 7 days.`,
    };
  }

  useAgentAction(
    {
      name: 'analytics.readReactions',
      description:
        'Read Emoji Analytics as shown: range, totals, every emoji count, on-screen leaderboard, most-reacted and highest-scoring items, per-type figures.',
      args: readArgs,
      run: async (a, ui) => {
        await settle(ui);
        return read(a.top, a.type);
      },
    },
    enabled,
  );

  useAgentAction(
    {
      name: 'analytics.setReactionFilters',
      description: 'Set the Emoji Analytics date range / content types / who counts / rank-by visibly, then read the result.',
      args: setArgs,
      run: async (a, ui) => {
        // Resolve everything before touching the screen, so a typo changes nothing.
        const wantTypes = a.types ? [...new Set(a.types.map(contentType))] : undefined;
        const wantRank = a.rankBy !== undefined ? rankKey(a.rankBy) : undefined;

        if (a.range && live.current.rangeId !== a.range) {
          await ui.click(reactionsAnchor.range(a.range), DATE_RANGES.find((r) => r.id === a.range)?.label);
          await waitUntil(() => live.current.rangeId === a.range, { timeoutMs: 2_000, signal: ui.signal });
        }
        if (wantTypes) {
          const cur = () => live.current.types;
          if (wantTypes.length === 0) {
            if (cur().length) await ui.click(reactionsAnchor.type('all'), 'Everything');
          } else {
            for (const t of CONTENT_TYPES.map((m) => m.id)) {
              const want = wantTypes.includes(t);
              if (cur().includes(t) === want) continue;
              const n = cur().length;
              await ui.click(reactionsAnchor.type(t), typeLabel(t));
              await waitUntil(() => cur().length !== n, { timeoutMs: 2_000, signal: ui.signal });
            }
          }
          const same = (x: ContentType[], y: ContentType[]) => x.length === y.length && x.every((v) => y.includes(v));
          await waitUntil(() => same(cur(), wantTypes), { timeoutMs: 2_000, signal: ui.signal });
          if (!same(cur(), wantTypes)) throw new Error('The content-type chips did not end up as asked.');
        }
        if (a.audience && live.current.audience !== a.audience) {
          await ui.click(reactionsAnchor.audience(a.audience), a.audience === 'readers' ? 'Readers' : 'Everyone');
          await waitUntil(() => live.current.audience === a.audience, { timeoutMs: 2_000, signal: ui.signal });
        }
        if (wantRank && live.current.rank !== wantRank) {
          await ui.click(reactionsAnchor.rank(wantRank), wantRank === 'score' ? 'Rank by score' : `Rank by ${stepFor(wantRank).label}`);
          await waitUntil(() => live.current.rank === wantRank, { timeoutMs: 2_000, signal: ui.signal });
        }
        await settle(ui);
        return read(a.top);
      },
    },
    enabled,
  );
}
