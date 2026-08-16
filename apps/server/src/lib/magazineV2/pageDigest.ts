// ---------------------------------------------------------------------------
// Magazine Builder v2 — what a stored page says about itself, and which stored
// page the user meant.
//
// A page document holds `elements`, an `index` and a `rev`. It has never held a page
// KIND or a SECTION TITLE: those exist in the generation plan and are thrown away once
// the page is composed. So anything that needs to know what an existing page is ABOUT
// has to read it off the page, and this is the one place that does.
//
// It lives in its own module rather than in generate.ts because generate.ts imports the
// database at module scope, which makes everything in it untestable without a live
// MONGODB_URI — the reason the generator has no unit tests at all. Pure and server-safe.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';

/** Long enough to identify a page, short enough that twelve of them cannot crowd the
 *  instructions out of a prompt. */
const MAX_LINE = 90;

/** The element id `pageFurniture` gives the running head. Imported by value rather than
 *  duplicated would be better, but that module pulls in the whole compose stack for one
 *  string; the test in addPages.test.ts pins the pair together instead. */
const HEAD_LABEL_ID = 'furniture-head-label';

function plain(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * One line per page describing what the issue already covers — its section and its
 * angle — for a planner deciding what to add to it.
 *
 * WITHOUT THIS THE ADD-PAGES PLANNER IS GUESSING. It is told to "expand on the issue's
 * existing themes" and to vary the page kinds for a magazine-like rhythm, and it used to
 * be shown the issue's title and nothing else — so it could not know that page 3 was
 * already a photo grid or that page 5 had already taken the angle it was about to take.
 * Adding one page to a twelve-page issue was a page designed with no knowledge of the
 * other twelve.
 *
 * Pages with nothing to say are omitted rather than listed blank: a numbered line with
 * no content after it is worse than a shorter list, because it reads as a page about
 * nothing.
 */
export function pagesAlreadyIn(pages: { elements?: unknown }[]): string[] {
  const out: string[] = [];
  for (const p of pages) {
    const els = Array.isArray(p.elements) ? (p.elements as MagazineElement[]) : [];
    const pick = (match: (e: MagazineElement) => boolean): string => {
      const hit = els.find((e) => e.type === 'text' && !!e.text?.content && match(e));
      return plain(hit?.text?.content ?? '');
    };
    const section = pick((e) => e.id === HEAD_LABEL_ID);
    const headline = pick((e) => e.text?.role === 'headline');
    const line = [section, headline].filter(Boolean).join(' — ').slice(0, MAX_LINE);
    if (line) out.push(line);
  }
  return out;
}

/**
 * Turn a page NUMBER the user said into the id of the page they meant.
 *
 * The assistant may now be told "do page 2 like this", and this is the only place that
 * ordinal becomes a page. Three rules, each of which exists because the alternative is
 * a page rebuilt that nobody asked for:
 *
 *  • AN ID COMES BACK, NEVER AN INDEX. Page order can change between the assistant
 *    answering and the user pressing Apply — a reorder, an insert, a delete — and an
 *    index resolved then would point at a different page now.
 *  • NAMING THE PAGE YOU ARE ALREADY ON IS NOT A DIFFERENT PAGE. It resolves to
 *    `undefined`, meaning "the open page", so the proposal stays the ordinary kind and
 *    the confirm keeps saying what it always said.
 *  • A NUMBER THAT DOES NOT EXIST IS AN ERROR NOW, not a silent miss later, so the
 *    assistant can say so in the same breath rather than the user discovering it after
 *    approving a rebuild.
 */
export type PageOrdinal =
  | { ok: true; pageId?: string }
  | { ok: false; error: string };

export function resolvePageOrdinal(
  pages: { _id: string; index: number }[],
  ordinal: number,
  currentIndex: number,
): PageOrdinal {
  const ordered = [...pages].sort((a, b) => a.index - b.index);
  const target = ordered[ordinal - 1];
  if (!target) {
    const n = ordered.length;
    return { ok: false, error: `This magazine has ${n} page${n === 1 ? '' : 's'}, so there is no page ${ordinal}.` };
  }
  return { ok: true, pageId: target.index === currentIndex ? undefined : target._id };
}
