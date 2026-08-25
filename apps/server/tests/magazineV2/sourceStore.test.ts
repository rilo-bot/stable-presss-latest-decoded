// ---------------------------------------------------------------------------
// The source-document store: chunking, coverage honesty, and budgeted retrieval.
//
// Three questions shaped these tests, all of them variants of one failure —
// a record that describes itself wrongly:
//
//   1. If the reader dies between two writes, can progress be misread?
//   2. Can a partially-read document be observed as COMPLETE?
//   3. Can the receipt disagree with the chunks it claims to describe?
//
// The answers are meant to be structural: progress is derived from the rows, not
// a counter; `ready` is computed from coverage in one function; and every receipt
// field is counted as chunks are packed rather than inferred from the query.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chunkDocument,
  pagesAlreadyRead,
  coverageOf,
  statusForCoverage,
  isReadable,
  shouldChain,
  type SourceChunk,
} from '../../src/lib/magazineV2/sourceStore.js';
import {
  retrieveForIntent,
  planBudget,
  receiptLine,
  chunkKey,
  type DocChunks,
} from '../../src/lib/magazineV2/sourceRetrieval.js';
import { tokenize, intentTerms } from '../../src/lib/magazineV2/retrieval.js';

// ── chunking ────────────────────────────────────────────────────────────────

test('chunking numbers seq per PAGE, so a re-read page cannot collide', () => {
  // The reason identity is {docId, pageNo, seq} and not a running ord: a crash at
  // page 5 must be recoverable by rewriting page 5 alone.
  const p5 = chunkDocument('Alpha paragraph.\n\nBeta paragraph.', { pageNo: 5 });
  const p6 = chunkDocument('Gamma paragraph.\n\nDelta paragraph.', { pageNo: 6 });
  assert.deepEqual(p5.map((c) => c.seq), [0, 1]);
  assert.deepEqual(p6.map((c) => c.seq), [0, 1]);
  // Keys are disjoint across pages even though seq restarts.
  const keys = [...p5, ...p6].map((c) => `${c.pageNo}:${c.seq}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('a re-read of one page reproduces byte-identical rows', () => {
  // Idempotency is what makes resume safe: writing page 5 twice must be a no-op
  // rather than a duplicate.
  const text = 'Karaka results.\n\nClearance was 91 percent.';
  assert.deepEqual(chunkDocument(text, { pageNo: 5 }), chunkDocument(text, { pageNo: 5 }));
});

test('chunking loses no content and records real terms', () => {
  const drafts = chunkDocument('Waikato yearling sales.\n\nTrainer Jamie Richards took three lots.');
  const joined = drafts.map((d) => d.text).join(' ');
  assert.ok(joined.includes('Waikato'));
  assert.ok(joined.includes('Jamie Richards'));
  for (const d of drafts) {
    assert.equal(d.chars, d.text.length);
    assert.ok(d.terms.length > 0, 'a chunk with prose must carry terms');
  }
});

test('empty and whitespace pages produce no rows', () => {
  assert.deepEqual(chunkDocument(''), []);
  assert.deepEqual(chunkDocument('   \n\n\t '), []);
});

test('stored terms and query terms come from the SAME tokenizer', () => {
  // If index-time and query-time tokenisation ever diverge, a document matches
  // nothing and there is no error anywhere to notice it. CJK is the case that
  // actually broke: a 2-character token must survive on both sides.
  for (const word of ['Waikato', '東京', 'Καρδίτσα', 'Ярославль']) {
    const [chunk] = chunkDocument(`A passage mentioning ${word} once.`);
    const queried = intentTerms(word);
    assert.ok(queried.length > 0, `intent produced no terms for ${word}`);
    for (const t of queried) {
      assert.ok(chunk!.terms.includes(t), `term "${t}" is queryable but was never indexed for ${word}`);
    }
  }
});

test('tokenize is the single source of the length rule', () => {
  assert.ok(tokenize('art').includes('art'), '3-char Latin token kept');
  assert.deepEqual(tokenize('a of'), [], 'sub-3-char Latin tokens dropped');
  assert.ok(tokenize('東京').includes('東京'), '2-char CJK token kept');
});

// ── coverage: `ready` must not be able to lie ───────────────────────────────

test('progress is derived from the rows, not a counter', () => {
  // The crash-between-writes case: chunks for pages 0-2 exist, and whatever a
  // counter says is irrelevant because the rows are the source of truth.
  const written: Pick<SourceChunk, 'pageNo'>[] = [{ pageNo: 0 }, { pageNo: 0 }, { pageNo: 1 }, { pageNo: 2 }];
  const done = pagesAlreadyRead(written);
  assert.deepEqual([...done].sort(), [0, 1, 2]);
  assert.ok(!done.has(3), 'page 3 must be re-read, since it has no rows');
});

test('a fully-read document is ready; a short read is partial, with a reason', () => {
  const whole = coverageOf({ pagesRead: new Set([0, 1, 2]), pagesTotal: 3 });
  assert.equal(whole.truncated, false);
  assert.equal(whole.reason, '');
  assert.equal(statusForCoverage(whole), 'ready');

  const short = coverageOf({ pagesRead: new Set([0, 1]), pagesTotal: 40 });
  assert.equal(short.truncated, true);
  assert.match(short.reason, /read 2 of 40 pages/);
  assert.equal(statusForCoverage(short), 'partial');
});

test('pages that errored make a document partial even at full page count', () => {
  // Every page produced rows, but two OCR calls failed — "all pages accounted
  // for" is not "all pages read", and ready must not absorb the difference.
  const c = coverageOf({ pagesRead: new Set([0, 1, 2]), pagesTotal: 3, skipped: 2, reason: 'two pages could not be read' });
  assert.equal(c.truncated, true);
  assert.equal(statusForCoverage(c), 'partial');
});

test('both readable states are usable; the unfinished ones are not', () => {
  assert.ok(isReadable('ready') && isReadable('partial'));
  for (const s of ['queued', 'reading', 'failed'] as const) assert.ok(!isReadable(s));
});

// ── budgeted retrieval across documents ─────────────────────────────────────

const chunk = (docId: string, pageNo: number, seq: number, text: string): SourceChunk => ({
  docId,
  magazineId: 'm1',
  pageNo,
  seq,
  text,
  chars: text.length,
  terms: tokenize(text),
});

/** N documents of M chunks each, one of which carries a distinctive needle. */
function docs(n: number, chunksEach = 6, needleIn = -1): DocChunks[] {
  return Array.from({ length: n }, (_, d) => ({
    docId: `d${d}`,
    name: `doc-${d}.pdf`,
    chunks: Array.from({ length: chunksEach }, (_, i) =>
      chunk(
        `d${d}`,
        0,
        i,
        d === needleIn && i === 2
          ? 'Bloodstock agent commissions rose to five percent across Karaka this season.'
          : `Document ${d} passage ${i}: general filler prose about the racing season, padded to a realistic length.`,
      ),
    ),
  }));
}

test('planBudget never lets a document be starved silently', () => {
  // Even split when it fits.
  assert.deepEqual(planBudget(5, 6_000), { served: 5, perDoc: 1_200, omitted: 0 });
  // One document gets the whole budget.
  assert.deepEqual(planBudget(1, 6_000), { served: 1, perDoc: 6_000, omitted: 0 });
  // More documents than the budget can seat: the surplus is REPORTED, not dropped.
  const tight = planBudget(40, 2_000);
  assert.equal(tight.served, 8);
  assert.equal(tight.omitted, 32);
  assert.ok(tight.perDoc >= 250, 'a served document must get a usable slice');
  // The plan never overspends.
  assert.ok(tight.served * tight.perDoc <= 2_000);
});

test('every document contributes — attachments four and five cannot vanish', () => {
  // The original bug: five documents concatenated then cut at the head, so the
  // last two contributed nothing and nobody was told.
  const got = retrieveForIntent(docs(5), { budgetChars: 6_000 });
  assert.equal(got.receipt.docs.length, 5);
  assert.equal(got.receipt.docsOmitted, 0);
  for (const d of got.receipt.docs) assert.ok(d.chunksUsed > 0, `${d.name} contributed nothing`);
  for (let d = 0; d < 5; d++) assert.ok(got.text.includes(`doc-${d}.pdf`), `doc ${d} missing from the text`);
});

test('a document that matches the intent is still not the only one served', () => {
  const got = retrieveForIntent(docs(4, 6, 2), { intent: 'Bloodstock commissions Karaka', budgetChars: 6_000 });
  assert.equal(got.receipt.strategy, 'relevance');
  assert.ok(got.text.includes('Bloodstock agent commissions'), 'the matching passage should be there');
  assert.equal(got.receipt.docs.length, 4, 'non-matching documents keep their share');
});

test('the receipt is counted from what was packed, not inferred', () => {
  const got = retrieveForIntent(docs(3, 8), { budgetChars: 2_000 });
  // Each doc's chunksUsed must equal the passages of it actually present.
  for (const r of got.receipt.docs) {
    const present = got.text.split('\n\n').filter((p) => p.includes(`Document ${r.docId.slice(1)} passage`)).length;
    assert.equal(r.chunksUsed, present, `${r.name}: receipt says ${r.chunksUsed}, text has ${present}`);
    assert.ok(r.chunksUsed <= r.chunksAvailable);
  }
  assert.equal(got.receipt.truncated, true, '8 chunks each cannot fit 2000 chars');
  assert.equal(got.receipt.charsUsed, got.receipt.docs.length > 0 ? got.receipt.charsUsed : 0);
});

test('a complete fit reports complete, and says so in words', () => {
  const one = docs(1, 2);
  const got = retrieveForIntent(one, { budgetChars: 14_000 });
  assert.equal(got.receipt.truncated, false);
  assert.equal(got.receipt.strategy, 'verbatim');
  assert.match(receiptLine(got.receipt), /^Complete — “doc-0\.pdf”: all 2 passages\.$/);
});

test('omitted documents are named in the receipt line', () => {
  const got = retrieveForIntent(docs(40, 3), { budgetChars: 2_000 });
  assert.ok(got.receipt.docsOmitted > 0);
  assert.match(receiptLine(got.receipt), /further documents did not fit this budget and contributed nothing/);
});

test('retrieval stays within its budget', () => {
  const got = retrieveForIntent(docs(4, 10), { budgetChars: 3_000 });
  assert.ok(got.receipt.charsUsed <= 3_000, `used ${got.receipt.charsUsed} of 3000`);
});

test('when alternatives exist, a page prefers what earlier pages did NOT use', () => {
  // Three passages that all match the intent, so there is a real choice to make.
  // (An earlier version of this test gave the document only ONE matching passage
  // and asserted page two would pick something else — which the design explicitly
  // does not promise. REUSE_PENALTY is a penalty, not a ban: a sole central
  // passage is supposed to win twice. The penalty only decides between peers.)
  // Padded to ~300 chars each so the 500-char minimum budget seats exactly ONE,
  // forcing a choice. The padding is neutral: it adds no scoring terms, so all
  // three passages tie and only the reuse penalty separates them.
  const pad = 'Additional background prose that carries no scoring terms whatsoever. '.repeat(3);
  const three: DocChunks[] = [
    {
      docId: 'd0',
      name: 'sales.pdf',
      chunks: [
        chunk('d0', 0, 0, `Bloodstock commissions at Karaka rose sharply in the spring draft. ${pad}`),
        chunk('d0', 0, 1, `Bloodstock commissions at Sydney held flat across the same period. ${pad}`),
        chunk('d0', 0, 2, `Bloodstock commissions in Melbourne fell for a second season. ${pad}`),
      ],
    },
  ];
  const intent = 'Bloodstock commissions';

  const first = retrieveForIntent(three, { intent, budgetChars: 500 });
  const firstUsed = three[0]!.chunks.filter((c) => first.text.includes(c.text));
  assert.equal(firstUsed.length, 1, 'the minimum budget should seat exactly one passage');

  const usedKeys = new Set(firstUsed.map((c) => chunkKey(c)));
  const second = retrieveForIntent(three, { intent, budgetChars: 500, usedKeys });
  assert.ok(
    !second.text.includes(firstUsed[0]!.text),
    'page two re-quoted page one despite two unused passages scoring the same',
  );
});

test('a sole matching passage still wins twice — the penalty is not a ban', () => {
  const d = docs(1, 6, 0);
  const intent = 'Bloodstock commissions Karaka';
  const first = retrieveForIntent(d, { intent, budgetChars: 900 });
  const usedKeys = new Set(d[0]!.chunks.filter((c) => first.text.includes(c.text)).map((c) => chunkKey(c)));
  const second = retrieveForIntent(d, { intent, budgetChars: 900, usedKeys });
  // Nothing else in this document is about commissions, so demoting the one
  // passage that is must not push an irrelevant passage above it.
  assert.ok(second.text.includes('Bloodstock agent commissions'));
});

test('retrieval over chunks is deterministic', () => {
  const d = docs(3, 6, 1);
  const opts = { intent: 'Bloodstock commissions', budgetChars: 2_000 };
  assert.equal(retrieveForIntent(d, opts).text, retrieveForIntent(d, opts).text);
});

// ── what may follow a read ──────────────────────────────────────────────────

test('a partial read chains the follow-on work; a failed read never does', () => {
  // The distinction matters more than it looks. Chaining after a FAILED read
  // would build a magazine invented from nothing while the user believed it came
  // from their document — worse than an honest failure, because it looks like it
  // worked. A PARTIAL read does chain: some of the document beats none, and the
  // coverage receipt is what tells the model and the user what was missed.
  assert.equal(shouldChain('ready'), true);
  assert.equal(shouldChain('partial'), true);
  assert.equal(shouldChain('failed'), false);
  assert.equal(shouldChain(null), false, 'an unknown outcome must not chain');
});

test('no documents means no text and an honest empty receipt', () => {
  const got = retrieveForIntent([], { budgetChars: 6_000 });
  assert.equal(got.text, '');
  assert.equal(got.receipt.truncated, false);
  assert.equal(receiptLine(got.receipt), '');
});
