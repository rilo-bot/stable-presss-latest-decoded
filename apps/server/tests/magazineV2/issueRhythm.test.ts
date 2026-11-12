// ---------------------------------------------------------------------------
// issueRhythm — the deterministic running-order pass after planning.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrangeIssueRhythm } from '../../src/lib/magazineV2/issueRhythm.js';
import { getPageType } from '../../src/lib/magazineV2/pageTypes.js';
import type { PageTemplateKind } from '../../src/lib/magazineV2/templates.js';

type P = { kind: PageTemplateKind; pageType: string; intent: string };
const page = (pageType: string, intent = pageType): P => ({ kind: getPageType(pageType)!.baseKind, pageType, intent });
const types = (ps: { pageType?: string }[]) => ps.map((p) => p.pageType);
const ARTICLES = new Set(['feature-article', 'long-read', 'sidebar-feature', 'profile', 'interview-qa']);

test('cover first, back cover last, contents straight after the cover', () => {
  const out = arrangeIssueRhythm([
    page('back-cover'),
    page('feature-article', 'a'),
    page('cover'),
    page('stat-infographic'),
    page('pull-quote'),
    page('photo-grid'),
    page('contents'),
  ]);
  assert.equal(out[0]!.pageType, 'cover');
  assert.equal(out[1]!.pageType, 'contents');
  assert.equal(out.at(-1)!.pageType, 'back-cover');
  assert.equal(out.length, 7, 'no page is lost or added');
});

test('the same page type never sits twice in a row when the issue has another page to put between', () => {
  const out = arrangeIssueRhythm([
    page('cover'),
    page('interview-qa', 'i1'),
    page('interview-qa', 'i2'),
    page('photo-essay'),
    page('stat-infographic'),
    page('back-cover'),
  ]);
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i]!.pageType, out[i - 1]!.pageType, `pages ${i} and ${i + 1}: ${types(out)}`);
});

test('an opener and its article travel together', () => {
  const input = [
    page('cover'),
    page('feature-opener', 'A'),
    page('feature-article', 'A body'),
    page('feature-opener', 'B'),
    page('long-read', 'B body'),
    page('pull-quote'),
    page('back-cover'),
  ];
  const out = arrangeIssueRhythm(input);
  const a = out.findIndex((p) => p.intent === 'A');
  const b = out.findIndex((p) => p.intent === 'B');
  assert.equal(out[a + 1]!.intent, 'A body');
  assert.equal(out[b + 1]!.intent, 'B body');
});

test('two openers back to back get an article between them when the issue has one to spare', () => {
  const out = arrangeIssueRhythm([
    page('cover'),
    page('feature-opener', 'A'),
    page('feature-opener', 'B'),
    page('feature-article', 'B body'),
    page('pull-quote'),
    page('profile', 'spare article'),
    page('back-cover'),
  ]);
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i]!.pageType === 'feature-opener') {
      assert.ok(ARTICLES.has(out[i + 1]!.pageType), `opener at ${i + 1} is followed by ${out[i + 1]!.pageType}: ${types(out)}`);
    }
  }
});

test('when nothing can separate two openers, the first becomes a photo essay (same structural kind)', () => {
  const out = arrangeIssueRhythm([page('cover'), page('feature-opener', 'A'), page('feature-opener', 'B'), page('back-cover')]);
  assert.deepEqual(types(out), ['cover', 'photo-essay', 'feature-opener', 'back-cover']);
  assert.equal(out[1]!.kind, 'feature-full-bleed');
  assert.equal(out[1]!.intent, 'A', 'the intent is kept');
});

test('dense and airy pages alternate where they can', () => {
  const denseRuns = (ps: { pageType?: string }[]) => {
    let n = 0;
    for (let i = 1; i < ps.length; i++) {
      if (getPageType(ps[i]!.pageType)!.density === 'dense' && getPageType(ps[i - 1]!.pageType)!.density === 'dense') n++;
    }
    return n;
  };
  const input = [
    page('cover'),
    page('long-read'),
    page('feature-article'),
    page('interview-qa'),
    page('pull-quote'),
    page('photo-essay'),
    page('mosaic-gallery'),
    page('back-cover'),
  ];
  assert.equal(denseRuns(input), 2);
  assert.equal(denseRuns(arrangeIssueRhythm(input)), 0);
});

test('a plan that already has rhythm is left exactly as the planner wrote it', () => {
  const input = [
    page('cover'),
    page('contents'),
    page('feature-opener'),
    page('feature-article'),
    page('pull-quote'),
    page('stat-infographic'),
    page('interview-qa'),
    page('photo-grid'),
    page('back-cover'),
  ];
  const out = arrangeIssueRhythm(input);
  assert.deepEqual(out, input);
  out.forEach((p, i) => assert.equal(p, input[i], 'same objects, same order'));
});

test('a second cover or contents becomes the interior type that does the same job', () => {
  const out = arrangeIssueRhythm([page('cover', 'c1'), page('feature-article'), page('cover', 'c2'), page('contents', 't1'), page('contents', 't2')]);
  assert.equal(out.filter((p) => p.pageType === 'cover').length, 1);
  assert.equal(out.filter((p) => p.pageType === 'contents').length, 1);
  assert.equal(out.find((p) => p.intent === 'c2')!.pageType, 'feature-opener');
  assert.equal(out.find((p) => p.intent === 't2')!.pageType, 'news-briefs');
  assert.equal(out[0]!.intent, 'c1');
});

test('pages without a stored type (older plans) still arrange by their kind', () => {
  const out = arrangeIssueRhythm<{ kind: PageTemplateKind; pageType?: string }>([
    { kind: 'two-column-article' },
    { kind: 'cover' },
    { kind: 'back-cover' },
    { kind: 'pull-quote' },
  ]);
  assert.equal(out[0]!.kind, 'cover');
  assert.equal(out.at(-1)!.kind, 'back-cover');
});

test('empty and single-page plans pass through', () => {
  assert.deepEqual(arrangeIssueRhythm([]), []);
  const one = [page('feature-article')];
  assert.deepEqual(arrangeIssueRhythm(one), one);
});
