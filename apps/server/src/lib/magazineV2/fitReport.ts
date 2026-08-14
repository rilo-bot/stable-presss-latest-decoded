// ---------------------------------------------------------------------------
// Magazine Builder v2 — THE FIT REPORT: telling the art-director what it just built.
//
// The art-director has never seen a page it made. It emits a tree, something else
// turns that into boxes, something else pours copy in, and the only word that ever
// comes back is "failed QA". That is the whole reason the output looks lame — not the
// model's taste. A designer works place → LOOK → adjust; ours worked place → done.
//
// This is the "look" step, done deterministically instead of with a vision call: for
// each leaf it compares the box the solver gave it against what actually went in, and
// says so in plain English. It is free, it is exact, and it names the specific defects
// a real run produced:
//
//   • a QR given a 1200×160 band — 87% of that band is unusable, because a QR is square
//   • a headline asked for at 40pt that only fits at 19pt
//   • a box three times taller than the copy inside it (the "more space than elements"
//     complaint, measured rather than eyeballed)
//   • a body column 1080px wide — about 120 characters a line, when 45–75 is readable
//
// Fed back into the retry hint, it turns a blind retry into a corrected one. It is also
// what makes the raised leaf cap safe: density arrives with feedback attached.
//
// Pure + server-safe: arithmetic over measured font metrics. No DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import { estimateTextHeight } from './layout.js';
import { measureRunWidthPx } from './fontMetrics.js';
import { roleStyle, TEXT_ROLES, ptToPx, pxToPt } from './roleScale.js';
import { typeSizeFor } from './composeFromSolved.js';
import type { ResolvedContent } from './composeFromSolved.js';
import type { SolvedLayout } from './solveLayout.js';
import type { GenFonts } from './templates.js';
import type { LeafRole } from './layoutSpec.js';

/** Roles that are read as PROSE, where line length matters to a reader. */
const PROSE = new Set<string>(['body', 'entry', 'pullquote']);

/** A comfortable measure is ~45–75 characters; past this a column reads as a wall. */
const MAX_COMFORTABLE_CPL = 90;
/** Under this, a column is too narrow to set prose in at all. */
const MIN_COMFORTABLE_CPL = 24;
/** Copy filling less than this share of its box means the box was over-allocated. */
const SLACK_AT = 0.55;
/**
 * A slack box that wastes more than this share of the PAGE is a defect, not advice.
 *
 * Slack was first reported but never counted, on the reasoning that a loose caption box
 * is common and often correct. That was right in the small and wrong in the large: a
 * real stat page shipped with three bands each roughly four times taller than the figure
 * inside them, every one measured as slack, none of them counted — which is precisely
 * the "shows more space than the elements" complaint. The size of the waste is what
 * decides, so it is measured against the sheet rather than against the box.
 */
const SLACK_SERIOUS_SHARE = 0.06;
/** An icon wider than this share of the page has stopped being a mark and become art. */
const ICON_DECOR_WIDTH = 0.12;
/** How far from a QR its own label may sit, in multiples of the QR's side. */
const QR_LABEL_REACH = 1.5;
/** A size cut by more than this means the design's intent was not achievable. */
const SHRUNK_AT = 0.7;
/** A square device (QR/icon) wasting more than this share of its box is a defect. */
const SQUARE_WASTE_AT = 0.35;
/** A QR bigger than this share of the page has stopped being a device. */
const QR_LOUD_AT = 0.15;

export interface FitFinding {
  kind: 'overflow' | 'shrunk' | 'slack' | 'square' | 'loud' | 'measure' | 'decor' | 'orphan';
  /** Which leaf, in the art-director's own words (its contentRef, else its role). */
  where: string;
  detail: string;
  /** For `slack`: the share of the PAGE this box wastes. What decides severity. */
  share?: number;
}

export interface Fit {
  findings: FitFinding[];
  /** Share of the page (0–1) allocated to leaves that draw nothing. */
  emptyShare: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pt = (px: number) => `${Math.round(pxToPt(px))}pt`;

interface Box { x: number; y: number; w: number; h: number }

/** Distance between two boxes' nearest edges (0 when they touch or overlap). */
function gapBetween(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.hypot(dx, dy);
}

/** Is there any real copy within `reach` px of this leaf? Used to tell a labelled mark
 *  apart from a floating decoration, without needing the tree the solver has discarded. */
function hasWordsNear(solved: SolvedLayout, leaf: SolvedLayout['leaves'][number], reach: number): boolean {
  return solved.leaves.some(
    (o) => o !== leaf && TEXT_ROLES.has(o.node.role) && gapBetween(leaf.box, o.box) <= reach,
  );
}

/**
 * Measure what happened to every leaf on a solved page.
 *
 * `content` is the resolved copy/photos; `fonts` the plan's pairing. Deliberately
 * takes the SOLVED layout rather than the composed elements, so it measures the same
 * inputs the composer does — and it borrows `typeSizeFor` from the composer itself
 * rather than restating the size rules, because a report that disagrees with the
 * renderer is worse than no report.
 */
export function fitReport(solved: SolvedLayout, content: ResolvedContent, fonts: GenFonts): Fit {
  const findings: FitFinding[] = [];
  const pageArea = Math.max(1, solved.page.width * solved.page.height);
  let emptyArea = 0;

  for (const leaf of solved.leaves) {
    const role = leaf.node.role as LeafRole;
    const ref = leaf.node.contentRef || role;
    const box = leaf.box;
    if (box.w < 2 || box.h < 2) continue;

    if (role === 'spacer') {
      emptyArea += box.w * box.h;
      continue;
    }

    // ── Square devices: a QR and a glyph have ONE natural shape ──────────────
    if (role === 'qr' || role === 'icon') {
      const side = Math.min(box.w, box.h);
      // A LARGE ICON WITH NOTHING BESIDE IT IS CLIP-ART. On a real cover two 15%-wide
      // outline glyphs floated at the top with no label attached and read as decoration;
      // the same two glyphs on the back cover, inside a module with labels under them,
      // read as design. The difference is whether anything explains them.
      if (role === 'icon' && side > solved.page.width * ICON_DECOR_WIDTH && !hasWordsNear(solved, leaf, side)) {
        findings.push({
          kind: 'decor',
          where: ref,
          detail:
            `the icon is ${Math.round(side)}px across (${pct(side / solved.page.width)} of the page width) with no ` +
            `text beside it — at that size an unlabelled glyph reads as clip-art. Either shrink it to a mark ` +
            `(6–9% of the width) inside a row/col WITH a label or caption, or use a photograph instead.`,
        });
      }
      const waste = 1 - (side * side) / (box.w * box.h);
      if (waste > SQUARE_WASTE_AT) {
        findings.push({
          kind: 'square',
          where: ref,
          detail:
            `you gave the ${role} a ${Math.round(box.w)}×${Math.round(box.h)} box, but a ${role} is SQUARE — ` +
            `it renders ${Math.round(side)}×${Math.round(side)} and ${pct(waste)} of that box is empty. ` +
            `Give it a square-ish share, or put something beside it in a row.`,
        });
      }
      if (role === 'qr' && (side * side) / pageArea > QR_LOUD_AT) {
        findings.push({
          kind: 'loud',
          where: ref,
          detail:
            `the QR takes ${pct((side * side) / pageArea)} of the page. A QR is a small scannable device — ` +
            `6–12% is normal, and anything larger reads as an error rather than an invitation.`,
        });
      }
      continue;
    }

    if (!TEXT_ROLES.has(role)) continue; // image/shape — the fit is the crop's business

    const text = content[leaf.node.contentRef ?? '']?.text ?? '';
    if (!text.trim()) continue;

    const s = roleStyle(role);
    const size = typeSizeFor(leaf.node, role, s);
    const fontFamily = (leaf.node.fontRef ?? s.fontRef) === 'display' ? fonts.display : fonts.body;
    const fontWeight = leaf.node.weightHint ?? s.fontWeight;
    const lineHeight = leaf.node.lineHeight ?? s.lineHeight;
    const letterSpacing = leaf.node.tracking;
    const textTransform = leaf.node.caps ? 'uppercase' : undefined;
    const measured = (fontSize: number) =>
      estimateTextHeight({
        text, fontSize, boxWidthPx: box.w, lineHeight, fontFamily, fontWeight,
        ...(letterSpacing !== undefined ? { letterSpacing } : {}),
        ...(textTransform ? { textTransform } : {}),
      });

    // At the size the design ASKED for, does the copy fit?
    const wantedH = measured(size.max);
    if (wantedH > box.h * 1.02) {
      // What size does fit? (The composer will shrink to roughly this.)
      let fits = size.min;
      for (let px = size.max; px >= size.min; px -= 1) {
        if (measured(px) <= box.h) { fits = px; break; }
      }
      if (fits < size.max * SHRUNK_AT) {
        findings.push({
          kind: 'shrunk',
          where: ref,
          detail:
            `${role} is set at ${pt(size.max)} but only fits at ${pt(fits)} in the ` +
            `${Math.round(box.w)}×${Math.round(box.h)} box you gave it — the copy needs ` +
            `${Math.round(wantedH)}px of height and has ${Math.round(box.h)}. Give it a bigger share, ` +
            `or write shorter copy, or set it smaller ON PURPOSE.`,
        });
      } else {
        findings.push({
          kind: 'overflow',
          where: ref,
          detail: `${role} needs ${Math.round(wantedH)}px of height in a ${Math.round(box.h)}px box — it will be shrunk to fit.`,
        });
      }
    } else if (wantedH < box.h * SLACK_AT) {
      const share = (box.w * (box.h - wantedH)) / pageArea;
      findings.push({
        kind: 'slack',
        where: ref,
        share,
        detail:
          `${role}'s box is ${Math.round(box.h)}px tall but its copy only needs ${Math.round(wantedH)}px — ` +
          `that is ${pct(share)} OF THE WHOLE PAGE left blank inside one box. Either give the space to ` +
          `something else, set the type larger, write more, or make the emptiness deliberate with a ` +
          `"spacer" leaf so it reads as air rather than as an accident.`,
      });
    }

    // ── Line length: the difference between a column and a wall of text ──────
    if (PROSE.has(role)) {
      const probe = 'abcdefghijklmnopqrstuvwxyz etaoinshrdlu';
      const perChar = measureRunWidthPx(probe, fontFamily, fontWeight, size.max) / probe.length;
      const cpl = perChar > 0 ? box.w / perChar : 0;
      if (cpl > MAX_COMFORTABLE_CPL) {
        findings.push({
          kind: 'measure',
          where: ref,
          detail:
            `${role} runs about ${Math.round(cpl)} characters a line at ${Math.round(box.w)}px wide. ` +
            `45–75 is readable; past 90 the eye loses its place returning to the left. ` +
            `Split it into two columns, or narrow it and put something in the space.`,
        });
      } else if (cpl > 0 && cpl < MIN_COMFORTABLE_CPL) {
        findings.push({
          kind: 'measure',
          where: ref,
          detail: `${role} is only ${Math.round(cpl)} characters a line — too narrow to set prose in. Widen it or merge it.`,
        });
      }
    }
  }

  // ── A QR and its own label belong together ───────────────────────────────
  // On a real cover the label sat up beside the standfirst while its QR was at the foot
  // of the page, so the words explained nothing and the code invited nothing. The pairing
  // is by contentRef, which is the only link the solved layout still carries.
  const qrs = solved.leaves.filter((l) => l.node.role === 'qr');
  const labels = solved.leaves.filter((l) => TEXT_ROLES.has(l.node.role) && /^qr/i.test(l.node.contentRef ?? ''));
  for (const q of qrs) {
    const side = Math.min(q.box.w, q.box.h);
    for (const l of labels) {
      const gap = gapBetween(q.box, l.box);
      if (gap > side * QR_LABEL_REACH) {
        findings.push({
          kind: 'orphan',
          where: l.node.contentRef || 'qrLabel',
          detail:
            `this label explains the QR but sits ${Math.round(gap)}px away from it (the QR is only ` +
            `${Math.round(side)}px across). Put the qr leaf and its label in the SAME row or col so they read as ` +
            `one device.`,
        });
      }
    }
  }

  const emptyShare = emptyArea / pageArea;
  return { findings, emptyShare };
}

/**
 * The report as a retry instruction, or '' when the page measured clean.
 *
 * Capped at `limit` lines: a hint the model skims is worth more than an exhaustive one
 * it ignores, and an unbounded list would grow with the raised leaf cap. Ordered so
 * the defects that cost the most page area come first.
 */
export function fitHint(fit: Fit, limit = 6): string {
  if (fit.findings.length === 0) return '';
  const rank: Record<FitFinding['kind'], number> = { loud: 0, decor: 1, square: 2, shrunk: 3, measure: 4, orphan: 5, slack: 6, overflow: 7 };
  const lines = [...fit.findings]
    // Worst KIND first, and within slack the biggest waste first — a box swallowing a
    // fifth of the page should not be buried under three loose captions.
    .sort((a, b) => rank[a.kind] - rank[b.kind] || (b.share ?? 0) - (a.share ?? 0))
    .slice(0, limit)
    .map((f) => `• ${f.where}: ${f.detail}`);
  const more = fit.findings.length - lines.length;
  return (
    `MEASUREMENTS OF THE PAGE YOU JUST BUILT — these are measured, not opinions:\n${lines.join('\n')}` +
    (more > 0 ? `\n• …and ${more} more of the same kind.` : '')
  );
}

/**
 * How many CHARACTERS actually fit in a box at a given setting.
 *
 * The copywriter has always been told a per-role budget from a static table —
 * `body: 1400` characters whether the box is a full page or a footnote — and then the
 * layout was blamed for overflowing. This is the same table replaced by arithmetic
 * over the real box and the real metrics, which is the whole "measure before you
 * commit" idea applied to copy instead of geometry.
 *
 * Approximate by design: it takes the average advance width of a representative run
 * rather than wrapping the (not yet written) words, and holds back a small margin
 * because the last line is rarely full. Being roughly right about THIS box beats being
 * exactly right about a box nobody has.
 */
export function charBudget(opts: {
  boxW: number;
  boxH: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: number;
}): number {
  const probe = 'abcdefghijklmnopqrstuvwxyz etaoinshrdlu';
  const perChar = measureRunWidthPx(probe, opts.fontFamily, opts.fontWeight, opts.fontSize) / probe.length;
  if (!(perChar > 0) || !(opts.fontSize > 0)) return 0;
  const cpl = Math.max(1, Math.floor(opts.boxW / perChar));
  const lines = Math.max(1, Math.floor(opts.boxH / (opts.fontSize * opts.lineHeight)));
  return Math.max(0, Math.round(cpl * lines * 0.92)); // the last line is rarely full
}

/**
 * How many findings are unambiguous DEFECTS rather than advice.
 *
 * Counted: a square device stretched into a band, a QR the size of a photograph, an
 * unlabelled glyph big enough to read as clip-art, a label stranded away from the code it
 * explains, type cut by a third to fit, and a column past the readable measure. All are
 * wrong however you look at them.
 *
 * `slack` is counted ONLY BY SIZE. Every loose box used to be advisory, on the reasoning
 * that a caption with room to spare is normal — but a stat page shipped with three bands
 * four times taller than their contents, each one reported and none counted. So a box
 * wasting more than SLACK_SERIOUS_SHARE of the sheet is a defect and a smaller one is
 * still just advice.
 *
 * `overflow` stays uncounted: it means the composer will shrink the type, which it does
 * well. Counting it would burn every attempt on pages that are fine.
 */
export function seriousFlaws(fit: Fit): number {
  return fit.findings.filter((f) => {
    if (f.kind === 'slack') return (f.share ?? 0) >= SLACK_SERIOUS_SHARE;
    return f.kind === 'loud' || f.kind === 'square' || f.kind === 'shrunk' || f.kind === 'measure' || f.kind === 'decor' || f.kind === 'orphan';
  }).length;
}

export { MAX_COMFORTABLE_CPL, SLACK_AT, SLACK_SERIOUS_SHARE, QR_LOUD_AT, SQUARE_WASTE_AT, ICON_DECOR_WIDTH };
