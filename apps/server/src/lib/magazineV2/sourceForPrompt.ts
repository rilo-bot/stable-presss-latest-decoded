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
import { getSourceDoc, loadCandidateChunks } from './sourceDocsDb.js';
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
    return {
      block: renderRetrieved(retrieved, { task: opts.task }),
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
