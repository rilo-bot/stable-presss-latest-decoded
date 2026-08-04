/**
 * The reader reaction scale.
 *
 * Lifted out of `pages/production-system/emoji-analytics/data.ts`, which defined
 * it for the staff dashboard. It now has two consumers — that dashboard, and the
 * reaction bar on a public blog post — and the two MUST agree: the dashboard is
 * explicitly "the design for the system we intend to build", so the day a
 * `reactions` collection lands, a scale that had quietly forked would make every
 * number on that screen wrong.
 *
 * `data.ts` re-exports everything here, so its own importers are untouched.
 */

export type EmojiKey =
  | 'reallyHate' | 'hate' | 'dislike' | 'undecided' | 'sortOf' | 'like' | 'love';

/** Which side of the baseline a reaction sits on. */
export type Side = 'for' | 'middle' | 'against';

export interface EmojiStep {
  key: EmojiKey;
  emoji: string;
  label: string;
  /**
   * What one reaction is worth. Summing these across an item's reactions gives
   * its SCORE — the single number the analytics page ranks on.
   *
   * The scale is deliberately NOT linear. The gaps run 2, 2, 1, 1, 2, 2: the
   * middle is compressed and the ends stretched, so one 🤬 cancels five 🙂, or
   * one 🤩. Mild opinions barely move a score; strong ones dominate it. That is
   * an editorial statement, not an accident, and the dashboard shows each step's
   * contribution so it is never a surprise.
   */
  weight: -5 | -3 | -1 | 0 | 1 | 3 | 5;
  side: Side;
}

/**
 * The seven-point scale, in scale order: most negative first. This is the order
 * it renders in — an ordinal scale read out of order stops being a scale.
 */
export const EMOJI_SCALE: EmojiStep[] = [
  { key: 'reallyHate', emoji: '🤬', label: 'Really hate it', weight: -5, side: 'against' },
  { key: 'hate', emoji: '😠', label: 'Hate it', weight: -3, side: 'against' },
  { key: 'dislike', emoji: '😕', label: "Don't like it", weight: -1, side: 'against' },
  { key: 'undecided', emoji: '😐', label: 'Undecided', weight: 0, side: 'middle' },
  { key: 'sortOf', emoji: '🙂', label: 'Sort of like it', weight: 1, side: 'for' },
  { key: 'like', emoji: '😊', label: 'Like it', weight: 3, side: 'for' },
  { key: 'love', emoji: '🤩', label: 'Love it', weight: 5, side: 'for' },
];

const WEIGHT_BY_KEY = new Map(EMOJI_SCALE.map((s) => [s.key, s.weight]));

/**
 * What one reaction of this kind is worth.
 *
 * Always DERIVE a weight through this rather than storing it alongside a
 * reaction. The scale was re-weighted once before it shipped and may be again;
 * a weight copied onto every stored row would make every historical reaction
 * wrong on the day it changes, and a re-weighting would need a backfill instead
 * of being a config change.
 */
export function weightOf(key: EmojiKey): number {
  return WEIGHT_BY_KEY.get(key) ?? 0;
}

/**
 * One fill per step, from the diverging scale the dashboard's colour notes
 * document at length — three steps per arm at monotone lightness plus a neutral
 * midpoint, searched against the Machado–Oliveira–Fernandes protanopia and
 * deuteranopia simulations so the two poles never collapse into each other.
 *
 * Never colour alone: every use of these carries the step's label as well.
 */
export const STEP_FILL: Record<EmojiKey, string> = {
  reallyHate: '#b84619',
  hate: '#cd5c2f',
  dislike: '#e37945',
  undecided: '#b2afa9',
  sortOf: '#2f7a58',
  like: '#22603f',
  love: '#174a32',
};
