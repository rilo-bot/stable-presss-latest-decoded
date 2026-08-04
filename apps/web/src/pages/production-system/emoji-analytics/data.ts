/**
 * Emoji analytics — the shape of the report, and everything derived from it.
 *
 * ── LIVE. The sample generator is gone. ──
 *
 * This file used to invent a plausible reaction dataset so the page could be
 * designed, and said so on the page's face. `GET /api/analytics/reactions` now
 * exists, so the invented catalogue, the seeded PRNG and the mood shapes have
 * been deleted rather than left behind a flag. Sample data that survives its own
 * endpoint is how a page ends up quietly lying.
 *
 * ── WHY THE SERVER SENDS COUNTS AND NOT SCORES ──
 *
 * The endpoint returns seven counts per item and no arithmetic. Scoring lives
 * here, in the browser, because scoring means WEIGHTS and the weights live in
 * exactly one file — `@/types/reactions`, shared with the public reaction bar. A
 * server-side copy would be a second scale waiting to disagree with the first,
 * which is the precise failure that module was extracted to prevent. Re-weight
 * the scale and every figure on this page re-derives correctly, with no backfill
 * and no second edit.
 *
 * The payload is therefore one row per reacted item — bounded by the published
 * catalogue — rather than one row per reaction, which would grow with traffic.
 *
 * ── WHAT THIS PAGE WILL NOT CLAIM ──
 *
 * No views, no dwell time, no referrers, no geography, no devices, no comments.
 * None of it is collected anywhere in Stable Press. Reactions are the only
 * reader signal there is, which is exactly why nothing here may imply a
 * measurement we do not take.
 */

import { EMOJI_SCALE, STEP_FILL, weightOf } from '@/types/reactions';
import type { EmojiKey, EmojiStep, Side } from '@/types/reactions';

export { EMOJI_SCALE, STEP_FILL, weightOf };
export type { EmojiKey, EmojiStep, Side };

/** Ascending weight, −5 → +5. The order everything iterates in, server included. */
export const EMOJI_KEYS: EmojiKey[] = [
  'reallyHate', 'hate', 'dislike', 'undecided', 'sortOf', 'like', 'love',
];

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
 * These four strings ARE the server's `ReactionTargetType`.
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
 * section of a post with a STABLE id, and the published page renders a reaction
 * scale for each part as well as one for the post overall. So a post and its
 * parts are separate reaction targets, and the part id is what a stored reaction
 * is keyed to. Counting only whole posts would throw away the finer of the two
 * signals the reader page asks for.
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

// ── The report, as the endpoint sends it ────────────────────────────────────

/** One reacted item, with its seven counts. Mirrors `ReportItem` on the server. */
export interface Item {
  id: string;
  title: string;
  type: ContentType;
  /** Display label, not a key — this page does no category maths. */
  category?: string;
  /** For a blog part: the post it belongs to. A part is never read alone. */
  parentTitle?: string;
  publishedAt: string;
  /** Per-emoji counts, ascending weight, always all seven. */
  counts: number[];
}

/** The body of `GET /api/analytics/reactions`. */
export interface ReactionsReport {
  from: string;
  to: string;
  types: ContentType[];
  items: Item[];
  /** Distinct PEOPLE — per-item counts cannot give this, a reader reacts to many. */
  reactors: number;
  publishedByType: Record<ContentType, number>;
  /** Reacted items the server's cap left out. 0 in every normal case. */
  truncated: number;
  /**
   * Staff reactions left out of these figures — reported so the page can EXPLAIN
   * a zero rather than just show one. Staff test their own reaction bars, so
   * "I reacted and the dashboard shows nothing" is the first thing this feature
   * does to the people who build it.
   */
  staffExcluded: number;
}

export const EMPTY_REPORT: ReactionsReport = {
  from: '', to: '', types: [],
  items: [],
  reactors: 0,
  publishedByType: { story: 0, blog: 0, blogPart: 0, bulletin: 0 },
  truncated: 0,
  staffExcluded: 0,
};

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
   * put two disagreeing direction numbers on one page.
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

/**
 * Turn seven counts into everything the page shows about them.
 *
 * THIS is where the weights are applied — at read time, from the shared scale,
 * never from anything stored. Re-weighting then re-scores all of history
 * correctly instead of needing a backfill.
 */
export function splitOf(rawCounts: number[]): Split {
  const counts = EMOJI_KEYS.map((_, i) => {
    const n = rawCounts[i];
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
  });
  const reactions = counts.reduce((a, b) => a + b, 0);
  if (reactions === 0) return EMPTY_SPLIT;

  let forCount = 0;
  let middleCount = 0;
  let againstCount = 0;
  let score = 0;
  const contributions = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 7; i++) {
    contributions[i] = counts[i]! * WEIGHTS[i]!;
    score += contributions[i]!;
    if (SIDE_OF[i] === 'for') forCount += counts[i]!;
    else if (SIDE_OF[i] === 'middle') middleCount += counts[i]!;
    else againstCount += counts[i]!;
  }
  const [forPct, middlePct, againstPct] = pcts([forCount, middleCount, againstCount], reactions);

  return {
    reactions,
    forPct: forPct!, middlePct: middlePct!, againstPct: againstPct!,
    score,
    avgScore: score / reactions,
    counts,
    contributions,
  };
}

/** Add two count vectors — how a type's totals are built from its items. */
function addCounts(into: number[], from: number[]): void {
  for (let i = 0; i < 7; i++) into[i] = (into[i] ?? 0) + (from[i] ?? 0);
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

const DAY = 86_400_000;

/**
 * The range as dates, computed from NOW.
 *
 * It used to be measured from a frozen constant, because the sample data was
 * generated around one. With a live feed that would have quietly stopped
 * including today.
 */
export function rangeFor(id: DateRangeId): { from: string; to: string } {
  const days = DATE_RANGES.find((r) => r.id === id)!.days;
  const now = Date.now();
  return {
    from: new Date(now - days * DAY).toISOString().slice(0, 10),
    to: new Date(now).toISOString().slice(0, 10),
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

/** Everything the screen renders. Three analytics, so three things plus totals. */
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
  /** Passed through so the page can admit it when the server capped the report. */
  truncated: number;
  /** Passed through so the page can explain a zero caused by the staff filter. */
  staffExcluded: number;
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

/**
 * Everything on the page, from one report.
 *
 * The server has already applied the date window and the type filter, so this
 * does no filtering of its own — it weights, totals and shapes. Keeping those
 * two responsibilities apart is what lets the endpoint stay arithmetic-free.
 */
export function deriveDashboard(report: ReactionsReport): Dashboard {
  const items: ItemStat[] = report.items
    .map((item) => ({ item, split: splitOf(item.counts) }))
    .filter((s) => s.split.reactions > 0);

  const overallCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const s of items) addCounts(overallCounts, s.split.counts);
  const overall = splitOf(overallCounts);

  const shares = pcts(overall.counts, overall.reactions);
  const emojiRows: EmojiRow[] = EMOJI_SCALE.map((step) => {
    const i = EMOJI_KEYS.indexOf(step.key);
    return { ...step, count: overall.counts[i]!, pct: shares[i]!, fill: STEP_FILL[step.key] };
  });

  const scoped = report.types.length ? new Set(report.types) : null;
  const byType: TypeStat[] = CONTENT_TYPES.filter((meta) => !scoped || scoped.has(meta.id)).map((meta) => {
    const own = [0, 0, 0, 0, 0, 0, 0];
    for (const s of items) if (s.item.type === meta.id) addCounts(own, s.split.counts);
    return { ...meta, published: report.publishedByType[meta.id] ?? 0, split: splitOf(own) };
  });

  // Coverage counts everything published up to `to`, NOT only what was published
  // inside the window: a June post can still be earning reactions in August, and
  // excluding it would flatter the number.
  const published = byType.reduce((a, t) => a + t.published, 0);

  return {
    overall,
    reactions: overall.reactions,
    reactors: report.reactors,
    coverage: { reacted: items.length, published },
    emojiRows,
    topEmoji: [...emojiRows].sort((a, b) => b.count - a.count)[0]!,
    items,
    byType,
    moodVerdict: moodVerdict(overall),
    truncated: report.truncated,
    staffExcluded: report.staffExcluded,
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
