// ---------------------------------------------------------------------------
// Magazine Builder v2 — the geometric QUALITY RULES, in one place.
//
// Three defects a real generated issue shipped, none of which any check could see:
//
//   • A SLIVER PHOTO. The solver gives an image leaf whatever its weight share comes to,
//     and nothing ever asked whether the result was still a picture: a 74×1634 strip
//     down a contents page (aspect 0.05), a 451×28 ribbon (aspect 16) in a profile grid.
//     `fit: cover` dutifully cropped a photograph into a line.
//   • A DEAD BAND. A full-width stripe of the sheet with nothing on it — a feature title
//     in a 787px box holding 200px of type left ~650px of bare page under it, and a
//     near-opaque scrim turned the same emptiness on a photo page into a black field.
//   • (Oversize boxes are the per-box view of the same thing; fitReport's `slack`
//     already measures those against the page, and layoutValidate now does too.)
//
// These rules are shared by the three places that must agree about them: the layout
// balancer that PREVENTS them (balanceLayout.ts), the fit report that tells the
// art-director about them (fitReport.ts), and the element-level QA that flags them on
// any page, generated or not (layoutValidate.ts). A rule that two of those disagreed on
// would either retry a page forever or wave a broken one through.
//
// Pure + server-safe: arithmetic only. No DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The sane shape of a photograph, as width ÷ height.
 *
 * 1:2 (a tall portrait) to 5:2 (a wide landscape band) covers every crop a magazine
 * actually prints at body scale. Outside it, `cover` is no longer cropping a photo — it
 * is cutting a strip out of one, and what survives is unreadable.
 */
export const IMAGE_MIN_ASPECT = 0.5;
export const IMAGE_MAX_ASPECT = 2.5;
/**
 * A photo that BLEEDS off both sides (or top and bottom) of the sheet is a deliberate
 * panorama or column, and gets a wider range — a full-width 3:1 band across the top of a
 * feature is a classic opener, not a sliver.
 */
export const BLEED_MIN_ASPECT = 1 / 3;
export const BLEED_MAX_ASPECT = 4;
/** Below this on its short side a photo is a thumbnail at best (0.8in at 150 DPI). */
export const IMAGE_MIN_SIDE = 120;
/** …and below this share of the sheet it is a postage stamp, whatever its shape. */
export const IMAGE_MIN_AREA_SHARE = 0.01;
/**
 * A photo this big is a BACKGROUND (a full-bleed hero behind a scrim and a headline),
 * and its shape is the page's shape — exempt from the aspect rules above.
 */
export const BACKGROUND_SHARE = 0.45;

export type ImageShapeKind = 'tiny' | 'too-tall' | 'too-wide';
export interface ImageShapeProblem {
  kind: ImageShapeKind;
  aspect: number;
  /** The aspect range this box was judged against (relaxed for a bleed). */
  lo: number;
  hi: number;
  detail: string;
}

const EDGE_TOL = 2;

/** Does this box run off (or exactly to) both side edges, or both top and bottom? */
export function bleeds(box: Box, page: { width: number; height: number }): boolean {
  const acrossX = box.x <= EDGE_TOL && box.x + box.w >= page.width - EDGE_TOL;
  const acrossY = box.y <= EDGE_TOL && box.y + box.h >= page.height - EDGE_TOL;
  return acrossX || acrossY;
}

/** The aspect range a photo in this box must keep. */
export function aspectRange(box: Box, page: { width: number; height: number }): { lo: number; hi: number } {
  return bleeds(box, page) ? { lo: BLEED_MIN_ASPECT, hi: BLEED_MAX_ASPECT } : { lo: IMAGE_MIN_ASPECT, hi: IMAGE_MAX_ASPECT };
}

/**
 * Is this box still a photograph? null when it is; otherwise what is wrong with it, in
 * plain words. Backgrounds (≥ BACKGROUND_SHARE of the sheet) are always fine — the caller
 * decides separately whether a smaller image is a backing layer under text.
 */
export function imageShapeProblem(box: Box, page: { width: number; height: number }): ImageShapeProblem | null {
  const pageArea = Math.max(1, page.width * page.height);
  if (box.w <= 0 || box.h <= 0) return { kind: 'tiny', aspect: 0, lo: IMAGE_MIN_ASPECT, hi: IMAGE_MAX_ASPECT, detail: 'the photo has no area at all' };
  if ((box.w * box.h) / pageArea >= BACKGROUND_SHARE) return null;
  const aspect = box.w / box.h;
  const { lo, hi } = aspectRange(box, page);
  const size = `${Math.round(box.w)}×${Math.round(box.h)}`;
  if (Math.min(box.w, box.h) < IMAGE_MIN_SIDE || (box.w * box.h) / pageArea < IMAGE_MIN_AREA_SHARE) {
    return { kind: 'tiny', aspect, lo, hi, detail: `the photo is ${size}px — too small to read as a picture (keep it at least ${IMAGE_MIN_SIDE}px on its short side)` };
  }
  if (aspect < lo) {
    return { kind: 'too-tall', aspect, lo, hi, detail: `the photo is ${size}px (aspect ${aspect.toFixed(2)}) — a sliver standing on end; a photo needs at least ${lo.toFixed(2)}:1` };
  }
  if (aspect > hi) {
    return { kind: 'too-wide', aspect, lo, hi, detail: `the photo is ${size}px (aspect ${aspect.toFixed(2)}) — a ribbon, not a picture; a photo needs at most ${hi.toFixed(2)}:1` };
  }
  return null;
}

// ── Dead bands ──────────────────────────────────────────────────────────────

/**
 * How tall a full-width stripe of nothing must be before it is a dead band rather than
 * air: a tenth of the sheet (175px on A4 at 150 DPI). Section rhythm — the gap between a
 * feature's parts — is 36–96px; a deliberate pause under a headline is rarely past 150.
 */
export const DEAD_BAND_SHARE = 0.1;
/**
 * A stripe touching the top or bottom edge of the sheet first spends this much on being
 * the page MARGIN (plus the running head / folio strip) before any of it counts.
 */
export const EDGE_ALLOWANCE_SHARE = 0.057;

export interface Band {
  y0: number;
  y1: number;
}

/**
 * Full-width horizontal stripes of the sheet that nothing inks.
 *
 * `ink` is every vertical extent that actually PRINTS something — a text block's
 * measured lines (not its box), a visible photo, a mark — whatever its x: a stripe is
 * only dead if it is empty all the way across. Returns the stripes at least
 * DEAD_BAND_SHARE of the page tall, after edge stripes have paid the margin allowance.
 */
export function deadBands(ink: { y: number; h: number }[], pageHeight: number): Band[] {
  const H = Math.max(1, pageHeight);
  const min = H * DEAD_BAND_SHARE;
  const allowance = H * EDGE_ALLOWANCE_SHARE;
  const spans = ink
    .filter((b) => b.h > 0)
    .map((b) => [Math.max(0, b.y), Math.min(H, b.y + b.h)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const bands: Band[] = [];
  let cursor = 0;
  const consider = (y0: number, y1: number) => {
    let len = y1 - y0;
    if (y0 <= 0) len -= allowance;
    if (y1 >= H) len -= allowance;
    if (len >= min) bands.push({ y0: Math.round(y0), y1: Math.round(y1) });
  };
  for (const [a, b] of spans) {
    if (a > cursor) consider(cursor, a);
    cursor = Math.max(cursor, b);
  }
  if (cursor < H) consider(cursor, H);
  return bands;
}

/** Above this opacity a wash over a photo HIDES it: the photo stops being ink. */
export const HIDING_OPACITY = 0.8;
/**
 * The darkest a scrim spread over most of the sheet may be. A scrim exists so type over a
 * photograph stays legible; at 0.88 over a full page it erases the photograph instead and
 * the page reads as a black field with a little type on it — the "black gap" pages. Light
 * type over a photo under a 0.7 wash of a dark colour stays well above the contrast bar.
 */
export const MAX_COVERING_SCRIM_OPACITY = 0.7;
/** A scrim covering at least this share of the sheet is subject to that ceiling. */
export const COVERING_SCRIM_SHARE = 0.5;

/** The opacity a scrim of this size may actually print at. */
export function capScrimOpacity(opacity: number, box: Box, page: { width: number; height: number }): number {
  const share = (box.w * box.h) / Math.max(1, page.width * page.height);
  return share >= COVERING_SCRIM_SHARE ? Math.min(opacity, MAX_COVERING_SCRIM_OPACITY) : opacity;
}

/** Share of `inner` that lies inside `outer` (0–1). */
export function coverage(inner: Box, outer: Box): number {
  const w = Math.min(inner.x + inner.w, outer.x + outer.w) - Math.max(inner.x, outer.x);
  const h = Math.min(inner.y + inner.h, outer.y + outer.h) - Math.max(inner.y, outer.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1, inner.w * inner.h);
}
