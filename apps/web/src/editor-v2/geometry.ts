// ---------------------------------------------------------------------------
// Magazine Builder v2 — shared geometry. Both the read-only renderer
// (IssuePageCanvas) and the editor's interaction overlay compute element boxes
// from THIS one place, so the editor, the public viewer, and the PDF can never
// disagree about where an element sits.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model';

type Dims = { width: number; height: number };

/** Element box as percentages of the page's own canonical width/height. */
export function pctRect(el: Pick<MagazineElement, 'x' | 'y' | 'w' | 'h'>, page: Dims) {
  return {
    left: `${(el.x / page.width) * 100}%`,
    top: `${(el.y / page.height) * 100}%`,
    width: `${(el.w / page.width) * 100}%`,
    height: `${(el.h / page.height) * 100}%`,
  };
}

/** font-size as a fraction of the page's own width, in container-query units. */
export function fontSizeCqw(fontSizePx: number, pageWidth: number): string {
  return `${(fontSizePx / pageWidth) * 100}cqw`;
}

/** Convert a screen-pixel delta to page-canonical-pixel delta given the rendered
 *  container width. (1 screen px = pageWidth/displayWidth canonical px.) */
export function screenToPage(deltaScreenPx: number, pageDim: number, displayDim: number): number {
  if (displayDim <= 0) return 0;
  return deltaScreenPx * (pageDim / displayDim);
}

/** Clamp an element rect to the page bounds, preserving a minimum size. */
export function clampRect(
  r: { x: number; y: number; w: number; h: number },
  page: Dims,
  min = 2,
): { x: number; y: number; w: number; h: number } {
  const w = Math.max(min, Math.min(r.w, page.width));
  const h = Math.max(min, Math.min(r.h, page.height));
  const x = Math.max(0, Math.min(r.x, page.width - w));
  const y = Math.max(0, Math.min(r.y, page.height - h));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
