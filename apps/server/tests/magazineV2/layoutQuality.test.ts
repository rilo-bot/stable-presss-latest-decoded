// ---------------------------------------------------------------------------
// layoutQuality — the shared geometric rules (photo shape, dead bands, scrim ceiling).
//
// Every number here is from a real generated page: a 74×1634 photo down a contents page,
// a 451×28 ribbon in a profile grid, a 529×123 photo (aspect 4.3), a 660px stripe of bare
// paper under a feature title, and a full-page scrim at 0.88 that turned a photograph
// into a black field.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  imageShapeProblem,
  deadBands,
  capScrimOpacity,
  bleeds,
  IMAGE_MIN_ASPECT,
  IMAGE_MAX_ASPECT,
  MAX_COVERING_SCRIM_OPACITY,
  DEAD_BAND_SHARE,
} from '../../src/lib/magazineV2/layoutQuality.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';

const PAGE = { width: PAGE_W, height: PAGE_H };

test('the slivers a real issue shipped are not photographs', () => {
  assert.equal(imageShapeProblem({ x: 1106, y: 60, w: 74, h: 1634 }, PAGE)?.kind, 'tiny', 'a 74px strip is too thin to read at all');
  assert.equal(imageShapeProblem({ x: 729, y: 913, w: 451, h: 28 }, PAGE)?.kind, 'tiny');
  const ribbon = imageShapeProblem({ x: 60, y: 1404, w: 529, h: 123 }, PAGE);
  assert.equal(ribbon?.kind, 'too-wide');
  assert.match(ribbon!.detail, /4\.30/);
  const pole = imageShapeProblem({ x: 36, y: 264, w: 403, h: 1183 }, PAGE);
  assert.equal(pole?.kind, 'too-tall', 'aspect 0.34 is a sliver standing on end');
});

test('a sane crop of any orientation is fine', () => {
  for (const [w, h] of [[529, 529], [800, 400], [451, 800], [1120, 448], [600, 1200]] as const) {
    assert.equal(imageShapeProblem({ x: 60, y: 60, w, h }, PAGE), null, `${w}×${h}`);
  }
  // The bounds themselves are inclusive.
  assert.equal(imageShapeProblem({ x: 60, y: 60, w: 500, h: 500 / IMAGE_MAX_ASPECT }, PAGE), null);
  assert.equal(imageShapeProblem({ x: 60, y: 60, w: 400, h: 400 / IMAGE_MIN_ASPECT }, PAGE), null);
});

test('a background photo is exempt — its shape is the page', () => {
  assert.equal(imageShapeProblem({ x: 0, y: 0, w: PAGE_W, h: PAGE_H }, PAGE), null);
  assert.equal(imageShapeProblem({ x: 0, y: 0, w: PAGE_W, h: PAGE_H * 0.6 }, PAGE), null);
});

test('a photo that bleeds edge to edge gets the wider panorama range, not a free pass', () => {
  const band = { x: 0, y: 0, w: PAGE_W, h: 400 }; // 3.1:1, bleeding left and right
  assert.ok(bleeds(band, PAGE));
  assert.equal(imageShapeProblem(band, PAGE), null, 'a full-width 3:1 opener is a classic, not a sliver');
  assert.equal(imageShapeProblem({ x: 60, y: 0, w: 1120, h: 360 }, PAGE)?.kind, 'too-wide', 'the same band inset is a ribbon');
  assert.equal(imageShapeProblem({ x: 0, y: 0, w: PAGE_W, h: 200 }, PAGE)?.kind, 'too-wide', 'even a bleed has a limit (6:1)');
});

test('dead bands are full-width stripes of nothing, measured past the margins', () => {
  const H = PAGE_H;
  // Ink at the top and the bottom, nothing between: one band, exactly where it is.
  const bands = deadBands([{ y: 60, h: 190 }, { y: 907, h: 787 }], H);
  assert.deepEqual(bands, [{ y0: 250, y1: 907 }]);
  // A section gap is rhythm, not a band.
  assert.deepEqual(deadBands([{ y: 60, h: 800 }, { y: 950, h: 744 }], H), []);
  // Ink ANYWHERE across the width breaks the stripe — x is deliberately ignored.
  assert.deepEqual(deadBands([{ y: 60, h: 400 }, { y: 300, h: 1394 }], H), []);
});

test('the page margin is not a dead band, but an empty foot is', () => {
  const H = PAGE_H;
  assert.deepEqual(deadBands([{ y: 96, h: H - 192 }], H), [], 'symmetric 96px margins');
  const foot = deadBands([{ y: 60, h: 1100 }], H);
  assert.equal(foot.length, 1, 'content ending at 1160 leaves ~600px of nothing');
  assert.equal(foot[0]!.y0, 1160);
  // The threshold is a share of the sheet.
  const justUnder = DEAD_BAND_SHARE * H - 1;
  assert.deepEqual(deadBands([{ y: 0, h: 500 }, { y: 500 + justUnder, h: H - 500 - justUnder }], H), []);
});

test('a scrim over most of the sheet may darken the photo, not erase it', () => {
  const full = { x: 0, y: 0, w: PAGE_W, h: PAGE_H };
  assert.equal(capScrimOpacity(0.88, full, PAGE), MAX_COVERING_SCRIM_OPACITY);
  assert.equal(capScrimOpacity(0.5, full, PAGE), 0.5, 'a lighter wash is the art-director’s call');
  assert.equal(capScrimOpacity(0.9, { x: 0, y: 1200, w: PAGE_W, h: 554 }, PAGE), 0.9, 'a band behind a caption may be dark');
});
