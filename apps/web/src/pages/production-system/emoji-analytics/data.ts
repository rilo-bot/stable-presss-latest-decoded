/**
 * Emoji analytics — the sample dataset and everything derived from it.
 *
 * SAMPLE DATA, NOT LIVE. There is no reaction system in Stable Press yet: no
 * `reactions` collection, no endpoint, nothing on the public site that records a
 * reader's emoji. This screen is the design for the one we intend to build, so
 * the numbers below are invented — the page says so, in the header badge and
 * again under every panel that would need located data.
 *
 * ONE SOURCE OF TRUTH. Every figure on the screen (totals, percentages, the
 * category cut, the content-type cut, the leaderboard, the audience segments)
 * is DERIVED from `ITEMS` — a list of published pieces, each carrying one count
 * per emoji. Hand-writing the summary numbers instead is how a mock ends up
 * claiming 4 reactions in one tile and 50% of them in another: the panels
 * disagree and the design can't be trusted. Here, changing one item's counts
 * moves every panel that depends on it, consistently.
 *
 * When the real endpoint lands, `deriveDashboard()` is the shape it should
 * return; only `ITEMS` gets replaced.
 */

// ── The emoji scale ─────────────────────────────────────────────────────────
//
// Now defined in `@/types/reactions` — this screen is no longer its only
// consumer, since the public blog post carries a reaction bar that has to use the
// same seven steps. Re-exported here so everything that already imports the scale
// from this module keeps working.
//
// Counts in `ITEMS` are tuples in ASCENDING weight, i.e. the same order as
// EMOJI_SCALE. See `EMOJI_TUPLE_ORDER`.

import { EMOJI_SCALE, STEP_FILL } from '@/types/reactions';
import type { EmojiKey, EmojiStep, Side } from '@/types/reactions';

export { EMOJI_SCALE, STEP_FILL };
export type { EmojiKey, EmojiStep, Side };

/** Tuple order for `ReactionCounts` — ascending weight, −3 → +3. */
export const EMOJI_TUPLE_ORDER: EmojiKey[] = [
  'reallyHate', 'hate', 'dislike', 'undecided', 'sortOf', 'like', 'love',
];

/** One count per emoji, in `EMOJI_TUPLE_ORDER`. */
export type ReactionCounts = [number, number, number, number, number, number, number];

// ── The colour scale ────────────────────────────────────────────────────────
//
// A DIVERGING scale: two opposed hues either side of a neutral midpoint, which
// is what polarity data takes (magnitude would take one hue, identity would take
// the categorical slots). Green is the brand's own; the opposing arm is an
// orange-vermilion rather than the theme's --destructive red, because dark green
// and dark red COLLAPSE under protanopia — as two tiles side by side in the same
// grid they measure ΔE 5.1 (OKLab ×100), i.e. the two poles of the scale become
// the same colour for a protan reader.
//
// The steps below were searched against the Machado–Oliveira–Fernandes (2009)
// simulation at full severity until all ten pairs clear ΔE 9.2 under BOTH
// protanopia and deuteranopia (target is 8), the worst pair clears 15.3 under
// normal vision, each arm passes the ordinal-ramp checks on its own (monotone
// lightness, ΔL ≥ 0.06, light end ≥ 2:1 on cream), and every fill has an ink
// that clears 4.5:1 on it for labels set inside the mark.
//
// Two fills sit below 3:1 against the cream card — `split` at 2.06:1 and `cool`
// at 2.79:1 — which is allowed only where the value is legible another way:
// every mark on this screen carries its band name and its signed number, and the
// ranking list is the full table view of the grid. Don't reuse these two
// anywhere that relief isn't present.
//
// Local hex constants rather than CSS tokens on purpose: theme.css is written by
// the design pipeline (its own header says so), and this scale is one screen's
// vocabulary, not a fourth brand colour. Light mode only — the app's dark mode
// is unwired config today, and a diverging ramp must be re-stepped for a dark
// surface, never flipped.

export interface Band {
  id: 'loved' | 'warm' | 'split' | 'cool' | 'rejected';
  /** Plain-words label. Always rendered next to the fill — never colour alone. */
  label: string;
  /** What it means, for the legend. */
  hint: string;
  fill: string;
  /** Ink that clears 4.5:1 on `fill`, for a label set inside the mark. */
  ink: string;
}

export const BANDS: Band[] = [
  { id: 'loved', label: 'Loved', hint: 'net +50 or better', fill: '#174a32', ink: '#ffffff' },
  { id: 'warm', label: 'Warm', hint: 'net +20 to +49', fill: '#2f7a58', ink: '#ffffff' },
  { id: 'split', label: 'Split', hint: 'net −19 to +19', fill: '#b2afa9', ink: '#101a15' },
  { id: 'cool', label: 'Cool', hint: 'net −20 to −49', fill: '#e37945', ink: '#2c1206' },
  { id: 'rejected', label: 'Rejected', hint: 'net −50 or worse', fill: '#b84619', ink: '#ffffff' },
];

const BAND_BY_ID = new Map(BANDS.map((b) => [b.id, b]));

/**
 * Which band a net score falls in.
 *
 * The thresholds are wide on purpose. People who bother to react to a racing
 * story mostly liked it, so nets cluster high: a +25 cut put seven of nine
 * categories in the same band and the grid read as one flat green field, which
 * is the failure mode of any classed scale — bands that don't separate the data
 * aren't telling you anything.
 */
export function bandFor(net: number): Band {
  const id = net >= 50 ? 'loved' : net >= 20 ? 'warm' : net >= -19 ? 'split' : net >= -49 ? 'cool' : 'rejected';
  return BAND_BY_ID.get(id)!;
}

/**
 * Fill for one step of the scale — the seven emoji rows.
 *
 * Three steps per arm plus the neutral midpoint. Within an arm the steps are a
 * single hue at monotone lightness, so "stronger" reads as "darker" without
 * needing the label — but the label is there anyway.
 */
/**
 * The three sides, for the for/middle/against meters. The poles of the scale
 * would be too loud across a full-width bar, so these are the arms' mid steps.
 */
export const SIDE_FILL: Record<Side, string> = {
  for: '#2f7a58',
  middle: '#b2afa9',
  against: '#b84619',
};

/** The unfilled part of any bar: a light step of the page's own cream. */
export const TRACK_FILL = '#eae1cd';

// ── The taxonomy ────────────────────────────────────────────────────────────

/**
 * Mirrors CATEGORIES in pages/news-index/constants.tsx (keys are the contract,
 * also enumerated server-side in lib/newsCategories.ts). Restated here rather
 * than imported so the sample dataset stays a standalone file with no app
 * dependencies — it is the one thing on this screen that gets thrown away when
 * the real endpoint lands.
 */
export interface CategoryMeta {
  key: string;
  label: string;
  section: 'news' | 'analysis' | 'interviews';
}

export const CATEGORIES: CategoryMeta[] = [
  { key: 'race-reports', label: 'Race Reports', section: 'news' },
  { key: 'industry-news', label: 'Industry News', section: 'news' },
  { key: 'morning-edition', label: 'Morning Edition', section: 'news' },
  { key: 'form-guide', label: 'Form Guide', section: 'analysis' },
  { key: 'track-notes', label: 'Track Notes', section: 'analysis' },
  { key: 'bloodstock', label: 'Bloodstock', section: 'analysis' },
  { key: 'trainer-profiles', label: 'Trainer Profiles', section: 'interviews' },
  { key: 'jockey-desk', label: 'Jockey Desk', section: 'interviews' },
  { key: 'owner-stories', label: 'Owner Stories', section: 'interviews' },
];

export const SECTION_LABELS: Record<CategoryMeta['section'], string> = {
  news: 'News',
  analysis: 'Analysis',
  interviews: 'Interviews',
};

// ── Content types ───────────────────────────────────────────────────────────

export type ContentType = 'blog' | 'article' | 'bulletin' | 'podcast' | 'magazine';

export interface ContentTypeMeta {
  id: ContentType;
  label: string;
  /** Plural noun for the "N published" line. */
  unit: string;
  /** Where the module lives, for the "open it" link. */
  href?: string;
}

/**
 * Blogs lead, because blogs are what this newsroom publishes most deliberately —
 * and because a post is the unit a reader reacts to hardest.
 */
export const CONTENT_TYPES: ContentTypeMeta[] = [
  { id: 'blog', label: 'Blogs', unit: 'posts', href: '/production-system/blogs' },
  { id: 'article', label: 'News & stories', unit: 'stories', href: '/production-system/all-stories' },
  { id: 'bulletin', label: 'Bulletins', unit: 'bulletins' },
  { id: 'podcast', label: 'Podcasts', unit: 'episodes' },
  { id: 'magazine', label: 'Magazine issues', unit: 'issues', href: '/production-system/magazine-v2' },
];

// ── The sample dataset ──────────────────────────────────────────────────────

export interface Item {
  id: string;
  title: string;
  type: ContentType;
  /** Blogs and stories carry one; bulletins, podcasts and issues don't. */
  category?: string;
  /** Counts in EMOJI_TUPLE_ORDER: 🤬 😠 😕 😐 🙂 😊 🤩 */
  r: ReactionCounts;
  comments: number;
  publishedAt: string;
}

export const ITEMS: Item[] = [
  // ── Blogs ──
  { id: 'b1', title: 'Inside the Karaka barn that never sleeps', type: 'blog', category: 'trainer-profiles', r: [3, 6, 11, 16, 42, 63, 61], comments: 34, publishedAt: '2026-07-28' },
  { id: 'b2', title: 'The clock does not lie: reading Te Rapa sectionals', type: 'blog', category: 'form-guide', r: [10, 18, 33, 25, 40, 50, 29], comments: 41, publishedAt: '2026-07-24' },
  { id: 'b3', title: 'What a $1.2m yearling tells you about the shed', type: 'blog', category: 'bloodstock', r: [5, 8, 15, 23, 51, 77, 75], comments: 57, publishedAt: '2026-07-21' },
  { id: 'b4', title: 'Riding heavy: five jockeys on the winter grind', type: 'blog', category: 'jockey-desk', r: [18, 32, 60, 29, 38, 32, 15], comments: 62, publishedAt: '2026-07-17' },
  { id: 'b5', title: 'The syndicate that bought a horse for the story', type: 'blog', category: 'owner-stories', r: [2, 5, 9, 16, 42, 63, 61], comments: 29, publishedAt: '2026-07-14' },
  { id: 'b6', title: "Ellerslie's new drainage, one year on", type: 'blog', category: 'track-notes', r: [13, 23, 44, 23, 40, 35, 17], comments: 38, publishedAt: '2026-07-09' },
  { id: 'b7', title: 'Nobody wants to talk about the whip rule', type: 'blog', category: 'industry-news', r: [63, 75, 78, 27, 23, 20, 10], comments: 184, publishedAt: '2026-07-03' },
  { id: 'b8', title: 'A morning with the Awapuni track crew', type: 'blog', category: 'morning-edition', r: [5, 10, 19, 23, 45, 55, 32], comments: 22, publishedAt: '2026-06-27' },

  // ── News & stories ──
  { id: 'a1', title: 'Group One at Trentham: the run home in full', type: 'article', category: 'race-reports', r: [10, 19, 36, 31, 64, 79, 45], comments: 46, publishedAt: '2026-07-27' },
  { id: 'a2', title: 'Stewards fine trainer over late scratching', type: 'article', category: 'industry-news', r: [49, 60, 61, 20, 15, 13, 6], comments: 97, publishedAt: '2026-07-23' },
  { id: 'a3', title: 'Saturday form: the five that matter', type: 'article', category: 'form-guide', r: [12, 21, 40, 26, 42, 51, 29], comments: 31, publishedAt: '2026-07-19' },
  { id: 'a4', title: 'Waikato sale tops $18m as buyers return', type: 'article', category: 'bloodstock', r: [5, 9, 18, 22, 48, 73, 71], comments: 25, publishedAt: '2026-07-16' },
  { id: 'a5', title: 'Rider suspended after Hastings incident', type: 'article', category: 'jockey-desk', r: [38, 46, 47, 27, 30, 26, 12], comments: 88, publishedAt: '2026-07-12' },
  { id: 'a6', title: 'Track rated heavy 11 at Riccarton', type: 'article', category: 'track-notes', r: [13, 23, 43, 26, 31, 27, 13], comments: 19, publishedAt: '2026-07-08' },
  { id: 'a7', title: 'Morning Edition: Wednesday scratchings', type: 'article', category: 'morning-edition', r: [6, 11, 20, 21, 35, 43, 25], comments: 11, publishedAt: '2026-07-01' },
  { id: 'a8', title: 'Riccarton: a length and a half, and a protest', type: 'article', category: 'race-reports', r: [14, 25, 47, 26, 46, 39, 19], comments: 53, publishedAt: '2026-06-24' },

  // ── Bulletins ──
  { id: 'u1', title: 'Weekly Bulletin — Spring Carnival preview', type: 'bulletin', r: [3, 4, 8, 15, 33, 40, 23], comments: 8, publishedAt: '2026-07-26' },
  { id: 'u2', title: 'Weekly Bulletin — Sales week wrap', type: 'bulletin', r: [2, 5, 9, 13, 25, 31, 18], comments: 5, publishedAt: '2026-07-12' },

  // ── Podcasts ──
  { id: 'p1', title: 'The Furlong Post — Ep. 14: the whip debate', type: 'podcast', r: [24, 29, 29, 24, 34, 29, 14], comments: 64, publishedAt: '2026-07-20' },
  { id: 'p2', title: 'The Furlong Post — Ep. 15: buying at Karaka', type: 'podcast', r: [3, 6, 11, 14, 27, 42, 41], comments: 27, publishedAt: '2026-07-06' },

  // ── Magazine ──
  { id: 'm1', title: 'Stable Press Quarterly — Spring 2026', type: 'magazine', r: [5, 8, 15, 21, 47, 58, 33], comments: 16, publishedAt: '2026-07-04' },
];

// ── Derivation ──────────────────────────────────────────────────────────────

export interface Split {
  reactions: number;
  forCount: number;
  middleCount: number;
  againstCount: number;
  /** Rounded percentages that sum to exactly 100 (or all 0 when there's nothing). */
  forPct: number;
  middlePct: number;
  againstPct: number;
  /** forPct − againstPct, in points. The single number that ranks anything here. */
  net: number;
}

const SIDE_OF: Side[] = EMOJI_TUPLE_ORDER.map(
  (k) => EMOJI_SCALE.find((s) => s.key === k)!.side,
);

/**
 * Percentages that add up.
 *
 * Rounding each share independently gives 33/33/33 or 50/50/1 — the panels then
 * show a 101% bar. This gives the largest remainder the rounding slack, so the
 * three always sum to 100 and the meter always fills exactly.
 */
function pcts(parts: number[], total: number): number[] {
  if (total <= 0) return parts.map(() => 0);
  const exact = parts.map((p) => (p / total) * 100);
  const floors = exact.map(Math.floor);
  let slack = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (const { i } of order) {
    if (slack <= 0) break;
    out[i] += 1;
    slack -= 1;
  }
  return out;
}

export function splitOf(counts: ReactionCounts[]): Split {
  const sum: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const c of counts) for (let i = 0; i < 7; i++) sum[i] += c[i];

  let forCount = 0;
  let middleCount = 0;
  let againstCount = 0;
  for (let i = 0; i < 7; i++) {
    if (SIDE_OF[i] === 'for') forCount += sum[i];
    else if (SIDE_OF[i] === 'middle') middleCount += sum[i];
    else againstCount += sum[i];
  }
  const reactions = forCount + middleCount + againstCount;
  const [forPct, middlePct, againstPct] = pcts([forCount, middleCount, againstCount], reactions);
  return { reactions, forCount, middleCount, againstCount, forPct, middlePct, againstPct, net: forPct - againstPct };
}

/** Per-emoji totals across a set of items. */
export function tally(items: Item[]): Record<EmojiKey, number> {
  const out = {} as Record<EmojiKey, number>;
  for (const k of EMOJI_TUPLE_ORDER) out[k] = 0;
  for (const it of items) {
    EMOJI_TUPLE_ORDER.forEach((k, i) => { out[k] += it.r[i]; });
  }
  return out;
}

export interface EmojiRow extends EmojiStep {
  count: number;
  pct: number;
  fill: string;
}

export interface CategoryStat extends CategoryMeta {
  items: Item[];
  published: number;
  split: Split;
  band: Band;
  /** Its share of all reactions — how much weight to give the net. */
  volumeShare: number;
  topItem?: Item;
}

export interface ContentTypeStat extends ContentTypeMeta {
  published: number;
  split: Split;
  band: Band;
  topItem?: Item;
}

export interface LeaderRow {
  item: Item;
  split: Split;
  band: Band;
}

export interface Segment {
  id: string;
  label: string;
  hint: string;
  keys: EmojiKey[];
  count: number;
  pct: number;
  fill: string;
}

export interface Dashboard {
  overall: Split;
  published: number;
  emojiRows: EmojiRow[];
  /** Most-used reaction across everything. */
  topEmoji: EmojiRow;
  categories: CategoryStat[];
  /** Categories with at least one published item, best net first. */
  rankedCategories: CategoryStat[];
  contentTypes: ContentTypeStat[];
  /** Blogs only, best net first — the leaderboard. */
  blogLeaders: LeaderRow[];
  segments: Segment[];
  moodVerdict: { headline: string; detail: string };
}

const SEGMENT_DEFS: Array<Omit<Segment, 'count' | 'pct'>> = [
  { id: 'loyalists', label: 'Loyalists', hint: 'Love what you publish — your base', keys: ['love'], fill: STEP_FILL.love },
  { id: 'friendly', label: 'Friendly', hint: 'Like it — winnable, not yet yours', keys: ['like', 'sortOf'], fill: STEP_FILL.sortOf },
  { id: 'undecided', label: 'Undecided', hint: 'On the fence — could go either way', keys: ['undecided'], fill: STEP_FILL.undecided },
  { id: 'sceptics', label: 'Sceptics', hint: 'Doubtful — need convincing', keys: ['dislike'], fill: STEP_FILL.dislike },
  { id: 'opponents', label: 'Opponents', hint: 'Firmly against what you ran', keys: ['hate', 'reallyHate'], fill: STEP_FILL.reallyHate },
];

/** Best net first; ties broken by volume, so a 1-reaction fluke can't lead. */
function byNet<T extends { split: Split }>(a: T, b: T): number {
  return b.split.net - a.split.net || b.split.reactions - a.split.reactions;
}

function moodVerdict(overall: Split): { headline: string; detail: string } {
  const { forPct, againstPct, net } = overall;
  const detail = `${forPct}% for · ${againstPct}% against`;
  if (net >= 40) return { headline: 'Readers are with you', detail };
  if (net >= 15) return { headline: 'Readers are warm', detail };
  if (net > 5) return { headline: 'Leaning your way', detail };
  if (net >= -5) return { headline: 'Opinion is split', detail };
  if (net > -15) return { headline: 'Leaning against you', detail };
  return { headline: 'Readers are cold on this', detail };
}

export function deriveDashboard(items: Item[] = ITEMS): Dashboard {
  const overall = splitOf(items.map((i) => i.r));
  const counts = tally(items);
  const pctByIndex = pcts(EMOJI_TUPLE_ORDER.map((k) => counts[k]), overall.reactions);
  const pctByKey = {} as Record<EmojiKey, number>;
  EMOJI_TUPLE_ORDER.forEach((k, i) => { pctByKey[k] = pctByIndex[i]; });

  const emojiRows: EmojiRow[] = EMOJI_SCALE.map((step) => ({
    ...step,
    count: counts[step.key],
    pct: pctByKey[step.key],
    fill: STEP_FILL[step.key],
  }));

  const topEmoji = [...emojiRows].sort((a, b) => b.count - a.count)[0];

  const categories: CategoryStat[] = CATEGORIES.map((meta) => {
    const own = items.filter((i) => i.category === meta.key);
    const split = splitOf(own.map((i) => i.r));
    const ranked = own
      .map((item) => ({ item, split: splitOf([item.r]) }))
      .sort(byNet);
    return {
      ...meta,
      items: own,
      published: own.length,
      split,
      band: bandFor(split.net),
      volumeShare: overall.reactions > 0 ? split.reactions / overall.reactions : 0,
      topItem: ranked[0]?.item,
    };
  });

  const contentTypes: ContentTypeStat[] = CONTENT_TYPES.map((meta) => {
    const own = items.filter((i) => i.type === meta.id);
    const split = splitOf(own.map((i) => i.r));
    const ranked = own
      .map((item) => ({ item, split: splitOf([item.r]) }))
      .sort(byNet);
    return { ...meta, published: own.length, split, band: bandFor(split.net), topItem: ranked[0]?.item };
  });

  const blogLeaders: LeaderRow[] = items
    .filter((i) => i.type === 'blog')
    .map((item) => {
      const split = splitOf([item.r]);
      return { item, split, band: bandFor(split.net) };
    })
    .sort(byNet);

  const segments: Segment[] = (() => {
    const raw = SEGMENT_DEFS.map((d) => d.keys.reduce((n, k) => n + counts[k], 0));
    const shares = pcts(raw, overall.reactions);
    return SEGMENT_DEFS.map((d, i) => ({ ...d, count: raw[i], pct: shares[i] }));
  })();

  return {
    overall,
    published: items.length,
    emojiRows,
    topEmoji,
    categories,
    rankedCategories: categories.filter((c) => c.published > 0).sort(byNet),
    contentTypes,
    blogLeaders,
    segments,
    moodVerdict: moodVerdict(overall),
  };
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** Signed points, the way a margin is written: +34, −12, 0. */
export function signed(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** 1,284 / 12.9K — compact above 10k, grouped below. */
export function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('en-NZ');
}
