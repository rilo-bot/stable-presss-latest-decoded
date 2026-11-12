// ---------------------------------------------------------------------------
// Magazine Builder v2 — ISSUE RHYTHM: the running order a reader feels.
//
// The planner writes a good list of pages and a mediocre sequence: two interviews
// back to back, three text-heavy pages in a row, the contents page on page six, a
// feature opener followed by another opener instead of its own article. None of
// that needs a model to fix. This pass re-orders the plan deterministically, after
// planning and before anything is composed:
//
//   • cover first, back cover last (when the plan has them); a second cover or back
//     cover becomes the interior type that does the same job
//   • contents and the editor's letter early
//   • no page type twice in a row
//   • dense and airy pages alternate where possible
//   • a feature opener is followed by its article — an opener and the article
//     after it travel together as one unit, and two openers never touch
//
// It moves whole pages (never rewrites their intent), prefers the planner's own
// order (every move costs), and only when no order can separate two openers does
// it turn the first into a photo essay (same structural kind, so nothing
// downstream changes shape).
//
// Pure: no I/O, no LLM.
// ---------------------------------------------------------------------------

import type { PageTemplateKind } from './templates.js';
import { getPageType, type PageTypeDef } from './pageTypes.js';
import { typeOfPage, INTERIOR_SWAP } from './creativeDirection.js';

export interface RhythmPage {
  kind: PageTemplateKind;
  pageType?: string;
}

/** Page types that carry a story's body — what a feature opener should lead into. */
const ARTICLE_TYPES = new Set(['feature-article', 'long-read', 'sidebar-feature', 'profile', 'interview-qa']);
const OPENER = 'feature-opener';

/** Page types that belong at the front of an issue, and how far back they may sit. */
const FRONT_LIMIT = 3; // 0-based index: within the first four pages

const COST = {
  sameType: 100,
  openerNoArticle: 30,
  frontLate: 40,
  /** A gentler pull: front matter wants to sit right after the cover. */
  frontPull: 8,
  denseDense: 12,
  airyAiry: 6,
  sameKind: 3,
  move: 1,
};

function retype<T extends RhythmPage>(page: T, typeId: string): T {
  const t = getPageType(typeId);
  return t ? { ...page, pageType: t.id, kind: t.baseKind } : page;
}

/** Score a flattened order (lower is better). `orig` maps a page to its planner index. */
function score<T extends RhythmPage>(seq: T[], orig: Map<T, number>): number {
  let s = 0;
  const types = seq.map((p) => typeOfPage(p));
  const firstFree = types[0]?.position === 'first' ? 1 : 0;
  for (let i = 0; i < seq.length; i++) {
    const t = types[i]!;
    if (t.position === 'front') {
      if (i > FRONT_LIMIT) s += COST.frontLate * (i - FRONT_LIMIT);
      s += COST.frontPull * Math.max(0, i - firstFree);
    }
    s += COST.move * Math.abs(i - (orig.get(seq[i]!) ?? i));
    if (t.id === OPENER) {
      const next = types[i + 1];
      if (!next || !ARTICLE_TYPES.has(next.id)) s += COST.openerNoArticle;
    }
    if (i === 0) continue;
    const prev = types[i - 1]!;
    if (prev.id === t.id) s += COST.sameType;
    const fixed = (x: PageTypeDef) => x.position === 'first' || x.position === 'last';
    if (fixed(prev) || fixed(t)) continue;
    if (prev.density === 'dense' && t.density === 'dense') s += COST.denseDense;
    if (prev.density === 'airy' && t.density === 'airy') s += COST.airyAiry;
    if (prev.id !== t.id && prev.baseKind === t.baseKind) s += COST.sameKind;
  }
  return s;
}

/**
 * Re-order a plan for rhythm. Returns a new array; pages are the same objects
 * unless their type had to change (a duplicate cover/back cover/contents, or an
 * opener with no article that cannot be separated from the next opener).
 */
export function arrangeIssueRhythm<T extends RhythmPage>(input: T[]): T[] {
  if (input.length === 0) return [];

  // 1. One cover, one back cover, one contents. Extras become the interior type that
  //    does the same job (a photo-led page stays photo-led; a list stays a list).
  const seen = new Set<string>();
  const pages = input.map((p) => {
    const id = typeOfPage(p).id;
    if (id === 'cover' || id === 'contents') {
      if (seen.has(id)) return retype(p, INTERIOR_SWAP[id]!);
      seen.add(id);
    }
    return p;
  });
  const backIdx = pages.map((p) => typeOfPage(p).id).lastIndexOf('back-cover');
  for (let i = 0; i < pages.length; i++) {
    if (i !== backIdx && typeOfPage(pages[i]!).id === 'back-cover') pages[i] = retype(pages[i]!, INTERIOR_SWAP['back-cover']!);
  }
  const orig = new Map(pages.map((p, i) => [p, i]));

  // 2. Pin the fixed slots.
  const cover = pages.find((p) => typeOfPage(p).id === 'cover');
  const back = pages.find((p) => typeOfPage(p).id === 'back-cover');
  const rest = pages.filter((p) => p !== cover && p !== back);

  // 3. Units: an opener and the article that follows it move as one.
  const units: T[][] = [];
  for (let i = 0; i < rest.length; i++) {
    const p = rest[i]!;
    const next = rest[i + 1];
    if (typeOfPage(p).id === OPENER && next && ARTICLE_TYPES.has(typeOfPage(next).id)) {
      units.push([p, next]);
      i++;
    } else {
      units.push([p]);
    }
  }
  // Contents goes straight after the cover when the planner left it late.
  const ci = units.findIndex((u) => typeOfPage(u[0]!).id === 'contents');
  if (ci > 1) units.unshift(...units.splice(ci, 1));

  const flatten = (us: T[][]): T[] => [...(cover ? [cover] : []), ...us.flat(), ...(back ? [back] : [])];

  // 4. Local search over unit moves: take the single best move each round until no
  //    move helps. Bounded — ≤24 pages, so this is a few thousand cheap scores.
  let best = units;
  let bestScore = score(flatten(best), orig);
  for (let round = 0; round < 40; round++) {
    let improved: T[][] | null = null;
    let improvedScore = bestScore;
    for (let from = 0; from < best.length; from++) {
      for (let to = 0; to < best.length; to++) {
        if (to === from) continue;
        const cand = [...best];
        const [u] = cand.splice(from, 1);
        cand.splice(to, 0, u!);
        const sc = score(flatten(cand), orig);
        if (sc < improvedScore) {
          improved = cand;
          improvedScore = sc;
        }
      }
    }
    if (!improved) break;
    best = improved;
    bestScore = improvedScore;
  }

  // 5. Openers that still touch: the first becomes a photo essay — same structural
  //    kind, a photo-led page with a caption instead of a headline left hanging.
  const out = flatten(best);
  for (let i = 0; i + 1 < out.length; i++) {
    if (typeOfPage(out[i]!).id === OPENER && typeOfPage(out[i + 1]!).id === OPENER) out[i] = retype(out[i]!, 'photo-essay');
  }
  return out;
}
