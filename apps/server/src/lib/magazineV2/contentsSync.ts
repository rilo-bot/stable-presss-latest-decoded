// ---------------------------------------------------------------------------
// Magazine Builder v2 — CONTENTS SYNC: the contents page's numbers stay true.
//
// Every page's folio is re-stamped whenever the page order changes (renumberFolios).
// The contents page is the other place a page number prints, and it was left behind:
// "add pages" put two new pages in front of "Bloodlines", its folio went from 4 to 6,
// and the contents page went on saying "04  Bloodlines: three families…". The same
// after a reorder, a duplicate, a delete or an inserted blank page.
//
// This is the deterministic repair. Given the issue's pages IN THEIR NEW ORDER it
//
//   1. reads each numbered entry off a page — a number and a title in one box
//      ("04 — Bloodlines: three families…", "Bloodlines …… 12"), a number on its own
//      line above the title, or a number in a box of its own beside or above the
//      title box (the "numbered-contents" archetype sets the figure apart);
//   2. decides which pages ARE contents pages. A stored page has no kind (see
//      pageDigest.ts), so it is read off the page: numbered entries that name OTHER
//      pages' headlines — two of them, or one on a page that says "Contents" / "In this
//      issue". A kind, when the caller knows it, settles the question either way;
//   3. matches each entry to the page it names: its title against each page's headline
//      (and section label / kicker), word by word — case, punctuation, accents and
//      plurals don't count — and only when ONE page is clearly the best match;
//   4. rewrites ONLY the digits of that entry's number to the page's current number,
//      keeping its zero-padding ("04" → "06", "4" → "6", and "12" → "04" on a page
//      whose numbers are padded).
//
// IT NEVER changes a title, adds or drops an entry, touches an entry it cannot match
// confidently (a page that was deleted, two pages tied for it), changes an element's
// style or geometry, or writes a longer number into a box it would no longer fit.
//
// The page headline is read the way the Editor-in-Chief reads it (mainHeadline), and
// fit is measured by its replacementFits — one notion of each across the codebase.
//
// Pure: no DOM, no LLM, no I/O. The database half is syncContentsNumbers in
// renumberFolios.ts, called wherever renumberFolios is.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';
import { FURNITURE_IDS, HEAD_LABEL_ID } from './pageFurniture.js';
import { isDropCapPiece } from './dropCap.js';
import { mainHeadline, plainText, replacementFits, words, STOP } from './editorInChief.js';

export interface ContentsSyncPage {
  /** The page document's id, echoed back on its update. */
  id?: string;
  elements: MagazineElement[];
  /** Structural kind from the plan, when the caller knows it ('contents' settles it). */
  kind?: string;
  pageType?: string;
  /** The page's 1-based number BEFORE the change that triggered this sync, if known.
   *  Breaks a tie only: an entry that pointed at this page keeps pointing at it. */
  prevPageNo?: number;
}

export interface ContentsSyncOptions {
  /** 1-based numbers (in the PREVIOUS order) of pages that no longer exist. An entry
   *  still carrying one most likely listed the removed page, so a merely similar
   *  headline elsewhere may not claim it. */
  removedPageNos?: number[];
}

export interface ContentsNumberChange {
  elementId: string;
  /** The entry's title as read (for logs). */
  title: string;
  fromNo: number;
  toNo: number;
  /** 0-based index of the page the entry lists. */
  targetIdx: number;
}

export interface ContentsPageUpdate {
  /** 0-based index of the contents page in `pages`. */
  pageIdx: number;
  id?: string;
  /** The page's full element array with the new numbers. Everything else is untouched. */
  elements: MagazineElement[];
  changedElementIds: string[];
  changes: ContentsNumberChange[];
}

export interface ContentsSkip {
  pageIdx: number;
  elementId: string;
  title: string;
  why: string;
}

export interface ContentsSyncResult {
  /** 0-based indexes of the pages read as contents pages. */
  contentsPages: number[];
  /** One per contents page whose numbers changed. Empty when everything is already true. */
  updates: ContentsPageUpdate[];
  /** Entries on contents pages left as they are, and why. */
  skipped: ContentsSkip[];
}

/** An entry must match a page at least this well (two of three key words in common)… */
const MIN_SCORE = 0.7;
/** …and beat every other page by this much, or it is a tie. */
const MARGIN = 0.15;
/** A match this good is trusted even when the entry's number was a removed page's. */
const STRONG = 0.9;
/** Text longer than this is body copy, not something a contents entry names. */
const MAX_TITLE_CHARS = 200;
/** How far apart a number box and its title box may sit and still be one entry. */
const PAIR_GAP_X = 320;
const PAIR_GAP_Y_MIN = 48;

const SIGNAL = /\b(?:contents|in this (?:issue|edition)|inside this (?:issue|edition)|what'?s inside)\b/i;

// ── Reading text a token at a time ───────────────────────────────────────────
//
// A number is rewritten IN the stored HTML, digit run for digit run, so "<b>04</b> —
// Bloodlines" keeps its <b>. The HTML is split into tags and text; lines break at <br>
// and block tags, so a box holding several entries is read entry by entry.

interface Tok {
  tag: boolean;
  s: string;
}

const BREAK_TAG = /^<\s*(?:br\b|\/?\s*(?:p|div|li|h[1-6])\b)/i;

function tokenize(html: string): Tok[] {
  return html
    .split(/(<[^>]*>)/)
    .filter((s) => s !== '')
    .map((s) => ({ tag: s.startsWith('<') && s.endsWith('>'), s }));
}

/** Entities that can sit around a number, decoded without trimming. */
function decode(s: string): string {
  return s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
}

interface NumRef {
  tok: number;
  start: number;
  end: number;
  digits: string;
}

interface Line {
  plain: string;
  num?: NumRef;
  /** The line is the number and nothing else. */
  numberOnly?: boolean;
  /** The line's words with the number (and its delimiter) taken off. */
  rest: string;
}

const LEAD = /^((?:\s|&nbsp;|&#160;)*(?:(?:p|pg|pp)\.(?:\s|&nbsp;|&#160;)*|page(?:\s|&nbsp;|&#160;)*)?)(\d{1,3})(?!\d)/i;
const TRAIL = /^(.*?\p{L}.*?)(?:\s*(?:\.{2,}|…+|·{2,}|_{2,})\s*|\s*[—–|]\s*|\s*,?\s+(?:(?:p|pg|pp)\.|page)\s*)(\d{1,3})$/iu;
const NUMBER_ONLY = /^(?:(?:(?:p|pg|pp)\.|page)\s*)?\d{1,3}\.?$/i;
const LEAD_DELIMS = /^[\s—–\-:.)|·•/]+/;

/** A leading number: "04 — X", "4. X", "<b>04</b> X", "p. 4 X" — never 4.8, 4%, 4th, 1,000. */
function leadingNumber(toks: Tok[], idxs: number[]): { num: NumRef; restRaw: string } | null {
  const k = idxs.findIndex((i) => decode(toks[i]!.s).trim() !== '');
  if (k < 0) return null;
  const ti = idxs[k]!;
  const s = toks[ti]!.s;
  const m = LEAD.exec(s);
  if (!m) return null;
  const start = m[1]!.length;
  const end = start + m[2]!.length;
  const after = s.slice(end);
  const following = idxs.slice(k + 1).map((i) => toks[i]!.s).join('');
  if (decode(after) !== '') {
    // Glued to the number in the same run of text: a figure, not a page number.
    if (/^(?:[.,:]\d|\s*%|[\p{L}\p{N}])/u.test(decode(after))) return null;
  } else if (/^(?:\s*%|(?:st|nd|rd|th)\b)/i.test(decode(following))) {
    return null;
  }
  return { num: { tok: ti, start, end, digits: m[2]! }, restRaw: after + following };
}

/** A trailing number set off by leaders or a dash: "Bloodlines …… 12", "Bloodlines — p. 12". */
function trailingNumber(toks: Tok[], idxs: number[], plain: string): { num: NumRef; rest: string } | null {
  const m = TRAIL.exec(plain);
  if (!m) return null;
  for (let k = idxs.length - 1; k >= 0; k--) {
    const ti = idxs[k]!;
    const s = toks[ti]!.s;
    if (decode(s).trim() === '') continue;
    const t = /(\d{1,3})((?:\s|&nbsp;|&#160;)*)$/.exec(s);
    if (!t || t[1] !== m[2] || /\d/.test(s.charAt(t.index - 1))) return null;
    return { num: { tok: ti, start: t.index, end: t.index + t[1]!.length, digits: t[1]! }, rest: m[1]!.trim() };
  }
  return null;
}

/** The non-empty lines of a box's HTML, each with its page number if it carries one.
 *  NumRefs index into `tokenize(html)`, which `rewrite` re-derives identically. */
function readLines(html: string): Line[] {
  const toks = tokenize(html);
  const groups: number[][] = [[]];
  toks.forEach((t, i) => {
    if (!t.tag) groups[groups.length - 1]!.push(i);
    else if (BREAK_TAG.test(t.s)) groups.push([]);
  });
  const lines: Line[] = [];
  for (const idxs of groups) {
    const plain = plainText(idxs.map((i) => toks[i]!.s).join(''));
    if (!plain) continue;
    const lead = leadingNumber(toks, idxs);
    if (lead && NUMBER_ONLY.test(plain)) {
      lines.push({ plain, num: lead.num, numberOnly: true, rest: '' });
      continue;
    }
    if (lead) {
      const rest = plainText(lead.restRaw).replace(LEAD_DELIMS, '').trim();
      if (/\p{L}/u.test(rest)) {
        lines.push({ plain, num: lead.num, rest });
        continue;
      }
    }
    const trail = trailingNumber(toks, idxs, plain);
    if (trail) {
      lines.push({ plain, num: trail.num, rest: trail.rest });
      continue;
    }
    lines.push({ plain, rest: plain });
  }
  return lines;
}

// ── Entries ──────────────────────────────────────────────────────────────────

interface NumberRef {
  elementId: string;
  num: NumRef;
}

interface Entry {
  /** Where its page number prints — usually once; twice when a figure box beside the
   *  entry repeats the number the entry's own text opens with. All move together. */
  refs: NumberRef[];
  number: number;
  /** The words that name the story: "Bloodlines — three families…". */
  text: string;
}

const letters = (s: string) => /\p{L}/u.test(s);

function textEls(page: ContentsSyncPage): MagazineElement[] {
  return page.elements.filter(
    (e) => e.type === 'text' && !!e.text?.content && !FURNITURE_IDS.includes(e.id) && !isDropCapPiece(e.id),
  );
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * The title box a number box belongs to: on its row to the right (the usual "04 | Title"),
 * else directly below it (a figure set above its title), else on its row to the left
 * (right-aligned page numbers). Nearest wins; anything further than a column away is
 * somebody else's.
 */
function titleBoxFor(n: MagazineElement, cands: MagazineElement[]): MagazineElement | undefined {
  const rowShare = (t: MagazineElement) => overlap(n.y, n.y + n.h, t.y, t.y + t.h) / Math.max(1, Math.min(n.h, t.h));
  const colShare = (t: MagazineElement) => overlap(n.x, n.x + n.w, t.x, t.x + t.w) / Math.max(1, Math.min(n.w, t.w));
  const nearest = (list: { t: MagazineElement; gap: number }[]) => list.sort((a, b) => a.gap - b.gap)[0]?.t;
  const right = cands
    .filter((t) => t.x >= n.x + n.w * 0.5 && rowShare(t) >= 0.3)
    .map((t) => ({ t, gap: Math.max(0, t.x - (n.x + n.w)) }))
    .filter((c) => c.gap <= PAIR_GAP_X);
  if (right.length) return nearest(right);
  const below = cands
    .filter((t) => t.y >= n.y + n.h * 0.5 && colShare(t) >= 0.3)
    .map((t) => ({ t, gap: Math.max(0, t.y - (n.y + n.h)) }))
    .filter((c) => c.gap <= Math.max(PAIR_GAP_Y_MIN, n.h * 1.5));
  if (below.length) return nearest(below);
  const left = cands
    .filter((t) => t.x + t.w <= n.x + n.w * 0.5 && rowShare(t) >= 0.3)
    .map((t) => ({ t, gap: Math.max(0, n.x - (t.x + t.w)) }))
    .filter((c) => c.gap <= PAIR_GAP_X);
  return nearest(left);
}

/** Every numbered entry on a page, in any of the shapes a contents page sets them. */
function readEntries(page: ContentsSyncPage): Entry[] {
  /** The entries read inside each box, in page order. */
  const own = new Map<string, Entry[]>();
  const whole = new Map<string, string>();
  const numberBoxes: NumberRef[] = [];
  const titleCands: MagazineElement[] = [];
  const els = textEls(page);

  for (const el of els) {
    const lines = readLines(el.text!.content);
    if (lines.length === 0) continue;
    if (lines.length === 1 && lines[0]!.numberOnly) {
      numberBoxes.push({ elementId: el.id, num: lines[0]!.num! });
      continue;
    }
    const mine: Entry[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.num) continue;
      // The entry's words run on until the next numbered line: "04 Bloodlines<br>three
      // families…" is one entry, its number above or beside its title and teaser. A
      // number set UNDER its title ("Bloodlines<br>04") takes the lines above it.
      const parts = line.rest ? [line.rest] : [];
      for (let j = i + 1; j < lines.length && !lines[j]!.num; j++) parts.push(lines[j]!.plain);
      if (parts.length === 0 && line.numberOnly) {
        for (let j = i - 1; j >= 0 && !lines[j]!.num; j--) parts.unshift(lines[j]!.plain);
      }
      const text = parts.join(' — ');
      if (!letters(text)) continue;
      mine.push({ refs: [{ elementId: el.id, num: line.num }], number: Number(line.num.digits), text });
    }
    own.set(el.id, mine);
    const plain = lines.map((l) => l.plain).join(' — ');
    whole.set(el.id, plain);
    if (letters(plain) && plain.length <= MAX_TITLE_CHARS * 2 && !SIGNAL.test(plain)) titleCands.push(el);
  }

  // A number in a box of its own names the story in the box beside it. A title box two
  // numbers both reach for belongs to neither.
  const pairs = numberBoxes.map((nb) => ({
    nb,
    title: titleBoxFor(els.find((e) => e.id === nb.elementId)!, titleCands),
  }));
  for (const p of pairs) {
    if (!p.title) continue;
    if (pairs.filter((q) => q.title === p.title).length > 1) continue;
    const number = Number(p.nb.num.digits);
    const mine = own.get(p.title.id) ?? [];
    if (mine.length === 0) {
      own.set(p.title.id, [{ refs: [p.nb], number, text: whole.get(p.title.id) ?? '' }]);
    } else if (mine.length === 1 && mine[0]!.number === number) {
      // The figure and the entry's own text print the same page number: one entry,
      // two places its number moves.
      mine[0]!.refs.push(p.nb);
    } else if (mine.length === 1) {
      // A different number opening the box beside the figure is part of its title
      // ("3 Generations at Waikato"): the figure is the page number.
      own.set(p.title.id, [{ refs: [p.nb], number, text: whole.get(p.title.id) ?? '' }]);
    }
    // Several entries in one box beside one figure: which one it numbers is a guess.
  }
  return [...own.values()].flat().filter((e) => e.number >= 1 && letters(e.text));
}

// ── Matching an entry to a page ──────────────────────────────────────────────

function stem(w: string): string {
  if (/^\d+$/.test(w)) return w;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** The words that carry meaning, as a reader would compare them. */
function keyToks(s: string): string[] {
  const base = s
    .slice(0, MAX_TITLE_CHARS)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/['’‘`]/g, '');
  return words(base)
    .filter((w) => w !== '&' && !STOP.has(w))
    .map(stem);
}

interface EntryToks {
  title: string[];
  teaser: string[];
  full: string[];
}

/** Where a title ends and its teaser (or a headline's own subtitle) begins. */
const TITLE_BREAK = /\s*(?::|\s[—–-]\s|\s\|\s)\s*/;

/** "Bloodlines: three families…" → title "Bloodlines", teaser "three families…". */
function entryToks(text: string): EntryToks {
  const m = TITLE_BREAK.exec(text);
  const title = m ? text.slice(0, m.index) : text;
  const teaser = m ? text.slice(m.index + m[0].length) : '';
  return { title: keyToks(title), teaser: keyToks(teaser), full: keyToks(text) };
}

function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

function startsWith(a: string[], b: string[]): boolean {
  return b.length > 0 && a.length >= b.length && b.every((w, i) => a[i] === w);
}

const same = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && a.every((w, i) => w === b[i]);

interface Cand {
  /** The title's words. */
  toks: string[];
  /** Its words before its own colon/dash ("The Long Game" of "The Long Game: Ten Years…"). */
  lead: string[];
  /** How much a match on this text counts: the headline fully, a kicker less. */
  w: number;
}

/**
 * How well an entry names a page title, 0…1. Deliberately strict: one shared word of
 * two ("Letters to the Editor" / "From the Editor") is NOT a match, and an entry that
 * merely starts like a headline ("Bloodlines of the North" / "Bloodlines") is not either.
 */
function similarity(e: EntryToks, c: Cand): number {
  const h = c.toks;
  if (h.length === 0) return 0;
  let s = dice(e.title, h);
  // The entry names the headline's main part — "The Long Game" for "The Long Game: Ten
  // Years of Patience" — or opens with the WHOLE of such a headline, which the entry's
  // own title/teaser split cut at the headline's colon. Only at that colon: a headline
  // that merely runs on into the entry's teaser words is not the entry's title.
  if (c.lead.length < h.length && same(e.title, c.lead)) s = Math.max(s, startsWith(e.full, h) ? 1 : 0.95);
  // Titled by section, with the headline as its teaser: "Sales: The Long Game".
  if (e.teaser.length >= 2) s = Math.max(s, 0.9 * dice(e.teaser, h));
  return s;
}

interface Target {
  idx: number;
  cands: Cand[];
  /** The page's main headline as words — two pages with the same key are one title twice. */
  key: string;
  prevPageNo?: number;
}

const byReadingOrder = (a: MagazineElement, b: MagazineElement) => Math.round(a.y / 8) - Math.round(b.y / 8) || a.x - b.x;

/** What a contents entry could call this page: its headline above all, then any other
 *  headline (a two-tone headline is two boxes), its section label, its kicker. */
function targetOf(page: ContentsSyncPage, idx: number): Target {
  const texts = textEls(page).filter((e) => letters(plainText(e.text!.content)));
  // A figure is set as a headline ("4.8%"); it is not what the page is called.
  const main = mainHeadline({ pageNo: idx + 1, elements: texts });
  const cands: Cand[] = [];
  const add = (s: string, w: number) => {
    if (!s || s.length > MAX_TITLE_CHARS) return;
    const toks = keyToks(s);
    const br = TITLE_BREAK.exec(s);
    if (toks.length) cands.push({ toks, lead: br ? keyToks(s.slice(0, br.index)) : toks, w });
  };
  const mainPlain = main ? plainText(main.text!.content) : '';
  add(mainPlain, 1);
  const heads = texts.filter((e) => e.text!.role === 'headline').sort(byReadingOrder);
  for (const h of heads) if (h !== main) add(plainText(h.text!.content), 0.95);
  if (heads.length > 1) add(heads.map((h) => plainText(h.text!.content)).join(' '), 1);
  const label = page.elements.find((e) => e.id === HEAD_LABEL_ID && e.type === 'text' && !!e.text?.content);
  if (label) add(plainText(label.text!.content), 0.9);
  // A KICKER — a short subhead set above the headline — is often the section a contents
  // entry is titled by. Not any short subhead: a deck under the headline, or a cover
  // line, routinely echoes ANOTHER page's headline.
  for (const k of texts) {
    if (k.text!.role !== 'subhead' || !main || k === main || k.y + k.h > main.y + 4) continue;
    const p = plainText(k.text!.content);
    if (p.split(/\s+/).length <= 5) add(p, 0.85);
  }
  return {
    idx,
    cands,
    key: mainPlain && mainPlain.length <= MAX_TITLE_CHARS ? keyToks(mainPlain).join(' ') : '',
    ...(typeof page.prevPageNo === 'number' ? { prevPageNo: page.prevPageNo } : {}),
  };
}

function scoreOf(e: EntryToks, t: Target): number {
  let best = 0;
  for (const c of t.cands) best = Math.max(best, c.w * similarity(e, c));
  return best;
}

type Pick = { target: Target; score: number } | { why: string };

/** The ONE page this entry names, or why there is none. */
function pick(entry: Entry, targets: Target[], removed: Set<number>): Pick {
  const et = entryToks(entry.text);
  const scored = targets
    .map((t) => ({ t, s: scoreOf(et, t) }))
    .filter((x) => x.s >= MIN_SCORE)
    .sort((a, b) => b.s - a.s || a.t.idx - b.t.idx);
  if (scored.length === 0) return { why: 'no page carries that title' };
  const best = scored[0]!;
  const close = scored.filter((x) => x.s > best.s - MARGIN);
  let chosen = best;
  if (close.length > 1) {
    // Two pages fit. The one this entry pointed at before the change still does.
    const byPrev = close.filter((x) => x.t.prevPageNo === entry.number);
    const order = [...close].sort((a, b) => a.t.idx - b.t.idx);
    // One story over consecutive pages under one headline: a contents lists where it starts.
    const oneStory =
      !!best.t.key &&
      close.every((x) => x.t.key === best.t.key) &&
      order.every((x, i) => i === 0 || x.t.idx === order[i - 1]!.t.idx + 1);
    if (byPrev.length === 1) chosen = byPrev[0]!;
    else if (oneStory) chosen = order[0]!;
    else return { why: `${close.length} pages fit it equally well` };
  }
  if (removed.has(entry.number) && chosen.t.prevPageNo !== entry.number && chosen.s < STRONG) {
    return { why: 'the page it listed was removed' };
  }
  // "3 Generations at Waikato" read as page 3 + "Generations at Waikato": the headline
  // opens with that very number, so it is the title's, not a page number.
  const head0 = chosen.t.key.split(' ')[0] ?? '';
  const title0 = et.title[0] ?? '';
  const isNum = (w: string) => /^\d+$/.test(w);
  if (isNum(head0) && Number(head0) === entry.number && !(isNum(title0) && Number(title0) === entry.number)) {
    return { why: 'its number is part of the title' };
  }
  return { target: chosen.t, score: chosen.s };
}

function isKind(page: ContentsSyncPage, kind: string): boolean {
  return page.kind === kind || page.pageType === kind;
}

/** true / false when the caller knows the page's kind, undefined when it must be read. */
function hintedContents(page: ContentsSyncPage): boolean | undefined {
  if (!page.kind && !page.pageType) return undefined;
  return isKind(page, 'contents');
}

/** 1, 2, 3… — a numbered list. A contents page starts after the cover, never at 1. */
function isListRun(nums: number[]): boolean {
  if (nums.length < 2) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted.every((n, i) => n === i + 1);
}

function hasSignal(page: ContentsSyncPage): boolean {
  return page.elements.some((e) => {
    if (e.type !== 'text' || !e.text?.content) return false;
    const p = plainText(e.text.content);
    return p.length <= 60 && SIGNAL.test(p);
  });
}

// ── Writing the numbers ──────────────────────────────────────────────────────

/** "04" stays two digits; on a page that pads ("04", "08"), "12" → "04" pads too. */
function formatNumber(n: number, old: string, pagePad: number): string {
  if (old.length > 1 && old.startsWith('0')) return String(n).padStart(old.length, '0');
  if (pagePad > 0 && old.length >= pagePad) return String(n).padStart(pagePad, '0');
  return String(n);
}

function rewrite(html: string, edits: { num: NumRef; digits: string }[]): string {
  const toks = tokenize(html);
  const sorted = [...edits].sort((a, b) => b.num.tok - a.num.tok || b.num.start - a.num.start);
  for (const e of sorted) {
    const t = toks[e.num.tok]!;
    t.s = t.s.slice(0, e.num.start) + e.digits + t.s.slice(e.num.end);
  }
  return toks.map((t) => t.s).join('');
}

/** A longer number must still fit its box at the size it prints at now. A box the
 *  measure already disagrees with is not the number's doing, so it is let through. */
function stillFits(el: MagazineElement, html: string): boolean {
  const clip = { ...el, text: { ...el.text!, autoFit: 'clip' as const } };
  if (!replacementFits(clip, el.text!.content).ok) return true;
  return replacementFits(clip, html).ok;
}

const label = (text: string) => text.slice(0, 80);

/**
 * Re-point every contents entry at the page it names, given the issue's pages in their
 * CURRENT order (page number = index + 1). Returns the new element arrays of the
 * contents pages whose numbers changed — nothing else on any page is touched.
 */
export function syncContentsPage(pages: ContentsSyncPage[], opts: ContentsSyncOptions = {}): ContentsSyncResult {
  const result: ContentsSyncResult = { contentsPages: [], updates: [], skipped: [] };
  if (pages.length < 2) return result;
  const removed = new Set(opts.removedPageNos ?? []);
  const entries = pages.map((p) => (hintedContents(p) === false ? [] : readEntries(p)));
  if (entries.every((list) => list.length === 0)) return result;
  const targets = pages.map((p, i) => targetOf(p, i));
  // A contents page never lists the cover or the back cover. Page 1 IS the cover unless
  // the caller says otherwise — and it must be ruled out, because cover lines are the
  // other place the issue's headlines are printed: an entry whose story was deleted
  // would otherwise find its headline again on the cover and be renumbered "1".
  const listable = (i: number) => {
    const p = pages[i]!;
    if (isKind(p, 'cover') || isKind(p, 'back-cover')) return false;
    return i > 0 || !!p.kind || !!p.pageType;
  };

  // Which pages are contents pages: their entries name other pages.
  pages.forEach((page, i) => {
    const list = entries[i]!;
    if (list.length === 0) return;
    const others = targets.filter((t) => t.idx !== i && listable(t.idx));
    const matched = list.filter((e) => 'target' in pick(e, others, removed)).length;
    const hinted = hintedContents(page);
    const isContents =
      hinted === true
        ? matched >= 1
        : (matched >= 2 && !isListRun(list.map((e) => e.number))) || (matched >= 1 && hasSignal(page));
    if (isContents) result.contentsPages.push(i);
  });

  const contents = new Set(result.contentsPages);
  for (const ci of result.contentsPages) {
    const page = pages[ci]!;
    const list = entries[ci]!;
    const others = targets.filter((t) => !contents.has(t.idx) && listable(t.idx));
    const picks = list.map((e) => ({ e, p: pick(e, others, removed) }));

    // One page, one entry: when two entries name the same page, the clearly better
    // match keeps it and the other is left alone; a dead heat moves neither.
    const kept: { e: Entry; target: Target }[] = [];
    for (const { e, p } of picks) {
      const skip = (why: string) =>
        result.skipped.push({ pageIdx: ci, elementId: e.refs[0]!.elementId, title: label(e.text), why });
      if (!('target' in p)) {
        skip(p.why);
        continue;
      }
      const beaten = picks.some((q) => q.e !== e && 'target' in q.p && q.p.target.idx === p.target.idx && q.p.score >= p.score);
      if (beaten) {
        skip('another entry names that page');
        continue;
      }
      kept.push({ e, target: p.target });
    }

    // Every place a number moves, per entry: an entry whose figure and text both print
    // the number moves in both or in neither.
    const digitsOf = list.flatMap((e) => e.refs.map((r) => r.num.digits));
    const pagePad = Math.max(0, ...digitsOf.map((d) => (d.length > 1 && d.startsWith('0') ? d.length : 0)));
    interface Move {
      e: Entry;
      toNo: number;
      targetIdx: number;
      edits: { ref: NumberRef; digits: string }[];
    }
    let moves: Move[] = kept
      .filter((k) => k.target.idx + 1 !== k.e.number)
      .map((k) => {
        const toNo = k.target.idx + 1;
        const edits = k.e.refs
          .map((ref) => ({ ref, digits: formatNumber(toNo, ref.num.digits, pagePad) }))
          .filter((x) => x.digits !== x.ref.num.digits);
        return { e: k.e, toNo, targetIdx: k.target.idx, edits };
      })
      .filter((m) => m.edits.length > 0);

    const htmlFor = (el: MagazineElement, ms: Move[]) =>
      rewrite(
        el.text!.content,
        ms.flatMap((m) => m.edits.filter((x) => x.ref.elementId === el.id).map((x) => ({ num: x.ref.num, digits: x.digits }))),
      );
    // A number that grows a digit must still fit its box; an entry that would not is
    // left as it is everywhere it prints.
    for (let pass = 0; pass < 3 && moves.length > 0; pass++) {
      const failed = new Set<Move>();
      for (const el of page.elements) {
        const mine = moves.filter((m) => m.edits.some((x) => x.ref.elementId === el.id));
        if (mine.length === 0 || !el.text) continue;
        const growing = mine.filter((m) => m.edits.some((x) => x.ref.elementId === el.id && x.digits.length > x.ref.num.digits.length));
        if (growing.length && !stillFits(el, htmlFor(el, mine))) growing.forEach((m) => failed.add(m));
      }
      if (failed.size === 0) break;
      for (const m of failed) {
        result.skipped.push({ pageIdx: ci, elementId: m.e.refs[0]!.elementId, title: label(m.e.text), why: `"${m.toNo}" would not fit its box` });
      }
      moves = moves.filter((m) => !failed.has(m));
    }
    if (moves.length === 0) continue;

    const changedIds: string[] = [];
    const elements = page.elements.map((el) => {
      if (!el.text || !moves.some((m) => m.edits.some((x) => x.ref.elementId === el.id))) return el;
      const html = htmlFor(el, moves);
      if (html === el.text.content) return el;
      changedIds.push(el.id);
      return { ...el, text: { ...el.text, content: html } };
    });
    if (changedIds.length === 0) continue;
    result.updates.push({
      pageIdx: ci,
      ...(page.id !== undefined ? { id: page.id } : {}),
      elements,
      changedElementIds: changedIds,
      changes: moves.map((m) => ({
        elementId: m.e.refs[0]!.elementId,
        title: label(m.e.text),
        fromNo: m.e.number,
        toNo: m.toNo,
        targetIdx: m.targetIdx,
      })),
    });
  }
  return result;
}
