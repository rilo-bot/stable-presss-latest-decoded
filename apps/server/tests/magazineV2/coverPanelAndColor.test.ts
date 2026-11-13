// Two cover bugs seen on 2026-11-13: an opaque stack panel burying the hero photo,
// and an "rgba(…, 0.4)" scrim stored as solid black.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isScrimLeaf } from '../../src/lib/magazineV2/composeFromSolved.js';
import { normalizeElements } from '../../src/lib/magazineV2/writePipeline.js';
import { parseColor } from '../../src/lib/magazineV2/model.js';

const leaf = (role: string, box: { x: number; y: number; w: number; h: number }, z: number, stackIndex?: number) =>
  ({ node: { kind: 'leaf', role }, box, z, ...(stackIndex !== undefined ? { stackIndex } : {}) }) as never;

test('a stack panel covering most of a photo becomes a scrim; a small card stays an opaque panel', () => {
  const photo = leaf('image', { x: 0, y: 0, w: 1240, h: 1754 }, 1);
  const fullPanel = leaf('shape', { x: 0, y: 0, w: 1240, h: 1754 }, 2, 0);
  const card = leaf('shape', { x: 80, y: 1300, w: 500, h: 300 }, 2, 0);
  assert.equal(isScrimLeaf(fullPanel, [photo, fullPanel]), true);
  assert.equal(isScrimLeaf(card, [photo, card]), false);
});

test('colours with transparency keep it as shape opacity instead of turning solid black', () => {
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.4)'), { hex: '#000000', alpha: 0.4 });
  assert.deepEqual(parseColor('#1a332280'), { hex: '#1a3322', alpha: 128 / 255 });
  assert.deepEqual(parseColor('rgb(26 51 34 / 50%)'), { hex: '#1a3322', alpha: 0.5 });
  assert.equal(parseColor('not a colour'), null);
  const [band] = normalizeElements([{ type: 'shape', x: 0, y: 900, w: 1240, h: 854, shape: { fill: 'rgba(0,0,0,0.4)' } }], { width: 1240, height: 1754 });
  assert.equal(band!.shape!.fill, '#000000');
  assert.equal(band!.shape!.opacity, 0.4);
  const [solid] = normalizeElements([{ type: 'shape', x: 0, y: 0, w: 100, h: 100, shape: { fill: '#123456' } }], { width: 1240, height: 1754 });
  assert.equal(solid!.shape!.opacity, undefined);
});
