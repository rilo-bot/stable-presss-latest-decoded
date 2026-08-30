// ---------------------------------------------------------------------------
// The command surface. Seven lanes read this file.
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
}

export interface ResizeItemPayload {
  itemId: Id;
  frame: Rect;
}

export interface RotateItemPayload {
  itemId: Id;
  degrees: number;
}

/**
 * Deliberately narrow — `ItemBase` fields only.
 *
 * A setter that accepted anything would absorb every lane's typed commands, and
 * FWD-02's "everything is a named instruction" would degrade to one instruction
 * meaning anything. Type-specific changes are named commands owned by their
 * lane: `photo.setCornerRadius`, `shape.setFill`, `text.setAlign`.
 */
export interface SetPropsPayload {
  itemId: Id;
  props: Partial<ItemBaseProps>;
}

export interface ReorderItemPayload {
  itemId: Id;
  afterId: Id | null;
  beforeId: Id | null;
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
  /** Present only when serving as the inverse of a merge. */
  restore?: {
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
