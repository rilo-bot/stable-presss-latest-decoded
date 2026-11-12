// ---------------------------------------------------------------------------
// The Visual Critic's pure half: reading its verdict, turning it into ONE retry hint,
// and the two decisions composeOnePageAI's attempt loop makes with it — "is this page
// good enough to stop?" and "which of two attempts do we keep?". No model, no browser.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseVerdict,
  verdictHint,
  combineHints,
  attemptPasses,
  betterAttempt,
  CRITIC_PASS_SCORE,
  type CriticVerdict,
  type RankedAttempt,
} from '../../src/lib/magazineV2/visualCritic.js';

test('reads a clean verdict', () => {
  const v = parseVerdict(
    '{"score": 8, "pass": true, "problems": [{"area": "lower third", "issue": "caption touches the photo", "fix": "add space above the caption"}]}',
  );
  assert.deepEqual(v, {
    score: 8,
    pass: true,
    problems: [{ area: 'lower third', issue: 'caption touches the photo', fix: 'add space above the caption' }],
  });
});

test('reads a verdict wrapped in prose and fences', () => {
  const v = parseVerdict('Here is my verdict:\n```json\n{"score": "5", "pass": false, "problems": ["The page is top-heavy."]}\n```');
  assert.ok(v);
  assert.equal(v.score, 5);
  assert.equal(v.pass, false);
  assert.deepEqual(v.problems, [{ area: '', issue: 'The page is top-heavy.', fix: '' }]);
});

test('pass is never on the model word alone', () => {
  // A low score fails even when the model says pass.
  assert.equal(parseVerdict(`{"score": ${CRITIC_PASS_SCORE - 1}, "pass": true, "problems": []}`)?.pass, false);
  // An explicit fail wins over a good score.
  assert.equal(parseVerdict('{"score": 9, "pass": false, "problems": []}')?.pass, false);
  // No pass field: the score decides.
  assert.equal(parseVerdict('{"score": 7, "problems": []}')?.pass, true);
});

test('score is clamped to 1–10; no score is no verdict', () => {
  assert.equal(parseVerdict('{"score": 14, "pass": true}')?.score, 10);
  assert.equal(parseVerdict('{"score": -3}')?.score, 1);
  assert.equal(parseVerdict('{"pass": true, "problems": []}'), null);
  assert.equal(parseVerdict('I could not see the page.'), null);
  assert.equal(parseVerdict('[1,2,3]'), null);
});

test('problems: empty issues dropped, alternate keys accepted, capped at five', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ where: `zone ${i}`, problem: `issue ${i}`, remedy: `fix ${i}` }));
  const v = parseVerdict(JSON.stringify({ score: 4, pass: false, problems: [{ area: 'x', issue: '' }, ...many] }));
  assert.ok(v);
  assert.equal(v.problems.length, 5);
  assert.deepEqual(v.problems[0], { area: 'zone 0', issue: 'issue 0', fix: 'fix 0' });
});

test('the hint names the score and every problem with its fix, most important first', () => {
  const v: CriticVerdict = {
    score: 5,
    pass: false,
    problems: [
      { area: 'top band', issue: 'headline crowds the photo', fix: 'give the headline row more room' },
      { area: '', issue: 'two photos the same size', fix: '' },
    ],
  };
  const hint = verdictHint(v);
  assert.match(hint, /scored it 5\/10 — not good enough to print/);
  assert.match(hint, /- \[top band\] headline crowds the photo → fix: give the headline row more room/);
  assert.match(hint, /- two photos the same size\n/);
  assert.ok(hint.indexOf('top band') < hint.indexOf('two photos'));
  assert.match(verdictHint({ score: 4, pass: false, problems: [] }), /strengthen the hierarchy/);
});

test('combineHints joins non-empty parts and caps the length at a word boundary', () => {
  assert.equal(combineHints(['a', '', null, undefined, '  b  ']), 'a\n\nb');
  const long = combineHints(['word '.repeat(100)], 50);
  assert.ok(long.length <= 50);
  assert.ok(long.endsWith('…'));
});

test('attemptPasses: measured flaws always fail; otherwise the critic decides when it spoke', () => {
  const pass: CriticVerdict = { score: 8, pass: true, problems: [] };
  const fail: CriticVerdict = { score: 5, pass: false, problems: [] };
  assert.equal(attemptPasses({ flaws: 0, verdict: pass }), true);
  assert.equal(attemptPasses({ flaws: 0, verdict: fail }), false);
  assert.equal(attemptPasses({ flaws: 2, verdict: pass }), false);
  // No verdict (no Chromium / call failed): judged on the measurements alone.
  assert.equal(attemptPasses({ flaws: 0, verdict: null }), true);
  assert.equal(attemptPasses({ flaws: 1, verdict: null }), false);
});

type A = RankedAttempt & { name: string };
const a = (name: string, attempt: number, legal: boolean, flaws: number, score?: number): A => ({ name, attempt, legal, flaws, ...(score !== undefined ? { score } : {}) });

test('betterAttempt: the first attempt seen is kept when there is nothing to compare', () => {
  assert.equal(betterAttempt<A>(null, a('one', 1, true, 2)).name, 'one');
});

test('betterAttempt: LEGAL beats everything', () => {
  assert.equal(betterAttempt(a('illegal-but-scored', 1, false, 0, 10), a('legal', 2, true, 5, 3)).name, 'legal');
});

test('betterAttempt: then the critic score, when BOTH were scored', () => {
  assert.equal(betterAttempt(a('first', 1, true, 0, 5), a('second', 2, true, 3, 8)).name, 'second');
  assert.equal(betterAttempt(a('first', 1, true, 3, 8), a('second', 2, true, 0, 6)).name, 'first');
});

test('betterAttempt: a missing score is not a zero — measured flaws decide', () => {
  assert.equal(betterAttempt(a('scored', 1, true, 2, 9), a('unscored', 2, true, 1)).name, 'unscored');
  assert.equal(betterAttempt(a('scored', 1, true, 0, 4), a('unscored', 2, true, 1)).name, 'scored');
});

test('betterAttempt: then fewer flaws; a full tie keeps the earlier attempt', () => {
  assert.equal(betterAttempt(a('first', 1, true, 2, 6), a('second', 2, true, 1, 6)).name, 'second');
  assert.equal(betterAttempt(a('first', 1, true, 1, 6), a('second', 2, true, 1, 6)).name, 'first');
});
