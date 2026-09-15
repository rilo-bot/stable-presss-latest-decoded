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

import { fitReport, fitHint, seriousFlaws, charBudget, EMPTY_SERIOUS } from '../../src/lib/magazineV2/fitReport.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';
import { ptToPx } from '../../src/lib/magazineV2/roleScale.js';
import type { SolvedLayout } from '../../src/lib/magazineV2/solveLayout.js';
import type { LeafNode, LeafRole } from '../../src/lib/magazineV2/layoutSpec.js';
import type { ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.js';

const fonts = { display: 'Playfair Display', body: 'Inter' };

type LeafSpec = [Partial<LeafNode> & { role: LeafRole }, [number, number, number, number]];

/**
 * A fixture page.
 *
 * Every fixture here isolates ONE finding and names only the leaves that produce
 * it — which is right for the per-leaf checks and a lie about the page. A real
 * solved layout ALWAYS tiles its whole sheet: the solver partitions the page, so
 * every pixel belongs to some leaf. To the page-level coverage check
 * (BARE_SERIOUS) a two-leaf fixture therefore reads as a page with almost nothing
 * on it, and every one of these tests would carry a second, spurious defect.
 *
 * So a backdrop covers the sheet by default, making each fixture the whole page it
 * was always pretending to be. A `shape` leaf yields no findings of its own, so it
 * changes nothing else about what these tests measure.
 *
 * `bare: true` opts out — for the tests that are ABOUT coverage.
 */
const solvedOf = (leaves: LeafSpec[], opts: { bare?: boolean } = {}): SolvedLayout => ({
  background: { ref: 'bg' },
  margin: 0,
  page: { width: PAGE_W, height: PAGE_H },
  leaves: [
    ...(opts.bare
      ? []
      : [{ node: { kind: 'leaf', role: 'shape' } as LeafNode, box: { x: 0, y: 0, w: PAGE_W, h: PAGE_H }, z: -1 }]),
    ...leaves.map(([node, [x, y, w, h]], i) => ({
      node: { kind: 'leaf', ...node } as LeafNode,
      box: { x, y, w, h },
      z: i,
    })),
  ],
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

test('SLACK IS JUDGED BY THE PAGE IT WASTES, not by the box', () => {
  // A stat page shipped with three bands each about four times taller than the figure
  // inside them. Every one was reported as slack and NONE was counted, because slack was
  // advisory whatever its size — so nothing retried and the page went out. The size of
  // the waste is what decides.
  const big = fitReport(solvedOf([[{ role: 'body', contentRef: 'body', fontPt: 10 }, [36, 200, 560, 900]]]), { body: { text: 'Two short lines of copy.' } }, fonts);
  const slack = big.findings.find((f) => f.kind === 'slack');
  assert.ok(slack, `got ${kinds(big).join(', ') || 'none'}`);
  assert.ok((slack!.share ?? 0) > 0.15, `share ${slack!.share}`);
  assert.match(slack!.detail, /OF THE WHOLE PAGE/);
  assert.equal(seriousFlaws(big), 1, 'a box swallowing a fifth of the sheet is a defect');

  // …and the reason slack was advisory in the first place still holds for small boxes: a
  // caption with room to spare is normal, and counting it would burn every attempt.
  const small = fitReport(solvedOf([[{ role: 'caption', contentRef: 'cap', fontPt: 9 }, [36, 200, 300, 120]]]), { cap: { text: 'A short caption.' } }, fonts);
  assert.ok(small.findings.some((f) => f.kind === 'slack'), 'still reported');
  assert.equal(seriousFlaws(small), 0, 'but not a defect');
});

test('a big unlabelled glyph is clip-art; the same glyph with a label beside it is design', () => {
  // A real cover put two 15%-wide outline icons at the top with nothing attached to them.
  // The same two glyphs on the back cover, in a module with labels, looked professional.
  const alone = fitReport(solvedOf([[{ role: 'icon', iconName: 'Trophy' }, [200, 120, 200, 200]]]), {}, fonts);
  const decor = alone.findings.find((f) => f.kind === 'decor');
  assert.ok(decor, `got ${kinds(alone).join(', ') || 'none'}`);
  assert.match(decor!.detail, /clip-art/);
  assert.equal(seriousFlaws(alone), 1);

  // With a caption right under it, the same icon is a labelled mark.
  const labelled = fitReport(
    solvedOf([
      [{ role: 'icon', iconName: 'Trophy' }, [200, 120, 200, 200]],
      [{ role: 'label', contentRef: 'l', fontPt: 9 }, [200, 330, 200, 24]],
    ]),
    { l: { text: "Winner's Circle" } },
    fonts,
  );
  assert.ok(!kinds(labelled).includes('decor'), `got ${kinds(labelled).join(', ')}`);

  // A small mark needs no label — it is not pretending to be a picture.
  const mark = fitReport(solvedOf([[{ role: 'icon', iconName: 'Trophy' }, [200, 120, 80, 80]]]), {}, fonts);
  assert.deepEqual(mark.findings, []);
});

test('a QR label stranded away from its QR is reported', () => {
  // The cover defect: the label sat beside the standfirst, the code was at the foot.
  const apart = fitReport(
    solvedOf([
      [{ role: 'qr', contentRef: 'qr' }, [140, 1200, 200, 200]],
      [{ role: 'caption', contentRef: 'qrLabel', fontPt: 9 }, [600, 600, 300, 30]],
    ]),
    { qr: { qrUrl: 'https://x' }, qrLabel: { text: 'Scan for odds' } },
    fonts,
  );
  const orphan = apart.findings.find((f) => f.kind === 'orphan');
  assert.ok(orphan, `got ${kinds(apart).join(', ') || 'none'}`);
  assert.ok(seriousFlaws(apart) >= 1);

  const together = fitReport(
    solvedOf([
      [{ role: 'qr', contentRef: 'qr' }, [140, 1200, 200, 200]],
      [{ role: 'caption', contentRef: 'qrLabel', fontPt: 9 }, [360, 1240, 300, 30]],
    ]),
    { qr: { qrUrl: 'https://x' }, qrLabel: { text: 'Scan for odds' } },
    fonts,
  );
  assert.ok(!kinds(together).includes('orphan'), `got ${kinds(together).join(', ')}`);
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

// ── The aggregates the per-box bar is blind to (C1, 2026-08-17) ──────────────
//
// Eight bands each wasting 4-5% slip under SLACK_SERIOUS_SHARE individually while
// the page is a third blank — the measured "many small text bands" shape behind
// every remaining "loose" page. The aggregate counts ONLY the small boxes, so the
// single huge box (already a per-box defect) is never counted twice.

test('many small slack bands are one defect together, none alone', () => {
  // Labels, not entries: entry/body are PROSE roles whose line-length check would
  // fire too and muddy the count — this test is about slack alone.
  const bands: LeafSpec[] = Array.from({ length: 8 }, (_, i) => [
    { role: 'label' as LeafRole, contentRef: `label${i}`, fontPt: 10 },
    [120, 100 + i * 180, 1000, 150],
  ]);
  const content: ResolvedContent = {};
  for (let i = 0; i < 8; i++) content[`label${i}`] = { text: 'One short line.' };
  const fit = fitReport(solvedOf(bands), content, fonts);
  const slacks = fit.findings.filter((f) => f.kind === 'slack');
  assert.ok(slacks.length >= 6, `expected most bands slack, got ${slacks.length}`);
  assert.ok(slacks.every((f) => (f.share ?? 0) < 0.06), 'each one is individually under the per-box bar');
  assert.ok(fit.slackShare >= 0.15, `total waste ${fit.slackShare}`);
  assert.equal(seriousFlaws(fit), 1, 'counted once, as a page-level defect');
  assert.match(fitHint(fit), /THE PAGE: your SMALL boxes together waste/);
});

test('a page mostly handed to spacers is a defect, and deliberate air is not', () => {
  const missing = fitReport(
    solvedOf([
      [{ role: 'headline', contentRef: 'h', fontPt: 24 }, [120, 100, 1000, 120]],
      [{ role: 'spacer' }, [0, 300, PAGE_W, 1100]], // ~50% of the sheet
    ]),
    { h: { text: 'A Headline' } },
    fonts,
  );
  assert.ok(missing.emptyShare >= EMPTY_SERIOUS, `emptyShare ${missing.emptyShare}`);
  assert.ok(seriousFlaws(missing) >= 1, 'past deliberate air and into a missing page');
  assert.match(fitHint(missing), /spacer leaves — past deliberate air/);

  const breathing = fitReport(
    solvedOf([
      [{ role: 'headline', contentRef: 'h', fontPt: 24 }, [120, 100, 1000, 120]],
      [{ role: 'spacer' }, [0, 300, PAGE_W, 500]], // ~23% — the blessed 15-30% budget
    ]),
    { h: { text: 'A Headline' } },
    fonts,
  );
  // 23% is inside the 15–30% the prompt blesses — and the bar is now that same
  // number, so this asserts against the constant rather than the 0.45 it used to be.
  assert.ok(breathing.emptyShare < EMPTY_SERIOUS);
  assert.equal(seriousFlaws(breathing), 0, 'deliberate air is not a defect');
  assert.ok(!fitHint(breathing).includes('past deliberate air'));
});

// ── The page nobody owned (2026-08-30) ──────────────────────────────────────
//
// A shipped issue had pages roughly 35-40% bare — and they measured CLEAN, on the
// first attempt, with no retry. Every check above is reported BY the leaf that owns
// the space: emptiness had to be declared as a spacer to count, and waste had to
// sit inside a box. Space belonging to NOTHING — a container's `pad`, the `gap`
// between its children, either of which may be set as high as 400px — was invisible
// to all of it. `inkShare` measures the other way round: what actually gets painted.

test('a page that paints almost nothing is a defect, however the emptiness is spelled', () => {
  // Content clustered into the top third, the rest given to gaps no leaf owns.
  // NO spacer leaf, so `emptyShare` is 0 and every per-leaf check is happy.
  const fit = fitReport(
    solvedOf(
      [
        [{ role: 'headline', contentRef: 'h', fontPt: 34 }, [120, 100, 1000, 200]],
        [{ role: 'body', contentRef: 'b', fontPt: 11 }, [120, 320, 1000, 360]],
      ],
      { bare: true },
    ),
    { h: { text: 'What Promise Costs' }, b: { text: 'A yearling’s price begins long before the ring. '.repeat(24) } },
    fonts,
  );
  assert.equal(fit.emptyShare, 0, 'nothing was DECLARED as air — that is the point');
  assert.ok(fit.inkShare < 0.4, `only the cluster is painted (inkShare ${fit.inkShare})`);
  assert.ok(seriousFlaws(fit) >= 1, 'the bare page is counted even with no spacer and no slack');
  assert.match(fitHint(fit), /has ANYTHING drawn on it/);
});

test('a page that covers its sheet is clean, and a full-bleed one is not "bare"', () => {
  // A photo bleeding to the edges paints the whole sheet: high air, zero bareness.
  const bled = fitReport(
    solvedOf(
      [
        [{ role: 'image', contentRef: 'hero' }, [0, 0, PAGE_W, PAGE_H]],
        [{ role: 'headline', contentRef: 'h', fontPt: 34 }, [120, 1200, 1000, 200]],
      ],
      { bare: true },
    ),
    { hero: { image: { url: 'https://s3/x.jpg', assetId: 'a', alt: '' } }, h: { text: 'The Deciding Eighth' } },
    fonts,
  );
  assert.equal(bled.inkShare, 1, 'the photo covers the sheet');
  assert.equal(seriousFlaws(bled), 0);
});

test('overlap is counted once — a stack is not denser than the page it sits on', () => {
  // hero + scrim + headline all cover the same ground. Summing areas would report
  // ~250% and make every layered page look impossibly full.
  const stacked = fitReport(
    solvedOf(
      [
        [{ role: 'image', contentRef: 'hero' }, [0, 0, PAGE_W, PAGE_H]],
        [{ role: 'shape' }, [0, 0, PAGE_W, PAGE_H]],
        [{ role: 'headline', contentRef: 'h', fontPt: 34 }, [120, 800, 1000, 200]],
      ],
      { bare: true },
    ),
    { hero: { image: { url: 'https://s3/x.jpg', assetId: 'a', alt: '' } }, h: { text: 'The Deciding Eighth' } },
    fonts,
  );
  assert.equal(stacked.inkShare, 1, 'never above 1, however many layers overlap');
});

test('a square device is credited with the square it paints, not the band it was given', () => {
  // The QR-in-a-1200×160-band defect, seen from the coverage side: the band is not
  // ink. Measuring the box here would credit the page for space it leaves bare.
  const fit = fitReport(
    solvedOf([[{ role: 'qr', contentRef: 'qr' }, [20, 800, 1200, 160]]], { bare: true }),
    { qr: { qrUrl: 'https://x' } },
    fonts,
  );
  // 160² of a 1240×1754 sheet ≈ 1.2%, not the 8.8% the band would have claimed.
  assert.ok(fit.inkShare < 0.02, `inkShare ${fit.inkShare}`);
});

test('type far past its role ceiling is REPORTED as giant but never counted', () => {
  // 120pt headline (ceiling 46pt): nothing else in the pipeline checks this at all.
  const fit = fitReport(
    solvedOf([[{ role: 'headline', contentRef: 'h', fontPt: 120 }, [60, 200, 1100, 900]]]),
    { h: { text: 'Big Loud Words Across The Page' } },
    fonts,
  );
  assert.ok(kinds(fit).includes('giant'), `got ${kinds(fit).join(', ') || 'none'}`);
  // Advisory: stripping the giant findings must not change the count — a cover
  // masthead legitimately runs huge and the report cannot see the page kind.
  const without = { ...fit, findings: fit.findings.filter((f) => f.kind !== 'giant') };
  assert.equal(seriousFlaws(fit), seriousFlaws(without));
});
