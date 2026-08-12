// ---------------------------------------------------------------------------
// Magazine Builder v2 — DID the page we built match the reference? (P3 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md)
//
// P1 read boxes out of a picture. P2 turned them into a page. This is the only part
// that checks whether the second thing resembles the first — and it exists because
// the honest failure mode of this feature is not a crash, it is a page that quietly
// looks nothing like what the client uploaded.
//
// docs/MAGAZINE-V2-QUALITY-PLAN.md's diagnosis of this whole builder is that "every
// page is designed in isolation and nothing ever looks at the output". Here something
// does, deterministically: intersection-over-union between the box the model read and
// the box the solver produced, for every slot that reached the page.
//
// Pure + server-safe: no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { ReadBox } from './layoutReading.js';
import type { Origin } from './readingToSpec.js';
import type { SolvedLayout } from './solveLayout.js';

export type FidelityVerdict = 'matched' | 'adapted' | 'loose';

export interface FidelitySlot {
  ref: string;
  role: string;
  /** 0–1. 1 = the solver put it exactly where the reference had it. */
  iou: number;
  read: ReadBox;
  got: ReadBox;
}

export interface Fidelity {
  /** Area-weighted mean IoU, 0–1. */
  score: number;
  verdict: FidelityVerdict;
  /** One sentence for the user. Never claims more than `score` supports. */
  summary: string;
  slots: FidelitySlot[];
  /** Read regions that never reached the page (no content for them, or dropped by
   *  the depth cap). Counted separately: they lower the score for a reason worth
   *  naming rather than a mystery. */
  missing: number;
  /** The slots that moved the most, worst first — what to mention, if anything. */
  worst: FidelitySlot[];
}

/**
 * Thresholds.
 *
 * Deliberately not generous. A guillotine reproduction of a magazine page lands
 * around 0.8–0.95 when it works, and an honest "adapted" at 0.6 is far more useful
 * than a flattering "matched" that the client can see is wrong.
 */
export const MATCHED_AT = 0.72;
export const ADAPTED_AT = 0.45;

/** Intersection over union of two normalised boxes. 0 when they don't touch. */
export function iou(a: ReadBox, b: ReadBox): number {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || bt <= y) return 0;
  const inter = (r - x) * (bt - y);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function verdictFor(score: number, missing: number): FidelityVerdict {
  if (missing > 0 && score >= MATCHED_AT) return 'adapted'; // can't be a match if a box never arrived
  if (score >= MATCHED_AT) return 'matched';
  if (score >= ADAPTED_AT) return 'adapted';
  return 'loose';
}

/** Plain-language names for the slots, so the sentence reads like a person wrote it. */
const ROLE_WORDS: Record<string, string> = {
  image: 'photo', headline: 'headline', kicker: 'kicker', subhead: 'standfirst',
  body: 'text', caption: 'caption', byline: 'byline', pullquote: 'pull-quote',
  figure: 'statistic', label: 'label', entry: 'list', qr: 'QR code', icon: 'icon', shape: 'panel',
};
const wordFor = (role: string) => ROLE_WORDS[role] ?? role;

/**
 * Score a built page against the reference it came from.
 *
 * WEIGHTED BY THE READ AREA, on purpose: putting the hero photo in the wrong half of
 * the page matters, and a caption 4% out does not. An unweighted mean would let six
 * accurate captions hide one badly misplaced photograph — which is exactly the
 * failure a client would notice first.
 */
export function measureFidelity(
  solved: SolvedLayout,
  origin: Origin,
  dims: { width: number; height: number },
): Fidelity {
  const W = dims.width > 0 ? dims.width : 1;
  const H = dims.height > 0 ? dims.height : 1;

  const slots: FidelitySlot[] = [];
  const seen = new Set<string>();
  for (const leaf of solved.leaves) {
    const ref = leaf.node.contentRef ?? '';
    const read = origin[ref];
    if (!ref || !read || seen.has(ref)) continue;
    seen.add(ref);
    // The solved rect is page pixels INCLUDING the page margin, and the read box is a
    // fraction of the reference INCLUDING its margin, so normalising by the page dims
    // compares like with like.
    const got: ReadBox = { x: leaf.box.x / W, y: leaf.box.y / H, w: leaf.box.w / W, h: leaf.box.h / H };
    slots.push({ ref, role: leaf.node.role, iou: iou(read, got), read, got });
  }

  const missing = Object.keys(origin).filter((ref) => !seen.has(ref)).length;

  let weighted = 0;
  let totalWeight = 0;
  for (const s of slots) {
    const w = Math.max(0.0001, s.read.w * s.read.h);
    weighted += s.iou * w;
    totalWeight += w;
  }
  // A page with no measurable slot is not a 0% match — it is an unanswered question,
  // and 0 would be reported to the user as a failure that did not happen.
  const score = totalWeight > 0 ? weighted / totalWeight : 0;
  const verdict = slots.length === 0 ? 'loose' : verdictFor(score, missing);
  const worst = [...slots].sort((a, b) => a.iou - b.iou).slice(0, 3);

  return { score, verdict, summary: summarize(verdict, score, missing, worst, slots.length), slots, missing, worst };
}

function summarize(
  verdict: FidelityVerdict,
  score: number,
  missing: number,
  worst: FidelitySlot[],
  count: number,
): string {
  if (count === 0) return 'Nothing on the page could be compared with the reference.';
  const pct = Math.round(score * 100);
  const short = missing > 0
    ? ` ${missing} box${missing === 1 ? '' : 'es'} from the reference had nothing to put in ${missing === 1 ? 'it' : 'them'}, so the rest grew to fill the page.`
    : '';

  if (verdict === 'matched') {
    return `Matched your reference closely (${pct}%).${short}`;
  }
  if (verdict === 'adapted') {
    // Name the thing that moved most: "the proportions shifted" is unfalsifiable,
    // "the photo ended up somewhere else" is something the user can look at.
    const off = worst.find((w) => w.iou < MATCHED_AT);
    const which = off ? ` The ${wordFor(off.role)} moved the most.` : '';
    return `Structure matched, proportions adapted (${pct}%).${which}${short}`;
  }
  return `This is a loose interpretation (${pct}%) — the reference's arrangement could not be reproduced closely.${short}`;
}
