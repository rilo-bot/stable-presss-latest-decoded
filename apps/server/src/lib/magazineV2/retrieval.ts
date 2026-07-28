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

/** Distinct subject keywords from an intent string (lowercased, de-stopworded,
 *  length ≥ 3). */
function keywords(intent: string): string[] {
  return [...new Set(intent.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w)))];
}

/** Relevance of one chunk to the keyword set: distinct keywords present (primary
 *  signal), with total occurrences as a tiebreak. */
function scoreChunk(chunkLower: string, kws: string[]): number {
  let distinct = 0;
  let total = 0;
  for (const kw of kws) {
    let idx = chunkLower.indexOf(kw);
    if (idx === -1) continue;
    distinct += 1;
    while (idx !== -1) {
      total += 1;
      idx = chunkLower.indexOf(kw, idx + kw.length);
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
 * Return the portion of `source` to feed a generation prompt, within `maxChars`.
 * With an `intent`, ranks chunks by keyword relevance and returns the best in
 * document order; without one (or on no keyword hit), returns a representative
 * whole-document sample. If the source already fits, returns it unchanged.
 */
export function retrieveSource(source: string | undefined, opts: { intent?: string; maxChars: number }): string {
  const text = (source ?? '').trim();
  const maxChars = Math.max(500, Math.floor(opts.maxChars));
  if (text.length <= maxChars) return text;

  const chunks = chunkSource(text);
  const kws = opts.intent ? keywords(opts.intent) : [];

  if (kws.length > 0) {
    const ranked = chunks
      .map((c, i) => ({ i, c, score: scoreChunk(c.toLowerCase(), kws) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
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
      return picked.map((s) => s.c).join('\n\n');
    }
  }
  return representativeSample(chunks, maxChars);
}

/** True when `source` is longer than the budget, so callers can add an honest
 *  "this is an excerpt of a longer document" note to the prompt (no silent drop). */
export function isTruncated(source: string | undefined, maxChars: number): boolean {
  return (source ?? '').trim().length > Math.max(500, Math.floor(maxChars));
}
