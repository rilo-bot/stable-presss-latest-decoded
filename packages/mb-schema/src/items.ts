// ---------------------------------------------------------------------------
// Items — the things on a page.
//
// Four kinds, discriminated on `type`. The old model's `qr` and `icon` are not
// carried over: neither appears in the requirements, and adding them silently
// would be a feature nobody asked for. If they are wanted, they are a new
// requirement.
// ---------------------------------------------------------------------------

import type { Color, Id, Insets, OrderKey, Px, Rect } from './primitives.js';

/** What every item has, whatever kind it is. */
export interface ItemBase {
  id: Id;
  /**
   * Fractional index, unique within the collection holding this item.
   *
   * Array position IS z-order at read time, and the array is stored sorted by
   * this key — so readers never sort and only reorder/create touch keys.
   * Identifying a position by key rather than index is what makes a reorder
   * correct when it was computed against a stale view, which happens today with
   * two browser tabs and not only under collaboration. Invariant 10.
   */
  order: OrderKey;
  frame: Rect;
  /** Degrees clockwise about the frame centre. */
  rotation: number;
  /** 0..1. On EVERY item — the old model had it on shapes alone. */
  opacity: number;
  /** ARR-11. Enforced by command handlers, not by the renderer. */
  locked: boolean;
}

/** What a box does when its text does not fit and there is no next box. */
export type OverflowBehaviour = 'warn' | 'shrink';

/** The default floor for `shrink`. Below this, warn instead. */
export const DEFAULT_MIN_FONT_SCALE = 0.7;

/**
 * A window onto part of a story.
 *
 * The box holds no text. `storyId` names the content; `nextBoxId`/`prevBoxId`
 * form the chain it flows through (TXT-11). Where the story is cut for this
 * particular box is computed, not stored — see ThreadLayout in mb-render.
 */
export interface TextBox extends ItemBase {
  type: 'text';
  storyId: Id;
  /** Next box in the chain, or null at the end. */
  nextBoxId: Id | null;
  /** Previous box, or null at the head. */
  prevBoxId: Id | null;
  insets: Insets;
  columns: { count: number; gutter: Px };
  verticalAlign: 'top' | 'center' | 'bottom';
  /**
   * Default 'warn' (FOUNDATION §9.3).
   *
   * Not 'shrink', because silent shrink-to-fit is exactly the invisible
   * behaviour that confuses our users: three more sentences and everything
   * quietly gets smaller, with no way to work out why — or worse, unnoticed,
   * and published at a size they cannot read.
   */
  overflow: OverflowBehaviour;
  /** Floor for 'shrink'. At this scale, stop shrinking and warn. */
  minFontScale: number;
}

/** How a photo fills its frame. `manual` uses `sourceRect` as the trim. */
export interface PhotoFit {
  mode: 'fill' | 'fit' | 'manual';
  /** Image-space trim rectangle. Only read when mode is 'manual'. */
  sourceRect: Rect | null;
}

/** Text flow around an item. Rectangle only in v1 (IMG-10). */
export interface TextWrap {
  gap: Insets;
}

export interface Photo extends ItemBase {
  type: 'photo';
  assetId: Id;
  fit: PhotoFit;
  flipH: boolean;
  flipV: boolean;
  cornerRadius: Px;
  /** null means text does not flow around this photo. */
  textWrap: TextWrap | null;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line';

export interface ShapeStroke {
  color: Color;
  width: Px;
}

export interface Shape extends ItemBase {
  type: 'shape';
  shape: ShapeKind;
  cornerRadius: Px;
  /** null means no colour inside — SHP-02 requires either to be switchable off. */
  fill: Color | null;
  /** null means no outline. */
  stroke: ShapeStroke | null;
  textWrap: TextWrap | null;
}

export interface Group extends ItemBase {
  type: 'group';
  /** Sorted by `order`, like every other item collection. Invariant 10. */
  children: Item[];
}

export type Item = TextBox | Photo | Shape | Group;

export type ItemType = Item['type'];

/**
 * The fields `item.setProps` may write.
 *
 * Deliberately narrow. A generic partial setter that accepted anything would
 * absorb every lane's typed commands, and FWD-02's "everything is a named
 * instruction" would degrade to one instruction meaning anything. Type-specific
 * changes are named commands owned by their lane — `photo.setCornerRadius`,
 * `shape.setFill`, `text.setAlign`.
 */
export type ItemBaseProps = Pick<ItemBase, 'frame' | 'rotation' | 'opacity' | 'locked'>;

/** Narrowing helper, so lanes do not each write their own `type === 'text'`. */
export function isTextBox(item: Item): item is TextBox {
  return item.type === 'text';
}

export function isPhoto(item: Item): item is Photo {
  return item.type === 'photo';
}

export function isShape(item: Item): item is Shape {
  return item.type === 'shape';
}

export function isGroup(item: Item): item is Group {
  return item.type === 'group';
}
