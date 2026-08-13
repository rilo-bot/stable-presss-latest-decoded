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

import { ASPECT_TOLERANCE, type ReadBox } from './layoutReading.js';
import type { Origin } from './readingToSpec.js';
import type { SolvedLayout } from './solveLayout.js';
import { TEXT_ROLES } from './roleScale.js';

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
  /** Read regions that never reached the page (no content for them, or dropped by the
   *  depth cap). NOT part of `score`, which is about where the placed boxes landed — any
   *  number above zero here forbids the "matched" verdict outright and is named in
   *  `summary`, so completeness is reported without distorting the placement figure. */
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

/**
 * A slot whose position was GUARANTEED carries no information, so it is not measured.
 *
 * THIS IS WHY THE SCORE USED TO LIE. Weighting by read area was right — it stops six
 * accurate captions hiding one misplaced photograph — but on a cover it inverted. A
 * full-bleed photo is a STACK LAYER, and the solver hands every stack layer the whole
 * page, so it scores IoU 1.0 with area 1.0 BY CONSTRUCTION, against roughly 0.09 for all
 * the type combined. The mean could not fall below 1/(1+0.09) ≈ 0.91 whatever happened to
 * the words: "matched" was decided before a single line was placed (measured at 92%, 89%,
 * 85% and 76% on four separately ruined pages).
 *
 * The fix is NOT a cap on how much any slot may weigh. A misplaced hero photo SHOULD be
 * able to condemn a page — only a correctly-placed one must not be able to certify it —
 * and capping is symmetric, so it breaks the first case to fix the second. Two existing
 * tests said so out loud when it was tried.
 *
 * What is actually wrong is measuring an outcome that could not have been otherwise: a
 * backing layer that fills the reference AND fills the page agrees with itself no matter
 * what the page looks like. Excluding it leaves the mean to the slots whose placement was
 * a real decision.
 */
export const FULL_BLEED_AT = 0.85;

/** Roles that BACK other content — the layers the solver hands the whole rect. */
const BACKING_ROLES = new Set(['image', 'shape']);

/**
 * The IoU below which the biggest piece of TYPE on the page has not landed where the
 * reference had it — and no mean, however flattering, may call that a match. Type is
 * what a reader looks at first, and it is the thing area-weighting is worst at seeing.
 */
export const TEXT_MATCH_MIN = 0.5;

/**
 * How big a text region must be before its IoU is allowed to veto a match.
 *
 * IoU is brutal on small boxes: a caption 2% of the page tall, landing 2% low, scores
 * around 0.4 while looking perfectly fine — the same harshness that made `worst` blame a
 * hairline for a page whose headline had really moved. So the veto weighs a masthead or a
 * standfirst (a wide band, 3%+ of the sheet) and ignores small print, which the
 * area-weighted mean is already the right tool for.
 */
export const TEXT_VETO_MIN_AREA = 0.03;

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

/** What forbids the word "matched" regardless of the mean. */
interface Vetoes {
  /** A read region never reached the page. */
  missing: number;
  /** The biggest piece of type is not where the reference had it. */
  textMissed: boolean;
  /** The reference is a different shape from the page, so proportions cannot carry. */
  aspectOff: boolean;
}

function verdictFor(score: number, veto: Vetoes): FidelityVerdict {
  const base: FidelityVerdict = score >= MATCHED_AT ? 'matched' : score >= ADAPTED_AT ? 'adapted' : 'loose';
  if (base !== 'matched') return base;
  // A high mean is necessary for "matched" and not sufficient. Each of these is a fact
  // the user can see on the page, and any one of them makes the word wrong.
  if (veto.missing > 0 || veto.textMissed || veto.aspectOff) return 'adapted';
  return 'matched';
}

/**
 * Was this slot's placement structurally guaranteed rather than achieved?
 *
 * True for a backing layer that fills the reference AND fills the page — the shape the
 * solver cannot get wrong, and therefore the shape that says nothing about whether the
 * arrangement was reproduced.
 */
export function isGuaranteed(role: string, read: ReadBox, got: ReadBox): boolean {
  return BACKING_ROLES.has(role) && read.w * read.h >= FULL_BLEED_AT && got.w * got.h >= FULL_BLEED_AT;
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
  opts: { aspect?: number } = {},
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

  const missingRefs = Object.keys(origin).filter((ref) => !seen.has(ref));
  const missing = missingRefs.length;

  const area = (b: ReadBox) => Math.max(0.0001, b.w * b.h);
  // TWO QUESTIONS, TWO ANSWERS. The score answers "what we placed — did it land where the
  // reference had it?", and `missing` answers "was anything not placed at all?". Keeping
  // them apart is deliberate and was measured: folding missing boxes into the mean at
  // their own area dropped a cover that IS recognisably the reference (photo full-bleed,
  // cluster in the top quarter, one reference box with no content for it) from 0.60 to
  // 0.39 — i.e. from "adapted" to "the arrangement could not be reproduced", which is
  // simply untrue. `missing` instead VETOES "matched" outright and is named in the
  // sentence, so completeness is reported without corrupting the placement number.
  const decided = slots.filter((s) => !isGuaranteed(s.role, s.read, s.got));
  // If EVERY slot was guaranteed there is nothing else to go on, and the honest answer is
  // that the page did reproduce the reference: one full-bleed photograph rebuilt as one
  // full-bleed photograph is a match.
  const scored = (decided.length > 0 ? decided : slots).map((s) => ({ iou: s.iou, weight: area(s.read) }));
  let weighted = 0;
  let totalWeight = 0;
  for (const e of scored) {
    weighted += e.iou * e.weight;
    totalWeight += e.weight;
  }
  // A page with no measurable slot is not a 0% match — it is an unanswered question,
  // and 0 would be reported to the user as a failure that did not happen.
  const score = totalWeight > 0 ? weighted / totalWeight : 0;

  // The biggest piece of TYPE, which is what a reader's eye goes to and what area
  // weighting is worst at noticing.
  const biggestText = slots
    .filter((s) => TEXT_ROLES.has(s.role) && area(s.read) >= TEXT_VETO_MIN_AREA)
    .sort((a, b) => area(b.read) - area(a.read))[0];
  const pageAspect = W / H;
  const veto: Vetoes = {
    missing,
    textMissed: biggestText ? biggestText.iou < TEXT_MATCH_MIN : false,
    aspectOff:
      typeof opts.aspect === 'number' && opts.aspect > 0
        ? Math.abs(opts.aspect - pageAspect) / pageAspect > ASPECT_TOLERANCE
        : false,
  };
  const verdict = slots.length === 0 ? 'loose' : verdictFor(score, veto);
  // Ranked by CONTRIBUTION — how much each slot actually cost the score — not by raw
  // IoU. IoU is brutal on hairlines: a tagline 2% of the page tall, landing 3% low,
  // scores zero while being visually almost right. Sorting on IoU made the sentence
  // blame that tagline for a page whose headline was the thing that really moved.
  const worst = [...slots]
    .sort((a, b) => (1 - b.iou) * b.read.w * b.read.h - (1 - a.iou) * a.read.w * a.read.h)
    .slice(0, 3);

  return {
    score,
    verdict,
    summary: summarize(verdict, score, worst, slots.length, veto, biggestText),
    slots,
    missing,
    worst,
  };
}

function summarize(
  verdict: FidelityVerdict,
  score: number,
  worst: FidelitySlot[],
  count: number,
  veto: Vetoes,
  biggestText: FidelitySlot | undefined,
): string {
  const missing = veto.missing;
  if (count === 0) return 'Nothing on the page could be compared with the reference.';
  const pct = Math.round(score * 100);
  const short = missing > 0
    ? ` ${missing} box${missing === 1 ? '' : 'es'} from the reference had nothing to put in ${missing === 1 ? 'it' : 'them'}, so the rest grew to fill the page.`
    : '';

  if (verdict === 'matched') {
    return `Matched your reference closely (${pct}%).${short}`;
  }
  if (verdict === 'adapted') {
    // A veto means the MEAN said "matched" and a fact on the page said otherwise, so the
    // sentence has to name that fact. Without it the user reads a high percentage next
    // to a hedged word and has no idea which to believe.
    if (veto.aspectOff) {
      return `Structure adapted, not matched (${pct}%) — the reference is a different shape from this page, so its proportions could not carry over.${short}`;
    }
    if (veto.textMissed && biggestText) {
      return `Structure adapted, not matched (${pct}%) — the ${wordFor(biggestText.role)} did not land where the reference had it.${short}`;
    }
    // Name the thing that moved most: "the proportions shifted" is unfalsifiable,
    // "the photo ended up somewhere else" is something the user can look at.
    const off = worst.find((w) => w.iou < MATCHED_AT);
    const which = off ? ` The ${wordFor(off.role)} moved the most.` : '';
    return `Structure matched, proportions adapted (${pct}%).${which}${short}`;
  }
  return `This is a loose interpretation (${pct}%) — the reference's arrangement could not be reproduced closely.${short}`;
}
