/**
 * Emoji analytics — the sample dataset and everything derived from it.
 *
 * ── SAMPLE DATA, NOT LIVE ──
 *
 * There is no `reactions` collection, no endpoint, and no reaction bar wired to
 * storage. This module invents a plausible one so the page can be designed, and
 * the page says so on its face. See docs/EMOJI-ANALYTICS-PLAN.md.
 *
 * TWO RULES SHAPE THIS FILE, both about the day the real endpoint lands:
 *
 * 1. THE SAMPLE IS REACTION-LEVEL, NOT ITEM-LEVEL — one row per reaction, the
 *    shape `reactions` will store. Seven counts per item could never answer a
 *    question about who reacted, or when.
 *
 * 2. `deriveDashboard()` IS THE API CONTRACT. It aggregates a flat reaction list
 *    the way the Mongo pipeline will and returns what the endpoint should
 *    return. Swapping sample for real is a source change; no component moves.
 *
 * The generator is DETERMINISTIC (a seeded PRNG, never Math.random) so the page
 * does not reshuffle itself between renders.
 *
 * SCOPE: stories, blogs and bulletins. Podcasts and magazine issues are out —
 * they are not where reactions are being collected first.
 *
 * NOT MODELLED, because the platform does not collect it: views, dwell time,
 * referrers, geography, devices, and comments. There is no comments collection
 * anywhere in Stable Press.
 */

import { EMOJI_SCALE, STEP_FILL, weightOf } from '@/types/reactions';
import type { EmojiKey, EmojiStep, Side } from '@/types/reactions';

export { EMOJI_SCALE, STEP_FILL, weightOf };
export type { EmojiKey, EmojiStep, Side };

/** Ascending weight, −5 → +5. The order everything iterates in. */
export const EMOJI_KEYS: EmojiKey[] = [
  'reallyHate', 'hate', 'dislike', 'undecided', 'sortOf', 'like', 'love',
];

/** Position of each step in `EMOJI_KEYS`, for counting without a linear scan. */
const INDEX_BY_KEY = new Map(EMOJI_KEYS.map((k, i) => [k, i]));

/** The weight of each step, in `EMOJI_KEYS` order. */
const WEIGHTS: number[] = EMOJI_KEYS.map(weightOf);

const STEP_BY_KEY = new Map(EMOJI_SCALE.map((s) => [s.key, s]));
export function stepFor(key: EmojiKey): EmojiStep {
  return STEP_BY_KEY.get(key)!;
}

// ── Colour ──────────────────────────────────────────────────────────────────
//
// A DIVERGING scale: two opposed hues either side of a neutral midpoint, which
// is what polarity data takes. Green is the brand's own; the opposing arm is an
// orange-vermilion rather than the theme's --destructive red, because dark green
// and dark red COLLAPSE under protanopia.
//
// MEASURED, not asserted (dataviz validator, against the real card #fefcf6):
//   • the for-arm  #2f7a58 → #22603f → #174a32 passes every ordinal check
//     (monotone lightness, ΔL ≥ 0.06, single hue within 4°)
//   • the against-arm #e37945 → #cd5c2f → #b84619 likewise (hue spread 6°)
//   • the seven step fills are only ever used as a RAMP (the emoji rows, the
//     diverging bar), never as categorical slots, so adjacent-pair separation
//     is the ordinal check above rather than an all-pairs one.
//   • `split` sits at 2.13:1 and `cool` at 2.89:1 against the card — under 3:1,
//     so every value on this page is directly labelled rather than left to hue.
//
// This is the page's ONLY colour language. Content type and category are carried
// by position and label, never by a second palette.
//
// Light mode only: the app's dark mode is unwired config, and a diverging ramp
// must be RE-STEPPED for a dark surface, never flipped.

/**
 * The average reaction, as a STEP ON THE SCALE rather than a decimal.
 *
 * The weights are whole numbers — 5, 3, 1, 0, −1, −3, −5 — so an average of
 * "+2.8" is a number that exists nowhere in the reader's world and asks the
 * staff reader to do arithmetic to interpret. Rounding it to the nearest step
 * says the same thing in the page's own vocabulary: this piece averages 😊.
 *
 * This replaced a five-band classification (Loved / Warm / Split / Cool /
 * Rejected) with its own thresholds. The bands were a second scale invented on
 * top of the one that already exists, and the emoji is both finer and needs no
 * legend.
 */
export function avgStep(avgScore: number): EmojiStep {
  let best = EMOJI_SCALE[0]!;
  let bestGap = Infinity;
  for (const step of EMOJI_SCALE) {
    const gap = Math.abs(step.weight - avgScore);
    if (gap < bestGap) { bestGap = gap; best = step; }
  }
  return best;
}

/** The three sides, for the for/middle/against bar — the arms' mid steps. */
export const SIDE_FILL: Record<Side, string> = {
  for: '#2f7a58',
  middle: '#b2afa9',
  against: '#b84619',
};

/** The unfilled part of any bar: a light step of the page's own cream. */
export const TRACK_FILL = '#eae1cd';

// ── Content types ───────────────────────────────────────────────────────────

/**
 * The four things a reader can react to, as this platform actually models them.
 *
 * Two of these were wrong in an earlier draft and are worth writing down:
 *
 * BULLETINS ARE MAGAZINES. `/bulletins` is the newsstand, and its own file says
 * "This page is MAGAZINES, and only magazines" — a published issue is a frozen
 * snapshot of magazine pages in the `issues` collection, and both builders (v1
 * `magazines`, v2 `magazinesV2`) freeze into it. A bulletin is NOT an article
 * wearing a `bulletin` channel; that axis is gone, and the server now silently
 * drops a `channels` key on write.
 *
 * BLOG PARTS ARE THEIR OWN TARGET. `BlogPart` — a "sub-blog" — is a titled
 * section of a post with a STABLE id, and the published page already renders a
 * reaction scale for each part as well as one for the post overall. So a post
 * and its parts are separate reaction targets, and the part id is what a stored
 * reaction is keyed to. Counting only whole posts would throw away the finer of
 * the two signals the reader page already asks for.
 */
export type ContentType = 'story' | 'blog' | 'blogPart' | 'bulletin';

export interface ContentTypeMeta {
  id: ContentType;
  label: string;
  /** Plural noun for the "N published" line. */
  unit: string;
  href: string;
}

export const CONTENT_TYPES: ContentTypeMeta[] = [
  { id: 'story', label: 'Stories', unit: 'stories', href: '/production-system/all-stories' },
  { id: 'blog', label: 'Blogs', unit: 'posts', href: '/production-system/blogs' },
  { id: 'blogPart', label: 'Blog parts', unit: 'parts', href: '/production-system/blogs' },
  { id: 'bulletin', label: 'Bulletins', unit: 'issues', href: '/production-system/magazine-v2' },
];

const TYPE_LABEL = new Map(CONTENT_TYPES.map((t) => [t.id, t.label]));
export function typeLabel(id: ContentType): string {
  return TYPE_LABEL.get(id) ?? id;
}

// ── The published catalogue ─────────────────────────────────────────────────

export interface Item {
  id: string;
  title: string;
  type: ContentType;
  /** Display label, not a key — this page does no category maths. */
  category?: string;
  /** For a blog part: the post it belongs to. A part is never read alone. */
  parentTitle?: string;
  publishedAt: string;
  /**
   * The seven-step shape this piece pulls, ascending weight. A relative weight,
   * not a count — the generator samples from it.
   */
  mood: [number, number, number, number, number, number, number];
  /** Roughly how many reactions it earns. */
  pull: number;
}

/** Moods, written as shapes rather than numbers pulled from the air. */
const ADORED: Item['mood'] = [0, 1, 2, 5, 18, 30, 30];
const RESPECTED: Item['mood'] = [1, 2, 5, 10, 24, 26, 14];
const SOLID: Item['mood'] = [2, 4, 9, 12, 22, 22, 12];
const DIVISIVE: Item['mood'] = [22, 14, 8, 6, 8, 14, 24];
const COOL: Item['mood'] = [10, 18, 26, 14, 12, 8, 4];
const REJECTED: Item['mood'] = [26, 24, 20, 10, 8, 6, 3];
const QUIET: Item['mood'] = [4, 7, 13, 38, 20, 12, 6];

export const ITEMS: Item[] = [
  // ── Blogs ──
  { id: 'b1', title: 'Inside the Karaka barn that never sleeps', type: 'blog', category: 'Trainer Profiles', publishedAt: '2026-07-28', mood: ADORED, pull: 402 },
  { id: 'b2', title: 'The clock does not lie: reading Te Rapa sectionals', type: 'blog', category: 'Form Guide', publishedAt: '2026-07-24', mood: SOLID, pull: 305 },
  { id: 'b3', title: 'What a $1.2m yearling tells you about the shed', type: 'blog', category: 'Bloodstock', publishedAt: '2026-07-21', mood: ADORED, pull: 354 },
  { id: 'b4', title: 'Riding heavy: five jockeys on the winter grind', type: 'blog', category: 'Jockey Desk', publishedAt: '2026-07-17', mood: COOL, pull: 324 },
  { id: 'b5', title: 'The syndicate that bought a horse for the story', type: 'blog', category: 'Owner Stories', publishedAt: '2026-07-14', mood: RESPECTED, pull: 268 },
  { id: 'b6', title: "Ellerslie's new drainage, one year on", type: 'blog', category: 'Track Notes', publishedAt: '2026-07-09', mood: QUIET, pull: 195 },
  { id: 'b7', title: 'Nobody wants to talk about the whip rule', type: 'blog', category: 'Industry News', publishedAt: '2026-07-03', mood: DIVISIVE, pull: 612 },
  { id: 'b8', title: 'A morning with the Awapuni track crew', type: 'blog', category: 'Morning Edition', publishedAt: '2026-06-27', mood: RESPECTED, pull: 221 },

  // ── Stories ──
  { id: 's1', title: 'Group One at Trentham: the run home in full', type: 'story', category: 'Race Reports', publishedAt: '2026-07-27', mood: ADORED, pull: 448 },
  { id: 's2', title: 'Stewards fine trainer over late scratching', type: 'story', category: 'Industry News', publishedAt: '2026-07-23', mood: REJECTED, pull: 386 },
  { id: 's3', title: 'Saturday form: the five that matter', type: 'story', category: 'Form Guide', publishedAt: '2026-07-19', mood: SOLID, pull: 331 },
  { id: 's4', title: 'Waikato sale tops $18m as buyers return', type: 'story', category: 'Bloodstock', publishedAt: '2026-07-16', mood: ADORED, pull: 362 },
  { id: 's5', title: 'Rider suspended after Hastings incident', type: 'story', category: 'Jockey Desk', publishedAt: '2026-07-12', mood: DIVISIVE, pull: 401 },
  { id: 's6', title: 'Track rated heavy 11 at Riccarton', type: 'story', category: 'Track Notes', publishedAt: '2026-07-08', mood: QUIET, pull: 176 },
  { id: 's7', title: 'Riccarton: a length and a half, and a protest', type: 'story', category: 'Race Reports', publishedAt: '2026-06-24', mood: COOL, pull: 296 },
  { id: 's8', title: 'Prize money lifted for provincial meetings', type: 'story', category: 'Industry News', publishedAt: '2026-06-12', mood: RESPECTED, pull: 268 },

  // ── Blog parts (sub-blogs) ──
  // Each is a titled section of the post above it, carrying its own reaction
  // scale on the published page. A part can outscore its own post — that is the
  // whole reason the reader page asks twice.
  { id: 'b7p1', title: 'What the rule actually says', type: 'blogPart', parentTitle: 'Nobody wants to talk about the whip rule', publishedAt: '2026-07-03', mood: RESPECTED, pull: 188 },
  { id: 'b7p2', title: 'The riders’ case', type: 'blogPart', parentTitle: 'Nobody wants to talk about the whip rule', publishedAt: '2026-07-03', mood: DIVISIVE, pull: 214 },
  { id: 'b7p3', title: 'Where I think this lands', type: 'blogPart', parentTitle: 'Nobody wants to talk about the whip rule', publishedAt: '2026-07-03', mood: REJECTED, pull: 171 },
  { id: 'b1p1', title: 'Four in the morning', type: 'blogPart', parentTitle: 'Inside the Karaka barn that never sleeps', publishedAt: '2026-07-28', mood: ADORED, pull: 164 },
  { id: 'b1p2', title: 'The staffing problem nobody solves', type: 'blogPart', parentTitle: 'Inside the Karaka barn that never sleeps', publishedAt: '2026-07-28', mood: SOLID, pull: 121 },
  { id: 'b3p1', title: 'Reading the catalogue page', type: 'blogPart', parentTitle: 'What a $1.2m yearling tells you about the shed', publishedAt: '2026-07-21', mood: ADORED, pull: 143 },
  { id: 'b3p2', title: 'What the buyers were really bidding on', type: 'blogPart', parentTitle: 'What a $1.2m yearling tells you about the shed', publishedAt: '2026-07-21', mood: RESPECTED, pull: 118 },
  { id: 'b4p1', title: 'Making weight in July', type: 'blogPart', parentTitle: 'Riding heavy: five jockeys on the winter grind', publishedAt: '2026-07-17', mood: COOL, pull: 136 },

  // ── Bulletins — published magazine issues (v1 and v2 both freeze into these) ──
  { id: 'i1', title: 'Stable Press Quarterly — Spring 2026', type: 'bulletin', publishedAt: '2026-07-26', mood: ADORED, pull: 229 },
  { id: 'i2', title: 'Karaka Sales Special — 2026', type: 'bulletin', publishedAt: '2026-07-12', mood: RESPECTED, pull: 188 },
  { id: 'i3', title: 'Stable Press Quarterly — Winter 2026', type: 'bulletin', publishedAt: '2026-06-28', mood: SOLID, pull: 142 },

  // Published in the last few days. These exist so the page has to cope with
  // what it meets on day one: pieces with too few reactions to say anything
  // about. Counted, shown, and kept out of every ranking by the floor.
  { id: 's9', title: 'Ruakākā twilight meeting moved to Sunday', type: 'story', category: 'Morning Edition', publishedAt: '2026-08-02', mood: SOLID, pull: 21 },
  { id: 'b9', title: 'Why we are changing how we cover stewards', type: 'blog', category: 'Industry News', publishedAt: '2026-08-01', mood: DIVISIVE, pull: 34 },
  { id: 'i4', title: 'Spring Carnival Preview — 2026', type: 'bulletin', publishedAt: '2026-08-03', mood: SOLID, pull: 0 },
];

// ── The generator ───────────────────────────────────────────────────────────

/** mulberry32 — small, fast, deterministic. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick an index from a weight vector. */
function pick(weights: number[], r: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const target = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (target < acc) return i;
  }
  return weights.length - 1;
}

/**
 * One reaction — the shape `reactions` will store.
 *
 * `readerId` is what makes "one reaction per reader per item" enforceable, and
 * what lets the page report readers separately from reactions. In the real
 * store it is a user id or a signed device cookie, backed by a unique index.
 */
export interface Reaction {
  itemId: string;
  readerId: string;
  emoji: EmojiKey;
  /** ISO date. Reactions arrive AFTER publication, on a decaying tail. */
  reactedAt: string;
}

const READER_POOL = 2400;
const DAY = 86_400_000;
const TODAY = Date.parse('2026-08-04');

/** Most reactions land in the first two days, with a long thin tail after. */
function arrivalOffsetDays(r: number): number {
  return Math.round(-Math.log(1 - r * 0.985) * 3.2);
}

function buildReactions(): Reaction[] {
  const out: Reaction[] = [];

  for (const item of ITEMS) {
    const r = rng(hash(item.id));
    const publishedMs = Date.parse(item.publishedAt);
    // One reaction per reader per item — the unique index, honoured here.
    const used = new Set<number>();

    for (let i = 0; i < item.pull; i++) {
      let idx = Math.floor(r() * READER_POOL);
      let guard = 0;
      while (used.has(idx) && guard++ < 8) idx = Math.floor(r() * READER_POOL);
      if (used.has(idx)) continue;
      used.add(idx);

      const stepIndex = pick(item.mood, r());
      const at = publishedMs + arrivalOffsetDays(r()) * DAY;
      if (at > TODAY) continue; // nothing arrives from the future

      out.push({
        itemId: item.id,
        readerId: `r${idx}`,
        emoji: EMOJI_KEYS[stepIndex]!,
        reactedAt: new Date(at).toISOString().slice(0, 10),
      });
    }
  }

  return out;
}

export const REACTIONS: Reaction[] = buildReactions();

// ── Aggregation ─────────────────────────────────────────────────────────────

export interface Split {
  reactions: number;
  /** Rounded percentages that sum to exactly 100 (or all 0 when empty). */
  forPct: number;
  middlePct: number;
  againstPct: number;
  /**
   * Σ (count × weight). What a piece earned in total — the headline number.
   *
   * It scales with how many people showed up, which is the point AND the catch:
   * the biggest thing usually wins. Read it next to `avgScore`, never alone.
   */
  score: number;
  /**
   * score ÷ reactions, −5 … +5. How well it was received, independent of reach.
   *
   * This replaced a `net` of "% for minus % against". Keeping both would have
   * put two disagreeing direction numbers on one page — against this dataset
   * the two orderings move 19 of 27 items.
   */
  avgScore: number;
  /** Per-emoji counts, ascending weight. */
  counts: number[];
  /** Per-emoji contribution to the score (count × weight), ascending weight. */
  contributions: number[];
}

const SIDE_OF: Side[] = EMOJI_KEYS.map((k) => stepFor(k).side);

/**
 * Percentages that add up. Rounding each share independently gives 33/33/33 or
 * 50/50/1 and the bar then draws 101%. Largest remainder gets the slack.
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

const EMPTY_SPLIT: Split = {
  reactions: 0, forPct: 0, middlePct: 0, againstPct: 0, score: 0, avgScore: 0,
  counts: [0, 0, 0, 0, 0, 0, 0],
  contributions: [0, 0, 0, 0, 0, 0, 0],
};

export function splitOf(rs: Reaction[]): Split {
  if (rs.length === 0) return EMPTY_SPLIT;

  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rs) counts[INDEX_BY_KEY.get(r.emoji)!]! += 1;

  let forCount = 0;
  let middleCount = 0;
  let againstCount = 0;
  let score = 0;
  const contributions = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 7; i++) {
    // The weight is applied HERE, at read time, from the shared scale — never
    // copied onto a stored reaction. Re-weighting the scale then re-scores
    // history correctly instead of needing a backfill.
    contributions[i] = counts[i]! * WEIGHTS[i]!;
    score += contributions[i]!;
    if (SIDE_OF[i] === 'for') forCount += counts[i]!;
    else if (SIDE_OF[i] === 'middle') middleCount += counts[i]!;
    else againstCount += counts[i]!;
  }
  const [forPct, middlePct, againstPct] = pcts([forCount, middleCount, againstCount], rs.length);

  return {
    reactions: rs.length,
    forPct: forPct!, middlePct: middlePct!, againstPct: againstPct!,
    score,
    avgScore: score / rs.length,
    counts,
    contributions,
  };
}

// ── The dashboard ───────────────────────────────────────────────────────────

export interface Filters {
  /** ISO dates, inclusive. */
  from: string;
  to: string;
  /** Empty = every type. */
  types: ContentType[];
}

export const DATE_RANGES = [
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: 3650 },
] as const;
export type DateRangeId = (typeof DATE_RANGES)[number]['id'];

export function rangeFor(id: DateRangeId): { from: string; to: string } {
  const days = DATE_RANGES.find((r) => r.id === id)!.days;
  return {
    from: new Date(TODAY - days * DAY).toISOString().slice(0, 10),
    to: new Date(TODAY).toISOString().slice(0, 10),
  };
}

export interface ItemStat {
  item: Item;
  split: Split;
}

export interface TypeStat extends ContentTypeMeta {
  published: number;
  split: Split;
}

export interface EmojiRow extends EmojiStep {
  count: number;
  pct: number;
  fill: string;
}

/** What the endpoint returns. Three analytics, so three things plus the totals. */
export interface Dashboard {
  overall: Split;
  reactions: number;
  reactors: number;
  coverage: { reacted: number; published: number };
  emojiRows: EmojiRow[];
  topEmoji: EmojiRow;
  items: ItemStat[];
  byType: TypeStat[];
  moodVerdict: string;
}

/** The mood in words, from the average score. */
function moodVerdict(overall: Split): string {
  if (overall.reactions === 0) return 'No reactions yet';
  const a = overall.avgScore;
  if (a >= 3) return 'Readers are with you';
  if (a >= 1.5) return 'Readers are warm';
  if (a > 0.3) return 'Leaning your way';
  if (a >= -0.3) return 'Opinion is split';
  if (a > -1.5) return 'Leaning against you';
  return 'Readers are cold on this';
}

export function deriveDashboard(
  filters: Filters,
  allReactions: Reaction[] = REACTIONS,
  allItems: Item[] = ITEMS,
): Dashboard {
  const typeSet = new Set(filters.types);
  const itemsInScope = allItems.filter(
    (i) => (typeSet.size === 0 || typeSet.has(i.type)) && i.publishedAt <= filters.to,
  );
  const scopeIds = new Set(itemsInScope.map((i) => i.id));

  const rs = allReactions.filter(
    (r) => scopeIds.has(r.itemId) && r.reactedAt >= filters.from && r.reactedAt <= filters.to,
  );

  const overall = splitOf(rs);

  const byItemId = new Map<string, Reaction[]>();
  for (const r of rs) {
    const list = byItemId.get(r.itemId);
    if (list) list.push(r);
    else byItemId.set(r.itemId, [r]);
  }

  const items: ItemStat[] = itemsInScope
    .map((item) => {
      const split = splitOf(byItemId.get(item.id) ?? []);
      return { item, split };
    })
    .filter((s) => s.split.reactions > 0);

  const shares = pcts(overall.counts, overall.reactions);
  const emojiRows: EmojiRow[] = EMOJI_SCALE.map((step) => {
    const i = EMOJI_KEYS.indexOf(step.key);
    return { ...step, count: overall.counts[i]!, pct: shares[i]!, fill: STEP_FILL[step.key] };
  });

  const byType: TypeStat[] = CONTENT_TYPES.map((meta) => {
    const own = itemsInScope.filter((i) => i.type === meta.id);
    const ownIds = new Set(own.map((i) => i.id));
    const split = splitOf(rs.filter((r) => ownIds.has(r.itemId)));
    return { ...meta, published: own.length, split };
  });

  // Coverage counts everything published up to `to`, NOT only what was published
  // inside the window: a June post can still be earning reactions in August, and
  // excluding it would flatter the number.
  return {
    overall,
    reactions: rs.length,
    reactors: new Set(rs.map((r) => r.readerId)).size,
    coverage: { reacted: items.length, published: itemsInScope.length },
    emojiRows,
    topEmoji: [...emojiRows].sort((a, b) => b.count - a.count)[0]!,
    items,
    byType,
    moodVerdict: moodVerdict(overall),
  };
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** Signed points, the way a margin is written: +34, −12, 0. */
export function signed(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** A score: signed and grouped — +1,193 · −653 · 0. */
export function scoreText(n: number): string {
  if (n === 0) return '0';
  const s = Math.abs(Math.round(n)).toLocaleString('en-NZ');
  return n > 0 ? `+${s}` : `−${s}`;
}


/** 1,284 / 12.9K — compact above 10k, grouped below. */
export function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('en-NZ');
}

/** 28 Jul — dates here are always short and always present. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}
