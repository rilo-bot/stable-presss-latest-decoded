// ---------------------------------------------------------------------------
// Reading a document in BATCHES: termination, and telling the truth afterwards.
//
// The worker claims one job at a time, so a read that ran to the end of a
// 5,000-page scan held the only lane for hours and no other magazine in the
// system could generate meanwhile — one user's upload became everyone's outage.
// A read is therefore a batch that re-enqueues itself, and a self-requeueing job
// brings one new way to fail catastrophically:
//
//   IT CAN REQUEUE ITSELF FOR EVER, QUIETLY. The queue looks busy, the document
//   sits in `reading`, and the issue waiting on it is never generated. Nothing
//   errors, so nothing is reported.
//
// So the first tests here are about the cursor only ever moving forward, and
// about a batch being refused unless it advanced. The rest are about the second
// hazard: once a page can be read and still produce no rows — a blank page in a
// scan — counting rows would report a long scan as `partial` for ever, and a
// `partial` that is always true tells a reader nothing.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isPaginated,
  mergeKind,
  nextBatchFrom,
  projectRead,
  sweepAdvanced,
  sweptCoverage,
  statusForCoverage,
} from '../../src/lib/magazineV2/sourceStore.js';
import { sweptThrough, splitPdfPagesAt, readDocumentUnits, type PageRead } from '../../src/lib/agent/documentIngest.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/** A real n-page PDF, so the split and the sweep are tested against pdf-lib and
 *  pdfjs rather than a mock of them — pdf-lib indexes pages from 0 and everything
 *  else here counts from 1, and that seam is exactly what a mock would agree with
 *  me about and get wrong. Each page carries its own number as text and as a
 *  distinct width, so a page can be identified however it comes back. */
async function pdfOf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([200, 200]);
    page.setSize(200 + i, 200);
    page.drawText(`Marker ${i + 1} of ${pages}`, { x: 15, y: 150, size: 11, font });
  }
  return Buffer.from(await doc.save());
}

/** Run one batch and collect what it emitted. */
async function sweepOnce(bytes: Buffer, opts: Partial<Parameters<typeof readDocumentUnits>[0]> = {}) {
  const units: PageRead[] = [];
  const result = await readDocumentUnits({
    bytes,
    contentType: 'application/pdf',
    name: 'marked.pdf',
    onUnit: async (u) => {
      units.push(u);
    },
    ...opts,
  });
  return { result, units };
}

/** The width each single-page PDF carries, i.e. which source page it came from. */
async function widthsOf(buffers: Buffer[]): Promise<number[]> {
  const out: number[] = [];
  for (const b of buffers) {
    const d = await PDFDocument.load(b);
    out.push(Math.round(d.getPage(0).getWidth()));
  }
  return out;
}

// ── termination ─────────────────────────────────────────────────────────────

test('a sweep walks the whole document in batches and then stops', () => {
  // The loop as the job actually runs it. The assertion that matters is the last
  // one: it terminates, and it terminates having looked at every page.
  const total = 213;
  const batch = 25;
  let swept = 0;
  let batches = 0;
  const seen: number[] = [];
  for (;;) {
    const from = nextBatchFrom(swept, total);
    if (from === null) break;
    assert.ok(sweepAdvanced(swept, from), 'every batch must move the cursor forward');
    for (let p = from; p < from + batch && p <= total; p++) seen.push(p);
    swept = Math.min(total, from - 1 + batch);
    batches += 1;
    assert.ok(batches <= 100, 'the sweep must not run away');
  }
  assert.equal(batches, Math.ceil(total / batch));
  assert.equal(seen.length, total, 'every page looked at');
  assert.equal(new Set(seen).size, total, 'and none twice');
});

test('a batch that did not advance is refused rather than requeued', () => {
  // The infinite-loop guard. A batch stopped by the clock before its first page
  // reports the cursor it started with, and requeueing that would repeat for ever.
  assert.equal(sweepAdvanced(30, 31), true, 'one page of progress is progress');
  assert.equal(sweepAdvanced(30, 31 + 24), true);
  assert.equal(sweepAdvanced(30, 30), false, 'standing still');
  assert.equal(sweepAdvanced(30, 12), false, 'and going backwards is worse');
  assert.equal(sweepAdvanced(30, null), true, 'finishing the sweep is the other way out');
});

test('the sweep ends exactly at the ceiling, not one page past it', () => {
  assert.equal(nextBatchFrom(0, 1), 1);
  assert.equal(nextBatchFrom(1, 1), null);
  assert.equal(nextBatchFrom(199, 200), 200);
  assert.equal(nextBatchFrom(200, 200), null);
  // A cursor already past the ceiling (a page cap lowered between batches) must
  // stop, not go round again.
  assert.equal(nextBatchFrom(250, 200), null);
  // A document with no pages has nothing to sweep.
  assert.equal(nextBatchFrom(0, 0), null);
});

test('how far a batch got, including when the clock cut it off', () => {
  // A whole batch: the sweep covers its range.
  assert.equal(sweptThrough({ from: 26, pageCount: 25 }), 50);
  assert.equal(sweptThrough({ from: 1, pageCount: 1 }), 1);
  // Cut off mid-batch: resume at the LOWEST page not reached, so a page read out
  // of order past that point is re-visited (and skipped, being stored) rather
  // than a page before it being silently passed over.
  assert.equal(sweptThrough({ from: 26, pageCount: 25, firstMissed: 40 }), 39);
  // Cut off before its first page: no progress. The caller must refuse to requeue
  // this, which is what sweepAdvanced is for.
  assert.equal(sweptThrough({ from: 26, pageCount: 25, firstMissed: 26 }), 25);
  assert.equal(sweepAdvanced(25, nextBatchFrom(25, 200)), true, 'and the retry still starts at 26');
  // Nonsense in: a missed page outside the range says nothing about the range.
  assert.equal(sweptThrough({ from: 26, pageCount: 25, firstMissed: 5 }), 25);
  assert.equal(sweptThrough({ from: 26, pageCount: 25, firstMissed: 999 }), 50);
  assert.equal(sweptThrough({ from: 26, pageCount: 0 }), 25, 'an empty batch swept nothing new');
});

// ── which pages a batch actually cuts out ───────────────────────────────────

test('the pages asked for are the pages cut out', async () => {
  // Two fixes in one function. Splitting "the first N" every time held every
  // single-page PDF in memory at once — fine behind a 24-page cap, thousands of
  // buffers without one. And the pages needing OCR are not a contiguous range now
  // that the text/scan decision is per page: a report with a scanned insert asks
  // for pages 4, 5 and 91, and a range cannot express that at all.
  const bytes = await pdfOf(10);

  assert.deepEqual(await widthsOf(await splitPdfPagesAt(bytes, [1, 2, 3])), [200, 201, 202]);
  // 1-based in, and page 5 is the fifth page — pdf-lib indexes from 0, and this is
  // the seam where that goes wrong.
  assert.deepEqual(await widthsOf(await splitPdfPagesAt(bytes, [5])), [204]);
  assert.deepEqual(await widthsOf(await splitPdfPagesAt(bytes, [10])), [209], 'the last page is reachable');
  // Non-contiguous, and the result is aligned to the request index for index.
  assert.deepEqual(await widthsOf(await splitPdfPagesAt(bytes, [2, 7, 9])), [201, 206, 208]);
  // Order is the caller's, not sorted behind their back — the OCR results are
  // matched back to page numbers positionally.
  assert.deepEqual(await widthsOf(await splitPdfPagesAt(bytes, [9, 2])), [208, 201]);
});

test('pages outside the document are skipped, not fabricated', async () => {
  const bytes = await pdfOf(3);
  assert.deepEqual(await splitPdfPagesAt(bytes, []), []);
  assert.deepEqual(await widthsOf(await splitPdfPagesAt(bytes, [0, 4, 99])), [], 'none of these exist');
  assert.deepEqual(await widthsOf(await splitPdfPagesAt(bytes, [2, 99])), [201], 'the real one still comes back');
});

// ── the sweep itself, against a real PDF ────────────────────────────────────
//
// A text PDF never reaches the OCR model, so the whole batched read — page
// numbering, budgets, resume, the result arithmetic — is testable offline. This is
// the path that used to be one pdf-parse call returning one string.

test('a text PDF is read page by page, with its real page numbers', async () => {
  // What replacing pdf-parse bought. The old reader returned ONE unit for the whole
  // document: no page numbers to cite, no progress to show, and a read killed at
  // 90% started again from nothing.
  const { result, units } = await sweepOnce(await pdfOf(6));
  assert.equal(result.kind, 'pdf-text');
  assert.equal(result.unitsTotal, 6);
  assert.deepEqual(
    units.map((u) => u.pageNo),
    [1, 2, 3, 4, 5, 6],
    'one unit per page, numbered from 1',
  );
  assert.match(units[0]!.text, /Marker 1 of 6/);
  assert.match(units[5]!.text, /Marker 6 of 6/);
  assert.equal(result.sweptTo, 6);
  assert.equal(nextBatchFrom(result.sweptTo, result.unitsCeiling), null, 'a short document is one batch');
});

test('the scan budget stops a batch, and the next one resumes exactly after it', async () => {
  const bytes = await pdfOf(10);
  const first = await sweepOnce(bytes, { scanBudget: 4 });
  assert.deepEqual(first.units.map((u) => u.pageNo), [1, 2, 3, 4]);
  assert.equal(first.result.sweptTo, 4);

  const resumeAt = nextBatchFrom(first.result.sweptTo, first.result.unitsCeiling);
  assert.equal(resumeAt, 5, 'the next batch starts at 5 — not 4 again, and not 6');
  assert.ok(sweepAdvanced(0, resumeAt));

  const second = await sweepOnce(bytes, { scanBudget: 4, startUnit: resumeAt! });
  assert.deepEqual(second.units.map((u) => u.pageNo), [5, 6, 7, 8]);
  assert.match(second.units[0]!.text, /Marker 5 of 10/, 'page 5 really is page 5');

  const third = await sweepOnce(bytes, { scanBudget: 4, startUnit: 9 });
  assert.deepEqual(third.units.map((u) => u.pageNo), [9, 10]);
  assert.equal(nextBatchFrom(third.result.sweptTo, third.result.unitsCeiling), null, 'and then it is done');
});

test('pages already stored are swept past, not read again', async () => {
  // Resume after a crash: the rows say what we hold, and re-reading those pages
  // would be the wasted OCR the whole design exists to avoid.
  const { result, units } = await sweepOnce(await pdfOf(6), { skipUnits: new Set([1, 2, 3]) });
  assert.deepEqual(units.map((u) => u.pageNo), [4, 5, 6], 'only the missing pages are read');
  assert.equal(result.attempted, 3, 'and only those are counted as attempted');
  assert.equal(result.sweptTo, 6, 'but the sweep has still passed over all six');
});

test('a page cap stops the read while coverage keeps the real length', async () => {
  const { result } = await sweepOnce(await pdfOf(10), { maxPages: 4 });
  assert.equal(result.unitsCeiling, 4);
  assert.equal(result.unitsTotal, 10, 'the document is still ten pages long');
  assert.equal(nextBatchFrom(result.sweptTo, result.unitsCeiling), null);
  const coverage = sweptCoverage({ swept: result.sweptTo, total: result.unitsTotal });
  assert.equal(coverage.truncated, true);
  assert.match(coverage.reason, /read the first 4 of 10 pages/);
});

test('resuming past the end finishes rather than erroring', async () => {
  // Reachable by a duplicate delivery of the last batch, or a cap lowered between
  // batches. Erroring here would fail a document that is completely read.
  const { result, units } = await sweepOnce(await pdfOf(3), { startUnit: 9 });
  assert.equal(units.length, 0);
  assert.equal(result.attempted, 0);
  assert.equal(nextBatchFrom(result.sweptTo, result.unitsCeiling), null);
});

test('a blank page costs nothing and is not mistaken for a failure', async () => {
  // A blank page has no text layer AND nothing drawn, so it must not be sent to a
  // paid OCR call — and it must not be reported as a page that could not be read.
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([200, 200]).drawText('Opening', { x: 15, y: 150, size: 11, font });
  doc.addPage([200, 200]); // blank
  const { result, units } = await sweepOnce(Buffer.from(await doc.save()));
  assert.deepEqual(units.map((u) => u.pageNo), [1], 'the blank page stores nothing');
  assert.deepEqual(result.failedUnits, [], 'and is not a failure');
  assert.equal(result.ok, 2, 'both pages were successfully read');
  assert.equal(result.kind, 'pdf-text', 'no OCR was involved');
  // The document is therefore fully read, blank page and all.
  const coverage = sweptCoverage({ swept: result.sweptTo, total: result.unitsTotal, failedUnits: result.failedUnits });
  assert.equal(coverage.truncated, false);
  assert.equal(statusForCoverage(coverage), 'ready');
});

// ── what the read costs, now that nothing caps it ───────────────────────────
//
// A page cap was, among its other jobs, an accidental spend ceiling: 200 pages
// could not cost more than 200 pages. Reading to the last page is right, and it
// removes that ceiling — so the estimate is the thing that keeps "no cap" a
// decision somebody made rather than a number nobody saw. Which means it has to be
// hard to mislead with.

test('a mixed document is not billed as if it were a scan throughout', () => {
  // THE reason this extrapolates from what it has seen. A 900-page report with a
  // scanned appendix is not 900 OCR pages, and an estimate that says so for every
  // long document tells the user nothing about their document.
  const scan = projectRead({ pagesSeen: 25, ocrPages: 25, pagesTotal: 900, usdPerOcrPage: 0.001 });
  assert.equal(scan.ocrPagesExpected, 900);
  assert.equal(scan.usd, 0.9);

  const typeset = projectRead({ pagesSeen: 25, ocrPages: 1, pagesTotal: 900, usdPerOcrPage: 0.001 });
  assert.equal(typeset.ocrPagesExpected, 36, 'one page in twenty-five, across 900');
  assert.equal(typeset.usd, 0.04);

  const clean = projectRead({ pagesSeen: 25, ocrPages: 0, pagesTotal: 900, usdPerOcrPage: 0.001 });
  assert.equal(clean.ocrPagesExpected, 0);
  assert.equal(clean.usd, 0, 'a typeset document costs nothing to read');
});

test('a finished read reports the count, not a projection', () => {
  const done = projectRead({ pagesSeen: 40, ocrPages: 12, pagesTotal: 40, usdPerOcrPage: 0.001 });
  assert.equal(done.projected, false);
  assert.equal(done.ocrPagesExpected, 12, 'exactly the pages transcribed');
  const mid = projectRead({ pagesSeen: 10, ocrPages: 3, pagesTotal: 40, usdPerOcrPage: 0.001 });
  assert.equal(mid.projected, true, 'and until then it says it is guessing');
});

test('the projection never falls below what has already been spent', () => {
  // The direction that matters. Under-reporting spend already incurred is how an
  // estimate becomes worse than no estimate at all.
  const got = projectRead({ pagesSeen: 100, ocrPages: 100, pagesTotal: 101, usdPerOcrPage: 0.01 });
  assert.ok(got.ocrPagesExpected >= 100);
  assert.ok(got.usd >= 1);
  // And never above the pages the document actually has.
  assert.equal(projectRead({ pagesSeen: 5, ocrPages: 5, pagesTotal: 5 }).ocrPagesExpected, 5);
  assert.ok(projectRead({ pagesSeen: 1, ocrPages: 1, pagesTotal: 3 }).ocrPagesExpected <= 3);
});

test('a rate of zero turns the money off but keeps the page counts', () => {
  // Env-configurable to 0 for a deployment that does not want to state a price.
  // The pages are facts; only the money is a configured reading.
  const got = projectRead({ pagesSeen: 50, ocrPages: 50, pagesTotal: 500, usdPerOcrPage: 0 });
  assert.equal(got.usd, 0);
  assert.equal(got.ocrPagesExpected, 500, 'still says how much OCR is coming');
  assert.equal(projectRead({ pagesSeen: 50, ocrPages: 50, pagesTotal: 500 }).usd, 0, 'and no rate means no price');
});

test('the estimate holds up against nonsense rather than producing nonsense', () => {
  // It is displayed to a person and stored on a row, so bad input must clamp.
  assert.equal(projectRead({ pagesSeen: 0, ocrPages: 0, pagesTotal: 0 }).ocrPagesExpected, 0);
  assert.equal(projectRead({ pagesSeen: 0, ocrPages: 0, pagesTotal: 0 }).projected, false, 'nothing to read is not "still guessing"');
  assert.equal(projectRead({ pagesSeen: 900, ocrPages: 900, pagesTotal: 10 }).pagesSeen, 10, 'seen is clamped to the total');
  assert.equal(projectRead({ pagesSeen: 10, ocrPages: 900, pagesTotal: 10 }).ocrPages, 10, 'and OCR pages to what was seen');
  assert.equal(projectRead({ pagesSeen: -5, ocrPages: -5, pagesTotal: 10 }).ocrPages, 0);
  assert.equal(projectRead({ pagesSeen: 3, ocrPages: 1, pagesTotal: 10, usdPerOcrPage: -1 }).usd, 0, 'a negative rate is not a refund');
});

test('the money shown is the money stored', () => {
  // Rounded to the cent it will be displayed as, so a screen and a row cannot
  // disagree about the same read by a fraction of a penny.
  const got = projectRead({ pagesSeen: 7, ocrPages: 7, pagesTotal: 7, usdPerOcrPage: 0.0011 });
  assert.equal(got.usd, 0.01);
  assert.equal(got.usd, Math.round(got.usd * 100) / 100);
});

// ── what kind of read it was ────────────────────────────────────────────────

test('both PDF kinds are paginated; a Word or text file is one unit', () => {
  // The answer CHANGED when text extraction went per page, and every
  // `kind === 'pdf-ocr'` test written before that quietly became a wrong test for
  // "is it paginated?". This is why it is a function.
  assert.equal(isPaginated('pdf-text'), true);
  assert.equal(isPaginated('pdf-ocr'), true);
  assert.equal(isPaginated('docx'), false);
  assert.equal(isPaginated('text'), false);
  assert.equal(isPaginated('image'), false);
});

test('OCR is sticky across batches', () => {
  // A 400-page report whose twelve scanned pages were in batch 2 must not report
  // itself as a clean text extraction because batch 9 happened to be typeset.
  // `kind` exists to tell a consumer the text was transcribed rather than
  // extracted, so getting this wrong makes exactly the wrong promise.
  assert.equal(mergeKind('pdf-ocr', 'pdf-text'), 'pdf-ocr', 'once transcribed, always transcribed');
  assert.equal(mergeKind('pdf-text', 'pdf-ocr'), 'pdf-ocr', 'and a later scan upgrades it');
  assert.equal(mergeKind('pdf-text', 'pdf-text'), 'pdf-text');
  assert.equal(mergeKind(undefined, 'pdf-text'), 'pdf-text', 'a first batch has nothing to merge with');
  // The stickiness must not leak across document types: a row created with the
  // default kind, then read as a Word file, is a Word file.
  assert.equal(mergeKind('pdf-ocr', 'docx'), 'docx');
  assert.equal(mergeKind('text', 'pdf-text'), 'pdf-text');
});

// ── coverage, once a page can be blank ──────────────────────────────────────

test('a fully-swept scan with blank pages is READY, not eternally partial', () => {
  // THE reason this function exists. Counting rows would call a 400-page scan
  // partial because a dozen of its pages were blank, so every prompt built from
  // it would carry a truncation warning — and a warning that is always there is
  // one nobody reads. Blank pages were read; they simply had nothing on them.
  const coverage = sweptCoverage({ swept: 400, total: 400, storedPages: new Set([1, 2, 3]) });
  assert.equal(coverage.pagesRead, 400);
  assert.equal(coverage.truncated, false);
  assert.equal(coverage.reason, '');
  assert.equal(statusForCoverage(coverage), 'ready');
});

test('pages that could not be read are subtracted and named', () => {
  const coverage = sweptCoverage({ swept: 100, total: 100, failedUnits: [7, 41] });
  assert.equal(coverage.pagesRead, 98);
  assert.equal(coverage.truncated, true);
  assert.match(coverage.reason, /2 pages could not be read/);
  assert.equal(statusForCoverage(coverage), 'partial');
  // Singular reads properly — this text reaches the model and the user.
  assert.match(sweptCoverage({ swept: 10, total: 10, failedUnits: [3] }).reason, /1 page could not be read/);
});

test('a failure that later produced chunks stops being held against the document', () => {
  // What makes the two writes safe to do separately. noteSweep records failures
  // BEFORE the cursor, so a crash between them leaves failures for pages the
  // cursor has not passed; those pages are read again, and this is what forgets
  // the stale entry rather than reporting a page as unread for ever.
  const stale = sweptCoverage({ swept: 50, total: 50, failedUnits: [9], storedPages: new Set([9]) });
  assert.equal(stale.pagesRead, 50);
  assert.equal(stale.truncated, false, 'page 9 was read on the retry');

  const genuine = sweptCoverage({ swept: 50, total: 50, failedUnits: [9], storedPages: new Set([8, 10]) });
  assert.equal(genuine.pagesRead, 49);
  assert.equal(genuine.truncated, true);
});

test('a failure beyond the sweep is not counted yet', () => {
  // Ordering again: a page recorded as failed but not yet swept past belongs to
  // the batch that will re-read it, so counting it now would report a loss the
  // document has not taken.
  const coverage = sweptCoverage({ swept: 25, total: 100, failedUnits: [4, 60] });
  assert.equal(coverage.pagesRead, 24, 'only page 4 is inside the swept range');
});

test('a read cut short says which way it was cut', () => {
  // Two different stories, and the difference is what the user can do about it:
  // a page cap is a setting, a time limit is a retry.
  const capped = sweptCoverage({ swept: 200, total: 830 });
  assert.match(capped.reason, /read the first 200 of 830 pages/);
  assert.equal(capped.truncated, true);

  const clock = sweptCoverage({ swept: 200, total: 830, outOfTime: true });
  assert.match(clock.reason, /time limit/);

  // Both at once: cut short AND pages lost inside what was read.
  const both = sweptCoverage({ swept: 200, total: 830, failedUnits: [3, 4, 5] });
  assert.match(both.reason, /read the first 200 of 830/);
  assert.match(both.reason, /3 pages could not be read/);
});

test('coverage never invents pages, whatever it is handed', () => {
  // The arithmetic is read by a model and shown to a user, so a nonsense input
  // must clamp rather than produce a nonsense sentence.
  assert.equal(sweptCoverage({ swept: 900, total: 100 }).pagesRead, 100, 'swept is clamped to the total');
  assert.equal(sweptCoverage({ swept: -5, total: 100 }).pagesRead, 0);
  assert.equal(sweptCoverage({ swept: 10, total: 10, failedUnits: [0, -3, 99] }).pagesRead, 10, 'out-of-range failures ignored');
  const empty = sweptCoverage({ swept: 0, total: 0 });
  assert.equal(empty.pagesRead, 0);
  assert.equal(empty.truncated, false);
  // A document read to zero pages of many must still say something.
  assert.ok(sweptCoverage({ swept: 0, total: 30 }).reason.length > 0);
});
