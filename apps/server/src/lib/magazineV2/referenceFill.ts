// ---------------------------------------------------------------------------
// Magazine Builder v2 — DRAFT copy for reference-layout slots the page cannot
// fill from its own content ("reference-fill").
//
// "Use this layout" is a RECREATE (user direction 2026-08-17): the page is
// cleaned and the reference's design rebuilt complete, so every slot
// `unfilledSlots` lists — on a blank page, all of them — is drafted here in one
// model call, guided by each slot's vision `hint` (what the reference page
// actually showed there), so the result reads like the reference adapted to
// this magazine. It still works for partially-filled pages: it only ever
// drafts what `unfilledSlots` lists, and drafted text enters reflow as pass 3.
//
// Never throws. A failure returns [] and the apply proceeds exactly as before
// this module existed — rearrange-only, with the leftover warning.
// ---------------------------------------------------------------------------

import { generateText } from 'ai';
import { getMagazineModel } from '../agent/provider.js';
import { parseJsonObject } from './parseJson.js';

export interface FillSlotSpec {
  role: string;
  approxChars: number;
  /** What the vision read in this slot's region of the reference ("masthead
   *  'THE HORSE'") — the drafter writes THIS magazine's version of the same
   *  thing. Absent when the slot has no one-to-one region. */
  hint?: string;
}

const MAX_SLOTS = 16;
const MAX_EXISTING_LINES = 10;

/** Plain text only: drafted copy goes straight into text elements, so markup is
 *  stripped rather than trusted, and length is clamped near the slot's budget. */
function cleanDraft(v: unknown, approxChars: number): string {
  if (typeof v !== 'string') return '';
  const plain = v.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  // A little headroom over the estimate — the composer shrinks-to-fit and the
  // tight-slot report covers real overruns; a hard cut mid-sentence is worse.
  return plain.slice(0, Math.max(24, Math.round(approxChars * 1.5)));
}

/**
 * Draft one piece of copy per missing slot, on the magazine's own subject.
 * Returns them in the same role vocabulary the reflow's pass 3 matches on.
 */
export async function draftReferenceFill(opts: {
  title: string;
  subtitle?: string;
  /** The brief the issue was generated from, when it has one — the best subject signal. */
  subject?: string;
  /** What already survives on the page, so the drafts continue it instead of colliding. */
  existingText: string[];
  slots: FillSlotSpec[];
}): Promise<{ role: string; text: string }[]> {
  const slots = opts.slots.slice(0, MAX_SLOTS);
  if (slots.length === 0) return [];

  const system = [
    'You are a magazine copywriter RECREATING a reference page for a different magazine: the',
    'reference’s design is being rebuilt slot for slot, and you write the copy that goes in it.',
    'Where a slot notes what the reference showed there, write THIS magazine’s own version of the',
    'same thing — same purpose, same weight (a masthead stays a masthead, a tagline a tagline) —',
    'never the reference’s brand, names, or subject.',
    '',
    'Rules:',
    '- Write REAL editorial copy on the magazine’s subject — concrete and specific, never filler',
    '  like "Lorem", "Your text here", or generic mission statements.',
    '- Match each slot’s role: a kicker is a few words; a caption describes an image plausibly;',
    '  a label is 1–3 words; body copy is full sentences.',
    '- Respect each slot’s character budget (a rough fit for its box). Under is fine; far over is not.',
    '- Plain text only — no HTML, no markdown.',
    '- Output ONLY a JSON object: { "items": [ { "slot": <number>, "text": "<copy>" } ] } with one',
    '  item per slot, `slot` being the number given below.',
  ].join('\n');

  const user = [
    `Magazine: “${opts.title}”${opts.subtitle ? ` — ${opts.subtitle}` : ''}`,
    opts.subject ? `Subject/brief: ${opts.subject.slice(0, 600)}` : '',
    opts.existingText.length > 0
      ? `Already on this page (do not repeat):\n${opts.existingText.slice(0, MAX_EXISTING_LINES).map((t) => `- ${t.slice(0, 160)}`).join('\n')}`
      : 'The page is currently empty — the drafts carry it alone.',
    '',
    'Slots to write:',
    ...slots.map(
      (s, i) =>
        `${i}. role: ${s.role} — about ${s.approxChars} characters${s.hint ? ` — the reference shows: “${s.hint.slice(0, 160)}”` : ''}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { text } = await generateText({
      model: getMagazineModel(),
      system,
      prompt: user,
      temperature: 0.7,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(45_000),
    });
    const parsed = parseJsonObject(text) as { items?: unknown } | null;
    const items = Array.isArray(parsed?.items) ? (parsed!.items as { slot?: unknown; text?: unknown }[]) : [];
    const out: { role: string; text: string }[] = [];
    for (const item of items) {
      const at = Number(item?.slot);
      const slot = Number.isInteger(at) ? slots[at] : undefined;
      if (!slot) continue;
      const copy = cleanDraft(item?.text, slot.approxChars);
      if (copy) out.push({ role: slot.role, text: copy });
    }
    return out;
  } catch (err) {
    console.warn('[magazineV2] reference-fill draft failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
