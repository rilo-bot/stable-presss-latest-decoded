// ---------------------------------------------------------------------------
// Magazine Builder v2 — resolve "the user's source material" for one prompt.
//
// The generation agents should not know whether a document is a string that came
// up the wire or rows in a collection. They ask for "the material relevant to
// this, within this budget" and get a rendered block. This is the seam that lets
// Phase 3 move every consumer onto stored documents without any of them changing
// shape twice.
//
// It is also the ONE place both worlds meet, deliberately: the legacy string path
// and the chunk path both come out through sourceEnvelope's wrap(), so the
// untrusted-data guard cannot be present on one and missing on the other.
// ---------------------------------------------------------------------------

import { renderRetrieved, renderSource } from './sourceEnvelope.js';
import { retrieveForIntent, type RetrievalReceipt } from './sourceRetrieval.js';
import { intentTerms, type IntentKind } from './retrieval.js';
import { getSourceDoc, loadCandidateChunks, loadOutlineHeads } from './sourceDocsDb.js';
import { buildOutline, formatOutline } from './sourceOutline.js';
import { OUTLINE_BUDGET } from './sourceLimits.js';
import { isReadable } from './sourceStore.js';

/**
 * WHERE a prompt's source material comes from.
 *
 * `docIds` is the real answer. `text` is the compatibility shim for callers still
 * posting a raw string, and it is deliberately the second-class citizen: it cannot
 * be resumed, cannot be re-read by a later page, and dies with the request that
 * carried it. It goes away once the last caller does.
 */
export interface SourceSelector {
  docIds?: string[];
  text?: string;
}

export interface ResolvedSource {
  /** The prompt-ready block, '' when there is no usable material. */
  block: string;
  /** Present only on the chunk path — what was actually selected. */
  receipt?: RetrievalReceipt;
  /** Documents named but not usable (still reading, or failed). Callers that
   *  report progress to a person want this; the prompt does not. */
  unavailable: string[];
}

const EMPTY: ResolvedSource = { block: '', unavailable: [] };

/** True when a selector could yield anything at all — cheap enough to call in a
 *  branch that only wants to know whether to mention a document. */
export function hasSource(sel?: SourceSelector): boolean {
  return !!(sel && ((sel.docIds && sel.docIds.length > 0) || (sel.text && sel.text.trim())));
}

export interface ResolveOpts {
  /** What this prompt is about. Omit for a whole-issue read. */
  intent?: string;
  kind?: IntentKind;
  maxChars: number;
  /** One line naming what the model should do with the material. */
  task: string;
  /** Chunks earlier pages of this issue already cited, so this page prefers others. */
  usedKeys?: Set<string>;
  /**
   * Include a MAP of the document — one line per page — alongside the excerpt.
   *
   * For the issue PLANNER, which chooses a running order and would otherwise be
   * doing it from a three-per-cent sample of a long document. Not for a page draft:
   * that page needs depth on its own subject, and a map of the other 499 pages is
   * budget spent on material it must not use.
   */
  withMap?: boolean;
}

/**
 * Build the document map for one or more documents.
 *
 * With several documents each gets its own map under its own name, because a
 * merged list of page numbers from three files is worse than no map at all — the
 * planner would read "page 4" without knowing which document it belongs to.
 *
 * The budget is split between them, so attaching four documents cannot quietly
 * quadruple the prompt.
 */
async function buildMap(docIds: string[]): Promise<string> {
  if (docIds.length === 0) return '';
  const share = Math.floor(OUTLINE_BUDGET / docIds.length);
  const parts: string[] = [];
  for (const docId of docIds) {
    let heads;
    try {
      heads = await loadOutlineHeads(docId);
    } catch (e) {
      // A map is an enhancement. Losing it must never lose the excerpt with it.
      console.warn('[sourceForPrompt] outline failed for', docId, e instanceof Error ? e.message : e);
      continue;
    }
    // buildOutline, not a per-page map: the running headers can only be spotted by
    // looking at the whole document, and a map that repeats one of them 400 times is
    // the main way a document map turns out worthless.
    const entries = buildOutline(heads);
    const text = formatOutline(entries, { budgetChars: share });
    // Logged because it is otherwise invisible: the map lives inside a prompt, so
    // "did the planner get the shape of the document?" has no observable answer
    // without this. Says what was mapped and what was dropped, so a document that
    // maps to nothing (all running headers, or a budget too small) is diagnosable
    // rather than just absent.
    const mapped = entries.filter((e) => e.head).length;
    console.log(
      `[sourceForPrompt] map ${docId}: ${heads.length} page(s) read → ${mapped} mappable → ${
        text ? `${text.split('\n').length - 1} on the map, ${text.length} chars` : 'no map'
      }`,
    );
    if (!text) continue;
    const doc = docIds.length > 1 ? await getSourceDoc(docId) : null;
    parts.push(doc ? [doc.originalName, text].join('\n') : text);
  }
  return parts.join('\n\n');
}

/**
 * Resolve a selector into a prompt block.
 *
 * Stored documents win when both are present: a docId is re-readable and carries
 * coverage, a string is neither, so if a caller supplies both during the
 * transition the better source is the one used.
 */
export async function resolveSource(sel: SourceSelector | undefined, opts: ResolveOpts): Promise<ResolvedSource> {
  if (!hasSource(sel)) return EMPTY;

  const ids = sel!.docIds ?? [];
  if (ids.length > 0) {
    const terms = opts.intent ? intentTerms(opts.intent, opts.kind ?? 'editorial') : [];
    const unavailable: string[] = [];
    const docs = [];

    for (const docId of ids) {
      const doc = await getSourceDoc(docId);
      if (!doc || doc.deletedAt) continue;
      // A document still being read is not an error and not a silent omission —
      // it is reported, so a caller can tell the user "one attachment is still
      // being read" rather than quietly building without it.
      if (!isReadable(doc.status)) {
        unavailable.push(doc.originalName);
        continue;
      }
      const chunks = await loadCandidateChunks(docId, terms);
      if (chunks.length > 0) docs.push({ docId, name: doc.originalName, chunks });
    }

    if (docs.length === 0) return { ...EMPTY, unavailable };

    const retrieved = retrieveForIntent(docs, {
      intent: opts.intent,
      kind: opts.kind,
      budgetChars: opts.maxChars,
      usedKeys: opts.usedKeys,
    });
    // The map is built from the same documents, and only when asked: it is one
    // cheap projected query per document, but it is still a query.
    const map = opts.withMap ? await buildMap(docs.map((d) => d.docId)) : '';

    return {
      block: renderRetrieved(retrieved, { task: opts.task, map: map || undefined }),
      receipt: retrieved.receipt,
      unavailable,
    };
  }

  // Legacy string path — same wrap(), same guard.
  return {
    block: renderSource(sel!.text, {
      intent: opts.intent,
      kind: opts.kind,
      maxChars: opts.maxChars,
      task: opts.task,
    }),
    unavailable: [],
  };
}

/** Block only, for call sites that just need the prompt text. */
export async function renderSourceFor(sel: SourceSelector | undefined, opts: ResolveOpts): Promise<string> {
  return (await resolveSource(sel, opts)).block;
}
