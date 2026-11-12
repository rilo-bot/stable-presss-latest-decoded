// ---------------------------------------------------------------------------
// Magazine Builder v2 — the DROP CAP, as ordinary elements.
//
// A drop cap is the oldest signal that a page was typeset rather than typed: the
// first letter of an article set three lines deep, the opening lines wrapped beside
// it. The element model has no floats and no text-indent, so it is built from what it
// does have — three text elements:
//
//     ┌────┐ orning comes early on the        ← FIRST: the opening lines, set in the
//     │ M  │ Waikato, and the string is          narrower measure beside the cap,
//     └────┘ already on the track by five…       exactly DROP_CAP_LINES lines deep
//     when the farrier arrives the horses…  ← REST: the copy that follows, full width
//
// The split is computed here, with the same measured glyph advances every other text
// box is fitted with, and it is conservative in the one direction that matters: the
// opening lines are chosen to fit at WRAP_SAFETY of the real width, so a browser that
// wraps a word early can only leave line three a little short — never push a word into
// a fourth line that the box would clip. Both text pieces are pinned to ONE size
// (min = max) so a later refit can never set the two halves of a paragraph differently.
//
// Shared by the three places that must agree about a drop-cap paragraph's height: the
// content measurer (measureLeaf), the composer that builds it (composeFromSolved) and
// the fit report that judges it (fitReport).
//
// Pure + server-safe: arithmetic over measured metrics. No DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import { estimateTextHeight } from './layout.js';
import { measureRunWidthPx } from './fontMetrics.js';

/** How many lines the cap is sunk into the paragraph. */
export const DROP_CAP_LINES = 3;

/**
 * Element ids of a drop-cap paragraph's pieces start with this ("dropcap-<n>-cap",
 * "-lead", "-rest"). The pieces only read correctly TOGETHER — the lead piece opens
 * mid-word ("orning comes early…") because its first letter is the cap — so any pass
 * that edits copy box by box (an editor, a proof-reader) must leave them alone or
 * treat the three as one paragraph. `isDropCapPiece` is the check.
 */
export const DROP_CAP_ID_PREFIX = 'dropcap-';
export function isDropCapPiece(elementId: string | undefined | null): boolean {
  return typeof elementId === 'string' && elementId.startsWith(DROP_CAP_ID_PREFIX);
}
/** Below this, a paragraph is too short to carry a drop cap at all. */
const MIN_WORDS = 24;
/** The opening lines must keep at least this share of the column, or the cap is too wide. */
const MIN_FIRST_SHARE = 0.55;

/**
 * Vertical metrics (em) of the curated faces — hhea ascender/descender and cap height.
 * Needed only to sink the cap onto the right baseline: CSS centres a line's content
 * area in its line box, so where a glyph's baseline lands depends on the face. An
 * unknown face gets a middle-of-the-road set; the error is a few pixels, not a defect.
 */
interface VMetrics { asc: number; desc: number; cap: number }
const VERTICAL: Record<string, VMetrics> = {
  'playfair display': { asc: 1.082, desc: 0.251, cap: 0.708 },
  'dm serif display': { asc: 1.041, desc: 0.311, cap: 0.7 },
  georgia: { asc: 0.917, desc: 0.219, cap: 0.693 },
  montserrat: { asc: 0.968, desc: 0.251, cap: 0.7 },
  oswald: { asc: 1.193, desc: 0.289, cap: 0.79 },
  'cormorant garamond': { asc: 0.924, desc: 0.287, cap: 0.637 },
  'eb garamond': { asc: 1.007, desc: 0.298, cap: 0.65 },
  'libre baskerville': { asc: 0.97, desc: 0.27, cap: 0.77 },
  merriweather: { asc: 0.984, desc: 0.273, cap: 0.743 },
  archivo: { asc: 0.878, desc: 0.21, cap: 0.7 },
  'work sans': { asc: 0.93, desc: 0.243, cap: 0.66 },
  poppins: { asc: 1.05, desc: 0.35, cap: 0.697 },
  inter: { asc: 0.969, desc: 0.242, cap: 0.727 },
  arial: { asc: 0.905, desc: 0.212, cap: 0.716 },
  lora: { asc: 1.006, desc: 0.274, cap: 0.7 },
  'pt serif': { asc: 1.039, desc: 0.286, cap: 0.7 },
  'source sans 3': { asc: 1.024, desc: 0.4, cap: 0.66 },
};
const DEFAULT_V: VMetrics = { asc: 0.95, desc: 0.25, cap: 0.7 };

function vmetrics(fontFamily: string): VMetrics {
  for (const part of fontFamily.split(',')) {
    const v = VERTICAL[part.replace(/['"]/g, '').trim().toLowerCase()];
    if (v) return v;
  }
  return DEFAULT_V;
}

/** Where a single line's baseline sits below the top of its line box (CSS half-leading). */
const baselineIn = (lineBox: number, fontSize: number, v: VMetrics) => lineBox / 2 + ((v.asc - v.desc) / 2) * fontSize;

/** Plain prose that opens on a letter or digit, long enough to wrap around a cap. */
export function dropCapEligible(text: string): boolean {
  if (/[<>]/.test(text)) return false; // inline markup would be cut in half by the split
  const t = text.trimStart();
  if (!/^[\p{L}\p{N}]/u.test(t)) return false; // a quote mark or a dash does not take a cap
  return t.split(/\s+/).filter(Boolean).length >= MIN_WORDS;
}

export interface DropCapPlan {
  /** The body size the plan was made at (both text pieces are pinned to it). */
  fontSize: number;
  cap: string;
  capFontSize: number;
  capWeight: number;
  /** The cap element, relative to the paragraph box's top-left. */
  capBox: { x: number; y: number; w: number; h: number };
  /** The cap element's line-height (its glyph is centred in that line box). */
  capLineHeight: number;
  /** The opening lines, set beside the cap. */
  first: string;
  firstBox: { x: number; y: number; w: number; h: number };
  /** The copy that follows, full width from `restY`. '' when the paragraph ended. */
  rest: string;
  restY: number;
  restH: number;
  /** The whole paragraph's height: the sunk block plus the rest. */
  totalH: number;
}

export interface DropCapInput {
  text: string;
  fontSize: number;
  lineHeight: number;
  boxW: number;
  bodyFamily: string;
  bodyWeight: number;
  capFamily: string;
  capWeight?: number;
  letterSpacing?: number;
  textTransform?: string;
  /** Measure lines as if the box were this share of its width (see header). */
  safety?: number;
}

/**
 * Plan a drop-cap paragraph at one font size, or null when this copy cannot carry one
 * (markup, a leading quote mark, too few words, or a column too narrow for the cap).
 */
export function planDropCap(o: DropCapInput): DropCapPlan | null {
  const text = o.text.trim();
  if (!dropCapEligible(text) || !(o.fontSize > 0) || !(o.boxW > 0)) return null;
  const safety = o.safety ?? 1;
  const f = o.fontSize;
  const lh = f * o.lineHeight;
  const N = DROP_CAP_LINES;
  const vb = vmetrics(o.bodyFamily);
  const vc = vmetrics(o.capFamily);
  const capWeight = o.capWeight ?? 700;

  // The cap's CAP HEIGHT spans from line 1's cap height to line N's baseline.
  const capFontSize = ((N - 1) * lh + vb.cap * f) / vc.cap;
  const chars = Array.from(text);
  const cap = chars[0]!;
  const capW = Math.ceil(measureRunWidthPx(cap, o.capFamily, capWeight, capFontSize) * 1.04) + 2;
  const gutter = Math.max(8, Math.round(f * 0.4));
  const firstW = o.boxW - capW - gutter;
  if (firstW < o.boxW * MIN_FIRST_SHARE) return null;

  // The opening paragraph, without its initial.
  const after = chars.slice(1).join('');
  const nl = after.indexOf('\n');
  const para = nl >= 0 ? after.slice(0, nl) : after;
  const tail = nl >= 0 ? after.slice(nl) : '';
  const words = para.split(/\s+/).filter(Boolean);
  const transform = (s: string) => (o.textTransform === 'uppercase' ? s.toUpperCase() : s);
  const width = (s: string) => measureRunWidthPx(transform(s), o.bodyFamily, o.bodyWeight, f, o.letterSpacing ?? 0);
  const space = width(' ');
  const limit = firstW * safety;
  let line = 1;
  let colW = 0;
  let k = 0;
  for (const w of words) {
    const ww = width(w);
    if (colW === 0) {
      colW = ww;
      k++;
      continue;
    }
    if (colW + space + ww <= limit) {
      colW += space + ww;
      k++;
      continue;
    }
    if (line === N) break;
    line++;
    colW = ww;
    k++;
  }
  if (line < 2) return null; // a one-line paragraph beside a three-line cap is a hole, not a cap

  const first = words.slice(0, k).join(' ');
  const restPara = words.slice(k).join(' ');
  const rest = (restPara + tail).replace(/^\s+/, '');
  const restY = N * lh;
  const restH = rest
    ? estimateTextHeight({
        text: rest, fontSize: f, boxWidthPx: o.boxW * safety, lineHeight: o.lineHeight, fontFamily: o.bodyFamily, fontWeight: o.bodyWeight,
        ...(o.letterSpacing !== undefined ? { letterSpacing: o.letterSpacing } : {}),
        ...(o.textTransform ? { textTransform: o.textTransform } : {}),
      })
    : 0;

  // Sink the cap: its baseline on line N's baseline. The element's line box is its own
  // height (≥ 0.8 em, the model's floor on line-height); the box is grown, never the
  // glyph moved, when a deep-set face would otherwise clip at the foot.
  const lineNBaseline = (N - 1) * lh + baselineIn(lh, f, vb);
  const capLineHeight = Math.max(0.8, (N * lh) / capFontSize);
  const lineBox = capLineHeight * capFontSize;
  const capY = lineNBaseline - baselineIn(lineBox, capFontSize, vc);
  const capH = Math.max(lineBox, baselineIn(lineBox, capFontSize, vc) + 0.06 * capFontSize);
  return {
    fontSize: f,
    cap,
    capFontSize,
    capWeight,
    capBox: { x: 0, y: Math.round(capY), w: capW, h: Math.ceil(capH) },
    capLineHeight,
    first,
    firstBox: { x: capW + gutter, y: 0, w: Math.floor(firstW), h: Math.ceil(N * lh) },
    rest,
    restY: Math.ceil(restY),
    restH,
    totalH: restY + restH,
  };
}

/**
 * The largest size in [min, max] at which a drop-cap paragraph fits `boxH`, with its
 * plan — or null when it does not fit even at `min` (the caller then sets the copy
 * without a cap and lets ordinary shrink-to-fit handle it).
 */
export function fitDropCap(o: DropCapInput & { boxH: number; maxFontSize: number; minFontSize: number }): DropCapPlan | null {
  const max = Math.floor(o.maxFontSize);
  const min = Math.max(1, Math.ceil(o.minFontSize));
  if (!dropCapEligible(o.text)) return null; // ineligible copy is ineligible at every size
  for (let px = max; px >= min; px--) {
    const plan = planDropCap({ ...o, fontSize: px });
    if (plan && plan.totalH <= o.boxH) return plan;
  }
  return null;
}
