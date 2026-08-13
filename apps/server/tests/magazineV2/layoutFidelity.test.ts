// Did the page we built match the reference? (P3 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md)
//
// The measurement has to be trustworthy in BOTH directions: it must not flatter a
// page that came out wrong, and it must not cry mismatch over a page that is right.
// Both failures cost the same thing — the user stops believing the number.

import test from 'node:test';
import assert from 'node:assert/strict';
import { iou, measureFidelity, isGuaranteed, MATCHED_AT, ADAPTED_AT } from '../../src/lib/magazineV2/layoutFidelity.ts';
import { readingToSpec } from '../../src/lib/magazineV2/readingToSpec.ts';
import { normalizeLayoutReading } from '../../src/lib/magazineV2/layoutReading.ts';
import { solveLayout } from '../../src/lib/magazineV2/solveLayout.ts';
import type { Origin } from '../../src/lib/magazineV2/readingToSpec.ts';
import type { SolvedLayout } from '../../src/lib/magazineV2/solveLayout.ts';
import type { LeafRole } from '../../src/lib/magazineV2/layoutSpec.ts';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const DIMS = { width: 1000, height: 1000 };

/** A solved layout, hand-built: one leaf per (ref, role, box-in-page-px). */
const solvedOf = (leaves: [string, string, [number, number, number, number]][]): SolvedLayout => ({
  background: { ref: 'bg' },
  margin: 0,
  page: DIMS,
  leaves: leaves.map(([ref, role, [x, y, w, h]], i) => ({
    node: { kind: 'leaf' as const, role: role as LeafRole, contentRef: ref },
    box: { x, y, w, h },
    z: i,
  })),
});

// ── iou ──────────────────────────────────────────────────────────────────────

test('identical boxes are a perfect match', () => {
  assert.equal(iou(box(0.1, 0.1, 0.5, 0.5), box(0.1, 0.1, 0.5, 0.5)), 1);
});

test('boxes that do not touch score zero', () => {
  assert.equal(iou(box(0, 0, 0.4, 0.4), box(0.6, 0.6, 0.4, 0.4)), 0);
  assert.equal(iou(box(0, 0, 0.5, 1), box(0.5, 0, 0.5, 1)), 0, 'sharing an edge is not overlap');
});

test('half-overlap scores a third, as the maths says it must', () => {
  // Two unit-ish boxes overlapping by half: inter = 0.5, union = 1.5 → 1/3.
  const v = iou(box(0, 0, 1, 0.5), box(0, 0.25, 1, 0.5));
  assert.ok(Math.abs(v - 1 / 3) < 1e-9, `${v}`);
});

test('a box inside a much bigger one scores low, not high', () => {
  // Containment is not a match: a caption where the hero photo should be would
  // otherwise look like a success.
  assert.ok(iou(box(0, 0, 1, 1), box(0.4, 0.4, 0.2, 0.2)) < 0.05);
});

// ── measureFidelity ──────────────────────────────────────────────────────────

test('a page built exactly where the reference had it reads as matched', () => {
  const origin: Origin = { hero: box(0, 0, 1, 0.6), body: box(0, 0.6, 1, 0.4) };
  const f = measureFidelity(solvedOf([
    ['hero', 'image', [0, 0, 1000, 600]],
    ['body', 'body', [0, 600, 1000, 400]],
  ]), origin, DIMS);
  assert.equal(f.score, 1);
  assert.equal(f.verdict, 'matched');
  assert.equal(f.missing, 0);
  assert.match(f.summary, /Matched/);
});

test('the score is weighted by area, so a misplaced PHOTO cannot hide behind captions', () => {
  // Three accurate captions and one hero photo in the wrong half. An unweighted mean
  // would call this a match; the client would call it wrong.
  const origin: Origin = {
    hero: box(0, 0, 1, 0.7),
    caption: box(0, 0.72, 0.3, 0.04),
    caption2: box(0.35, 0.72, 0.3, 0.04),
    caption3: box(0.7, 0.72, 0.3, 0.04),
  };
  const f = measureFidelity(solvedOf([
    ['hero', 'image', [0, 700, 1000, 300]], // moved to the bottom third
    ['caption', 'caption', [0, 720, 300, 40]],
    ['caption2', 'caption', [350, 720, 300, 40]],
    ['caption3', 'caption', [700, 720, 300, 40]],
  ]), origin, DIMS);
  assert.ok(f.score < ADAPTED_AT, `score ${f.score} should be poor`);
  assert.equal(f.verdict, 'loose');
});

test('a caption a few percent out does not spoil a good page', () => {
  const origin: Origin = { hero: box(0, 0, 1, 0.7), caption: box(0, 0.72, 0.4, 0.05) };
  const f = measureFidelity(solvedOf([
    ['hero', 'image', [0, 0, 1000, 700]],
    ['caption', 'caption', [0, 740, 380, 50]], // 2% low, slightly narrow
  ]), origin, DIMS);
  assert.equal(f.verdict, 'matched');
  assert.ok(f.score > MATCHED_AT);
});

test('a slot that never reached the page is counted and named in the sentence', () => {
  // pruneSpec drops leaves with no content and the solver re-partitions, so the
  // survivors legitimately grow. That is a real difference from the reference and the
  // user is told why rather than left with an unexplained number.
  const origin: Origin = { hero: box(0, 0, 1, 0.5), body: box(0, 0.5, 1, 0.3), caption: box(0, 0.85, 1, 0.1) };
  const f = measureFidelity(solvedOf([
    ['hero', 'image', [0, 0, 1000, 500]],
    ['body', 'body', [0, 500, 1000, 300]],
  ]), origin, DIMS);
  assert.equal(f.missing, 1);
  assert.match(f.summary, /1 box from the reference had nothing to put in it/);
});

test('a perfect score with a missing box is "adapted", never "matched"', () => {
  const origin: Origin = { hero: box(0, 0, 1, 0.6), body: box(0, 0.6, 1, 0.4), caption: box(0, 0.95, 1, 0.04) };
  const f = measureFidelity(solvedOf([
    ['hero', 'image', [0, 0, 1000, 600]],
    ['body', 'body', [0, 600, 1000, 400]],
  ]), origin, DIMS);
  // Every box that WAS placed landed exactly right, so 1.0 is the truthful placement
  // figure. What the missing caption costs is the WORD, not the number.
  assert.equal(f.score, 1);
  assert.equal(f.verdict, 'adapted', 'a box that never arrived is not a close match');
});

test('the sentence names what moved most, in words a person would use', () => {
  const origin: Origin = { hero: box(0, 0, 1, 0.5), body: box(0, 0.55, 1, 0.45) };
  const f = measureFidelity(solvedOf([
    ['hero', 'image', [0, 0, 1000, 340]],   // noticeably shallower
    ['body', 'body', [0, 360, 1000, 640]],
  ]), origin, DIMS);
  assert.equal(f.verdict, 'adapted');
  assert.match(f.summary, /photo|text/, 'names a slot in plain language, not "image leaf"');
});

test('nothing measurable is an unanswered question, not a 0% failure', () => {
  const f = measureFidelity(solvedOf([]), { hero: box(0, 0, 1, 1) }, DIMS);
  assert.equal(f.slots.length, 0);
  assert.match(f.summary, /could be compared/);
});

test('a page with no dimensions does not divide by zero', () => {
  const f = measureFidelity(solvedOf([['hero', 'image', [0, 0, 100, 100]]]), { hero: box(0, 0, 1, 1) }, { width: 0, height: 0 });
  assert.ok(Number.isFinite(f.score));
});

// ── End to end: the converter's own origin map, against the real solver ──────

test('a reading converted and solved measures as a close match to itself', () => {
  // The strongest available check: no hand-built boxes. Read → convert → SOLVE →
  // measure. If the guillotine and the solver agree with the reading, this is high.
  const reading = normalizeLayoutReading({
    margin: 'none',
    regions: [
      { role: 'image', box: box(0, 0, 1, 0.55) },
      { role: 'headline', box: box(0, 0.57, 1, 0.13) },
      { role: 'body', box: box(0, 0.72, 1, 0.28) },
    ],
  });
  assert.ok(reading);
  const converted = readingToSpec(reading);
  assert.ok(converted);
  const solved = solveLayout(converted.spec, DIMS);
  const f = measureFidelity(solved, converted.origin, DIMS);
  assert.equal(f.slots.length, 3, 'every slot was measured');
  assert.ok(f.score > MATCHED_AT, `score ${f.score.toFixed(3)} should be a close match`);
  assert.equal(f.verdict, 'matched');
});

test('A MAGAZINE COVER: text clustered at the top stays at the top', () => {
  // THE REGRESSION. Reported from a real test: a magazine cover (full-bleed photo,
  // masthead and teasers in the TOP THIRD) came back with the headline as a giant band
  // across the MIDDLE of the page.
  //
  // Cause: `fr` weights always fill their container — the solver only honours
  // `justify` when every track is content-sized. So a cluster of text occupying the top
  // 25% of the reference was given fr weights summing to 25 and stretched over 100% of
  // the page. The reference's empty space was thrown away.
  const reading = normalizeLayoutReading({
    margin: 'none',
    regions: [
      { role: 'image', box: box(0, 0, 1, 1) },                 // full-bleed cover photo
      { role: 'kicker', box: box(0.1, 0.03, 0.8, 0.03) },      // teaser strip
      { role: 'headline', box: box(0.08, 0.09, 0.84, 0.1) },   // the masthead
      { role: 'subhead', box: box(0.3, 0.21, 0.4, 0.03) },     // the tagline
    ],
  });
  assert.ok(reading);
  const converted = readingToSpec(reading);
  assert.ok(converted);
  const H = 1650;
  const solved = solveLayout(converted.spec, { width: 1275, height: H }, { measureLeaf: () => 90 });
  const head = solved.leaves.find((l) => l.node.role === 'headline');
  assert.ok(head, 'the headline reached the page');
  // The masthead sat in the top 20% of the reference. Anywhere past the top THIRD is
  // the bug, however generously you read it.
  assert.ok(
    head.box.y + head.box.h <= H * 0.4,
    `the masthead ends at ${head.box.y + head.box.h} of ${H} — it belongs in the top third`,
  );
  const f = measureFidelity(solved, converted.origin, { width: 1275, height: H });
  assert.ok(f.score > ADAPTED_AT, `fidelity ${f.score.toFixed(2)} — a cover should not be a loose interpretation`);
});

test('a landscape reading on a portrait page reports honestly instead of claiming a match', () => {
  // The layout is fine; the SHAPE is wrong, and the score has to say so — this is
  // exactly the case aspectMismatch warns about before anything is built.
  const reading = normalizeLayoutReading({
    margin: 'none',
    regions: [
      { role: 'image', box: box(0, 0, 0.45, 1) },
      { role: 'body', box: box(0.5, 0, 0.5, 1) },
    ],
  });
  assert.ok(reading);
  const converted = readingToSpec(reading);
  assert.ok(converted);
  // A tall page: the same row of two columns, but the columns are now narrow.
  const solved = solveLayout(converted.spec, { width: 600, height: 1600 });
  const f = measureFidelity(solved, converted.origin, { width: 600, height: 1600 });
  // Proportions in NORMALISED space are preserved by the solver, so this still scores
  // well — the honest signal for shape is aspectMismatch, not IoU. Asserting that
  // here keeps the two mechanisms from being confused for one another.
  assert.ok(f.score > ADAPTED_AT, `${f.score}`);
});

// ── The domination bound (Phase 0 of docs/MAGAZINE-V2-BUILDER-PLAN.md) ────────
//
// The score used to have a MATHEMATICAL FLOOR on any reference with a full-bleed photo.
// A full-bleed photo is a stack layer, the solver hands every stack layer the whole page,
// so it always scored IoU 1.0 with area 1.0 — against ~0.09 for all the type combined.
// The area-weighted mean therefore could not fall below 1/(1+0.09) ≈ 0.91, and
// MATCHED_AT is 0.72, so "Matched your reference closely" was decided before a single
// word was placed. Four separately ruined pages measured 92%, 89%, 85% and 76%.

test('one perfect full-bleed photo cannot certify a page whose type is all wrong', () => {
  // A cover: full-bleed photo, masthead in the top 12%, a label under it.
  const origin: Origin = {
    hero: box(0, 0, 1, 1),
    headline: box(0.08, 0.04, 0.84, 0.08),
    label: box(0.08, 0.15, 0.34, 0.04),
  };
  // What the fr-stretch actually builds: the photo right, the type spread down the page.
  const f = measureFidelity(
    solvedOf([
      ['hero', 'image', [0, 0, 1000, 1000]],
      ['headline', 'headline', [0, 0, 1000, 640]],
      ['label', 'label', [0, 680, 1000, 320]],
    ]),
    origin,
    DIMS,
  );
  assert.notEqual(f.verdict, 'matched', 'the photo must not carry the verdict on its own');
  assert.ok(f.score < MATCHED_AT, `score ${f.score} should be below the matched bar`);
  assert.ok(!/Matched your reference closely/.test(f.summary), f.summary);
});

test('the cap does not punish a page that is genuinely right', () => {
  // The other direction matters just as much: over-correcting would make the number
  // useless in the opposite way.
  const origin: Origin = {
    hero: box(0, 0, 1, 0.55),
    headline: box(0.06, 0.58, 0.88, 0.1),
    body: box(0.06, 0.7, 0.88, 0.26),
  };
  const f = measureFidelity(
    solvedOf([
      ['hero', 'image', [0, 0, 1000, 550]],
      ['headline', 'headline', [60, 580, 880, 100]],
      ['body', 'body', [60, 700, 880, 260]],
    ]),
    origin,
    DIMS,
  );
  assert.equal(f.verdict, 'matched', f.summary);
});

test('a full-bleed backing layer is not measured — it agrees with itself by construction', () => {
  const full = { x: 0, y: 0, w: 1, h: 1 };
  assert.equal(isGuaranteed('image', full, full), true);
  assert.equal(isGuaranteed('shape', full, full), true, 'a full-page scrim is guaranteed too');
  // An inset photo's placement is a real decision, so it stays in the mean.
  assert.equal(isGuaranteed('image', { x: 0, y: 0, w: 1, h: 0.6 }, { x: 0, y: 0, w: 1, h: 0.6 }), false);
  // Type is never excluded, however big it is.
  assert.equal(isGuaranteed('headline', full, full), false);
  // A photo the reference had full-bleed that did NOT come out full-bleed is a real
  // failure and must keep its full weight.
  assert.equal(isGuaranteed('image', full, { x: 0, y: 0, w: 1, h: 0.3 }), false);
});

test('a reference that is ONE full-bleed photo still reads as matched', () => {
  // Excluding guaranteed slots must not empty the set and score the page 0%.
  const origin: Origin = { hero: box(0, 0, 1, 1) };
  const f = measureFidelity(solvedOf([['hero', 'image', [0, 0, 1000, 1000]]]), origin, DIMS);
  assert.equal(f.verdict, 'matched', f.summary);
});
test('a missing box does not move the score — it forbids the verdict and is named', () => {
  // TWO QUESTIONS, TWO ANSWERS. `score` is "what we placed, did it land right?";
  // `missing` is "was anything not placed at all?". Folding missing into the mean was
  // tried and measured: it took a cover that IS recognisably the reference from 0.60 to
  // 0.39 — 'adapted' to 'could not be reproduced' — which is untrue. So the veto carries
  // completeness instead, and the number stays honest about placement.
  const origin: Origin = { hero: box(0, 0, 1, 0.5), body: box(0, 0.5, 1, 0.3), caption: box(0, 0.85, 1, 0.15) };
  const placedOnly = solvedOf([['hero', 'image', [0, 0, 1000, 500]], ['body', 'body', [0, 500, 1000, 300]]]);
  const f = measureFidelity(placedOnly, origin, DIMS);
  assert.equal(f.missing, 1);
  assert.notEqual(f.verdict, 'matched', 'a box that never arrived is never a close match');
  assert.match(f.summary, /1 box from the reference had nothing to put in it/, f.summary);
});
test('the biggest piece of type not landing is never a match, whatever the mean says', () => {
  const origin: Origin = { hero: box(0, 0, 1, 0.5), headline: box(0.1, 0.55, 0.8, 0.1) };
  const f = measureFidelity(
    solvedOf([
      ['hero', 'image', [0, 0, 1000, 500]], // photo exactly right
      ['headline', 'headline', [100, 880, 800, 100]], // headline in the wrong band
    ]),
    origin,
    DIMS,
  );
  assert.notEqual(f.verdict, 'matched');
  assert.match(f.summary, /headline did not land where the reference had it/, f.summary);
});

test('a landscape reference on a portrait page is adapted, never matched', () => {
  // Even when every band happens to line up, the shape did not carry over — and this is
  // the only place the user is told.
  const origin: Origin = { hero: box(0, 0, 1, 0.5), body: box(0, 0.5, 1, 0.5) };
  const solved = solvedOf([['hero', 'image', [0, 0, 1000, 500]], ['body', 'body', [0, 500, 1000, 500]]]);
  const square = measureFidelity(solved, origin, DIMS);
  assert.equal(square.verdict, 'matched', 'control: same shape, perfect placement');
  const wide = measureFidelity(solved, origin, DIMS, { aspect: 1.6 });
  assert.equal(wide.verdict, 'adapted');
  assert.match(wide.summary, /different shape/, wide.summary);
});
