/**
 * Human-friendly NAMES for editable regions — especially images.
 *
 * Region ids are terse and machine-shaped (`cover.hero`, `regional-north.r1Img`,
 * `winning-moments.w1Img`). Editors and the Studio Assistant both need to refer
 * to an image by a CLEAR, human name ("the Hero photo", "Auckland / Northland
 * photo"), so this module is the single source of truth for those names.
 *
 * Two layers:
 *  1. `REGION_NAMES` — a curated, content-grounded name per IMAGE region id.
 *  2. `humanizeRegionName` — a deterministic fallback that turns any region id
 *     into a readable label, so a region is NEVER nameless (covers text/qr/icon
 *     regions and any image added after this map was authored).
 *
 * PURE DATA (no React) so the store, the agent tools and the read-only viewer
 * can all import it without pulling in the editor component tree.
 */

import type { RegionContent } from '@/types/magazine';
import { REGION_NAMES } from './regionNamesData';

export { REGION_NAMES };

/** Acronyms that must render upper-cased rather than Title-cased. */
const ACRONYMS: Record<string, string> = {
  qr: 'QR',
  url: 'URL',
  cta: 'CTA',
  faq: 'FAQ',
  nz: 'NZ',
  nztrof: 'NZTROF',
  tab: 'TAB',
  id: 'ID',
};

/** Token rewrites that read better than a raw capitalisation. */
const WORD_MAP: Record<string, string> = {
  img: 'photo',
  pic: 'photo',
  pics: 'photos',
  bg: 'background',
  num: 'number',
};

/** The part of a region id after the `<pageType>.` prefix. */
export function regionSuffix(regionId: string): string {
  const i = regionId.indexOf('.');
  return i >= 0 ? regionId.slice(i + 1) : regionId;
}

/** The `<pageType>` prefix of a region id (empty if there is no dot). */
export function regionPageType(regionId: string): string {
  const i = regionId.indexOf('.');
  return i >= 0 ? regionId.slice(0, i) : '';
}

/** Split a camelCase / digit-mixed region name into display words. */
function splitTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2') // regionalNorth -> regional North
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // QRCode -> QR Code
    .replace(/([A-Za-z])([0-9])/g, '$1 $2') // photo1 -> photo 1
    .replace(/([0-9])([A-Za-z])/g, '$1 $2') // 2Tile -> 2 Tile
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function titleWord(w: string): string {
  const lower = w.toLowerCase();
  if (ACRONYMS[lower]) return ACRONYMS[lower];
  if (WORD_MAP[lower]) {
    const mapped = WORD_MAP[lower];
    return mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  if (/^\d+$/.test(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Deterministic readable name for ANY region id (the fallback when a region
 * isn't in the curated map). e.g. `cover.hero` -> "Hero", `cover.joinQr` ->
 * "Join QR", `young-owners.charlieImg` -> "Charlie Photo".
 */
export function humanizeRegionName(regionId: string): string {
  const tokens = splitTokens(regionSuffix(regionId));
  if (tokens.length === 0) return regionId;
  return tokens.map(titleWord).join(' ');
}

/** The display name for a region: curated if known, else humanized. */
export function regionDisplayName(regionId: string): string {
  return REGION_NAMES[regionId] ?? humanizeRegionName(regionId);
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Resolve a user/AI-supplied reference (an exact region id OR a friendly name
 * like "Hero photo" / "Auckland Northland") to the real region id on a page.
 * Returns null when nothing matches confidently.
 *
 * Matching order: exact id → exact name/suffix → unambiguous partial. A partial
 * is only accepted when it hits exactly ONE region, so we never silently edit
 * the wrong slot when a phrase is ambiguous.
 *
 * Pass `kind` when the caller knows the target kind (e.g. setRegionImage knows
 * it wants an image) so a name only ever resolves to a same-kind slot — never
 * an image phrase landing on a text region.
 */
export function findRegionIdByName(
  content: Record<string, RegionContent>,
  query: string,
  kind?: RegionContent['kind'],
): string | null {
  if (!query) return null;
  if (content[query]) return query; // exact id (any kind — the id is explicit)

  const q = norm(query);
  if (q.length < 3) return null; // too short to match safely

  const ids = Object.keys(content).filter((id) => !kind || content[id].kind === kind);

  // Exact match against any candidate (id, suffix, or display name).
  for (const id of ids) {
    const candidates = [id, regionSuffix(id), regionDisplayName(id)];
    if (candidates.some((c) => norm(c) === q)) return id;
  }

  // Unambiguous partial — the query is contained in (or contains) one name.
  // The "query contains name" direction needs a longer name to avoid a short
  // humanized fallback (e.g. "Sub") grabbing an unrelated phrase ("subscribe").
  const partials = ids.filter((id) => {
    const dn = norm(regionDisplayName(id));
    const sx = norm(regionSuffix(id));
    return dn.includes(q) || sx.includes(q) || (dn.length >= 5 && q.includes(dn));
  });
  return partials.length === 1 ? partials[0] : null;
}
