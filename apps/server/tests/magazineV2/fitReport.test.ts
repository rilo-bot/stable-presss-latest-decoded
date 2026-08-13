// ---------------------------------------------------------------------------
// fitReport — the art-director's eyes.
//
// Every finding here corresponds to a defect a REAL generated issue shipped, so the
// tests are written from those pages rather than from the code: a QR in a 1200×160
// band with a small glyph adrift in it, a QR covering a quarter of the back cover, a
// headline that had to be cut by two thirds to fit, and body copy set as one column
// running about 120 characters a line.
//
// The other half of the contract matters just as much: a report that fires on
// everything is a report that gets ignored, and `seriousFlaws` is what buys a retry —
// so a clean page must measure clean, and the soft findings must NOT be counted.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitReport, fitHint, seriousFlaws, charBudget } from '../../src/lib/magazineV2/fitReport.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';
import { ptToPx } from '../../src/lib/magazineV2/roleScale.js';
import type { SolvedLayout } from '../../src/lib/magazineV2/solveLayout.js';
import type { LeafNode, LeafRole } from '../../src/lib/magazineV2/layoutSpec.js';
import type { ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.js';

const fonts = { display: 'Playfair Display', body: 'Inter' };

type LeafSpec = [Partial<LeafNode> & { role: LeafRole }, [number, number, number, number]];

const solvedOf = (leaves: LeafSpec[]): SolvedLayout => ({
  background: { ref: 'bg' },
  margin: 0,
  page: { width: PAGE_W, height: PAGE_H },
  leaves: leaves.map(([node, [x, y, w, h]], i) => ({
    node: { kind: 'leaf', ...node } as LeafNode,
    box: { x, y, w, h },
    z: i,
  })),
});

const kinds = (fit: { findings: { kind: string }[] }) => fit.findings.map((f) => f.kind);

test('a QR in a wide band is reported as the wasted space it is', () => {
  // The page-2 defect, exactly: a full-measure band holding a small square glyph.
  const fit = fitReport(solvedOf([[{ role: 'qr', contentRef: 'qr' }, [36, 1400, 1200, 160]]]), { qr: { qrUrl: 'https://x' } }, fonts);
  const square = fit.findings.find((f) => f.kind === 'square');
  assert.ok(square, `expected a square finding, got ${kinds(fit).join(', ') || 'none'}`);
  assert.match(square!.detail, /1200×160/);
  assert.match(square!.detail, /86%|87%|88%/); // 1 − 160²/(1200×160)
  assert.equal(seriousFlaws(fit), 1);
});

test('a QR the size of a photograph is reported as too loud', () => {
  // The back-cover defect: it passed every existing check and looked absurd.
  const fit = fitReport(solvedOf([[{ role: 'qr', contentRef: 'qr' }, [300, 600, 620, 620]]]), { qr: { qrUrl: 'https://x' } }, fonts);
  assert.ok(kinds(fit).includes('loud'), `got ${kinds(fit).join(', ') || 'none'}`);
});

test('a square QR at a sensible size measures clean', () => {
  const fit = fitReport(solvedOf([[{ role: 'qr', contentRef: 'qr' }, [1000, 1500, 190, 190]]]), { qr: { qrUrl: 'https://x' } }, fonts);
  assert.deepEqual(fit.findings, []);
  assert.equal(seriousFlaws(fit), 0);
});

test('type that has to be cut by two thirds says so, in points', () => {
  const content: ResolvedContent = { headline: { text: 'A Headline Far Too Long For The Narrow Box It Was Given Here' } };
  const fit = fitReport(solvedOf([[{ role: 'headline', contentRef: 'headline', fontPt: 40 }, [36, 100, 400, 80]]]), content, fonts);
  const shrunk = fit.findings.find((f) => f.kind === 'shrunk');
  assert.ok(shrunk, `got ${kinds(fit).join(', ') || 'none'}`);
  assert.match(shrunk!.detail, /set at 40pt but only fits at \d+pt/);
  assert.ok(seriousFlaws(fit) >= 1);
});

test('a single full-width body column is reported by its line length', () => {
  const long = 'The paddock is where the real reading happens, and trainers walk the rail with their hands in their pockets. '.repeat(6);
  const fit = fitReport(solvedOf([[{ role: 'body', contentRef: 'body', fontPt: 10 }, [36, 200, 1080, 700]]]), { body: { text: long } }, fonts);
  const measure = fit.findings.find((f) => f.kind === 'measure');
  assert.ok(measure, `got ${kinds(fit).join(', ') || 'none'}`);
  assert.match(measure!.detail, /characters a line/);
  assert.match(measure!.detail, /45–75 is readable/);
});

test('a box far taller than its copy is reported — the "more space than elements" complaint, measured', () => {
  const fit = fitReport(solvedOf([[{ role: 'body', contentRef: 'body', fontPt: 10 }, [36, 200, 560, 900]]]), { body: { text: 'Two short lines of copy.' } }, fonts);
  const slack = fit.findings.find((f) => f.kind === 'slack');
  assert.ok(slack, `got ${kinds(fit).join(', ') || 'none'}`);
  assert.match(slack!.detail, /blank/);
  // …but slack alone must NOT buy a retry: it is common, often correct, and if it
  // forced one, nearly every page would burn its attempts and drop to the template.
  assert.equal(seriousFlaws(fit), 0);
});

test('deliberate emptiness is counted, not complained about', () => {
  const half = PAGE_H / 2;
  const fit = fitReport(
    solvedOf([
      [{ role: 'spacer' }, [0, 0, PAGE_W, half]],
      // Sized to its copy on purpose: the only thing under test here is the spacer.
      [{ role: 'headline', contentRef: 'headline', fontPt: 30 }, [36, half, PAGE_W - 72, 80]],
    ]),
    { headline: { text: 'Before the Bell' } },
    fonts,
  );
  assert.ok(fit.emptyShare > 0.45 && fit.emptyShare < 0.55, `emptyShare ${fit.emptyShare}`);
  assert.ok(!kinds(fit).includes('slack'), 'a spacer is not slack — it is a decision');
});

test('the hint is capped, ordered worst-first, and empty for a clean page', () => {
  assert.equal(fitHint({ findings: [], emptyShare: 0 }), '');

  const many = Array.from({ length: 9 }, (_, i) => ({ kind: 'slack' as const, where: `s${i}`, detail: 'blank' }));
  const hint = fitHint({ findings: [{ kind: 'loud', where: 'qr', detail: 'too big' }, ...many], emptyShare: 0 });
  const lines = hint.split('\n').filter((l) => l.startsWith('•'));
  assert.equal(lines.length, 7, 'six findings plus the "…and N more" line');
  assert.match(lines[0]!, /^• qr:/, 'the loudest defect leads');
  assert.match(hint, /and 4 more/);
  assert.match(hint, /measured, not opinions/);
});

test('charBudget follows the BOX, which a per-role table never could', () => {
  const at = (boxW: number, boxH: number) =>
    charBudget({ boxW, boxH, fontSize: ptToPx(10), lineHeight: 1.5, fontFamily: fonts.body, fontWeight: 400 });
  const narrow = at(300, 400);
  const wide = at(900, 400);
  const tall = at(300, 1200);
  assert.ok(wide > narrow * 2.5, `wide ${wide} vs narrow ${narrow}`);
  assert.ok(tall > narrow * 2.5, `tall ${tall} vs narrow ${narrow}`);
  // The old static answer for a body slot was 1400 characters whatever the box.
  assert.ok(narrow < 1400, `a 300×400 box does not hold 1400 characters (${narrow})`);
  assert.equal(at(0, 0) >= 0, true);
});
