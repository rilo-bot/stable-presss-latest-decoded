// ---------------------------------------------------------------------------
// Magazine Builder v2 — page FURNITURE: the running head and the folio.
//
// Every page of a real magazine carries chrome the article itself never mentions:
// a section label at the top, the publication's name beside it, a hairline rule,
// and a page number at the foot. Our generated pages carried NONE of it — that
// absence is most of why a technically-correct page still reads as a slide rather
// than a spread (docs/MAGAZINE-V2-BUILDER-PLAN.md §4b).
//
// This is DETERMINISTIC, not authored by the AI, and it costs nothing from the
// art-director's leaf budget — which is the point: it is the cheapest possible
// "looks like a publication" gain, and it repeats on every page.
//
// TWO RULES MAKE IT SAFE TO ADD AFTER LAYOUT QA HAS ALREADY PASSED:
//
//  1. The bands are MEASURED, never assumed. `freeBands` reads the composed
//     elements and reports how much clear space each edge actually has. On the
//     AI path that is the page margin the solver inset by; on the fixed-template
//     path it is whatever the template happened to leave. Furniture is emitted
//     only into space that is provably empty, so it cannot overlap content and
//     cannot turn a page that passed QA into one that would fail it.
//  2. The ground must be KNOWABLE. A page whose background is an image (an
//     imported/rasterised page) or an unparseable paint gets no furniture at
//     all, because we would be guessing at contrast. Where the ground IS known
//     — a flat hex, or the generated diagonal gradient, whose stops we read —
//     the ink is checked against EVERY stop, not just one.
//
// Cover and back-cover are skipped by convention: a magazine cover carries no
// folio and no running head, and those two pages are also the most likely to be
// full-bleed artwork.
//
// Furniture is emitted as ordinary elements (not renderer chrome) so it is
// selectable, movable and deletable like everything else on the page. The folio
// therefore has to be RE-STAMPED when page order changes — see restampFolio and
// its single call site in the pages route's writeOrder.
//
// Pure + server-safe: no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import { PAGE_W, PAGE_H } from './config.js';
import { contrastRatio, fitFontSize } from './layout.js';
import type { MagazineElement, ElementTextAlign } from './model.js';
import { normalizeElements } from './writePipeline.js';
import type { GenFonts, GenPalette, PageTemplateKind } from './templates.js';

/** The smallest clear band (px) a running head or folio can live in. Sized to be
 *  exactly what one line plus its rule needs, so the default page margin
 *  (`md` = 36px) is enough and a tighter one is honestly refused. */
export const BAND_MIN = 34;

const RULE_H = 2; // hairline
const RULE_GAP = 7; // between the rule and the line of type
const EDGE_GAP = 5; // between the rule and the band's outer (content-facing) edge
const FONT_MAX = 16; // ≈7.7pt at 150 DPI — running-head/folio size
const FONT_MIN = 11;
const LINE = 1.2;
const TEXT_H = Math.ceil(FONT_MAX * LINE); // one line at the largest size
const INSET_MIN = 36; // SPACE_PX.md — never tighter than the default margin
const INSET_MAX = 96; // SPACE_PX.xl — never wider than the widest margin
const RULE_OPACITY = 0.28;
const MAX_LABEL = 48;
const MAX_TITLE = 40;
const MIN_CONTRAST = 3.5; // matches layout.readableColor's bar for display type
const Z_TEXT = 990;
const Z_RULE = 989;

/** Stable element ids. They let the folio be found again (restampFolio) and let a
 *  later pass strip or restyle furniture without guessing from geometry. */
export const FOLIO_ELEMENT_ID = 'furniture-folio';
const HEAD_LABEL_ID = 'furniture-head-label';
const HEAD_TITLE_ID = 'furniture-head-title';
const HEAD_RULE_ID = 'furniture-head-rule';
const FOLIO_RULE_ID = 'furniture-folio-rule';

/** Every furniture element id, so callers can recognise (or strip) the whole set. */
export const FURNITURE_IDS: readonly string[] = [
  HEAD_LABEL_ID,
  HEAD_TITLE_ID,
  HEAD_RULE_ID,
  FOLIO_ELEMENT_ID,
  FOLIO_RULE_ID,
];

/** The running-head label when the planner gave the page no section title. */
const KIND_LABEL: Record<PageTemplateKind, string> = {
  cover: 'Cover',
  contents: 'In this issue',
  'feature-full-bleed': 'Feature',
  'two-column-article': 'Feature',
  'photo-grid': 'Gallery',
  'pull-quote': 'In their words',
  'stat-infographic': 'By the numbers',
  'back-cover': 'Back cover',
};

export interface FurnitureContext {
  /**
   * The page's template kind, when the caller knows it. Covers and back covers get no
   * chrome at all, and it is the FALLBACK source for the running-head label.
   *
   * Optional because not every caller can know it: a page document stores its elements
   * and its index, not its kind, so the reference path rebuilding an existing page has
   * no kind to give. Such a caller supplies the label itself (see `refurnish`) and gets
   * no KIND_LABEL fallback — which is right, since inventing "Feature" for a page whose
   * running head deliberately had no label would be putting words back that were
   * deliberately left out.
   */
  kind?: PageTemplateKind;
  sectionTitle: string;
  magazineTitle: string;
  pageNumber: number;
  palette: GenPalette;
  fonts: GenFonts;
}

/** What a page must look like to be furnished — structurally a ComposedPage,
 *  declared here so this module never imports generate.ts (and its DB). */
export interface FurnishablePage {
  background: { type: 'color' | 'image'; value: string };
  elements: MagazineElement[];
}

/** Compare text as a reader would see it: case, punctuation and spacing don't make two
 *  identical phrases different. Strips inline HTML too — element copy may carry it. */
function normalizeWords(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '').trim() + '…';
}

/** How much provably-clear space each edge of the page has. */
export function freeBands(elements: MagazineElement[]): { top: number; bottom: number; left: number; right: number } {
  let top = PAGE_H;
  let bottom = PAGE_H;
  let left = PAGE_W;
  let right = PAGE_W;
  for (const el of elements) {
    top = Math.min(top, el.y);
    bottom = Math.min(bottom, PAGE_H - (el.y + el.h));
    left = Math.min(left, el.x);
    right = Math.min(right, PAGE_W - (el.x + el.w));
  }
  return {
    top: Math.max(0, top),
    bottom: Math.max(0, bottom),
    left: Math.max(0, left),
    right: Math.max(0, right),
  };
}

/**
 * Every flat colour the page ground can present under the furniture, or null when
 * it is unknowable. `composeFromSolved` paints a bold background as a three-stop
 * diagonal gradient, so a single "the background is X" reading would be wrong at
 * two of its three stops — we take them all and require the ink to work on each.
 */
function groundStops(background: FurnishablePage['background']): string[] | null {
  if (background.type !== 'color') return null; // a photo ground — we cannot know it
  const found = background.value.match(/#[0-9a-fA-F]{6}/g);
  if (!found || found.length === 0) return null; // a paint we don't understand — don't guess
  return found.map((h) => h.toLowerCase());
}

/** `desired` if it reads on EVERY ground stop, else whichever palette extreme has
 *  the best worst-case contrast. Same shape as layout.readableColor, but plural. */
function readableOn(desired: string, grounds: string[], light: string, dark: string): string {
  const worst = (c: string) => Math.min(...grounds.map((g) => contrastRatio(c, g)));
  if (worst(desired) >= MIN_CONTRAST) return desired;
  return worst(light) >= worst(dark) ? light : dark;
}

/** Recto (odd) pages carry the folio at the outer — right — edge, verso at the left. */
function folioAlign(pageNumber: number): ElementTextAlign {
  return pageNumber % 2 === 1 ? 'right' : 'left';
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function line(
  id: string,
  box: Box,
  content: string,
  style: {
    color: string;
    fontFamily: string;
    fontWeight: 400 | 500 | 600 | 700;
    align: ElementTextAlign;
    letterSpacing: number;
    uppercase?: boolean;
  },
): unknown {
  // A FIXED size with autoFit 'clip': furniture must not be re-fitted on every
  // later write (refitText only touches shrink-with-a-maxFontSize text), because a
  // running head that quietly shrank to its 55% floor would be 4pt in print. The
  // size is chosen here to fit one line, and over-long strings are truncated
  // rather than shrunk.
  const fontSize = fitFontSize({
    text: content,
    boxW: box.w,
    boxH: box.h,
    maxFontSize: FONT_MAX,
    minFontSize: FONT_MIN,
    lineHeight: LINE,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    maxLines: 1,
    letterSpacing: style.letterSpacing,
    textTransform: style.uppercase ? 'uppercase' : 'none',
  });
  return {
    id,
    type: 'text',
    ...box,
    rotation: 0,
    zIndex: Z_TEXT,
    locked: false,
    source: 'ai-agent',
    text: {
      content,
      role: 'other', // chrome, not editorial copy — and so it never counts as content
      fontFamily: style.fontFamily,
      fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      align: style.align,
      lineHeight: LINE,
      autoFit: 'clip',
      letterSpacing: style.letterSpacing,
      ...(style.uppercase ? { textTransform: 'uppercase' } : {}),
    },
  };
}

function rule(id: string, box: Box, color: string): unknown {
  return {
    id,
    type: 'shape',
    ...box,
    rotation: 0,
    zIndex: Z_RULE,
    locked: false,
    source: 'ai-agent',
    shape: { fill: color, opacity: RULE_OPACITY },
  };
}

/**
 * The furniture for one composed page, already validated — or an empty array when
 * the page cannot carry any (see the two safety rules in the file header). Append
 * it to the page's own elements; never let it replace them.
 */
export function pageFurniture(page: FurnishablePage, ctx: FurnitureContext): MagazineElement[] {
  if (ctx.kind === 'cover' || ctx.kind === 'back-cover') return [];
  if (page.elements.length === 0) return []; // nothing composed → nothing to furnish
  const grounds = groundStops(page.background);
  if (!grounds) return [];

  const band = freeBands(page.elements);
  const inset = Math.min(INSET_MAX, Math.max(INSET_MIN, Math.min(band.left, band.right)));
  const contentW = PAGE_W - 2 * inset;
  if (contentW < 200) return [];

  const ink = readableOn(ctx.palette.primary, grounds, ctx.palette.bg, ctx.palette.text);
  const soft = readableOn(ctx.palette.secondary, grounds, ctx.palette.bg, ctx.palette.text);
  const raw: unknown[] = [];

  if (band.top >= BAND_MIN) {
    // Anchored to the band's INNER edge, so the head sits with the content rather
    // than drifting to the paper edge as the margin grows.
    const ruleY = band.top - EDGE_GAP - RULE_H;
    const textY = ruleY - RULE_GAP - TEXT_H;
    // WORDS ALREADY ON THE PAGE ARE NOT A RUNNING HEAD.
    //
    // The copywriter is told a kicker is "a 2–4 word SECTION TAG", so it lands on the
    // section title almost every time — and a real page came out reading
    // "Reading the Walk" in the running head directly above "READING THE WALK" as the
    // kicker. Comparing against the magazine title alone (the first version of this)
    // missed it entirely, because the duplicate is the AI's own copy, not the masthead.
    const onPage = new Set(
      page.elements
        .filter((e) => e.type === 'text' && e.text?.content)
        .map((e) => normalizeWords(e.text!.content)),
    );
    // EVERY candidate is checked, including the fallback. The first version of this
    // guarded the section title and then fell back to KIND_LABEL — and for
    // `stat-infographic` that label is "By the numbers", which is exactly the kicker the
    // copywriter writes for such a page. So a real page shipped reading "By the numbers"
    // directly above "BY THE NUMBERS". Guarding one door and leaving the other open is
    // the same bug twice; if nothing survives, the page simply gets no label.
    const label =
      [
        truncate(ctx.sectionTitle, MAX_LABEL),
        ctx.kind ? truncate(KIND_LABEL[ctx.kind], MAX_LABEL) : '',
      ].find((c) => !!c && !onPage.has(normalizeWords(c))) ?? '';
    const title = truncate(ctx.magazineTitle, MAX_TITLE);
    const showTitle =
      !!title && (!label || normalizeWords(title) !== normalizeWords(label)) && !onPage.has(normalizeWords(title));
    // With no label the masthead becomes the whole running head rather than hanging off
    // the right of an empty measure.
    const labelW = !label ? 0 : showTitle ? Math.round(contentW * 0.62) : contentW;
    if (label) {
      raw.push(
        line(HEAD_LABEL_ID, { x: inset, y: textY, w: labelW, h: TEXT_H }, label, {
          color: ink,
          fontFamily: ctx.fonts.body,
          fontWeight: 700,
          align: 'left',
          letterSpacing: 2,
          uppercase: true,
        }),
      );
    }
    if (showTitle) {
      const titleX = inset + labelW;
      raw.push(
        line(HEAD_TITLE_ID, { x: titleX, y: textY, w: PAGE_W - inset - titleX, h: TEXT_H }, title, {
          color: soft,
          fontFamily: ctx.fonts.body,
          fontWeight: 500,
          align: 'right',
          letterSpacing: 1,
        }),
      );
    }
    if (raw.length > 0) raw.push(rule(HEAD_RULE_ID, { x: inset, y: ruleY, w: contentW, h: RULE_H }, ink));
  }

  if (band.bottom >= BAND_MIN) {
    const ruleY = PAGE_H - band.bottom + EDGE_GAP;
    const textY = ruleY + RULE_H + RULE_GAP;
    raw.push(rule(FOLIO_RULE_ID, { x: inset, y: ruleY, w: contentW, h: RULE_H }, ink));
    // Full content width at every parity, so re-stamping after a reorder only ever
    // rewrites the string and its alignment — never the geometry.
    raw.push(
      line(FOLIO_ELEMENT_ID, { x: inset, y: textY, w: contentW, h: TEXT_H }, String(ctx.pageNumber), {
        color: soft,
        fontFamily: ctx.fonts.body,
        fontWeight: 600,
        align: folioAlign(ctx.pageNumber),
        letterSpacing: 1,
      }),
    );
  }

  if (raw.length === 0) return [];
  return normalizeElements(raw, { width: PAGE_W, height: PAGE_H });
}

/** What a REBUILD needs to put a page's chrome back: everything `FurnitureContext` has
 *  except the two things a stored page cannot tell you — its kind and its section. */
export interface RefurnishContext {
  magazineTitle: string;
  pageNumber: number;
  palette: GenPalette;
  fonts: GenFonts;
}

/**
 * Put a REARRANGED page's chrome back, taking its wording from the chrome it had.
 *
 * "Take this layout" replaces every element on a page, which used to take the running
 * head and the folio with it — measured: `furniture ids surviving: 0`, the folio's digit
 * glued onto the end of the article, and a fidelity report of 81% "matched" printed over
 * the top. Losing the folio is the worse half: `restampFolio` finds it by id, so a page
 * that loses it drops out of `renumberFolios` permanently and can never be renumbered
 * again by a later reorder.
 *
 * RE-DERIVED, NOT RE-ATTACHED. The old boxes were measured against the old layout, and
 * the new one may well have taken the top band; `pageFurniture` reads the free bands of
 * the page it is handed and emits nothing where there is no room. The WORDING, though, is
 * the page's own: the section label is read back off the previous running head rather
 * than guessed, so a page that said "Stable Life" still says "Stable Life", and a page
 * that deliberately carried no label (because it duplicated the kicker) does not acquire
 * one from a fallback.
 *
 * A page that had no chrome to begin with — a cover, a back cover — gets none back.
 */
export function refurnish(
  previous: MagazineElement[],
  page: FurnishablePage,
  ctx: RefurnishContext,
): MagazineElement[] {
  if (!previous.some((e) => FURNITURE_IDS.includes(e.id))) return [];
  const label = previous.find((e) => e.id === HEAD_LABEL_ID && e.type === 'text')?.text?.content ?? '';
  return pageFurniture(page, {
    sectionTitle: label,
    magazineTitle: ctx.magazineTitle,
    pageNumber: ctx.pageNumber,
    palette: ctx.palette,
    fonts: ctx.fonts,
  });
}

/**
 * Re-number a page's folio after its position in the issue changed, returning the
 * new element array — or null when there is nothing to do (no folio on this page,
 * or it already says the right thing) so the caller can skip the write.
 *
 * The folio is a real element rather than renderer chrome, which is what makes it
 * editable — and what makes this necessary: without it, moving page 7 to the front
 * would leave it printing "7". Geometry never changes here (the folio box always
 * spans the full content width), only the number and which edge it hugs.
 */
export function restampFolio(elements: MagazineElement[], pageNumber: number): MagazineElement[] | null {
  const idx = elements.findIndex((e) => e.id === FOLIO_ELEMENT_ID && e.type === 'text' && !!e.text);
  if (idx < 0) return null;
  const el = elements[idx]!;
  const content = String(pageNumber);
  const align = folioAlign(pageNumber);
  if (el.text!.content === content && el.text!.align === align) return null;
  const next = elements.slice();
  next[idx] = { ...el, text: { ...el.text!, content, align } };
  return next;
}
