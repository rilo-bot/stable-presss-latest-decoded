// ---------------------------------------------------------------------------
// The command surface. Seven lanes read this file.
//
// THE INVERSE-PAYLOAD PATTERN. Several payloads carry an optional field used
// only when the command is serving as another command's inverse — `order` on
// `item.create` and `item.reorder`, `runs` on `text.insert`, `restore` on
// `text.splitParagraph`, `restore` on the three transform commands, and
// `restoreStory` on `text.disconnectBox`.
//
// It exists because an inverse must reproduce the ORIGINAL VALUE, not merely a
// value that looks equivalent. A reorder computes a fresh fractional key between
// the same neighbours, and that key is not the string the item had; a deletion
// spanning runs with different formatting cannot be undone by inserting plain
// text; scaling a group's children back by the reciprocal ratio drifts by an ulp
// per round trip, and LANE-1 §12 gate 5 requires no drift at all. In each case
// the inverse carries the original verbatim.
//
// FOUNDATION §6.7 already chose this pattern for `splitParagraph`. Using it
// consistently keeps the surface at fourteen commands instead of twenty-two.
// ---------------------------------------------------------------------------

import type {
  Id,
  Item,
  ItemBaseProps,
  Magazine,
  OrderKey,
  Paragraph,
  Rect,
  Story,
  TextRun,
} from '@rilo/mb-schema';

/**
 * An item on its way into the document, before it has a place.
 *
 * `T extends unknown ?` makes the conditional DISTRIBUTIVE, so each member of
 * the union keeps its own fields. A plain `Omit<Item, 'order'>` does not work:
 * `keyof` over a union is the INTERSECTION of its members' keys, so the result
 * collapses to the fields all four kinds share and a text box silently loses
 * `storyId`.
 *
 * `order` present means use it verbatim — that is how `item.create` serves as
 * the inverse of a delete, restoring an item to the exact key it had. Absent
 * means the handler generates one between the named neighbours.
 */
export type NewItem<T = Item> = T extends unknown
  ? Omit<T, 'order'> & { order?: OrderKey }
  : never;

/**
 * One item's geometry, captured so an inverse can restore it exactly.
 *
 * A group transform touches every descendant, and recomputing the reverse
 * transform accumulates floating-point drift. Restoring the recorded numbers
 * does not.
 */
export interface FrameSnapshot {
  itemId: Id;
  frame: Rect;
  rotation: number;
}

// ── Payloads ────────────────────────────────────────────────────────────────

export interface CreateItemPayload {
  pageId: Id;
  item: NewItem;
  /** Intended predecessor. Both null means append — the common case. */
  afterId: Id | null;
  /** Intended successor. */
  beforeId: Id | null;
  /**
   * For a text box, the story it shows.
   *
   * Creating a box and creating its story cannot be two commands: invariant 1
   * requires `storyId` to resolve, and `validateStructure` runs after every
   * command, so it would fire on the state between them. Absent means the story
   * already exists.
   */
  story?: Story;
}

export interface DeleteItemPayload {
  itemId: Id;
}

export interface MoveItemPayload {
  itemId: Id;
  x: number;
  y: number;
  /** Inverse path — restore these frames verbatim instead of translating. */
  restore?: FrameSnapshot[];
}

export interface ResizeItemPayload {
  itemId: Id;
  frame: Rect;
  /** Inverse path — restore these frames verbatim instead of scaling. */
  restore?: FrameSnapshot[];
}

export interface RotateItemPayload {
  itemId: Id;
  degrees: number;
  /** Inverse path — restore these frames and rotations verbatim. */
  restore?: FrameSnapshot[];
}

/**
 * One field today, and that is deliberate — see `ItemBaseProps`.
 *
 * Geometry and lock each have a command that does more than assign, so a
 * general setter able to write them would be a second, weaker path to the same
 * state.
 */
export interface SetPropsPayload {
  itemId: Id;
  props: Partial<ItemBaseProps>;
}

export interface ReorderItemPayload {
  itemId: Id;
  afterId: Id | null;
  beforeId: Id | null;
  /**
   * Inverse path — take this key rather than generating one.
   *
   * Generating between the original neighbours produces a valid key but not the
   * original string, and undo has to land on the document it started from.
   */
  order?: OrderKey;
}

export interface SetLockedPayload {
  itemId: Id;
  locked: boolean;
}

export interface InsertTextPayload {
  paragraphId: Id;
  /** Character offset into the paragraph's concatenated runs. */
  offset: number;
  /** Plain text. Inherits formatting per D-19 — the left run, or the first at offset 0. */
  text?: string;
  /**
   * Runs verbatim, used when this serves as the inverse of a delete.
   *
   * A deletion spanning runs with different formatting cannot be undone by
   * inserting plain text; the original runs have to come back as they were.
   */
  runs?: TextRun[];
}

export interface DeleteTextPayload {
  paragraphId: Id;
  offset: number;
  length: number;
}

export interface SplitParagraphPayload {
  paragraphId: Id;
  offset: number;
  /** Caller-supplied so the inverse can name it, and so undo/redo reproduce it. */
  newParagraphId: Id;
  /**
   * Present only when serving as the inverse of a merge.
   *
   * A merge destroys the second paragraph's own look, overrides, list type and
   * order key. Splitting again would copy the first paragraph's instead, so the
   * inverse carries what was lost.
   */
  restore?: {
    order: OrderKey;
    lookId: Id;
    overrides: Paragraph['overrides'];
    listType: Paragraph['listType'];
  };
}

export interface MergeParagraphPayload {
  /** This paragraph merges INTO the one before it. */
  paragraphId: Id;
}

export interface ConnectBoxPayload {
  /** Text overflowing this box continues into the next. */
  fromBoxId: Id;
  toBoxId: Id;
}

export interface DisconnectBoxPayload {
  /** Breaks the link AFTER this box. */
  boxId: Id;
  /** The story the downstream chain takes. Supplied so undo can name it. */
  newStoryId: Id;
  /**
   * Present only when serving as the inverse of a connect.
   *
   * Connecting adopts the downstream chain into the upstream story, which
   * strands the story those boxes used to show. Disconnecting normally hands
   * them a new EMPTY story — the text belongs to the chain it was typed into —
   * so undo has to bring the original back with its paragraphs intact.
   */
  restoreStory?: Story;
}

// ── Command envelope ────────────────────────────────────────────────────────

export interface Command<T = unknown> {
  type: string;
  payload: T;
  /**
   * Commands sharing a key within the coalescing window merge into one undo
   * entry. A drag emits dozens of `item.move` and should cost one undo.
   */
  coalesceKey?: string;
}

/** What a handler returns when it applied the change. */
export interface CommandApplied {
  /** The command that exactly reverses this one. */
  inverse: Command;
  /** Ids whose layout must be recomputed. Exactly what was touched, no more. */
  dirty: Id[];
}

/**
 * What a handler returns when it refused.
 *
 * A refusal is expected — a locked item, a merge with nothing before it. It is
 * not a defect, so nothing throws and nothing commits. `InvariantError` is
 * reserved for a handler that produced an invalid document.
 *
 * The string is shown to the user (GL-12: never silently do nothing), so it is
 * written in the Section 9 vocabulary, not in schema terms.
 */
export interface CommandRejected {
  rejected: string;
}

export type CommandOutcome = CommandApplied | CommandRejected;

export type CommandHandler<T> = (draft: Magazine, payload: T) => CommandOutcome;

export function isRejected(outcome: CommandOutcome): outcome is CommandRejected {
  return 'rejected' in outcome;
}

export type DispatchResult = { ok: true; dirty: Id[] } | { ok: false; reason: string };

/**
 * The slice of a store that dispatch needs.
 *
 * Declared here rather than imported, because `mb-commands` imports `mb-schema`
 * only (FOUNDATION §4) and `mb-store` imports this package — importing back
 * would be a cycle. `Store` in mb-store is a superset and satisfies this
 * structurally.
 */
export interface CommandStore {
  readonly current: Magazine;
  commit(next: Magazine): void;
}
