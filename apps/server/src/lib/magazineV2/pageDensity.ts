// ---------------------------------------------------------------------------
// Magazine Builder v2 — is this page substantial enough to ship?
//
// The generator has always had a sparseness gate, but its bar was **2** real
// elements for every interior page and the COVER was exempt from it entirely.
// Two. So an art-director allowed 14 leaves could return 6 and pass, and a cover
// with a photograph and no words at all passed as well — which is exactly what
// shipped (docs/MAGAZINE-V2-BUILDER-PLAN.md §4b).
//
// The bar is per page KIND, because a pull-quote page is legitimately spare and a
// contents page is not, and the numbers are set where the art-director already
// reaches when it is working properly. The gate is deliberately NOT set at the
// reference's density: failing it drops the page to the fixed-template path, which
// costs the issue its variety, so a bar the model can't clear would make the
// magazine worse rather than denser. Raising these numbers is Phase 1.5b's job,
// together with the leaf cap and composite leaves.
//
// FURNITURE NEVER COUNTS. A running head and a folio are chrome, not substance,
// so pages are measured with them excluded — regardless of whether they have been
// added yet. Without that, adding furniture would have silently lowered the bar
// by three.
//
// Pure + server-safe: no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';
import type { PageTemplateKind } from './templates.js';
import { FURNITURE_IDS } from './pageFurniture.js';

/**
 * The fewest real content elements a page of each kind may ship with.
 *
 * Grounded in the naming conventions the copywriter already works to, so each
 * number is reachable without a new device: `contents` writes entry1…entry5 plus a
 * title (6); `stat-infographic` writes stat1–3 with label1–3 plus a headline (7);
 * an article has a headline, a deck, two body columns and a photo (5). Cover is
 * title + subtitle + hero + one more (4) — the page where a fallback to the fixed
 * template is the SAFEST outcome, which is why its bar is the least conservative.
 */
export const MIN_ELEMENTS: Record<PageTemplateKind, number> = {
  cover: 4,
  contents: 6,
  'feature-full-bleed': 4,
  'two-column-article': 5,
  'photo-grid': 5,
  'pull-quote': 3,
  'stat-infographic': 6,
  'back-cover': 3,
};

const FURNITURE = new Set<string>(FURNITURE_IDS);

/** Text with real copy, or an image with a real photo. A tinted block standing in
 *  for a photo that never loaded is not content, and neither is a bare shape. */
function isMeaningful(el: MagazineElement): boolean {
  if (FURNITURE.has(el.id)) return false;
  if (el.type === 'text') return !!el.text?.content?.trim();
  if (el.type === 'image') return !!el.image?.url;
  return false;
}

export interface Density {
  meaningful: number;
  min: number;
  tooSparse: boolean;
}

export function densityOf(elements: MagazineElement[], kind: PageTemplateKind): Density {
  const meaningful = elements.filter(isMeaningful).length;
  const min = MIN_ELEMENTS[kind];
  return { meaningful, min, tooSparse: meaningful < min };
}

/**
 * What to tell the art-director when a page failed the density gate.
 *
 * It names the count and the target, and it says DO NOT SIMPLIFY out loud: the
 * retry wrapper used to append "use fewer/shorter leaves or a simpler tree" to
 * every hint, which for a sparseness failure is the exact opposite of the fix.
 */
export function densityHint(d: Density, kind: PageTemplateKind): string {
  return (
    `the page was too sparse — only ${d.meaningful} real content element${d.meaningful === 1 ? '' : 's'}, ` +
    `and a "${kind}" page needs at least ${d.min}. ADD substance — a kicker, a deck, two body paragraphs, ` +
    `a stat trio, an icon feature row, a caption, a QR call-to-action — and do NOT simplify or shorten the tree`
  );
}
