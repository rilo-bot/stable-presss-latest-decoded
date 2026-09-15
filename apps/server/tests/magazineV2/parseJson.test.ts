import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJsonObject,
  repairUnquotedKeys,
  repairBracketMismatch,
  repairBalance,
  repairCloserCount,
} from '../../src/lib/magazineV2/parseJson.js';

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

// ── The OTHER malformation: a closing bracket of the wrong TYPE ───────────────
// Measured, not imagined: a real art-director layout tree — an otherwise
// well-formed, valid page — closed a `"children":[...]` array with `}` instead of
// `]` near the end. finishReason was 'stop' (a complete response, not a
// truncation), JSON.parse rejected the whole object, and the scan fell through to
// the small, valid `"page":{...}` fragment inside it — the SAME wrong-fragment
// failure mode repairUnquotedKeys exists for for keys, just via a bracket instead.
// The user saw "was unusable — using seed" on a page the model had designed correctly.

const MISMATCHED_ARRAY_CLOSER = `{"root":{"kind":"row","children":[{"weight":1,"node":{"kind":"leaf","role":"body"}}}}}`;
const MATCHING_VALID_SHAPE = { root: { kind: 'row', children: [{ weight: 1, node: { kind: 'leaf', role: 'body' } }] } };

test('a mismatched closing bracket type still parses whole', () => {
  const parsed = parseJsonObject(MISMATCHED_ARRAY_CLOSER);
  assert.deepEqual(parsed, MATCHING_VALID_SHAPE);
});

test('bracket-mismatch repair alone reconstructs the intended nesting', () => {
  const repaired = repairBracketMismatch(MISMATCHED_ARRAY_CLOSER);
  assert.deepEqual(JSON.parse(repaired), MATCHING_VALID_SHAPE);
});

test('repairBracketMismatch leaves already-valid JSON unchanged', () => {
  const src = '{"a":[1,2,{"b":[3,4]}],"c":{"d":5}}';
  assert.equal(repairBracketMismatch(src), src);
});

test('repairBracketMismatch never rewrites brackets inside strings', () => {
  const src = '{"note": "use [brackets] and {braces} in prose"}';
  assert.equal(repairBracketMismatch(src), src);
  assert.deepEqual(parseJsonObject(src), { note: 'use [brackets] and {braces} in prose' });
});

test('a stray closer with nothing open is dropped, not guessed at', () => {
  assert.equal(repairBracketMismatch('{"a":1}]'), '{"a":1}');
});

test('an unquoted key AND a mismatched bracket in the same object both repair', () => {
  const src = `{"root":{"kind":"row",children:[{"weight":1,"node":{"kind":"leaf","role":"body"}}}}}`;
  assert.deepEqual(parseJsonObject(src), MATCHING_VALID_SHAPE);
});

test('the outermost object still wins when the outer is bracket-mismatched', () => {
  // Same regression as the unquoted-key case, via the other malformation: a scan
  // that merely "tries the next {" on failure is happy to return the small, valid
  // inner "page" object instead of the real (fixable) outer one.
  const src = `{"page":{"background":{"ref":"bg"}},"root":{"kind":"row","children":[{"weight":1,"node":{"kind":"leaf"}}}}}`;
  const parsed = parseJsonObject(src) as Record<string, unknown>;
  assert.ok(parsed, 'the outer object parses');
  assert.ok('root' in parsed, 'must be the whole spec, not just the page fragment');
});

// ── The THIRD malformation: a miscounted closing RUN ──────────────────────────
// Measured, not imagined, and it ran in both directions. Two real art-director
// responses, both `finishReason: 'stop'` — complete responses, nothing truncated —
// where the design was finished and good and the long tail of `}]` characters was
// the only thing wrong.
//
// This is worse than a wrong closer TYPE, because the COUNT is wrong: with a closer
// missing or spare, the outermost object never balances, so parseJsonObject's scan
// never forms a group for it at all — and the type/key repairs, which only ever run
// on a group that closed, never even executed. The scan fell through to the next
// `{`, which is the value of `"page"`: a small, perfectly-valid fragment with no
// `root` in it. normalizeLayoutSpec returned null, and the worker logged
// "was unusable — using seed" on a page the model had designed correctly.
//
// Both cases below are reduced from the real responses, keeping the exact defect.
// Each is paired with the control the model MEANT to write, and the repair has to
// reproduce it byte for byte — "it parses" is not the bar; "it parses into the tree
// that was designed" is.

/** …col > child > leaf. The run that closes all of it, written correctly. */
const A_HEAD =
  '{"page":{"background":{"ref":"bg"},"margin":"lg"},"root":{"kind":"row","children":[' +
  '{"weight":1.7,"node":{"kind":"stack","layers":[' +
  '{"kind":"leaf","role":"shape"},' +
  '{"kind":"col","children":[{"sizing":"content","node":{"kind":"leaf","role":"byline"';
const A_CONTROL = `${A_HEAD}}}]}]}}]}}`;
// `}}]}}}` where `}}]}]}}` was due: one closer of the wrong type, and one absent.
const A_MISSING_A_CLOSER = `${A_HEAD}}}]}}}]}}`;

const B_HEAD =
  '{"page":{"background":{"ref":"primary"},"margin":"none"},"root":{"kind":"row","children":[' +
  '{"weight":6.4,"node":{"kind":"stack","layers":[' +
  '{"kind":"leaf","role":"image"},' +
  '{"kind":"col","children":[{"sizing":"content","node":{"kind":"leaf","role":"label"';
const B_TAIL = ',{"weight":1.2,"node":{"kind":"leaf","role":"entry"}}]}}';
const B_CONTROL = `${B_HEAD}}}]}]}}${B_TAIL}`;
// `}}]}}]}}` where `}}]}]}}` was due: one closer too MANY, which shuts the root's
// own children array early and strands the second page element outside it.
const B_EXTRA_CLOSER = `${B_HEAD}}}]}}]}}${B_TAIL}`;

test('the controls are the JSON the model meant to write', () => {
  // Guards the fixtures themselves: a typo in a control would make the two tests
  // below agree with each other about the wrong tree.
  assert.deepEqual((JSON.parse(A_CONTROL) as Record<string, unknown>).page, { background: { ref: 'bg' }, margin: 'lg' });
  assert.equal((JSON.parse(B_CONTROL) as any).root.children.length, 2, 'both page elements are inside root');
});

test('a closer MISSING from the middle of the run is restored', () => {
  assert.throws(() => JSON.parse(A_MISSING_A_CLOSER), 'the fixture really is broken');
  assert.deepEqual(parseJsonObject(A_MISSING_A_CLOSER), JSON.parse(A_CONTROL));
});

test('a closer too MANY in the middle of the run is dropped', () => {
  assert.throws(() => JSON.parse(B_EXTRA_CLOSER), 'the fixture really is broken');
  const parsed = parseJsonObject(B_EXTRA_CLOSER) as any;
  assert.deepEqual(parsed, JSON.parse(B_CONTROL));
  assert.equal(parsed.root.children.length, 2, 'the second element is back inside root, not stranded after it');
});

test('the repair reconstructs the intended text exactly, in both directions', () => {
  assert.equal(repairCloserCount(A_MISSING_A_CLOSER), A_CONTROL);
  assert.equal(repairCloserCount(B_EXTRA_CLOSER), B_CONTROL);
});

test('a miscounted run never yields the inner "page" fragment', () => {
  // The actual bug as the user saw it: `{background, margin}` reaching
  // normalizeLayoutSpec, which finds no root and returns null → seed page.
  for (const broken of [A_MISSING_A_CLOSER, B_EXTRA_CLOSER]) {
    const parsed = parseJsonObject(broken) as Record<string, unknown>;
    assert.ok('root' in parsed, 'must be the whole spec, not the page fragment');
  }
});

// ── The repair must not be a licence, part two ───────────────────────────────

test('repairBalance and repairCloserCount leave already-valid JSON identical', () => {
  const src = '{"a":[1,2,{"b":[3,4]}],"c":{"d":5}}';
  assert.equal(repairBalance(src), src);
  assert.equal(repairCloserCount(src), src);
});

test('a response cut off mid-tree yields the tree built so far', () => {
  // finishReason 'length'. Closing what is still open beats returning nothing: the
  // page keeps the design the model got through before the budget ran out.
  const truncated = '{"root":{"kind":"row","children":[{"node":{"kind":"leaf","role":"body"';
  assert.deepEqual(parseJsonObject(truncated), {
    root: { kind: 'row', children: [{ node: { kind: 'leaf', role: 'body' } }] },
  });
});

test('an unterminated string is closed rather than dropped', () => {
  assert.deepEqual(parseJsonObject('{"root":{"contentRef":"headl'), { root: { contentRef: 'headl' } });
});

test('brackets inside strings are still never counted or rewritten', () => {
  assert.deepEqual(parseJsonObject('{"note":"a [b] and {c}"}'), { note: 'a [b] and {c}' });
  assert.equal(repairCloserCount('{"note":"a [b] and {c}"}'), '{"note":"a [b] and {c}"}');
});

test('unparseable junk is still null — the count repair invents nothing', () => {
  // Only `}` and `]` are ever added or removed, and only where JSON.parse has
  // already refused to continue. Nothing here is a bracket problem, so nothing here
  // gets a tree.
  assert.equal(parseJsonObject('no braces here'), null);
  assert.equal(parseJsonObject('{"a": undefined}'), null);
  assert.equal(parseJsonObject('{"a": , "b": }'), null);
});

test('prose and fences around the object still work', () => {
  // The count repair runs per candidate, so it must not hijack a document whose
  // first `{` is prose and whose real object comes later.
  assert.deepEqual(parseJsonObject('Here:\n```json\n{"a":1}\n```\ndone'), { a: 1 });
  assert.deepEqual(parseJsonObject('a {note} then {"a":1}'), { a: 1 });
});
