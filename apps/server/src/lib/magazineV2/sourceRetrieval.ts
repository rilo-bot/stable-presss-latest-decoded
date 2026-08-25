// ---------------------------------------------------------------------------
// Magazine Builder v2 — retrieval over STORED chunks, with a receipt.
//
// This is what replaces `slice(0, 60_000)` on a concatenation of every attached
// document. That line looked reasonable and silently dropped attachments four and
// five: five documents can be 400k characters, the joined string was cut at 60k
// from the head, and nobody — not the model, not the user — was told.
//
// Two properties make that unrepresentable rather than fixed:
//
//   1. A PER-DOCUMENT FLOOR. Budget is shared out per document before ranking, so
//      a document can be outranked but never starved to zero. It is arithmetic,
//      not vigilance.
//   2. A RECEIPT COMPUTED FROM WHAT WAS PACKED. Every counter is incremented as a
//      chunk is appended to the text, never derived from the query parameters. A
//      receipt built from inputs ("5 docs asked for, budget was small, so probably
//      truncated") can disagree with its own payload — the same bug as the
//      coverage line that read `hasIntent` instead of the strategy actually used.
//
// PURE. Chunks come in as data, so all of this is testable without a database.
// ---------------------------------------------------------------------------

import { buildScorer, intentTerms, type IntentKind, type RetrievalStrategy } from './retrieval.js';
import type { SourceChunk } from './sourceStore.js';

/** What one document contributed, counted as it was packed. */
export interface DocReceipt {
  docId: string;
  name: string;
  chunksUsed: number;
  chunksAvailable: number;
  /** Page numbers actually represented in the text, ascending. */
  pages: number[];
}

export interface RetrievalReceipt {
  docs: DocReceipt[];
  /** Documents the budget could not seat at all. Reported, never silent. */
  docsOmitted: number;
  /** True when any document contributed fewer chunks than it had, or was omitted. */
  truncated: boolean;
  /** How passages were chosen — mirrors the string path's vocabulary. */
  strategy: RetrievalStrategy;
  charsUsed: number;
  charsBudget: number;
}

export interface RetrievedSource {
  text: string;
  receipt: RetrievalReceipt;
}

/** One document's chunks, plus the name a receipt should show. */
export interface DocChunks {
  docId: string;
  name: string;
  chunks: SourceChunk[];
}

export interface RetrieveForIntentOpts {
  /** What this prompt is about. Absent ⇒ breadth across every document. */
  intent?: string;
  /** Where the intent came from — 'chat' also stops request verbs. */
  kind?: IntentKind;
  budgetChars: number;
  /** Chunks already cited by EARLIER pages of this issue, as `pageNo:seq` keys.
   *  Penalised rather than excluded: a passage may legitimately serve two pages,
   *  but page 7 should stop re-quoting page 2's paragraphs. */
  usedKeys?: Set<string>;
  /** Smallest slice any one document may receive, so document five is never
   *  starved by document one. Raised to the whole budget when there is one doc. */
  perDocMinChars?: number;
}

/** Stable identity of a chunk within its document. */
export function chunkKey(c: Pick<SourceChunk, 'pageNo' | 'seq'>): string {
  return `${c.pageNo}:${c.seq}`;
}

/** Below this, a document's slice is too small to carry a usable passage, so
 *  serving it would be a gesture rather than a contribution. */
const MIN_USABLE_CHARS = 250;
/** How much a chunk an earlier page already used is demoted. A penalty, not a
 *  ban — a truly central passage can still win, it just stops winning twice. */
const REUSE_PENALTY = 0.4;

export interface BudgetPlan {
  /** How many documents can be served a usable slice, in the order given. */
  served: number;
  /** Characters each served document may contribute. */
  perDoc: number;
  /** Documents that did not fit. Never silent — the receipt reports it. */
  omitted: number;
}

/**
 * Divide the budget across documents.
 *
 * The obvious version of this is wrong in a way worth recording. An even split
 * with a floor — `max(perDocMin, budget / n)` — can sum to more than the budget
 * (twenty documents with a 700-character floor needs 14,000 of a 6,000 budget),
 * and then whatever enforces the global cap starves the documents at the end of
 * the list. That is the ORIGINAL BUG rebuilt one layer down: attachments four and
 * five contribute nothing, and nobody is told.
 *
 * So the number of documents served is bounded by what the budget can actually
 * pay for, the split is even among those, and the remainder is reported as
 * `omitted` rather than quietly dropped.
 */
export function planBudget(docCount: number, budgetChars: number, minUsable = MIN_USABLE_CHARS): BudgetPlan {
  const budget = Math.max(500, Math.floor(budgetChars));
  if (docCount <= 0) return { served: 0, perDoc: 0, omitted: 0 };
  if (docCount === 1) return { served: 1, perDoc: budget, omitted: 0 };
  const affordable = Math.max(1, Math.floor(budget / minUsable));
  const served = Math.min(docCount, affordable);
  return { served, perDoc: Math.floor(budget / served), omitted: docCount - served };
}

/**
 * Pack one document's chunks into a character budget, best first, then restore
 * document order. Returns what it used so the caller can count it — the receipt is
 * built from these, never guessed.
 */
function packDoc(
  chunks: SourceChunk[],
  score: ((text: string) => number) | null,
  budget: number,
  usedKeys: Set<string>,
): SourceChunk[] {
  const ranked =
    score === null
      ? // No usable terms: a breadth spread across this document, always including
        // its opening, so the model sees the whole shape rather than the head.
        spread(chunks, budget)
      : chunks
          .map((c) => {
            const raw = score(c.text);
            const penalised = usedKeys.has(chunkKey(c)) ? raw * REUSE_PENALTY : raw;
            return { c, score: penalised };
          })
          .filter((s) => s.score > 0)
          // Ties break on document position — retrieval must be deterministic to
          // be testable, and "same document, same intent, same excerpt" is what
          // makes a bad page reproducible.
          .sort((a, b) => b.score - a.score || a.c.pageNo - b.c.pageNo || a.c.seq - b.c.seq)
          .map((s) => s.c);

  const picked: SourceChunk[] = [];
  let used = 0;
  for (const c of ranked) {
    if (used + c.chars + 2 > budget && picked.length > 0) continue;
    picked.push(c);
    used += c.chars + 2;
    if (used >= budget) break;
  }
  return picked.sort((a, b) => a.pageNo - b.pageNo || a.seq - b.seq);
}

/** A representative spread: the opening, then chunks paced across the rest. */
function spread(chunks: SourceChunk[], budget: number): SourceChunk[] {
  if (chunks.length === 0) return [];
  const ordered = [...chunks].sort((a, b) => a.pageNo - b.pageNo || a.seq - b.seq);
  const out: SourceChunk[] = [];
  const taken = new Set<number>();
  let used = 0;
  const take = (i: number): void => {
    const c = ordered[i];
    if (!c || taken.has(i)) return;
    if (used + c.chars + 2 > budget && out.length > 0) return;
    taken.add(i);
    out.push(c);
    used += c.chars + 2;
  };
  take(0);
  const probes = Math.max(1, Math.floor(budget / 900));
  for (let k = 1; k <= probes && ordered.length > 1; k++) {
    take(Math.round((k / (probes + 1)) * (ordered.length - 1)));
  }
  for (let i = 0; i < ordered.length && used < budget; i++) take(i);
  return out.sort((a, b) => a.pageNo - b.pageNo || a.seq - b.seq);
}

/**
 * Select the passages of one or more stored documents to put in a prompt, within
 * a character budget, and account for exactly what was selected.
 */
export function retrieveForIntent(docs: DocChunks[], opts: RetrieveForIntentOpts): RetrievedSource {
  const budgetChars = Math.max(500, Math.floor(opts.budgetChars));
  const present = docs.filter((d) => d.chunks.length > 0);
  const usedKeys = opts.usedKeys ?? new Set<string>();

  if (present.length === 0) {
    return {
      text: '',
      receipt: { docs: [], docsOmitted: 0, truncated: false, strategy: 'sample', charsUsed: 0, charsBudget: budgetChars },
    };
  }

  const terms = opts.intent ? intentTerms(opts.intent, opts.kind ?? 'editorial') : [];
  const score = terms.length > 0 ? buildScorer(terms) : null;
  const plan = planBudget(present.length, budgetChars, opts.perDocMinChars);
  const serving = present.slice(0, plan.served);

  const parts: string[] = [];
  const receipts: DocReceipt[] = [];
  let charsUsed = 0;
  let anyRelevance = false;

  for (const d of serving) {
    let picked = packDoc(d.chunks, score, plan.perDoc, usedKeys);
    // A scored document that matched NOTHING still owes the prompt its share:
    // falling silent would reintroduce the silent drop by another route. Give it
    // a breadth spread and let the receipt say relevance did not apply.
    if (picked.length === 0) picked = packDoc(d.chunks, null, plan.perDoc, usedKeys);
    else if (score !== null) anyRelevance = true;

    if (picked.length === 0) continue;
    const body = picked.map((c) => c.text).join('\n\n');
    parts.push(present.length > 1 ? `[From “${d.name}”]\n${body}` : body);
    charsUsed += body.length;
    receipts.push({
      docId: d.docId,
      name: d.name,
      chunksUsed: picked.length,
      chunksAvailable: d.chunks.length,
      pages: [...new Set(picked.map((c) => c.pageNo))].sort((a, b) => a - b),
    });
  }

  // Every field below is counted from what was packed, so the receipt cannot
  // describe a payload it did not produce.
  const truncated = plan.omitted > 0 || receipts.some((r) => r.chunksUsed < r.chunksAvailable);
  const strategy: RetrievalStrategy = anyRelevance ? 'relevance' : truncated ? 'sample' : 'verbatim';

  return {
    text: parts.join('\n\n'),
    receipt: {
      docs: receipts,
      docsOmitted: plan.omitted,
      truncated,
      strategy,
      charsUsed,
      charsBudget: budgetChars,
    },
  };
}

/**
 * The coverage sentence for a receipt, for the prompt and for the user.
 *
 * One renderer, because the receipt and the sentence describing it must not be
 * able to disagree — the mistake the envelope's first coverage line made.
 */
export function receiptLine(receipt: RetrievalReceipt): string {
  if (receipt.docs.length === 0) return '';
  const parts = receipt.docs.map((d) =>
    d.chunksUsed < d.chunksAvailable
      ? `“${d.name}”: ${d.chunksUsed} of ${d.chunksAvailable} passages`
      : `“${d.name}”: all ${d.chunksAvailable} passages`,
  );
  if (receipt.docsOmitted > 0) {
    parts.push(
      `${receipt.docsOmitted} further document${receipt.docsOmitted === 1 ? '' : 's'} did not fit this budget and contributed nothing`,
    );
  }
  return `${receipt.truncated ? 'Excerpted' : 'Complete'} — ${parts.join('; ')}.`;
}
