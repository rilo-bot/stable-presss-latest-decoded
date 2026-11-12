// ---------------------------------------------------------------------------
// Magazine Builder v2 — deterministic layout QA for a composed page.
//
// Runs after fitting + validation and answers one question: "does this page look
// OK, or should we fall back to the safe template?" It flags content boxes that
// collide, escape the page, or hold text that still overflows after fitting.
// Intentional stacks (text over a full-bleed image/scrim) are NOT flagged — a big
// background element is recognised and excluded. Pure + server-safe.
//
// Ported verbatim from the campaign-hq reference (packages/blocks/src/layoutValidate.ts).
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';
import { estimateTextHeight } from './layout.js';
import { FURNITURE_IDS } from './pageFurniture.js';
import { SLACK_AT, SLACK_SERIOUS_SHARE } from './fitReport.js';
import { imageShapeProblem, deadBands, coverage, HIDING_OPACITY, type Band, type ImageShapeProblem } from './layoutQuality.js';

export interface LayoutIssue {
  /**
   * The first three are HARD: they decide `ok` and send a page to the fallback. The last
   * three are QUALITY advisories (see `advisories` below): a photo cut into a sliver, a
   * text box far bigger than the type in it, and a full-width stripe nothing prints on.
   */
  kind: 'overlap' | 'out-of-bounds' | 'overflow' | 'sliver' | 'empty-box' | 'dead-band';
  detail: string;
}
export interface LayoutReport {
  ok: boolean;
  /** Hard defects only — what `ok` is computed from. Unchanged in meaning, because two
   *  callers fail a page on ANY entry here (generate's QA, and applyLayout's `fatal`). */
  issues: LayoutIssue[];
  /**
   * Quality defects that never make a page illegal on their own — a sliver photo, an
   * oversize empty box, a dead band. They are what the repair loop and the Adjust pass
   * act on, and what used to be invisible: a page carrying all three measured `ok`.
   */
  advisories: LayoutIssue[];
}

/** The most of a photo another photo may cover before the lower one stops counting as
 *  seen (a collage overlap is typically 10–30%). */
export const COLLAGE_MAX_HIDDEN = 0.4;

function area(el: MagazineElement): number {
  return Math.max(0, el.w) * Math.max(0, el.h);
}

function intersectionArea(a: MagazineElement, b: MagazineElement): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/** A "background" element is one meant to sit behind content — a large image or
 *  shape (scrim/panel) covering a big share of the page. Text/qr over these is
 *  intentional, so they're excluded from overlap checks. */
function isBackground(el: MagazineElement, pageArea: number): boolean {
  if (el.type !== 'image' && el.type !== 'shape') return false;
  return area(el) >= pageArea * 0.5;
}

/**
 * Check a composed page's geometry. Returns ok:false with issues when the page
 * would render poorly (colliding content, off-page boxes, or text that can't
 * fit even after shrinking) — the caller then swaps to the safe template.
 */
export function validatePageLayout(
  elements: MagazineElement[],
  page: { width: number; height: number },
): LayoutReport {
  const issues: LayoutIssue[] = [];
  const pageArea = page.width * page.height;
  const tol = Math.max(4, page.width * 0.004); // a few px of slack

  // 1. Out of bounds.
  for (const el of elements) {
    if (el.x < -tol || el.y < -tol || el.x + el.w > page.width + tol || el.y + el.h > page.height + tol) {
      issues.push({ kind: 'out-of-bounds', detail: `${el.type} ${el.id} escapes the page` });
    }
  }

  // 2. Genuine collisions only. Text over a shape (bar/panel/scrim) or over an
  // image is intentional layering, not a bug — so we ONLY flag two elements of
  // the SAME content type colliding: text-on-text or photo-on-photo. (Shapes
  // are always decorative backing and never counted.) This is the real defect
  // the user sees; fitting keeps text in its box, so it should never trip
  // unless a template itself has overlapping same-type slots.
  const collidable = (el: MagazineElement) =>
    (el.type === 'text' || el.type === 'image') && !isBackground(el, pageArea);
  const content = elements.filter(collidable);
  for (let i = 0; i < content.length; i++) {
    for (let j = i + 1; j < content.length; j++) {
      const a = content[i]!;
      const b = content[j]!;
      if (a.type !== b.type) continue; // cross-type overlap = intentional layering
      const smaller = Math.min(area(a), area(b));
      if (smaller <= 0) continue;
      const shared = intersectionArea(a, b);
      if (a.type === 'image') {
        // PHOTO ON PHOTO is a collage when the one underneath still mostly shows — an
        // inset over a hero, a tilted print overlapping its neighbour. It is a defect
        // only when the lower photo is mostly HIDDEN (then it is a picture nobody sees).
        const lower = a.zIndex <= b.zIndex ? a : b;
        if (shared > area(lower) * COLLAGE_MAX_HIDDEN) {
          issues.push({ kind: 'overlap', detail: `image ${b === lower ? a.id : b.id} hides most of image ${lower.id}` });
        }
        continue;
      }
      if (shared > smaller * 0.2) {
        issues.push({ kind: 'overlap', detail: `${a.type} ${a.id} overlaps ${b.type} ${b.id}` });
      }
    }
  }

  // 3. Text that still overflows its box after fitting (fit hit its floor).
  for (const el of elements) {
    if (el.type !== 'text' || !el.text?.content) continue;
    const h = estimateTextHeight({
      text: el.text.content,
      fontSize: el.text.fontSize,
      boxWidthPx: el.w,
      lineHeight: el.text.lineHeight,
      fontFamily: el.text.fontFamily,
      fontWeight: el.text.fontWeight,
      letterSpacing: el.text.letterSpacing,
      textTransform: el.text.textTransform,
    });
    if (h > el.h * 1.25) {
      issues.push({ kind: 'overflow', detail: `text ${el.id} overflows its box` });
    }
  }

  return { ok: issues.length === 0, issues, advisories: qualityIssues(elements, page) };
}

// ── Quality advisories ────────────────────────────────────────────────────────

const isFurniture = (el: MagazineElement) => FURNITURE_IDS.includes(el.id);

/** The vertical extent a text element actually prints, per its own type and vAlign. */
export function textInk(el: MagazineElement): { y: number; h: number } | null {
  if (el.type !== 'text' || !el.text) return null;
  if (!el.text.content.replace(/<[^>]+>/g, '').trim()) return null;
  const need = estimateTextHeight({
    text: el.text.content,
    fontSize: el.text.fontSize,
    boxWidthPx: el.w,
    lineHeight: el.text.lineHeight,
    fontFamily: el.text.fontFamily,
    fontWeight: el.text.fontWeight,
    letterSpacing: el.text.letterSpacing,
    textTransform: el.text.textTransform,
  });
  const h = Math.min(el.h, need);
  const y = el.text.vAlign === 'bottom' ? el.y + el.h - h : el.text.vAlign === 'center' ? el.y + (el.h - h) / 2 : el.y;
  return { y, h };
}

/** A shape laid over a photo is its scrim — the photo's tint, not ink of its own. */
function isScrimEl(el: MagazineElement, all: MagazineElement[]): boolean {
  return el.type === 'shape' && all.some((o) => o !== el && o.type === 'image' && o.zIndex <= el.zIndex && coverage(o, el) > 0);
}

export interface PageQuality {
  slivers: { id: string; problem: ImageShapeProblem }[];
  emptyBoxes: { id: string; boxH: number; inkH: number; share: number }[];
  deadBands: Band[];
}

/**
 * The three quality measures for a composed page — element-level, so they work on ANY
 * page (generated, imported, hand-edited, or one generated before these rules existed).
 * Furniture (running head, folio, rules) is chrome and is left out of every measure.
 */
export function pageQuality(elements: MagazineElement[], page: { width: number; height: number }): PageQuality {
  const pageArea = Math.max(1, page.width * page.height);
  const els = elements.filter((e) => !isFurniture(e));
  const slivers: PageQuality['slivers'] = [];
  const emptyBoxes: PageQuality['emptyBoxes'] = [];
  const ink: { y: number; h: number }[] = [];
  for (const el of els) {
    if (el.type === 'text') {
      const t = textInk(el);
      if (!t) continue;
      ink.push(t);
      const share = ((el.h - t.h) * el.w) / pageArea;
      if (t.h < el.h * SLACK_AT && share >= SLACK_SERIOUS_SHARE) emptyBoxes.push({ id: el.id, boxH: el.h, inkH: Math.round(t.h), share });
      continue;
    }
    if (el.type === 'image') {
      // Backing photo: words sit on it, so its shape is the shape of what it backs.
      const backing = els.some((o) => o.type === 'text' && o.zIndex > el.zIndex && coverage(o, el) >= 0.5);
      if (!backing) {
        const problem = imageShapeProblem(el, page);
        if (problem) slivers.push({ id: el.id, problem });
      }
      const hidden = els.some(
        (o) => o.type === 'shape' && o.zIndex > el.zIndex && coverage(el, o) >= 0.9 && (o.shape?.opacity ?? 1) >= HIDING_OPACITY,
      );
      if (!hidden) ink.push(el);
      continue;
    }
    if (el.type === 'shape') {
      // A sheet-sized shape is the page's ground, and a scrim is its photo's tint; a rule,
      // a bar or a card is ink.
      if ((el.w * el.h) / pageArea >= 0.5 || isScrimEl(el, els)) continue;
      ink.push(el);
      continue;
    }
    ink.push(el); // qr / icon
  }
  return { slivers, emptyBoxes, deadBands: deadBands(ink, page.height) };
}

/** The advisories for a page, in words. */
export function qualityIssues(elements: MagazineElement[], page: { width: number; height: number }): LayoutIssue[] {
  const q = pageQuality(elements, page);
  const out: LayoutIssue[] = [];
  for (const s of q.slivers) out.push({ kind: 'sliver', detail: `image ${s.id}: ${s.problem.detail}` });
  for (const b of q.emptyBoxes) {
    out.push({
      kind: 'empty-box',
      detail: `text ${b.id} is ${b.boxH}px tall but its copy prints only ${b.inkH}px — ${Math.round(b.share * 100)}% of the page left blank inside one box`,
    });
  }
  for (const d of q.deadBands) {
    out.push({ kind: 'dead-band', detail: `nothing prints across the page from y=${d.y0} to y=${d.y1} (${d.y1 - d.y0}px)` });
  }
  return out;
}
