/**
 * Page blueprints — the locked NZTROF bulletin content & house styles.
 *
 * PURE DATA (no React) so the magazine store can import `createDefaultPages`
 * without pulling in the editor component tree. Each page exposes an `ids` map
 * (semantic name → globally-unique region id) that its component imports, so
 * region ids are single-sourced and never drift.
 *
 * This module is a barrel: the individual page blueprints live under
 * `./blueprints/`, one file per page group. The shared `PageBlueprint` shape,
 * the `mkPage` factory and reusable builders live in `./blueprints/_shared`.
 * Here we assemble the print-order registry and lookup map.
 */

import type { MagazinePage, PageTypeKey } from '@/types/magazine';
import { type PageBlueprint } from './blueprints/_shared';
import { cover } from './blueprints/cover';
import { president, editor } from './blueprints/president';
import { discussion } from './blueprints/discussion';
import { headline } from './blueprints/headline';
import { young, women } from './blueprints/young-women';
import { regionNorth, regionSouth } from './blueprints/regions';
import { lounge } from './blueprints/owners-lounge';
import { karaka } from './blueprints/karaka';
import { celebration } from './blueprints/celebration';
import { future } from './blueprints/future';
import { breeder } from './blueprints/breeder';
import { welfare, business } from './blueprints/welfare';
import { leaderboards, gamification } from './blueprints/competitions';
import { predictions, followup } from './blueprints/predictions';
import { education } from './blueprints/education';
import { winning, voice } from './blueprints/winning';
import { backCover } from './blueprints/back-cover';
import { PREMIUM_BLUEPRINTS } from './premium/blueprints';

export type { PageBlueprint };
export { FIRST_COVER_IMAGE } from './blueprints/_shared';

// ── Registry of blueprints (print order) ────────────────────────────
export const BLUEPRINTS: PageBlueprint[] = [
  cover, president, editor, discussion, headline, young, women,
  regionNorth, regionSouth, lounge, karaka, celebration, future,
  breeder, welfare, business, leaderboards, gamification, predictions,
  followup, education, winning, voice, backCover,
];

/** Lookup a blueprint by its page type. Premium (#2) blueprints are merged in
 *  for content/reconcile lookups but kept OUT of the classic print-order array
 *  above, so template #1's default document is unaffected. */
export const BLUEPRINT_BY_TYPE: Record<string, PageBlueprint> = Object.fromEntries(
  [...BLUEPRINTS, ...PREMIUM_BLUEPRINTS].map((b) => [b.pageType, b])
);

/** Page types offered in the editor's "add page" picker, in canonical order. */
export const PAGE_TYPE_OPTIONS: { pageType: PageTypeKey; label: string }[] = BLUEPRINTS.map(
  (b) => ({ pageType: b.pageType, label: b.label })
);

/**
 * Recompute positional page numbers across a document.
 *
 * Page numbers are derived from print order — never authored content — so they
 * stay correct after pages are added, removed or reordered. This keeps each
 * page's `number` and its `*.pageNum` footer region in sync, and is why the
 * per-blueprint `pageNum` defaults (copied from the original print issue, where
 * they were out of order / duplicated) never reach the rendered document.
 * Returns a new array, allocating new objects only for pages that changed.
 */
export function renumberPages(pages: MagazinePage[]): MagazinePage[] {
  return pages.map((p, i) => {
    const n = i + 1;
    const pnId = `${p.pageType}.pageNum`;
    const pn = p.content[pnId];
    const html = `PAGE ${n}`;
    const needsContent = !!pn && pn.kind === 'text' && pn.html !== html;
    if (p.number === n && !needsContent) return p;
    return {
      ...p,
      number: n,
      content: needsContent ? { ...p.content, [pnId]: { ...pn, html } } : p.content,
    };
  });
}

/** Build a fresh page of the given type, seeded from its blueprint defaults. */
export function createPageFromType(pageType: PageTypeKey, id: string): MagazinePage {
  const bp = BLUEPRINT_BY_TYPE[pageType];
  return {
    id,
    pageType,
    label: bp?.label ?? pageType,
    number: 0, // assigned by renumberPages once inserted
    selectedForPublish: true,
    content: structuredClone(bp?.defaultContent ?? {}),
  };
}

/**
 * Assemble a document from an ordered list of page types (a template). Each page
 * is deep-cloned from its blueprint so the new magazine owns its content, gets a
 * stable index-based id (unique even if a type repeats), and renumberPages then
 * derives the 1..N print order and writes it into the footer regions.
 */
export function createPagesFromTypes(pageTypes: PageTypeKey[]): MagazinePage[] {
  const pages: MagazinePage[] = pageTypes
    .filter((t) => BLUEPRINT_BY_TYPE[t])
    .map((t, i) => ({
      id: `${t}-${i + 1}`,
      pageType: t,
      label: BLUEPRINT_BY_TYPE[t].label,
      number: i + 1,
      selectedForPublish: true,
      content: structuredClone(BLUEPRINT_BY_TYPE[t].defaultContent),
    }));
  return renumberPages(pages);
}

/** Build the default full-bulletin document (all blueprints, in print order). */
export function createDefaultPages(): MagazinePage[] {
  return createPagesFromTypes(BLUEPRINTS.map((b) => b.pageType));
}
