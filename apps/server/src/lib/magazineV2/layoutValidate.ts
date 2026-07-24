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

export interface LayoutIssue {
  kind: 'overlap' | 'out-of-bounds' | 'overflow';
  detail: string;
}
export interface LayoutReport {
  ok: boolean;
  issues: LayoutIssue[];
}

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
      if (intersectionArea(a, b) > smaller * 0.2) {
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

  return { ok: issues.length === 0, issues };
}
