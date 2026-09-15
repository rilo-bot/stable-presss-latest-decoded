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
// loadUserPhotoPool fed the pool generation places FIRST, ahead of stock: use
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
 *   photo     — a photograph: extracted from an imported PDF, or found on stock. Rows
 *               written before generation was retired carry `source: 'ai-image'`; they
 *               are still photographs and still placeable.
 *   graphic   — an icon, logo or QR crop lifted off an imported page
 *   reference — a LAYOUT REFERENCE: read for its composition, never placed
 *   doc       — an uploaded source document (PDF/Word/text), never placed
 */
export type MediaKind = 'upload' | 'photo' | 'graphic' | 'reference' | 'doc';

/**
 * May a row of this kind be placed on a page? EXHAUSTIVE, and that is the point.
 *
 * A `Record<MediaKind, …>` rather than a list of exclusions, so adding a kind to the
 * union above is a COMPILE ERROR until someone answers this question for it. The bug
 * this module exists to fix was exactly that shape: `reference` was added, the filters
 * that already existed named only `doc`, and four of six call sites silently treated
 * the new kind as a photograph. A deny-list rebuilds that hole one kind later.
 *
 * The costs are not symmetric, which is what settles it. A picture kind wrongly marked
 * false: a photo does not appear in the picker — visible immediately, harmless, one
 * line to fix. An unplaceable kind wrongly marked true: somebody else's licensed page
 * on a public newsstand and inside an exported PDF. The default has to protect against
 * the second.
 */
const PLACEABLE_BY_KIND: Record<MediaKind, boolean> = {
  upload: true, // the user's own image, put there to be placed
  photo: true, // extracted from an import, or found on stock
  graphic: true, // an icon/logo/QR crop lifted off an imported page
  reference: false, // someone else's licensed page — read for structure, never placed
  doc: false, // a source document; a PDF of race results is not a photograph
};

/** The kinds that may never be placed, derived from the table above so the two
 *  can never disagree. Exported for tests and for anything that needs to explain
 *  itself to a user. */
export const UNPLACEABLE_KINDS: readonly string[] = (Object.keys(PLACEABLE_BY_KIND) as MediaKind[])
  .filter((k) => !PLACEABLE_BY_KIND[k]);

/** Unknown kinds already warned about, so a library scan logs each one once rather
 *  than once per row per request. */
const warnedKinds = new Set<string>();

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
 *
 * A kind OUTSIDE the union fails SAFE — unplaceable, with one warning per distinct
 * value. The compile-time table above cannot reach a legacy row written before a kind
 * existed, or one hand-edited in the database, so the runtime needs its own answer;
 * "hide a photo and say so in the log" is a recoverable wrong answer, and "publish
 * someone's licensed page" is not.
 */
export function isPlaceableMedia(m: MediaRowLike): boolean {
  if (typeof m.url !== 'string' || !m.url) return false;
  const kind = m.kind ?? '';
  if (Object.prototype.hasOwnProperty.call(PLACEABLE_BY_KIND, kind)) {
    return PLACEABLE_BY_KIND[kind as MediaKind];
  }
  if (!warnedKinds.has(kind)) {
    warnedKinds.add(kind);
    console.warn(
      `[magazineV2] media kind ${JSON.stringify(kind)} is not a known MediaKind — treating it as unplaceable. ` +
        'Add it to PLACEABLE_BY_KIND in lib/magazineV2/media.ts to decide deliberately.',
    );
  }
  return false;
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
 * without one. This is the pool generation places FIRST, ahead of stock, so
 * whatever reaches it reaches the client's magazine; it has to be testable.
 *
 * Two INDEPENDENT conditions, and conflating them is what caused the leak:
 *   • `source === 'upload'` is the pool's DEFINITION — photos the user put in
 *     themselves. An extracted photo is a fine picture but already sits on its own
 *     page, so it must not be promoted ahead of stock by this pool.
 *   • `isPlaceableMedia` is whether the row may be placed AT ALL. A layout reference
 *     is `source: 'upload'` too, so provenance alone can never exclude it.
 */
export function userPhotosFrom(media: MediaRow[]): UserPhoto[] {
  return media
    .filter((m) => m.source === 'upload' && isPlaceableMedia(m))
    .map((m) => ({ url: m.url as string, assetId: String(m._id), alt: m.alt ?? '' }));
}

/** A media row with the two fields that decide how RELEVANT it is to a given page. */
export interface RankableMediaRow extends MediaRow {
  /** The page this asset came off, for extracted/stock rows. `null` for uploads —
   *  nothing records which page a user had in mind when they uploaded a photo. */
  pageIndex?: number | null;
  createdAt?: string;
}

/**
 * The magazine's placeable pictures, best candidate for THIS page first.
 *
 * Rebuilding a page needs photographs, and the library is the whole magazine's. Read
 * in storage order — which is what the apply-layout top-up did — page 3's rebuild can
 * take page 12's photograph while page 3's own sits further down the array. The
 * pictures are technically the client's own, so nothing is leaked; the page is just
 * wrong, in a way that reads as the feature being careless.
 *
 * Two tiers, and the second matters as much as the first:
 *
 *   1. Assets extracted from THIS page. Only extraction and stock record a
 *      `pageIndex` — an upload is stored with `pageIndex: null`, because nothing ever
 *      asked the user which page they meant.
 *   2. Everything else, NEWEST first. This is the tier uploads land in, and recency is
 *      the only signal there is: a photo added minutes ago is far likelier to be meant
 *      for the page being worked on than one from the first import.
 *
 * Stable: rows that tie keep their relative order, so the result does not shuffle
 * between two calls with the same input.
 */
export function rankMediaForPage<T extends RankableMediaRow>(media: T[], pageIndex: number): T[] {
  const placeable = media.filter((m) => isPlaceableMedia(m));
  const onThisPage = (m: T) => Number.isInteger(m.pageIndex) && m.pageIndex === pageIndex;
  const newest = (a: T, b: T) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  return [
    ...placeable.filter(onThisPage),
    ...placeable.filter((m) => !onThisPage(m)).sort(newest),
  ];
}
