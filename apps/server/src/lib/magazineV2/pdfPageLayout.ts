// ---------------------------------------------------------------------------
// Magazine Builder v2 — a PDF page's layout, MEASURED rather than read.
//
// WHY THIS EXISTS
//
// "Lay this page out like that one" already works from a picture: a vision model
// looks at an image and estimates a LayoutReading — where things sit, as fractions
// of the reference. That is the best anyone can do with a photograph, and it is an
// estimate throughout.
//
// A PDF is not a photograph. It states where every word and picture is, in points,
// along with the size of the type. So for a PDF the honest thing is not to ask a
// model what it thinks it sees — it is to MEASURE, and hand the same LayoutReading
// downstream. Same type, same trust boundary (normalizeLayoutReading), same
// consumers; the reference path does not learn that its source was a document.
//
// WHAT IS MEASURED AND WHAT IS INFERRED, kept clearly apart:
//
//   MEASURED   boxes, type size, the words themselves, page aspect, where the
//              pictures are. These come off the file and are exact.
//   INFERRED   role (is this a headline or a caption?), columns, margin. A PDF
//              records geometry, never intent, so these are heuristics — and they
//              are confined to this file so that "how did it decide that was a
//              headline?" has one answer.
//
// PURE. Takes measurements, returns a reading. No pdfjs, no database, no model —
// so every rule below is testable against a hand-built page.
// ---------------------------------------------------------------------------

import type { PdfImageBox, PdfPageMeasure, PdfTextRun } from '../agent/pdfText.js';
import { MAX_REGION_TEXT, normalizeLayoutReading, type LayoutReading, type ReadRegion } from './layoutReading.js';
import { SPACE_PX, SPACE_TOKENS, type LeafRole, type SpaceToken, type TextAlignToken } from './layoutSpec.js';
import { PAGE_W } from './config.js';

// ── Grouping thresholds ──────────────────────────────────────────────────────
// All expressed as multiples of the TYPE'S OWN SIZE, never as absolute points. A
// fixed gap that groups 9pt body copy correctly tears a 72pt masthead into one
// block per line, and one that holds the masthead together merges a caption into
// the paragraph above it. Type size is the only scale that travels.

/** Two runs are on the same line when their bands overlap by more than this
 *  fraction of the shorter one. Generous: superscripts and inline size changes
 *  sit noticeably off the baseline but are plainly the same line. */
const LINE_OVERLAP = 0.4;
/** Lines further apart than this many multiples of their size start a new block.
 *  Comfortably above single (1.0) and normal (1.2–1.5) leading, and below the air
 *  a design puts between separate items. */
const BLOCK_GAP = 1.9;
/** Type sizes within this relative distance count as the same type. Covers a
 *  design's own rounding (11.04 vs 11) without merging a subhead into body. */
const SIZE_TOL = 0.12;
/** Two lines belong to one block only if they overlap horizontally by at least
 *  this fraction of the narrower. Keeps two columns of identical body copy apart,
 *  which is otherwise the single most damaging mis-grouping on a magazine page. */
const COLUMN_OVERLAP = 0.3;
/** A run separated from the previous by more than this fraction of the type size
 *  has a word space between them. pdfjs does not always emit one. */
const WORD_GAP = 0.22;
/**
 * A run further than this many multiples of the type size from the line so far
 * starts a NEW line, however exactly its baseline agrees.
 *
 * Without this, two columns of body copy are one line: they sit at identical
 * heights in identical type, and a rule phrased only in vertical terms cannot tell
 * them apart. The result reads as a single column the width of the page and every
 * subsequent judgement — blocks, columns, margins — inherits the mistake. Wide
 * enough to keep a letter-spaced masthead's runs together, far narrower than any
 * gutter.
 */
const LINE_GAP = 2.5;

// ── Role thresholds ──────────────────────────────────────────────────────────
/** Type this many times the body size, and the largest on the page, is the
 *  headline. */
const HEADLINE_RATIO = 1.9;
/** Above body but below the headline: a subhead or a deck. */
const SUBHEAD_RATIO = 1.35;
/** Below body: captions, kickers, folios, credits. */
const SMALL_RATIO = 0.85;
/** A small block sitting within this many multiples of its size below a picture,
 *  and horizontally under it, is that picture's caption. */
const CAPTION_GAP = 2.5;
/** Short enough to be a label rather than a paragraph. */
const LABEL_CHARS = 40;
/** How far above the headline a kicker may sit, in multiples of its own size.
 *  Bounded so the folio at the top of a page whose headline is halfway down is not
 *  mistaken for a strap over it. */
const KICKER_REACH = 6;
/** A picture covering this much of the page is the page's ground, not an element
 *  on it — which is what `background: 'photo'` means. */
const FULL_BLEED_AREA = 0.85;

/** A line of type occupies its leading, not its cap height. Boxes measured tight
 *  to the glyphs make a single line thinner than the reading's own MIN_SIDE and it
 *  is dropped — so a caption would silently vanish from the layout it belongs to. */
const LINE_BOX = 1.2;

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
  font: string;
  lines: number;
}

/** Vertical overlap of two bands as a fraction of the shorter one. */
function bandOverlap(aY: number, aH: number, bY: number, bH: number): number {
  const overlap = Math.min(aY + aH, bY + bH) - Math.max(aY, bY);
  const shorter = Math.max(1e-6, Math.min(aH, bH));
  return overlap / shorter;
}

/** Horizontal overlap of two boxes as a fraction of the narrower one. */
function spanOverlap(aX: number, aW: number, bX: number, bW: number): number {
  const overlap = Math.min(aX + aW, bX + bW) - Math.max(aX, bX);
  const narrower = Math.max(1e-6, Math.min(aW, bW));
  return overlap / narrower;
}

function sameSize(a: number, b: number): boolean {
  return Math.abs(a - b) <= SIZE_TOL * Math.max(a, b);
}

/**
 * Gather runs into lines, then lines into blocks.
 *
 * Two passes rather than one because the two questions have different answers.
 * "Are these on the same line?" is about vertical bands and nothing else — a
 * headline is often delivered as one run per word, with wide gaps. "Are these
 * lines the same block?" additionally needs horizontal overlap, because two
 * columns of identical body copy are at identical heights in identical type and
 * only their x tells them apart.
 */
export function blocksFrom(runs: PdfTextRun[]): Block[] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);

  // Pass one: lines.
  interface Line { x: number; y: number; w: number; size: number; font: string; parts: PdfTextRun[] }
  const lines: Line[] = [];
  for (const run of sorted) {
    // Runs arrive left-to-right within a band, so a candidate line is one this run
    // CONTINUES — same band, same type, and close enough horizontally to be the
    // same line rather than the next column. Nearest wins, so a run between two
    // columns joins the one it actually touches.
    let line: Line | undefined;
    let nearest = Infinity;
    for (const l of lines) {
      if (!sameSize(l.size, run.size)) continue;
      if (bandOverlap(l.y, l.size, run.y, run.size) < LINE_OVERLAP) continue;
      const gap = run.x - (l.x + l.w);
      if (gap > LINE_GAP * l.size) continue;
      const distance = Math.abs(gap);
      if (distance < nearest) {
        nearest = distance;
        line = l;
      }
    }
    if (line) {
      line.parts.push(run);
      const right = Math.max(line.x + line.w, run.x + run.w);
      line.x = Math.min(line.x, run.x);
      line.w = right - line.x;
      line.y = Math.min(line.y, run.y);
      line.size = Math.max(line.size, run.size);
    } else {
      lines.push({ x: run.x, y: run.y, w: run.w, size: run.size, font: run.font, parts: [run] });
    }
  }
  const laid = lines
    .map((l) => {
      const parts = [...l.parts].sort((a, b) => a.x - b.x);
      let text = '';
      let cursor = -Infinity;
      for (const p of parts) {
        if (text && p.x - cursor > WORD_GAP * l.size && !/\s$/.test(text)) text += ' ';
        text += p.text;
        cursor = p.x + p.w;
      }
      return { ...l, text: text.replace(/\s+/g, ' ').trim() };
    })
    .filter((l) => l.text)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Pass two: blocks.
  const blocks: Block[] = [];
  for (const line of laid) {
    const h = Math.max(line.size * LINE_BOX, line.size);
    const prev = blocks.find(
      (b) =>
        b.font === line.font &&
        sameSize(b.size, line.size) &&
        spanOverlap(b.x, b.w, line.x, line.w) >= COLUMN_OVERLAP &&
        line.y - (b.y + b.h) <= BLOCK_GAP * line.size &&
        line.y >= b.y,
    );
    if (prev) {
      prev.text += '\n' + line.text;
      const right = Math.max(prev.x + prev.w, line.x + line.w);
      const bottom = Math.max(prev.y + prev.h, line.y + h);
      prev.x = Math.min(prev.x, line.x);
      prev.w = right - prev.x;
      prev.h = bottom - prev.y;
      prev.lines += 1;
    } else {
      blocks.push({ x: line.x, y: line.y, w: line.w, h, text: line.text, size: line.size, font: line.font, lines: 1 });
    }
  }
  return blocks;
}

/**
 * The page's BODY size — the type most of its words are set in.
 *
 * Weighted by characters, not by block count. A page with one paragraph and nine
 * small credits has nine blocks of furniture and one of prose; counting blocks
 * makes the furniture the body and reports the actual body copy as a headline.
 */
export function bodySizeOf(blocks: Block[]): number {
  if (blocks.length === 0) return 0;
  const weight = new Map<number, number>();
  for (const b of blocks) {
    // Bucket to a tenth of a point so 11.04 and 11 are the same typeface size.
    const key = Math.round(b.size * 10) / 10;
    weight.set(key, (weight.get(key) ?? 0) + b.text.length);
  }
  let best = blocks[0]!.size;
  let most = -1;
  for (const [size, chars] of weight) {
    if (chars > most) {
      most = chars;
      best = size;
    }
  }
  return best;
}

/** Which picture, if any, this block is captioning. */
function captions(block: Block, images: PdfImageBox[]): boolean {
  return images.some(
    (img) =>
      spanOverlap(block.x, block.w, img.x, img.w) >= 0.5 &&
      block.y >= img.y + img.h - 1 &&
      block.y - (img.y + img.h) <= CAPTION_GAP * block.size,
  );
}

/**
 * What each block IS. The one genuinely inferred field, and the only place that
 * infers it.
 *
 * Everything keys off the page's own body size rather than absolute points,
 * because a headline is only a headline relative to what surrounds it: 14pt is a
 * headline on a page set in 8pt and a caption on a poster.
 */
export function rolesFor(blocks: Block[], images: PdfImageBox[]): LeafRole[] {
  const body = bodySizeOf(blocks);
  if (!(body > 0)) return blocks.map(() => 'body');
  let biggest = -1;
  let biggestAt = -1;
  blocks.forEach((b, i) => {
    if (b.size > biggest) {
      biggest = b.size;
      biggestAt = i;
    }
  });
  const headline = biggest / body >= HEADLINE_RATIO && biggestAt >= 0 ? blocks[biggestAt]! : null;

  return blocks.map((b, i) => {
    const ratio = b.size / body;
    // Exactly one headline. A page with three equally large blocks has a headline
    // and two subheads, which is what a designer would call them.
    if (i === biggestAt && ratio >= HEADLINE_RATIO) return 'headline';
    if (ratio >= SUBHEAD_RATIO) return 'subhead';
    // A KICKER IS DEFINED BY WHERE IT IS, NOT BY BEING TINY. The strap over a
    // headline is often only slightly smaller than body copy — a size-only rule
    // (this was `ratio <= SMALL_RATIO`) called it body text and the composition
    // lost the one element that says what section the page belongs to. What makes
    // it a kicker is that it is short, on its own line, and sits immediately above
    // the headline and across it.
    if (
      headline &&
      b !== headline &&
      b.lines === 1 &&
      ratio <= 1.05 &&
      b.text.length <= LABEL_CHARS &&
      b.y + b.h <= headline.y + 1 &&
      headline.y - (b.y + b.h) <= KICKER_REACH * b.size &&
      spanOverlap(b.x, b.w, headline.x, headline.w) >= 0.3
    ) {
      return 'kicker';
    }
    if (ratio <= SMALL_RATIO) {
      if (captions(b, images)) return 'caption';
      if (b.lines === 1 && b.text.length <= LABEL_CHARS) return 'label';
    }
    return 'body';
  });
}

/**
 * How many columns the body copy is set in.
 *
 * Counted from the LEFT EDGES of body-sized blocks, because that is what a column
 * grid actually fixes — widths vary with a picture cutting in, right edges vary
 * with ragged setting, but the left edge of a column is the column.
 */
export function columnsOf(blocks: Block[], pageWidth: number): number | undefined {
  const body = bodySizeOf(blocks);
  const prose = blocks.filter((b) => b.lines >= 2 && sameSize(b.size, body));
  if (prose.length < 2) return undefined;
  const tol = pageWidth * 0.02;
  const edges: number[] = [];
  for (const b of [...prose].sort((a, z) => a.x - z.x)) {
    if (!edges.some((e) => Math.abs(e - b.x) <= tol)) edges.push(b.x);
  }
  return edges.length >= 1 ? Math.min(6, edges.length) : undefined;
}

/** The nearest spacing token to a measured inset, as a fraction of page width. */
export function marginToken(insetFrac: number): SpaceToken {
  let best: SpaceToken = 'md';
  let closest = Infinity;
  for (const token of SPACE_TOKENS) {
    const d = Math.abs(SPACE_PX[token] / PAGE_W - insetFrac);
    if (d < closest) {
      closest = d;
      best = token;
    }
  }
  return best;
}

/** Centred or right-set, when the geometry says so unambiguously. Only for a
 *  single line: the last line of a justified paragraph is short and flush left,
 *  and reading that as an alignment would re-set the whole page. */
function alignOf(b: Block, page: { width: number }, content: { x: number; w: number }): TextAlignToken | undefined {
  if (b.lines !== 1) return undefined;
  if (b.w > content.w * 0.7) return undefined;
  const centre = b.x + b.w / 2;
  if (Math.abs(centre - page.width / 2) <= page.width * 0.015) return 'center';
  const flushRight = Math.abs(b.x + b.w - (content.x + content.w)) <= page.width * 0.01;
  const insetLeft = b.x - content.x > page.width * 0.05;
  if (flushRight && insetLeft) return 'right';
  return undefined;
}

/**
 * Turn one measured page into a LayoutReading, or null when there is not enough
 * on it to call a composition.
 *
 * Null is a real answer — the same one readLayoutImage gives for a picture it
 * could not make out — and the caller must say so rather than build from nothing.
 */
export function layoutFromMeasure(page: PdfPageMeasure): LayoutReading | null {
  const { width, height } = page;
  if (!(width > 0 && height > 0)) return null;
  const blocks = blocksFrom(page.runs);
  const roles = rolesFor(blocks, page.images);
  const pageArea = width * height;

  // A picture covering the page is its ground, not a region on it. Kept out of the
  // regions AND used to set the background, so a full-bleed cover reads as one
  // photograph behind the type rather than a photo-shaped hole with type beside it.
  const bleed = page.images.filter((i) => (i.w * i.h) / pageArea >= FULL_BLEED_AREA);
  const pictures = page.images.filter((i) => !bleed.includes(i));

  const all = [
    ...blocks.map((b, i) => ({ x: b.x, y: b.y, w: b.w, h: b.h, block: b, role: roles[i]! })),
    ...pictures.map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h, block: null, role: 'image' as LeafRole })),
  ];
  if (all.length < 2) return null;

  const left = Math.min(...all.map((r) => r.x));
  const right = Math.max(...all.map((r) => r.x + r.w));
  const top = Math.min(...all.map((r) => r.y));
  const content = { x: left, w: right - left };
  // The horizontal inset, which is the one a reader perceives as "the margin".
  // Vertical inset varies with whether the page happens to start on a headline.
  const inset = Math.min(left, width - right, top) / width;

  const regions: ReadRegion[] = all.map((r) => {
    const region: Record<string, unknown> = {
      role: r.role,
      box: { x: r.x / width, y: r.y / height, w: r.w / width, h: r.h / height },
    };
    if (r.block) {
      // MEASURED, all of it — sizeFrac is defined as a fraction of page height,
      // which is exactly what we have.
      region.sizeFrac = r.block.size / height;
      region.chars = r.block.text.length;
      if (r.block.text.length <= MAX_REGION_TEXT) region.text = r.block.text;
      const align = alignOf(r.block, { width }, content);
      if (align) region.align = align;
      const ratio = r.block.size / Math.max(1e-6, bodySizeOf(blocks));
      region.emphasis = ratio >= HEADLINE_RATIO ? 'dominant' : ratio <= SMALL_RATIO ? 'quiet' : 'normal';
    }
    return region as unknown as ReadRegion;
  });

  return normalizeLayoutReading({
    aspect: width / height,
    // 'dark' is deliberately never claimed: it is a statement about ink on paper
    // and nothing here has looked at a pixel. A full-bleed picture we CAN see, so
    // that is the one background this reading is entitled to report.
    background: bleed.length > 0 ? 'photo' : 'light',
    margin: marginToken(inset),
    columns: columnsOf(blocks, width),
    regions,
    // Measured, not estimated. The only reading in this system honestly entitled
    // to say so — every field above came off the file rather than out of a model.
    confidence: 1,
  });
}
