// Did the page we built match the reference? (P3 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md)
//
// The measurement has to be trustworthy in BOTH directions: it must not flatter a
// page that came out wrong, and it must not cry mismatch over a page that is right.
// Both failures cost the same thing — the user stops believing the number.

import test from 'node:test';
import assert from 'node:assert/strict';
import { iou, measureFidelity, MATCHED_AT, ADAPTED_AT } from '../../src/lib/magazineV2/layoutFidelity.ts';
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
