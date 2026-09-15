// ---------------------------------------------------------------------------
// PDF text extraction, against real PDFs and the real parser.
//
// These tests are deliberately not mocked. Three of the four things that can go
// wrong here are invisible to a mock:
//
//   1. THE LOADER. pdfjs-dist is ESM and this server compiles to CommonJS, where
//      tsc rewrites `import()` into `require()`. pdfText.ts hides the import
//      behind `new Function` to stop that. If the trick ever stops working, the
//      failure is at runtime in production — so the first test simply proves the
//      parser loads and reads a page.
//   2. PAGE NUMBERING. pdfjs is 1-based, pdf-lib is 0-based, and the store uses
//      1-based with 0 reserved for "the whole document". A mock would agree with
//      whichever convention I wrote it with.
//   3. BLANK VS SCANNED. Telling those apart is what stops every blank page in a
//      long document being sent to a paid OCR call to come back empty.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { openPdf } from '../../src/lib/agent/pdfText.js';

/** A PDF whose pages are described by `spec`: text, blank, or an image. */
async function buildPdf(spec: Array<'text' | 'blank' | 'image'>): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // A 1x1 PNG, embedded so a page can paint an image without any text.
  const png = await doc.embedPng(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  spec.forEach((kind, i) => {
    const page = doc.addPage([320, 220]);
    if (kind === 'text') {
      page.drawText(`Heading ${i + 1}`, { x: 20, y: 180, size: 14, font, color: rgb(0, 0, 0) });
      page.drawText(`Body of page ${i + 1}.`, { x: 20, y: 150, size: 11, font });
    } else if (kind === 'image') {
      page.drawImage(png, { x: 10, y: 10, width: 300, height: 200 });
    }
  });
  return Buffer.from(await doc.save());
}

test('the parser loads under CommonJS and reads pages by number', async () => {
  // Test 1 of the header: if the ESM-under-CJS load breaks, this is where it shows,
  // in CI rather than in a user's upload.
  const bytes = await buildPdf(['text', 'text', 'text']);
  const pdf = await openPdf(bytes);
  try {
    assert.equal(pdf.pageCount, 3);
    // 1-based, and page 2 is page 2 — not page 1 and not page 3.
    const second = await pdf.probe(2);
    assert.match(second.text, /Heading 2/);
    assert.match(second.text, /Body of page 2/);
    assert.doesNotMatch(second.text, /Heading 1|Heading 3/, 'a page must not carry its neighbours');
  } finally {
    await pdf.close();
  }
});

test('lines are kept apart instead of run together', async () => {
  // Concatenating pdfjs text items with no separator fuses a heading into the body
  // and one table cell into the next. What comes out here is quoted back by a
  // model, so "Heading 1Body of page 1." is not a cosmetic problem.
  const pdf = await openPdf(await buildPdf(['text']));
  try {
    const { text } = await pdf.probe(1);
    assert.doesNotMatch(text, /1Body/, 'heading and body must not fuse');
    assert.ok(text.includes('\n') || / Body/.test(text), 'some separator survives');
  } finally {
    await pdf.close();
  }
});

test('a blank page is told apart from a scanned one', async () => {
  // The distinction that decides whether a page costs an OCR call. Getting it
  // wrong in one direction wastes money on empty pages; in the other it silently
  // drops the content of every scanned page.
  const pdf = await openPdf(await buildPdf(['blank', 'image']));
  try {
    const blank = await pdf.probe(1);
    assert.equal(blank.text, '');
    assert.equal(blank.hasImage, false, 'nothing to OCR here');

    const scan = await pdf.probe(2);
    assert.equal(scan.text, '', 'an image carries no text layer');
    assert.equal(scan.hasImage, true, 'this one is worth OCR');
  } finally {
    await pdf.close();
  }
});

test('the image probe is skipped for a page that already has text', async () => {
  // The operator-list scan is the expensive half and can only change the answer
  // for a page with no text, so it is not run otherwise.
  const pdf = await openPdf(await buildPdf(['text']));
  try {
    const got = await pdf.probe(1, { probeImages: false });
    assert.match(got.text, /Heading 1/);
    assert.equal(got.hasImage, false);
  } finally {
    await pdf.close();
  }
});

test('a mixed document reports each page as it actually is', async () => {
  // The case the old whole-document test could not express at all: a typeset
  // report with a scanned insert looked identical to a 300-page scan.
  const pdf = await openPdf(await buildPdf(['text', 'image', 'text', 'blank']));
  try {
    const probes = [];
    for (let n = 1; n <= pdf.pageCount; n++) probes.push(await pdf.probe(n));
    assert.deepEqual(
      probes.map((p) => (p.text ? 'text' : p.hasImage ? 'scan' : 'blank')),
      ['text', 'scan', 'text', 'blank'],
    );
  } finally {
    await pdf.close();
  }
});

test('a file that is not a PDF fails rather than reading as empty', async () => {
  // An upload that silently reads as "no pages" would be reported to the user as
  // an unreadable scan, which sends them off to re-scan a file that was never a
  // PDF in the first place.
  await assert.rejects(() => openPdf(Buffer.from('this is plainly not a pdf', 'utf8')));
});
