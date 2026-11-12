// ---------------------------------------------------------------------------
// Magazine Builder v2 — COPY HYGIENE: internal numbering and meta labels never print.
//
// A real generated issue printed its own plumbing:
//
//   • cover lines   "PAGE 2 — CUP WEEK: …", "PAGE 3 — …", "PAGE 4 — …", "PAGE 6 — …"
//                   (wrong pages, and page 5 missing — the cover was guessing)
//   • a profile grid where every item began "04 — …" (the page's own number, four times)
//   • a meta line   "3 — THREE COURSES, ONE SEASON: The carnivals…" under a headline
//                   that already said "Three Courses, One Season"
//
// The source was the copywriter's own instructions: every `entry*` slot — whatever page
// it was on — was told to write "PAGE — TITLE: one-line description", a contents-page
// format, and the model dutifully filled in a page number it did not know. The prompt is
// fixed where those slots are described (generate.ts draftPage); this module is the
// DETERMINISTIC half, because a prompt is a request and the page is a promise:
//
//   1. strip meta prefixes — "PAGE n —", "P. n", "SECTION:", "KICKER:", "entry2 —" …
//   2. a numbered run must be a real sequence — 1, 2, 3… in reading order — or lose
//      its numbers. A lone number, a repeated number ("04, 04, 04, 04") or page refs
//      ("2, 3, 4, 6") are not a list. On a CONTENTS page the numbers ARE the content, so
//      there they must be real page numbers of this issue, none repeated.
//   3. drop a lead-in that just repeats the page's own headline or section title.
//
// Applied to the copywriter's draft (generation and "add pages"), and by the per-page
// Adjust/Fill pass to both the model's rewrites and the copy already on the page — which
// is how an issue generated before this existed gets cleaned.
//
// Inline HTML is preserved: only words are removed, never a tag. Pure — no DOM, no LLM.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';
import { FURNITURE_IDS } from './pageFurniture.js';

export interface CopyContext {
  /** The page's structural kind; 'contents' is the one page where numbers are content. */
  pageKind?: string;
  /** Pages in the issue — a contents page may only cite 1…totalPages. */
  totalPages?: number;
  /** The page's own headline and section title, which no other line should repeat. */
  headline?: string;
  sectionTitle?: string;
}

export interface CopyItem {
  id: string;
  text: string;
  /** The slot/element role; a headline is never stripped of its own words. */
  role?: string;
}

/** Whitespace, tags and non-breaking spaces that may sit between the words of a prefix. */
const GAP = String.raw`(?:\s|<[^>]+>|&nbsp;)*`;
const DELIM = String.raw`(?:[—–|:·•]|-{1,2})`;

/** "PAGE 2 —", "PAGE —", "P. 4:", "pp. 12 —", "Pg 3 |". Group 1 is the number, if any. */
const PAGE_REF = new RegExp(`^${GAP}(?:page|pg\\.?|pp?\\.)${GAP}(\\d{1,3})?${GAP}${DELIM}${GAP}`, 'i');
/** A slot or editorial label leaking into the copy: "SECTION:", "Kicker —", "entry2:". */
const META_LABEL = new RegExp(
  `^${GAP}(?:section|kicker|headline|heading|deck|standfirst|sub-?head(?:ing)?|body(?:${GAP}copy)?|caption|label|entry|slot|title|byline|pull${GAP}-?${GAP}quote|cta|stat|figure|qr${GAP}label|cover${GAP}line)${GAP}\\d{0,2}${GAP}${DELIM}${GAP}`,
  'i',
);
/** A leading list number: "04 — ", "3 – ", "1. ", "2) ". Never a year, a decimal or a figure. */
const NUMBER_PREFIX = new RegExp(`^${GAP}(\\d{1,3})${GAP}(?:[—–]|-{1,2}|[.)])(?=(?:\\s|<[^>]+>|&nbsp;)+\\S)${GAP}`);

/** Keep the TAGS a removed prefix contained (so <b>…</b> stays balanced); drop its words. */
function removePrefix(text: string, match: RegExpExecArray): string {
  const tags = match[0].match(/<[^>]+>/g)?.join('') ?? '';
  return tidyTags(tags + text.slice(match[0].length));
}

/** Remove tag pairs left empty by a removal, e.g. "<b></b>CUP WEEK" → "CUP WEEK". */
function tidyTags(s: string): string {
  let prev = '';
  let out = s;
  while (out !== prev) {
    prev = out;
    out = out.replace(/<(\w+)[^>]*>(?:\s|&nbsp;)*<\/\1>/g, '');
  }
  return out.replace(/^\s+/, '');
}

const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Strip every meta prefix (page refs, slot labels) from the head of one piece of copy.
 *  On a contents page a page ref keeps its number: "PAGE 4 — X" → "4 — X". */
export function stripMetaLabels(text: string, opts: { keepPageNumber?: boolean } = {}): string {
  let out = text;
  for (let guard = 0; guard < 4; guard++) {
    const page = PAGE_REF.exec(out);
    if (page) {
      out = removePrefix(out, page);
      if (opts.keepPageNumber && page[1]) out = `${Number(page[1])} — ${out}`;
      continue;
    }
    const meta = META_LABEL.exec(out);
    if (meta) {
      out = removePrefix(out, meta);
      continue;
    }
    break;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "THREE COURSES, ONE SEASON: The carnivals…" under that headline → "The carnivals…". */
function stripEcho(text: string, titles: string[]): string {
  for (const t of titles) {
    const words = plain(t).split(' ').filter(Boolean);
    if (words.length === 0) continue;
    const re = new RegExp(`^${GAP}${words.map(escapeRe).join(`${GAP}`)}${GAP}${DELIM}${GAP}`, 'i');
    const m = re.exec(text);
    if (m && plain(text.slice(m[0].length))) return capitalizeFirst(removePrefix(text, m));
  }
  return text;
}

/** "every January…" left behind by a removed lead-in starts a sentence again. */
function capitalizeFirst(html: string): string {
  const m = /^((?:\s|<[^>]+>|&nbsp;)*)([a-z])/.exec(html);
  return m ? m[1] + m[2]!.toUpperCase() + html.slice(m[0].length) : html;
}

/**
 * Is this run of numbers a real list — 1, 2, 3… with nothing missing or repeated?
 * Judged as a SET, not in the order the items were handed over: a numbered list set in
 * two columns reads 1,2 | 3,4 but scans row by row as 1,3,2,4, and a check that cared
 * about scan order would strip the numbers off a perfectly good list.
 */
function isSequence(nums: number[]): boolean {
  if (nums.length < 2) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted.every((n, i) => n === i + 1);
}

/** On a contents page: real page numbers of this issue, none repeated. */
function isPageRun(nums: number[], totalPages?: number): boolean {
  const max = totalPages && totalPages > 0 ? totalPages : Infinity;
  return new Set(nums).size === nums.length && nums.every((n) => n >= 1 && n <= max);
}

/**
 * Clean a whole page's copy. Returns ONLY the items whose text changed (id → new text),
 * so a caller can turn the result straight into edits. Every text on the page should be
 * passed together: a numbered run is judged across all of them.
 */
export function cleanPageCopy(items: CopyItem[], ctx: CopyContext = {}): Map<string, string> {
  const contents = ctx.pageKind === 'contents';
  const titles = [ctx.headline, ctx.sectionTitle].filter((t): t is string => !!t && plain(t).length >= 3);
  const working = items.map((it) => ({ ...it, out: stripMetaLabels(it.text, { keepPageNumber: contents }) }));

  // The numbered run, judged as a whole.
  const numbered = working
    .map((it) => ({ it, m: NUMBER_PREFIX.exec(it.out) }))
    .filter((x): x is { it: (typeof working)[number]; m: RegExpExecArray } => x.m !== null && x.it.role !== 'headline');
  const nums = numbered.map((x) => Number(x.m[1]));
  const keep = numbered.length > 0 && (contents ? isPageRun(nums, ctx.totalPages) : isSequence(nums));
  if (!keep) for (const x of numbered) x.it.out = removePrefix(x.it.out, x.m);

  const changed = new Map<string, string>();
  for (const it of working) {
    if (it.role !== 'headline' && titles.length) {
      // The echo sits after any number we kept: "2 — HEADLINE: …" keeps "2 — ".
      const m = keep ? NUMBER_PREFIX.exec(it.out) : null;
      if (m) it.out = it.out.slice(0, m[0].length) + stripEcho(it.out.slice(m[0].length), titles);
      else it.out = stripEcho(it.out, titles);
    }
    // Never blank a box: if stripping left no words, the original stands.
    if (it.out !== it.text && plain(it.out)) changed.set(it.id, it.out);
  }
  return changed;
}

// ── Whole-page edits (the Fill / Adjust pass) ───────────────────────────────


export interface TextEdit {
  elementId: string;
  content: string;
}

/**
 * The text edits a page should receive: the model's rewrites (if any) merged with copy
 * hygiene over EVERY text on the page — so Adjust also cleans "PAGE 2 —" and "04 —" out
 * of copy generated before these rules existed, and a Fill can never write them back in.
 * Furniture (running head, folio) is the page's chrome and is never touched. Only edits
 * that actually change a stored text are returned.
 */
export function pageCopyEdits(
  elements: MagazineElement[],
  modelEdits: TextEdit[],
  ctx: Omit<CopyContext, 'headline'> = {},
): TextEdit[] {
  const texts = elements.filter((e) => e.type === 'text' && !!e.text && !FURNITURE_IDS.includes(e.id));
  const proposed = new Map<string, string>();
  for (const e of modelEdits) if (texts.some((t) => t.id === e.elementId)) proposed.set(e.elementId, e.content);
  const current = (e: MagazineElement) => proposed.get(e.id) ?? e.text!.content;
  const headline = texts
    .filter((e) => e.text!.role === 'headline')
    .sort((a, b) => b.text!.fontSize - a.text!.fontSize)[0];
  const cleaned = cleanPageCopy(
    texts.map((e) => ({ id: e.id, text: current(e), role: e.text!.role })),
    { ...ctx, ...(headline ? { headline: plain(current(headline)) } : {}) },
  );
  for (const [id, text] of cleaned) proposed.set(id, text);
  return [...proposed]
    .filter(([id, content]) => texts.find((t) => t.id === id)!.text!.content !== content)
    .map(([elementId, content]) => ({ elementId, content }));
}
