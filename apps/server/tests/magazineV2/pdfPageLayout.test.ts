// ---------------------------------------------------------------------------
// Measuring a PDF page's layout — against real PDFs and the real parser.
//
// Mocking would defeat the purpose. The whole claim of this path is "we MEASURED
// it, we did not estimate it", and a mock would just return whatever numbers I
// wrote into it. So these build real files with pdf-lib at known coordinates and
// check the reading lands where the ink actually is.
//
// Two coordinate traps are the reason this file exists at all:
//
//   1. PDF is y-UP from the bottom-left; a LayoutReading is y-DOWN from the
//      top-left. Get that wrong and every page comes out vertically mirrored —
//      which still looks like a plausible layout, so nothing else would catch it.
//   2. pdfjs reports a text run's BASELINE, not the top of its box. A box drawn
//      from the baseline sits a full line too low, and "what is above what" — the
//      only thing a composition is — reads wrong.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { openPdf } from '../../src/lib/agent/pdfText.js';
import { blocksFrom, bodySizeOf, columnsOf, layoutFromMeasure, marginToken, rolesFor } from '../../src/lib/magazineV2/pdfPageLayout.js';
import { readLayoutPdfPage } from '../../src/lib/magazineV2/readLayoutPdf.js';

const W = 600;
const H = 800;

/** A one-page magazine-ish spread: kicker, big headline, a picture, its caption,
 *  and two columns of body copy. Coordinates are pdf-lib's (y from the BOTTOM). */
async function editorialPage(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  const page = doc.addPage([W, H]);
  // Kicker, small, above the headline.
  page.drawText('TRAVEL', { x: 60, y: 740, size: 9, font });
  // Headline, dominant.
  page.drawText('The Long Way North', { x: 60, y: 690, size: 34, font, color: rgb(0, 0, 0) });
  // Picture, upper middle.
  page.drawImage(png, { x: 60, y: 420, width: 480, height: 230 });
  // Caption, small, directly under the picture.
  page.drawText('Dawn over the pass.', { x: 60, y: 400, size: 8, font });
  // Two columns of body copy.
  for (let i = 0; i < 6; i++) {
    page.drawText('Body copy line that runs on a while.', { x: 60, y: 360 - i * 14, size: 10, font });
    page.drawText('Second column of the same story.', { x: 320, y: 360 - i * 14, size: 10, font });
  }
  return Buffer.from(await doc.save());
}

async function measure(bytes: Buffer, pageNo = 1) {
  const pdf = await openPdf(bytes);
  try {
    return await pdf.measure(pageNo);
  } finally {
    await pdf.close();
  }
}

test('a run is measured where the ink is, in top-left space', async () => {
  const bytes = await editorialPage();
  const m = await measure(bytes);
  assert.equal(m.width, W);
  assert.equal(m.height, H);

  const headline = m.runs.find((r) => r.text.includes('Long Way'));
  assert.ok(headline, 'the headline should be measured');
  // Drawn at pdf-lib y=690 (baseline, from the bottom) at size 34. Top-left y is
  // H - 690 - 34 = 76. Trap 1 and trap 2 in one assertion: a y-flip error puts
  // this near 690, a baseline error near 110.
  assert.ok(Math.abs(headline!.y - (H - 690 - 34)) < 6, `headline y was ${headline!.y}`);
  assert.ok(Math.abs(headline!.x - 60) < 2, `headline x was ${headline!.x}`);
  assert.ok(Math.abs(headline!.size - 34) < 1, `headline size was ${headline!.size}`);
});

test('a picture is measured where it was drawn, not where its unit square is', async () => {
  const bytes = await editorialPage();
  const m = await measure(bytes);
  assert.equal(m.images.length, 1, 'one picture on the page');
  const img = m.images[0]!;
  // Drawn at (60, 420) 480×230 from the bottom → top-left y = 800 - 420 - 230 = 150.
  assert.ok(Math.abs(img.x - 60) < 2, `image x was ${img.x}`);
  assert.ok(Math.abs(img.y - 150) < 2, `image y was ${img.y}`);
  assert.ok(Math.abs(img.w - 480) < 2, `image w was ${img.w}`);
  assert.ok(Math.abs(img.h - 230) < 2, `image h was ${img.h}`);
});

test('lines of one paragraph group into one block; two columns stay two', async () => {
  const bytes = await editorialPage();
  const m = await measure(bytes);
  const blocks = blocksFrom(m.runs);
  const body = blocks.filter((b) => Math.abs(b.size - 10) < 1);
  assert.equal(body.length, 2, 'the two columns must not merge into one block');
  // Six lines each, gathered — not six blocks each.
  for (const col of body) assert.equal(col.lines, 6);
  // And they are side by side, not stacked.
  assert.ok(Math.abs(body[0]!.y - body[1]!.y) < 4, 'the columns start at the same height');
});

test('the body size is the type most of the WORDS are set in, not most of the blocks', () => {
  // Nine short furniture blocks at 8pt, one real paragraph at 11pt. Counting
  // blocks makes 8pt the body and reports the paragraph as a subhead.
  const blocks = [
    ...Array.from({ length: 9 }, (_, i) => ({
      x: 0, y: i * 10, w: 40, h: 9, text: 'CREDIT', size: 8, font: 'f1', lines: 1,
    })),
    { x: 0, y: 200, w: 300, h: 120, text: 'x'.repeat(600), size: 11, font: 'f2', lines: 10 },
  ];
  assert.equal(bodySizeOf(blocks), 11);
});

test('roles: the biggest type is the headline, and only one block gets it', async () => {
  const bytes = await editorialPage();
  const m = await measure(bytes);
  const blocks = blocksFrom(m.runs);
  const roles = rolesFor(blocks, m.images);
  assert.equal(roles.filter((r) => r === 'headline').length, 1);
  const headlineAt = roles.indexOf('headline');
  assert.match(blocks[headlineAt]!.text, /Long Way North/);
});

test('roles: small text under a picture is its caption; small text above the headline is a kicker', async () => {
  const bytes = await editorialPage();
  const m = await measure(bytes);
  const blocks = blocksFrom(m.runs);
  const roles = rolesFor(blocks, m.images);
  const roleOf = (needle: string) => roles[blocks.findIndex((b) => b.text.includes(needle))];
  assert.equal(roleOf('Dawn over'), 'caption', 'sits directly below the picture');
  assert.equal(roleOf('TRAVEL'), 'kicker', 'sits above the headline and is short');
});

test('columns are counted from the left edges of the prose', async () => {
  const bytes = await editorialPage();
  const m = await measure(bytes);
  assert.equal(columnsOf(blocksFrom(m.runs), m.width), 2);
});

test('one column of prose is one column, not undefined', () => {
  const blocks = [
    { x: 60, y: 0, w: 400, h: 60, text: 'a'.repeat(200), size: 10, font: 'f1', lines: 5 },
    { x: 60, y: 100, w: 400, h: 60, text: 'b'.repeat(200), size: 10, font: 'f1', lines: 5 },
  ];
  assert.equal(columnsOf(blocks, 600), 1);
});

test('the full reading is normalised, fractional and confident', async () => {
  const bytes = await editorialPage();
  const reading = layoutFromMeasure(await measure(bytes));
  assert.ok(reading, 'the page should read as a layout');
  // MEASURED, so it is entitled to say so — this is the one reading in the system
  // that is not a model's estimate.
  assert.equal(reading!.confidence, 1);
  assert.ok(Math.abs(reading!.aspect - W / H) < 0.01);
  assert.equal(reading!.columns, 2);
  // Every box is a fraction of the page, inside it.
  for (const r of reading!.regions) {
    assert.ok(r.box.x >= 0 && r.box.y >= 0, 'no region starts off the page');
    assert.ok(r.box.x + r.box.w <= 1.0001 && r.box.y + r.box.h <= 1.0001, 'no region runs off the page');
  }
  // The headline is in the top third, above the picture — the composition, not
  // just the ingredients.
  const headline = reading!.regions.find((r) => r.role === 'headline');
  const image = reading!.regions.find((r) => r.role === 'image');
  assert.ok(headline && image);
  assert.ok(headline!.box.y < 0.2, `headline sat at ${headline!.box.y}`);
  assert.ok(headline!.box.y + headline!.box.h <= image!.box.y, 'the headline is above the picture');
});

test('sizeFrac is the type size as a fraction of PAGE height', async () => {
  const bytes = await editorialPage();
  const reading = layoutFromMeasure(await measure(bytes));
  const headline = reading!.regions.find((r) => r.role === 'headline');
  // 34pt on an 800pt page.
  assert.ok(headline?.sizeFrac, 'the headline reports its size');
  assert.ok(Math.abs(headline!.sizeFrac! - 34 / H) < 0.005, `sizeFrac was ${headline!.sizeFrac}`);
});

test('a full-bleed picture becomes the background, not a region', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  const page = doc.addPage([W, H]);
  page.drawImage(png, { x: 0, y: 0, width: W, height: H });
  page.drawText('COVER', { x: 60, y: 600, size: 48, font });
  page.drawText('The issue', { x: 60, y: 540, size: 18, font });
  const reading = layoutFromMeasure(await measure(Buffer.from(await doc.save())));
  assert.ok(reading);
  assert.equal(reading!.background, 'photo');
  assert.equal(reading!.regions.filter((r) => r.role === 'image').length, 0, 'the ground is not also a region');
});

test('marginToken maps a measured inset to the nearest spacing token', () => {
  assert.equal(marginToken(0), 'none');
  // 36px of 1240 is `md` exactly.
  assert.equal(marginToken(36 / 1240), 'md');
  assert.equal(marginToken(96 / 1240), 'xl');
  // Well past the scale still lands on the largest token rather than throwing.
  assert.equal(marginToken(0.4), 'xl');
});

test('a blank page says so rather than returning an empty layout', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([W, H]);
  const out = await readLayoutPdfPage(Buffer.from(await doc.save()), 1);
  assert.equal(out.reading, null);
  assert.match(out.error, /blank/i);
  assert.equal(out.pageCount, 1);
});

test('asking for a page the document does not have names the real count', async () => {
  const out = await readLayoutPdfPage(await editorialPage(), 40);
  assert.equal(out.reading, null);
  assert.equal(out.pageCount, 1);
  assert.match(out.error, /1 page/);
});

test('the page asked for is the page measured', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of ['ONE', 'TWO', 'THREE']) {
    const page = doc.addPage([W, H]);
    page.drawText(label, { x: 60, y: 700, size: 40, font });
    page.drawText(`${label} body copy for the page.`, { x: 60, y: 400, size: 10, font });
  }
  const out = await readLayoutPdfPage(Buffer.from(await doc.save()), 2);
  assert.ok(out.reading);
  assert.equal(out.pageCount, 3);
  const said = out.reading!.regions.map((r) => r.text ?? '').join(' ');
  assert.match(said, /TWO/);
  assert.doesNotMatch(said, /ONE|THREE/, 'a page must not carry its neighbours');
});
