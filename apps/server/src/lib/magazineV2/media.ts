// ---------------------------------------------------------------------------
// Magazine Builder v2 — what a row in the media library IS, and the one question
// almost everything asks of it: MAY THIS BE PLACED ON A PAGE?
//
// This module exists because that question had three answers.
//
// A magazine's media library holds five kinds of row, and two of them must never
// reach a page. `doc` is an uploaded source document — a PDF of race results is not
// a photograph. `reference` is somebody else's licensed magazine page, uploaded so
// the AI could read its STRUCTURE; placing it is the one thing
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md §1 says we never do.
//
// The rule was written out by hand at each call site instead of living anywhere,
// and four of the six sites did not have it at all:
//
//   GET /media                    kind !== 'doc' && kind !== 'reference'   ✓
//   apply-layout image top-up     kind !== 'reference' && kind !== 'doc'   ✓
//   loadUserPhotoPool             kind !== 'doc'                           ✗ LEAKED
//   agent list_media              (no filter)                              ✗ LEAKED
//   agent set_element_image       (no filter)                              ✗ LEAKED
//   agent add_media_image         (no filter)                              ✗ LEAKED
//
// loadUserPhotoPool fed the pool generation places FIRST, ahead of AI and stock: use
// a reference layout on a page, ask for more pages, and the reference was composed
// into the client's magazine as a hero photograph — publishable to the public
// newsstand and exportable to PDF. The three agent tools were a shorter path to the
// same place: `list_media` is described to the model as "photos in this magazine's
// library" and handed it references and PDFs, and the two placement tools accepted
// whatever it picked. An invariant restated at six call sites is an invariant that is
// wrong at four of them; there is now one place to be right.
//
// ONE TOOL IS DELIBERATELY EXEMPT. `use_image_as_layout` exists to READ a reference's
// structure, so it takes the unfiltered library on purpose — see the note there.
// Reading a reference is the feature; only its pixels are off-limits.
//
// Pure data + one predicate. No I/O, no DOM, no model.
// ---------------------------------------------------------------------------

/**
 * The kinds of row the media library holds.
 *
 *   upload    — an image the user put in themselves, to place
 *   photo     — a photograph: extracted from an imported PDF, or sourced from stock/AI
 *   graphic   — an icon, logo or QR crop lifted off an imported page
 *   reference — a LAYOUT REFERENCE: read for its composition, never placed
 *   doc       — an uploaded source document (PDF/Word/text), never placed
 */
export type MediaKind = 'upload' | 'photo' | 'graphic' | 'reference' | 'doc';

/** Kinds that may never be placed on a page, and why, in one place. */
export const UNPLACEABLE_KINDS: readonly string[] = ['reference', 'doc'];

/** The shape this module needs. Deliberately loose: callers hold raw Mongo rows
 *  whose fields are all optional until proven otherwise. */
export interface MediaRowLike {
  kind?: string;
  url?: string;
}

/**
 * May this media row be placed on a page?
 *
 * Note what it does NOT look at: `source`. A layout reference is stored with
 * `source: 'upload'` (it really was uploaded) and `kind: 'reference'`, so any check
 * phrased in terms of provenance rather than KIND lets it through — which is
 * precisely how it leaked into the user photo pool. Placeability is a property of
 * what a row IS, never of where it came from.
 *
 * A row with no usable url is not placeable either: an image element pointing at
 * nothing renders as a hole, and downstream (pruneSpec) deletes its slot and
 * re-partitions the page.
 */
export function isPlaceableMedia(m: MediaRowLike): boolean {
  if (typeof m.url !== 'string' || !m.url) return false;
  return !UNPLACEABLE_KINDS.includes(m.kind ?? '');
}

/** One of the user's own photographs, ready to hand to a composer. */
export interface UserPhoto {
  url: string;
  assetId: string;
  alt: string;
}

/** A media row as the collection stores it. */
export interface MediaRow extends MediaRowLike {
  _id: string;
  alt?: string;
  source?: string;
}

/**
 * The user's own uploaded photographs, out of a magazine's whole media library.
 *
 * Lives HERE rather than in generate.ts for two reasons. It is the same question
 * this module already answers, one filter clause further on — and generate.ts
 * reaches the database at import time, so anything defined there cannot be tested
 * without one. This is the pool generation places FIRST, ahead of AI and stock, so
 * whatever reaches it reaches the client's magazine; it has to be testable.
 *
 * Two INDEPENDENT conditions, and conflating them is what caused the leak:
 *   • `source === 'upload'` is the pool's DEFINITION — photos the user put in
 *     themselves. An extracted photo is a fine picture but already sits on its own
 *     page, so it must not be promoted ahead of AI/stock by this pool.
 *   • `isPlaceableMedia` is whether the row may be placed AT ALL. A layout reference
 *     is `source: 'upload'` too, so provenance alone can never exclude it.
 */
export function userPhotosFrom(media: MediaRow[]): UserPhoto[] {
  return media
    .filter((m) => m.source === 'upload' && isPlaceableMedia(m))
    .map((m) => ({ url: m.url as string, assetId: String(m._id), alt: m.alt ?? '' }));
}
