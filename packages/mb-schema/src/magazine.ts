// ---------------------------------------------------------------------------
// The magazine — the root document.
//
// Everything about a magazine's appearance lives here (FWD-05). Nothing about
// it exists only inside a component or in browser memory, which is what lets
// the publish job render the same result from Node.
//
// Derived values are NOT stored: fitted font size, layout positions and overflow
// counts are all computed (see ThreadLayout in mb-render). The moment computed
// state is written down it becomes a second source of truth that goes stale, and
// that is precisely why the old element model's text behaviour is hard to reason
// about — it kept a fitted `fontSize` alongside `maxFontSize` and `minFontSize`.
// ---------------------------------------------------------------------------

import type { Color, Id, Insets, Px } from './primitives.js';
import type { Item } from './items.js';
import type { SavedLook, Story } from './text.js';
import type { AssetRef } from './assets.js';

/**
 * Defaults applied when a page is created.
 *
 * `width` and `height` here are a DEFAULT, not the truth. Each Page carries its
 * own size and that is what renders (ADR-002), so a magazine can hold mixed
 * sizes. Nothing reads pageSetup at render time.
 */
export interface PageSetup {
  width: Px;
  height: Px;
  margin: Insets;
  /** DOC-07. When false, every spread holds exactly one page — invariant 12. */
  facingPages: boolean;
}

/**
 * Items that appear on every page — a header, a footer, a border (DOC-10).
 *
 * A page may opt out of individual items by id, rather than out of the whole
 * background, so a cover can drop the folio and keep the border.
 */
export interface RepeatingBackground {
  id: Id;
  name: string;
  /** Sorted by `order`, like every other item collection. Invariant 10. */
  items: Item[];
}

export interface Page {
  id: Id;
  /** Authoritative. `pageSetup` supplies this at creation and is not read again. */
  width: Px;
  height: Px;
  /** Which repeating background this page uses, if any. */
  backgroundId: Id | null;
  /** CLR-04. null means the page takes no colour of its own. */
  backgroundColor: Color | null;
  /**
   * Stored sorted by `Item.order`; array position IS z-order at read time.
   * Readers never sort. Invariant 10.
   */
  items: Item[];
  /** Ids from the repeating background this page hides. */
  hiddenBackgroundItems: Id[];
  columns: { count: number; gutter: Px } | null;
}

/**
 * One or two pages shown side by side (DOC-07).
 *
 * Covers hold one page; interiors hold two, except a final odd interior spread
 * which holds one. Invariant 11.
 */
export interface Spread {
  id: Id;
  pages: Page[];
}

export interface MagazineMeta {
  title: string;
  slug: string;
  /** Resolves against the existing `users` collection. */
  ownerId: Id;
  /** ISO 8601. */
  createdAt: string;
  updatedAt: string;
}

export interface Magazine {
  id: Id;
  schemaVersion: 1;
  meta: MagazineMeta;
  pageSetup: PageSetup;
  backgrounds: Record<Id, RepeatingBackground>;
  /** Ordered. spreads[0] is the front cover. */
  spreads: Spread[];
  /** Text content, keyed by id. Boxes point at these; these point at nothing. */
  stories: Record<Id, Story>;
  /** Named looks (TXT-13). */
  looks: Record<Id, SavedLook>;
  /** The magazine's own colours, offered first everywhere (CLR-02). */
  palette: Color[];
  assets: Record<Id, AssetRef>;
}

/** The schema version this package reads and writes. */
export const SCHEMA_VERSION = 1;
