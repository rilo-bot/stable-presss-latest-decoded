// Always-3 page suggestions. The heuristic layer is synchronous, free, and
// guaranteed to return exactly 3 chips pointing at REAL regions on the current
// page — so the floating chips are instant and never broken. The model layer
// (POST /api/agent/editor/suggestions) optionally returns sharper chips that
// replace the heuristics; on any error the heuristics stand.

import { authFetch } from '@/lib/api';
import type { Magazine, MagazinePage, RegionContent } from '@/types/magazine';
import { filledOf, buildEditorContext } from './editorContext';
import type { SuggestionChip } from './types';

const HEADLINE_HINTS = ['h1', 'h2', 'title', 'headline', 'masthead', 'band'];
const LEAD_HINTS = ['lead', 'intro', 'sub', 'body', 'tagline'];
const HERO_HINTS = ['hero', 'photo', 'img', 'image', 'portrait', 'collage', 'cover'];

function suffix(regionId: string): string {
  const i = regionId.indexOf('.');
  return (i >= 0 ? regionId.slice(i + 1) : regionId).toLowerCase();
}
function matches(regionId: string, hints: string[]): boolean {
  const s = suffix(regionId);
  return hints.some((h) => s.includes(h));
}

function chip(label: string, prompt: string, regionId?: string): SuggestionChip {
  return { label, prompt, regionId };
}

/** Exactly three heuristic chips for the page (or fewer-padded). */
export function suggestForPage(page: MagazinePage): SuggestionChip[] {
  const entries = Object.entries(page.content) as Array<[string, RegionContent]>;
  const empty = entries.filter(([, c]) => !filledOf(c));
  const emptyText = empty.filter(([, c]) => c.kind === 'text').map(([id]) => id);
  const emptyImage = empty.filter(([, c]) => c.kind === 'image').map(([id]) => id);
  const emptyQr = empty.filter(([, c]) => c.kind === 'qr').map(([id]) => id);

  const out: SuggestionChip[] = [];
  const where = `on "${page.label}"`;

  const headline = emptyText.find((id) => matches(id, HEADLINE_HINTS));
  if (headline) out.push(chip('Write the headline', `Write a compelling headline ${where} (region ${headline}).`, headline));

  const lead = emptyText.find((id) => matches(id, LEAD_HINTS) && id !== headline);
  if (lead) out.push(chip('Draft the intro', `Write the intro/lead copy ${where} (region ${lead}).`, lead));

  const hero = emptyImage.find((id) => matches(id, HERO_HINTS)) ?? emptyImage[0];
  if (hero && out.length < 3) out.push(chip('Suggest a photo', `Suggest an on-brand photo for the ${suffix(hero)} image ${where} (region ${hero}).`, hero));

  // Whole-page fill if there's still a lot empty.
  if (out.length < 3 && empty.length >= 4) {
    out.push(chip('Fill this page', `Fill the empty regions ${where} with on-brand draft copy and photo suggestions.`));
  }

  // Remaining empty text, then QR, then polish — pad to exactly 3.
  for (const id of emptyText) {
    if (out.length >= 3) break;
    if (out.some((c) => c.regionId === id)) continue;
    out.push(chip(`Write ${suffix(id)}`, `Write the ${suffix(id)} text ${where} (region ${id}).`, id));
  }
  if (out.length < 3 && emptyQr[0]) {
    out.push(chip('Set a QR link', `Set the QR target for ${suffix(emptyQr[0])} ${where} (region ${emptyQr[0]}).`, emptyQr[0]));
  }
  while (out.length < 3) {
    out.push(chip('Polish this page', `Review "${page.label}" and suggest improvements to the copy and layout.`));
  }
  return out.slice(0, 3);
}

export function heuristicForCurrent(mag: Magazine | undefined, pageId: string | null): SuggestionChip[] {
  const page = mag?.pages.find((p) => p.id === pageId) ?? mag?.pages[0];
  return page ? suggestForPage(page) : [];
}

/** Model-enriched chips for the current page; falls back to [] (caller keeps heuristics). */
export async function fetchModelSuggestions(): Promise<SuggestionChip[]> {
  try {
    const res = await authFetch('/api/agent/editor/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editorContext: buildEditorContext() }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: SuggestionChip[] };
    return Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : [];
  } catch {
    return [];
  }
}
