import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonObject, repairUnquotedKeys } from '../../src/lib/magazineV2/parseJson.js';

// ── The malformation this exists for ─────────────────────────────────────────
// Measured, not imagined: reading one real magazine cover four times, three of the
// four vision responses came back with `colorRef` unquoted and every other key
// correct. The whole top-level object then failed to parse, the scan fell through
// to the first `"box": {…}` inside it — which parses perfectly and is the WRONG
// object — and the user was told we could not make out a layout in an image the
// model had read correctly.

const REAL_SHAPE = `{
  "aspect": 0.77,
  "background": "photo",
  "regions": [
    {
      "role": "headline",
      "box": {"x": 0.28, "y": 0.1, "w": 0.6, "h": 0.09},
      "emphasis": "dominant",
      colorRef: "primary",
      "color": "#e5182a",
      "text": "THE HORSE",
      "chars": 9
    }
  ],
  "confidence": 0.9
}`;

test('a reading with an unquoted key still parses whole', () => {
  const parsed = parseJsonObject(REAL_SHAPE) as Record<string, unknown> | null;
  assert.ok(parsed, 'the object parses');
  assert.ok(Array.isArray(parsed.regions), 'and it is the OUTER object, not an inner box');
  assert.equal((parsed.regions as unknown[]).length, 1);
  const region = (parsed.regions as Record<string, unknown>[])[0]!;
  assert.equal(region.colorRef, 'primary', 'the repaired key keeps its value');
  assert.equal(region.color, '#e5182a', 'and its neighbours are untouched');
});

test('the outermost object wins — a malformed outer never yields an inner fragment', () => {
  // The regression in one line: `{x,y,w,h}` is a perfectly valid object, so a scan
  // that merely "tries the next {" is happy to return it.
  const parsed = parseJsonObject(REAL_SHAPE) as Record<string, unknown>;
  assert.ok(!('x' in parsed), 'must not be the box');
  assert.ok('aspect' in parsed, 'must be the reading');
});

// ── The repair must not be a licence ─────────────────────────────────────────

test('valid JSON is returned byte-identically — the repair never runs on it', () => {
  const src = '{"note": "Summer 2026: the issue", "n": 1}';
  assert.deepEqual(parseJsonObject(src), { note: 'Summer 2026: the issue', n: 1 });
});

test('a colon inside a string is not mistaken for a key', () => {
  // The one way a string-blind regex would corrupt real data. `note` genuinely
  // carries prose from the model, and prose contains colons.
  const src = `{ role: "kicker", "note": "two-tone masthead: THE in gray, HORSE in red" }`;
  const parsed = parseJsonObject(src) as Record<string, string>;
  assert.equal(parsed.role, 'kicker');
  assert.equal(parsed.note, 'two-tone masthead: THE in gray, HORSE in red', 'prose survives verbatim');
});

test('an escaped quote inside a string does not desynchronise the scan', () => {
  const src = String.raw`{ role: "label", "note": "the \"AAEP\" line: quoted" }`;
  const parsed = parseJsonObject(src) as Record<string, string>;
  assert.equal(parsed.role, 'label');
  assert.equal(parsed.note, 'the "AAEP" line: quoted');
});

test('bare words that are not keys are left alone to fail', () => {
  // No `:` follows, so this is a bare VALUE — not the malformation we repair, and
  // quietly inventing a meaning for it is exactly what a trust boundary must not do.
  assert.equal(repairUnquotedKeys('{"a": undefined}'), '{"a": undefined}');
  assert.equal(parseJsonObject('{"a": undefined}'), null);
});

test('still finds the object inside prose and fences', () => {
  assert.deepEqual(parseJsonObject('Here you go:\n```json\n{"a": 1}\n```\nHope that helps.'), { a: 1 });
});

test('nothing parseable is still null, not a guess', () => {
  assert.equal(parseJsonObject('no braces here'), null);
  assert.equal(parseJsonObject(''), null);
});

test('repair leaves an already-quoted key untouched', () => {
  const src = '{ "colorRef": "text" }';
  assert.equal(repairUnquotedKeys(src), src);
});

test('keys after a nested close-brace are repaired too', () => {
  const parsed = parseJsonObject('{"box": {"x": 1}, colorRef: "bg"}') as Record<string, unknown>;
  assert.deepEqual(parsed, { box: { x: 1 }, colorRef: 'bg' });
});
