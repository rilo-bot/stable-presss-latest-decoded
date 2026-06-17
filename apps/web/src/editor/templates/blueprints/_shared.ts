/**
 * Shared blueprint primitives — the `PageBlueprint` shape, the `mkPage`
 * factory, common style/content helpers, and the reusable region/table/card
 * builders used across multiple page blueprints.
 *
 * PURE DATA (no React) so the magazine store can import `createDefaultPages`
 * without pulling in the editor component tree.
 */

import type { PageTypeKey, RegionContent, RegionKind } from '@/types/magazine';
import { text, img, qr, STOCK } from '../helpers';
import { PRESET as P, GOLD, WHITE } from '../styles';

export interface PageBlueprint {
  pageType: PageTypeKey;
  label: string;
  ids: Record<string, string>;
  regionKinds: Record<string, RegionKind>;
  defaultContent: Record<string, RegionContent>;
}

export function mkPage(
  pageType: PageTypeKey,
  label: string,
  regions: Record<string, RegionContent>
): PageBlueprint {
  const ids: Record<string, string> = {};
  const regionKinds: Record<string, RegionKind> = {};
  const defaultContent: Record<string, RegionContent> = {};
  for (const [name, content] of Object.entries(regions)) {
    const id = `${pageType}.${name}`;
    ids[name] = id;
    regionKinds[name] = content.kind;
    defaultContent[id] = content;
  }
  return { pageType, label, ids, regionKinds, defaultContent };
}

// Convenience for a repeated "row of text" (tables / lists).
export const row = (html: string) => text(html, P.td);

export const FIRST_COVER_IMAGE = STOCK.ownersCelebrate;

// Region block helper for regional roundups
export function regionBlock(prefix: string, photo: string, name: string, tag: string, body: string, quote: string) {
  return {
    [`${prefix}Img`]: img(photo, 'cover'),
    [`${prefix}Name`]: text(name, { ...P.subhead, fontSize: 15 }),
    [`${prefix}Tag`]: text(tag, P.scriptGold),
    [`${prefix}Body`]: text(body, P.bodySmall),
    [`${prefix}Quote`]: text(quote, P.caption),
    [`${prefix}Qr`]: qr('https://nztrof.co.nz/regions'),
  };
}

// Leaderboard table builder
export function lbTable(prefix: string, title: string, head: string, rows: string[]) {
  const out: Record<string, RegionContent> = {
    [`${prefix}Title`]: text(title, { ...P.kickerWhite, fontSize: 9 }),
    [`${prefix}Head`]: text(head, { ...P.th, color: GOLD }),
  };
  rows.forEach((r, i) => (out[`${prefix}R${i + 1}`] = row(r)));
  return out;
}

// Prediction column builder
export function predCol(prefix: string, title: string, photo: string, items: string[]) {
  const out: Record<string, RegionContent> = {
    [`${prefix}Title`]: text(title, { ...P.kickerWhite, fontSize: 9 }),
    [`${prefix}Img`]: img(photo, 'cover'),
  };
  items.forEach((it, i) => (out[`${prefix}I${i + 1}`] = text(it, P.bodySmall)));
  out[`${prefix}Qr`] = qr('https://nztrof.co.nz/predictions');
  return out;
}

// Winner card builder
export function winnerCard(prefix: string, photo: string, race: string, horse: string, detail: string) {
  return {
    [`${prefix}Img`]: img(photo, 'cover'),
    [`${prefix}Race`]: text(race, { ...P.kickerGold, fontSize: 8.5 }),
    [`${prefix}Horse`]: text(horse, { ...P.name, fontSize: 14 }),
    [`${prefix}Detail`]: text(detail, P.caption),
  };
}

// Re-export the content/style primitives so each page file can import them
// from a single place.
export { text, img, qr, STOCK, P, GOLD, WHITE };
export { NAVY } from '../styles';
