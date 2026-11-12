// ---------------------------------------------------------------------------
// Magazine Builder v2 — the copywriter's CONTRACT, as pure rules.
//
// What a drafted page must contain before it is composed (draftGaps — drives the
// copywriter's self-heal), and what it may never print (cleanDraftCopy — the
// deterministic half of copy hygiene). Kept out of generate.ts so they can be tested
// without the model, the database or the network: generate.ts opens a Mongo client the
// moment it is imported.
//
// Pure — no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { PageTemplate, PageTemplateSlot } from './templates.js';
import type { GenPlanPage, PageDraft } from './generate.js';
import { cleanPageCopy } from './copyHygiene.js';

// A body slot below this many characters isn't a real paragraph — treat the
// page's prose backbone as missing so the copywriter self-heal rewrites it.
export const MIN_BODY_CHARS = 200;

/** Which REQUIRED backbone slots a draft is still missing (an empty headline, or
 *  a body that's absent/too thin) — drives the copywriter self-heal + its feedback.
 *  Secondary devices (kicker/deck/caption/stat) are optional and never gate. */
export function draftGaps(draft: PageDraft, template: PageTemplate): string[] {
  const textSlots = template.slots.filter((s) => s.role === 'text');
  const roleOf = (s: PageTemplateSlot) => s.textRole ?? 'body';
  const has = (id: string) => !!draft.texts[id]?.trim();
  const gaps: string[] = [];
  const headline = textSlots.find((s) => roleOf(s) === 'headline');
  if (headline && !has(headline.id)) gaps.push('headline (a punchy title, a few words)');
  const bodySlots = textSlots.filter((s) => roleOf(s) === 'body');
  if (bodySlots.length > 0) {
    const chars = bodySlots.reduce((n, s) => n + (draft.texts[s.id]?.trim().length ?? 0), 0);
    if (chars < MIN_BODY_CHARS) gaps.push('body (2–3 full paragraphs of real, specific prose)');
  }
  // EVERY BODY COLUMN THE LAYOUT DREW IS REQUIRED, not just enough body in total. The
  // total-only rule let a three-venue spread ship with "Trentham" as a kicker and a
  // heading over NOTHING: the copy re-flowed from an earlier attempt had two bodies,
  // this layout had three, 400 characters across the other two passed the bar, and the
  // empty third was pruned out from under its own heading. Only the AI layout's slots
  // carry a leafRole (the fixed templates keep their own, total-only, contract).
  for (const s of textSlots) {
    if (s.leafRole === 'body' && !has(s.id)) gaps.push(`${s.id} (a body column of its own — its heading is on the page with nothing under it)`);
  }
  return gaps;
}

/**
 * The deterministic half of "nothing internal ever prints" (copyHygiene.ts): page refs
 * and slot labels stripped, a numbered run kept only if it is a real 1, 2, 3… sequence
 * (or, on a contents page, real page numbers of this issue, none repeated), and no line that
 * opens by repeating the page's own headline. Slot order is reading order.
 */
export function cleanDraftCopy(draft: PageDraft, template: PageTemplate, page: GenPlanPage, totalPages: number): PageDraft {
  const textSlots = template.slots.filter((s) => s.role === 'text' && draft.texts[s.id]);
  const headlineSlot = textSlots.find((s) => (s.leafRole ?? s.textRole) === 'headline');
  const changed = cleanPageCopy(
    textSlots.map((s) => ({ id: s.id, text: draft.texts[s.id]!, role: s.leafRole ?? s.textRole })),
    { pageKind: page.kind, totalPages, headline: headlineSlot ? draft.texts[headlineSlot.id] : undefined, sectionTitle: page.sectionTitle },
  );
  if (changed.size === 0) return draft;
  return { ...draft, texts: { ...draft.texts, ...Object.fromEntries(changed) } };
}
