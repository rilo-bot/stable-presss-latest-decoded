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
//   • a page 40% of which has nothing drawn on it at all (`inkShare`)
//
// Fed back into the retry hint, it turns a blind retry into a corrected one. It is also
// what makes the raised leaf cap safe: density arrives with feedback attached.
//
// ONE MEASURE HERE IS NOT LIKE THE OTHERS. Everything above is reported BY the leaf
// that owns the space, and that is a real blind spot: emptiness had to be DECLARED as
// a spacer to be counted, and waste had to sit INSIDE somebody's box. Space belonging
// to nothing — a container's `pad`, the `gap` between its children — was invisible to
// all of it, which is how a shipped issue came to have pages 35-40% bare that measured
// perfectly clean and never bought themselves a retry. `inkShare` is taken from the
// page rather than from the report: union what actually gets painted, compare with the
// sheet. No leaf can hide anything from it because no leaf is asked.
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
/**
 * The AGGREGATE version of the same rule — over the SMALL boxes only. Eight
 * bands each wasting 4–5% slip under the per-box bar individually while the
 * page is a third blank — measured as exactly the "many small text bands" shape
 * behind every remaining "loose" page. Summed across the boxes the per-box bar
 * cannot see (share < SLACK_SERIOUS_SHARE), waste past this share of the sheet
 * is one defect. Boxes already over the per-box bar are excluded here: they are
 * counted individually, and counting the same waste twice punished the single
 * huge box double.
 */
const AGG_SLACK_SERIOUS = 0.15;

/** The aggregate the per-box threshold is blind to: total slack across findings
 *  individually too small to count. */
function smallSlackShare(fit: Fit): number {
  return fit.findings.reduce(
    (n, f) => n + (f.kind === 'slack' && (f.share ?? 0) < SLACK_SERIOUS_SHARE ? (f.share ?? 0) : 0),
    0,
  );
}
/**
 * Deliberate emptiness (spacer leaves) has a budget too. The prompt blesses
 * 15–30% of an interior page as air; a page MOSTLY handed to spacers is not a
 * design, it is a missing page. Above this share, the emptiness counts.
 *
 * SET TO MATCH THE BRIEF. This bar was 0.45 while the art-director was told
 * "roughly 15–30% of an interior page as deliberate air" — a fifteen-point band
 * where the model was graded 50% looser than the standard it was given, and
 * every page that landed in it scored ZERO flaws and shipped on the first
 * attempt without a retry. That band is where the half-empty pages came from.
 * 0.30 is the top of what the prompt actually blesses, so the grader and the
 * brief now say the same number.
 */
const EMPTY_SERIOUS = 0.3;
/**
 * THE HONEST MEASURE: how much of the sheet the page never draws on at all.
 *
 * Every other number here is reported by the leaf that owns the space, which is
 * exactly why a page could be visibly half-empty and measure clean. Emptiness had
 * to be DECLARED (a spacer) to be counted, and waste inside a box had to belong to
 * a box. Space that belongs to NOTHING — a container's `pad`, the `gap` between its
 * children, both of which the art-director may set as high as MAX_SPACE_PX (400) —
 * was invisible to all of it. So was a leaf that draws nothing at all.
 *
 * `inkShare` is measured the other way round: union the boxes that actually PAINT
 * something and compare that with the sheet. It cannot be evaded by whose account
 * the emptiness sits in.
 *
 * Counted against the emptiness NOBODY DECLARED — the bare sheet less whatever the
 * art-director owned up to with spacer leaves, which EMPTY_SERIOUS already judges.
 *
 * The bar is derived, not felt. The page margin is `md` = 36px on 1240×1754, which
 * is ~10% of the sheet no page can ever draw on; the prompt blesses up to 30% more
 * as deliberate air. 10 + 30 = 40, so undeclared bareness past 40% of the sheet has
 * gone beyond what the page was told it could have, whoever's account it sits in.
 */
const BARE_SERIOUS = 0.4;
/** Type asked at more than this multiple of its role's own ceiling reads as a
 *  banner, not a headline. Advisory (see the note on `giant` below). */
const GIANT_AT = 1.75;
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
  kind: 'overflow' | 'shrunk' | 'slack' | 'square' | 'loud' | 'measure' | 'decor' | 'orphan' | 'giant';
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
  /** Share of the page (0–1) wasted INSIDE boxes, summed across every slack
   *  finding — the aggregate the per-box threshold cannot see. */
  slackShare: number;
  /** Share of the page (0–1) that something actually PAINTS, overlap counted once.
   *  The one measure here that no leaf can hide from: see BARE_SERIOUS. */
  inkShare: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pt = (px: number) => `${Math.round(pxToPt(px))}pt`;

interface Box { x: number; y: number; w: number; h: number }

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The rectangle this leaf actually PAINTS, or null if it paints nothing.
 *
 * Deliberately mirrors `buildElement` in composeFromSolved.ts case for case,
 * including the two square devices: a QR and an icon are shrunk to the largest
 * square that fits and centred, so a QR handed a 1200×160 band paints 160×160 and
 * the rest of that band is bare page. Measuring the BOX there would credit the
 * page with ink it never puts down — which is the same blindness this whole
 * measure exists to remove. A report that disagrees with the renderer is worse
 * than no report, so when that function changes, this one has to change with it.
 */
function drawnBox(leaf: SolvedLayout['leaves'][number], content: ResolvedContent): Box | null {
  const role = leaf.node.role as LeafRole;
  const box = leaf.box;
  const fill = content[leaf.node.contentRef ?? ''];
  // Takes its fr share of the track and draws nothing — that is its entire job.
  if (role === 'spacer') return null;
  if (role === 'image') {
    if (fill?.image?.url) return box;
    return fill?.shapeFill && HEX.test(fill.shapeFill) ? box : null; // tinted stand-in still paints
  }
  if (role === 'shape') return box; // scrim or panel — always painted
  if (role === 'qr' || role === 'icon') {
    if (role === 'qr' && !fill?.qrUrl) return null;
    const side = Math.max(1, Math.min(box.w, box.h));
    return { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, w: side, h: side };
  }
  if (TEXT_ROLES.has(role)) return fill?.text?.trim() ? box : null;
  return null;
}

/**
 * Total area covered by these rectangles, counting overlap ONCE.
 *
 * Summing areas would be wrong by exactly the amount a page uses stacks — a
 * full-bleed photo with a scrim and a headline over it would measure 200%+ of the
 * sheet and make every layered page look impossibly dense. Coordinate compression
 * gives the exact union: cut the plane along every box edge and count each cell
 * that any box covers. A page holds a couple of dozen leaves, so the O(n³) shape of
 * this is nothing (~50k cheap checks) and it is exact rather than sampled.
 */
function unionArea(boxes: Box[]): number {
  if (boxes.length === 0) return 0;
  const xs = [...new Set(boxes.flatMap((b) => [b.x, b.x + b.w]))].sort((a, b) => a - b);
  const ys = [...new Set(boxes.flatMap((b) => [b.y, b.y + b.h]))].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    for (let j = 0; j < ys.length - 1; j++) {
      const y0 = ys[j]!;
      const y1 = ys[j + 1]!;
      if (boxes.some((b) => b.x <= x0 && b.x + b.w >= x1 && b.y <= y0 && b.y + b.h >= y1)) {
        total += (x1 - x0) * (y1 - y0);
      }
    }
  }
  return total;
}

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

    // ── Oversized type: nothing else ever checks this ─────────────────────────
    // The unlock let the AI name any size to 220pt, and the only counter-pressure
    // was geometric (does it FIT). A headline asked far past its role's own
    // ceiling fits fine in a big enough box and reads as a banner ad. ADVISORY,
    // not counted: a cover masthead legitimately runs huge, and the report cannot
    // see the page kind — counting this would burn attempts on good covers (the
    // same lesson as slack). It feeds the hint so the next attempt hears it.
    const roleCeiling = roleStyle(role).maxFontSize;
    if (roleCeiling > 0 && size.max > roleCeiling * GIANT_AT) {
      findings.push({
        kind: 'giant',
        where: ref,
        detail:
          `${role} is set at ${pt(size.max)} — its usual ceiling is ${pt(roleCeiling)}. ` +
          `On a cover that can be right; anywhere else it reads as a banner, not editorial. ` +
          `Confirm it is deliberate or bring it down.`,
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
  const slackShare = findings.reduce((n, f) => n + (f.kind === 'slack' ? (f.share ?? 0) : 0), 0);
  // Measured over EVERY leaf, not just the ones that produced a finding — the
  // point of this number is that it is taken from the page rather than from the
  // report, so nothing above can have hidden anything from it.
  const painted = solved.leaves
    .map((l) => drawnBox(l, content))
    .filter((b): b is Box => b !== null);
  const inkShare = Math.min(1, unionArea(painted) / pageArea);
  return { findings, emptyShare, slackShare, inkShare };
}

/**
 * The report as a retry instruction, or '' when the page measured clean.
 *
 * Capped at `limit` lines: a hint the model skims is worth more than an exhaustive one
 * it ignores, and an unbounded list would grow with the raised leaf cap. Ordered so
 * the defects that cost the most page area come first.
 */
export function fitHint(fit: Fit, limit = 6): string {
  // The PAGE-level lines come first and are never capped out: many small slack
  // boxes are individually the least interesting finding and collectively the
  // whole complaint — burying the sum under the per-box list re-creates the
  // blindness the aggregate exists to fix.
  const pageLines: string[] = [];
  if (smallSlackShare(fit) >= AGG_SLACK_SERIOUS) {
    pageLines.push(
      `• THE PAGE: your SMALL boxes together waste ${pct(fit.slackShare)} of the sheet (blank space INSIDE boxes, ` +
        `each too small to flag alone). Merge small bands, give them real height, set the type larger, or make the ` +
        `air deliberate with spacer leaves.`,
    );
  }
  if (fit.emptyShare >= EMPTY_SERIOUS) {
    pageLines.push(
      `• THE PAGE: ${pct(fit.emptyShare)} of the sheet is spacer leaves — past deliberate air and into a missing page. ` +
        `Add real content or shrink the spacers.`,
    );
  }
  // Independent of the spacer line above, and deliberately so: they describe two
  // different faults, and a page can have both. See seriousFlaws.
  if (Math.max(0, 1 - fit.inkShare - fit.emptyShare) >= BARE_SERIOUS) {
    // Says WHERE to look, because this is the one complaint the art-director cannot
    // trace back to a leaf: by construction the empty part of the page belongs to
    // nothing it named. Listing the usual culprits is the difference between a
    // measurement it can act on and one it can only feel bad about.
    pageLines.push(
      `• THE PAGE: only ${pct(fit.inkShare)} of the sheet has ANYTHING drawn on it — the other ${pct(1 - fit.inkShare)} ` +
        `is bare background. This is not one loose box; it is the page as a whole. Look for a large "pad" or "gap" ` +
        `on a container, a track whose weight is far larger than what sits in it, or content clustered into part of ` +
        `the sheet with the rest left over. Spread the content across the page, or give the leftover to something real.`,
    );
  }
  if (fit.findings.length === 0 && pageLines.length === 0) return '';
  const rank: Record<FitFinding['kind'], number> = { loud: 0, decor: 1, square: 2, shrunk: 3, giant: 4, measure: 5, orphan: 6, slack: 7, overflow: 8 };
  const lines = [...fit.findings]
    // Worst KIND first, and within slack the biggest waste first — a box swallowing a
    // fifth of the page should not be buried under three loose captions.
    .sort((a, b) => rank[a.kind] - rank[b.kind] || (b.share ?? 0) - (a.share ?? 0))
    .slice(0, limit)
    .map((f) => `• ${f.where}: ${f.detail}`);
  const more = fit.findings.length - lines.length;
  return (
    `MEASUREMENTS OF THE PAGE YOU JUST BUILT — these are measured, not opinions:\n${[...pageLines, ...lines].join('\n')}` +
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
  const perFinding = fit.findings.filter((f) => {
    if (f.kind === 'slack') return (f.share ?? 0) >= SLACK_SERIOUS_SHARE;
    // `giant` stays advisory: the report cannot see the page kind, and a cover
    // masthead legitimately runs far past the role ceiling.
    return f.kind === 'loud' || f.kind === 'square' || f.kind === 'shrunk' || f.kind === 'measure' || f.kind === 'decor' || f.kind === 'orphan';
  }).length;
  // The AGGREGATES, counted once each. Many small slack boxes are individually
  // advice and collectively THE complaint ("more space than elements") — a page
  // wasting AGG_SLACK_SERIOUS of the sheet across boxes too small to flag alone,
  // or handing EMPTY_SERIOUS of it to spacers, is flawed even when no single box
  // is. Small-slack only, so a huge box (already counted above) isn't counted twice.
  // TWO KINDS OF EMPTINESS, each counted once at its own bar. `emptyShare` is the
  // air the art-director DECLARED with spacer leaves; `undeclaredBare` is the rest
  // of the unpainted sheet — a container's pad, the gap between its children, a
  // track far wider than what sits in it — which it left bare without saying so.
  //
  // Subtracting the declared part is what keeps one fault from being charged twice
  // (the same rule the small-slack aggregate follows above, where boxes already
  // over the per-box bar are excluded). Simply suppressing the bare check whenever
  // spacers tripped would be the opposite error: a page that declares 35% air AND
  // leaks another 35% into gaps has two different faults, and would have been
  // charged for one.
  const undeclaredBare = Math.max(0, 1 - fit.inkShare - fit.emptyShare);
  const aggregate =
    (smallSlackShare(fit) >= AGG_SLACK_SERIOUS ? 1 : 0) +
    (fit.emptyShare >= EMPTY_SERIOUS ? 1 : 0) +
    (undeclaredBare >= BARE_SERIOUS ? 1 : 0);
  return perFinding + aggregate;
}

export { MAX_COMFORTABLE_CPL, SLACK_AT, SLACK_SERIOUS_SHARE, AGG_SLACK_SERIOUS, EMPTY_SERIOUS, BARE_SERIOUS, QR_LOUD_AT, SQUARE_WASTE_AT, ICON_DECOR_WIDTH };
