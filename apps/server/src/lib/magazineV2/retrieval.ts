// ---------------------------------------------------------------------------
// Magazine Builder v2 — source-document retrieval.
//
// Replaces the blind `source.slice(0, N)` head-truncation that made "build from
// this document" only ever see the document's OPENING (so every page rehashed
// the intro and the back half was never written). Instead:
//   • for a PER-PAGE intent, return the source sections most RELEVANT to that
//     page, so each page draws copy from the right part of the document;
//   • for the whole-issue planner (no intent), return a REPRESENTATIVE sample
//     spread across the ENTIRE document, so the outline reflects all of it.
//
// Deterministic, bounded, no LLM, no I/O — a correct retrieval primitive the
// generation agents call instead of truncating. A budget (maxChars) still
// applies (LLM context is finite), but selection is now smart, not "the head".
// ---------------------------------------------------------------------------

// Intent strings are mostly editorial boilerplate ("a feature on…", "a page
// developing…") — stopping these words keeps scoring on the real subject terms.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those', 'their', 'our', 'your',
  'its', 'about', 'into', 'over', 'under', 'than', 'then', 'not', 'page', 'pages', 'issue',
  'magazine', 'article', 'feature', 'story', 'spread', 'section', 'develop', 'developing',
  'distinct', 'specific', 'aspect', 'own', 'angle', 'written', 'real', 'substance', 'covered',
  'other', 'full', 'bleed', 'column', 'photo', 'essay', 'pull', 'quote',
]);

/**
 * Noise in a REQUEST, but real subject nouns in editorial copy — so these are
 * stopped only for a chat intent, never for a planner-authored page intent.
 *
 * The page agent feeds the USER'S OWN WORDS in as an intent, and a request is
 * mostly verbs and politeness: "please fill this page from the attached
 * document" would otherwise rank the request's phrasing above its subject. But
 * `document`, `file`, `text`, `copy` and `content` are exactly the vocabulary of
 * a magazine about printing, archives or publishing — stop them on the
 * generation path and "the document trail behind the 1953 issue" retrieves on
 * "trail" and "1953" alone. Two input distributions, two lists.
 */
const REQUEST_WORDS = new Set([
  'fill', 'write', 'draft', 'make', 'add', 'use', 'using', 'put', 'update', 'change',
  'please', 'attached', 'attachment', 'document', 'file', 'pdf', 'text', 'copy', 'content',
]);

/** Where an intent came from — which decides whether request verbs are noise. */
export type IntentKind = 'chat' | 'editorial';

/** Split source into coherent chunks: paragraphs (blank-line separated), with a
 *  long paragraph packed into ~maxChunk-char windows on word boundaries (no
 *  fragile sentence regex — a window boundary only affects granularity). */
export function chunkSource(text: string, maxChunk = 900): string[] {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const p of paras) {
    if (p.length <= maxChunk) {
      chunks.push(p);
      continue;
    }
    let buf = '';
    for (const w of p.split(' ')) {
      if (buf && buf.length + w.length + 1 > maxChunk) {
        chunks.push(buf);
        buf = '';
      }
      buf += (buf ? ' ' : '') + w;
    }
    if (buf) chunks.push(buf);
  }
  return chunks;
}

/**
 * Split text into comparable tokens. THE one tokenizer, used for both sides of a
 * match: the terms stored on a chunk at ingest and the terms pulled from an
 * intent at query time. If those two ever came from different code, a token could
 * be indexed in one form and searched for in another — a whole document that
 * silently matches nothing, with no error anywhere. Same function, no drift.
 */
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!w) continue;
    // Space-delimited scripts need 3+ characters before a token carries subject
    // meaning. Scripts that do NOT separate words carry it in two — 東京 is a
    // place, not a fragment — so holding those to 3 would discard most of the
    // real terms in a CJK document.
    const min = /^[\p{Script=Latin}\p{Nd}]+$/u.test(w) ? 3 : 2;
    if (w.length >= min) out.add(w);
  }
  return [...out];
}

/**
 * Subject keywords from an intent: tokenized, then de-noised for where it came
 * from. The old `/[^a-z0-9]+/` split yielded ZERO keywords for an intent written
 * in Arabic, Chinese, Cyrillic or Greek, so those issues lost per-page retrieval
 * entirely and every page silently fell back to the same generic sample.
 */
export function intentTerms(intent: string, kind: IntentKind = 'editorial'): string[] {
  return tokenize(intent).filter((w) => !STOPWORDS.has(w) && !(kind === 'chat' && REQUEST_WORDS.has(w)));
}

const RE_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * How one keyword is looked for inside a chunk.
 *
 * A plain substring test matches INSIDE longer words: the intent word "art"
 * scored on "cartography", "particular" and "cart", quietly pulling the wrong
 * sections into a page. Latin-script keywords therefore match on word
 * boundaries. Scripts without word separators keep substring matching, where an
 * abutting character is normal rather than a false positive — a boundary rule
 * there would match almost nothing.
 */
function matcherFor(kw: string): RegExp | null {
  if (!/^[\p{Script=Latin}\p{Nd}]+$/u.test(kw)) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${kw.replace(RE_SPECIALS, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
}

interface Matcher {
  kw: string;
  /** null ⇒ match by substring (a script without word separators). */
  re: RegExp | null;
}

/** Build the matchers ONCE per retrieval, not once per chunk — a long document is
 *  thousands of chunks and the keyword set is fixed for the whole call. */
function matchers(kws: string[]): Matcher[] {
  return kws.map((kw) => ({ kw, re: matcherFor(kw) }));
}

/**
 * A scorer bound to one term set: `score(text)` → relevance, 0 for no match.
 *
 * Exported so retrieval over stored CHUNKS scores identically to retrieval over a
 * raw string. Two implementations of "how relevant is this passage" would drift,
 * and the drift would show up as the chunk-backed path quietly choosing different
 * passages than the string path it replaced — a regression with no error to catch.
 */
export function buildScorer(terms: string[]): (text: string) => number {
  const ms = matchers(terms);
  return (text: string) => scoreChunk(text.toLowerCase(), ms);
}

/** Relevance of one chunk to the keyword set: distinct keywords present (primary
 *  signal), with total occurrences as a tiebreak. */
function scoreChunk(chunkLower: string, ms: Matcher[]): number {
  let distinct = 0;
  let total = 0;
  for (const m of ms) {
    let hits = 0;
    if (m.re) {
      m.re.lastIndex = 0; // shared across chunks, so never trust its carried state
      for (let x = m.re.exec(chunkLower); x; x = m.re.exec(chunkLower)) hits += 1;
    } else {
      let idx = chunkLower.indexOf(m.kw);
      while (idx !== -1) {
        hits += 1;
        idx = chunkLower.indexOf(m.kw, idx + m.kw.length);
      }
    }
    if (hits > 0) {
      distinct += 1;
      total += hits;
    }
  }
  return distinct * 1000 + total;
}

/** A representative slice of the whole document: always the opening, then chunks
 *  spread evenly across the rest, up to the budget — so the reader sees breadth,
 *  not just the head. */
function representativeSample(chunks: string[], maxChars: number): string {
  if (chunks.length === 0) return '';
  const picked: { i: number; c: string }[] = [];
  let used = 0;
  const take = (idx: number): void => {
    const c = chunks[idx];
    if (!c || picked.some((p) => p.i === idx)) return;
    if (used + c.length + 2 > maxChars && picked.length > 0) return;
    picked.push({ i: idx, c });
    used += c.length + 2;
  };
  take(0);
  const probes = Math.max(1, Math.floor(maxChars / 900));
  for (let k = 1; k <= probes && chunks.length > 1; k++) {
    take(Math.round((k / (probes + 1)) * (chunks.length - 1)));
  }
  for (let i = 0; i < chunks.length && used < maxChars; i++) take(i); // fill leftover budget
  picked.sort((a, b) => a.i - b.i);
  return picked.map((p) => p.c).join('\n\n');
}

/**
 * WHICH selection actually produced the text — not which one was asked for.
 *
 * `verbatim`  the whole document fitted the budget and is returned unchanged.
 * `relevance` chunks ranked against an intent: a genuine per-page excerpt.
 * `sample`    a breadth spread across the WHOLE document.
 *
 * Callers must not infer this from their own inputs. Passing an intent does NOT
 * mean relevance selection happened: an intent whose every token is stopworded,
 * or one no chunk matches, falls through to `sample`. A prompt that inferred
 * "I asked for relevance, so this is a per-page excerpt" would assert a property
 * its own payload lacks — the same two-decisions-about-one-fact bug that the
 * duplicated 14000 literal was. So retrieval reports it, and nobody guesses.
 */
export type RetrievalStrategy = 'verbatim' | 'relevance' | 'sample';

export interface RetrievalOutcome {
  text: string;
  strategy: RetrievalStrategy;
}

export interface RetrieveOpts {
  intent?: string;
  maxChars: number;
  /** Defaults to 'editorial' — request verbs are only noise in a chat intent. */
  kind?: IntentKind;
}

/**
 * Return the portion of `source` to feed a generation prompt, within `maxChars`,
 * together with the strategy that produced it. With an `intent`, ranks chunks by
 * keyword relevance and returns the best in document order; without one (or on
 * no keyword hit), returns a representative whole-document sample. If the source
 * already fits, returns it unchanged.
 */
export function retrieveSourceDetailed(source: string | undefined, opts: RetrieveOpts): RetrievalOutcome {
  const text = (source ?? '').trim();
  const maxChars = Math.max(500, Math.floor(opts.maxChars));
  if (text.length <= maxChars) return { text, strategy: 'verbatim' };

  const chunks = chunkSource(text);
  const kws = opts.intent ? intentTerms(opts.intent, opts.kind ?? 'editorial') : [];

  if (kws.length > 0) {
    const score = buildScorer(kws);
    const ranked = chunks
      .map((c, i) => ({ i, c, score: score(c) }))
      .filter((s) => s.score > 0)
      // Equal scores break on document position, never on sort implementation:
      // retrieval has to be deterministic to be testable, and "same document,
      // same intent, same excerpt" is what makes a bad page reproducible.
      .sort((a, b) => b.score - a.score || a.i - b.i);
    if (ranked.length > 0) {
      const picked: { i: number; c: string }[] = [];
      let used = 0;
      for (const s of ranked) {
        if (used + s.c.length + 2 > maxChars && picked.length > 0) continue;
        picked.push(s);
        used += s.c.length + 2;
        if (used >= maxChars) break;
      }
      picked.sort((a, b) => a.i - b.i);
      return { text: picked.map((s) => s.c).join('\n\n'), strategy: 'relevance' };
    }
  }
  return { text: representativeSample(chunks, maxChars), strategy: 'sample' };
}

/** Text only, for callers that genuinely do not describe what they were given.
 *  Anything that puts this in a PROMPT wants retrieveSourceDetailed instead — see
 *  RetrievalStrategy for why. */
export function retrieveSource(source: string | undefined, opts: RetrieveOpts): string {
  return retrieveSourceDetailed(source, opts).text;
}

// `isTruncated` lived here and is gone. It existed so a caller could decide
// whether to warn the model it was seeing an excerpt — a second, independent
// answer to a question `strategy` now answers once. Its last caller was the
// envelope's coverage line, which was wrong precisely because the two decisions
// were separate.
