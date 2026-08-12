// ---------------------------------------------------------------------------
// Magazine Builder v2 — which layout slots does a page still need content for?
//
// "Take this layout" reflows the page's existing content into the reference's
// boxes (applyLayout.ts). When the page holds less than the reference shows —
// the common case for a page still being written — the old behaviour pruned
// every empty box and re-solved, so one caption grew to fill the page and the
// result looked nothing like the picture (fidelity 3%, seven boxes gone). The
// design doc always intended the other half: "unfilled slots either take a
// generation brief or are pruned". The generation brief lives in slotFiller.ts
// (it needs the db and a model); THIS module is the pure half — what "empty"
// means and how to find it — kept free of I/O imports so applyLayout.ts and
// its tests stay database-free.
//
// Pure + server-safe: no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { LeafFill, ResolvedContent } from './composeFromSolved.js';
import type { ReadBox, ReadRegion } from './layoutReading.js';

/** A content slot the reflow could not fill from the page's own elements. */
export interface EmptySlot {
  ref: string;
  role: string;
}

/** What the apply knows about the reference that helps a filler do better than
 *  guessing — all optional signals, never obligations. */
export interface SlotFillHints {
  /** True when the user asked for the reference's CONTENT too. Image sourcing
   *  then prefers the reference itself (crops / descriptions) over the library. */
  replicate: boolean;
  /** Per image-slot ref: the photograph described in one line, for image-gen /
   *  stock queries and for alt text. */
  imageDescs: Record<string, string>;
  /** Per image-slot ref: the region's box in the reference — ONLY for regions
   *  clean enough to crop (no text printed over them, see cropSafeBoxes). */
  cropBoxes: Record<string, ReadBox>;
  /** The reference image's own URL, proven to belong to this magazine. */
  sourceUrl?: string;
}

/** Provides content for empty slots. Returns only the slots it could fill.
 *  Best-effort by contract: whatever it leaves empty is pruned as before. */
export type SlotFiller = (empty: EmptySlot[], hints: SlotFillHints) => Promise<ResolvedContent>;

const TEXTY = new Set(['headline', 'subhead', 'kicker', 'byline', 'body', 'caption', 'pullquote', 'figure', 'label', 'entry']);

const overlapArea = (a: ReadBox, b: ReadBox): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/**
 * Which image slots can honestly be CROPPED out of the reference image.
 *
 * A magazine cover's hero photo has the cover lines printed over it — cropping
 * that box reproduces the baked-in text, and the rebuilt page then prints the
 * transcription on top of a picture of the same words. So a region qualifies
 * only when no text region covers a meaningful share of it; the covered ones
 * fall through to description-driven sourcing instead.
 */
export function cropSafeBoxes(
  slots: { ref: string; role: string }[],
  origin: Record<string, ReadBox>,
  regions: ReadRegion[],
): Record<string, ReadBox> {
  const textBoxes = regions.filter((r) => TEXTY.has(r.role)).map((r) => r.box);
  const out: Record<string, ReadBox> = {};
  for (const s of slots) {
    if (s.role !== 'image') continue;
    const box = origin[s.ref];
    if (!box) continue;
    const area = box.w * box.h;
    if (area < 0.005) continue; // too small to be worth a crop
    const covered = textBoxes.some((t) => overlapArea(t, box) > area * 0.05);
    if (!covered) out[s.ref] = box;
  }
  return out;
}

/**
 * Does this fill actually carry content for this role? The same question
 * pruneSpec's `leafHasContent` asks — kept as one predicate here so "empty"
 * means the same thing to the finder, the filler and the counter.
 */
export function fillSatisfies(role: string, fill: LeafFill | undefined): boolean {
  if (!fill) return false;
  if (role === 'image') return !!fill.image?.url;
  if (role === 'qr') return !!fill.qrUrl;
  if (role === 'icon') return !!(fill.iconName || fill.iconSrc);
  if (role === 'shape') return true; // shapes never need content
  return !!(fill.text && fill.text.trim());
}

/** The slots the reflow left empty — the ones pruneSpec would delete. (One
 *  benign over-report: an icon leaf that AUTHORS its own glyph on the leaf is
 *  counted empty here — this function sees content, not the tree — but it
 *  survives pruning regardless, and the standard filler never fills icons.) */
export function findEmptySlots(
  slots: { ref: string; role: string }[],
  content: ResolvedContent,
): EmptySlot[] {
  return slots.filter((s) => s.role !== 'shape' && !fillSatisfies(s.role, content[s.ref]));
}
