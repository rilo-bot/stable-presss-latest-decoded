// ---------------------------------------------------------------------------
// S3 — the submission/approval transitions.
//
// Three things here are easy to get wrong and impossible to notice at runtime:
//
//   1. `reviewIs` is a MONGO FILTER, and in Mongo a missing field is not an equal
//      field. Get it wrong and every page that predates this feature fails its
//      compare-and-set with a phantom "someone else changed it" conflict.
//   2. `reviewTransitionError` decides who may do what. Its two non-obvious
//      allowances (re-approve a stale approval, request-changes as REOPEN) are
//      load-bearing: without the second, the "ask the owner to reopen it" message
//      that every blocked edit shows points at a door that doesn't exist.
//   3. Page NAMING is shared by three emails that must phrase a set identically.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reviewIs, reviewTransitionError } from '../../src/lib/magazineV2/review.js';
import { assigneesOfPage } from '../../src/lib/magazineV2/access.js';
import { pageNumbersLabel } from '../../src/lib/pageLabels.js';

// ── reviewIs: the CAS filter ─────────────────────────────────────────────────

test('reviewIs("in_progress") matches a page with NO review field', () => {
  // The bug this prevents: { review: 'in_progress' } excludes legacy pages, so a
  // collaborator's first submit on any pre-existing page would 409 forever.
  const filter = reviewIs('in_progress') as { review: { $nin: string[] } };
  assert.ok(filter.review?.$nin, 'in_progress must be expressed as $nin, not equality');
  assert.deepEqual(filter.review.$nin, ['submitted', 'approved']);
});

test('reviewIs mirrors reviewOf: only the two explicit states use equality', () => {
  assert.deepEqual(reviewIs('submitted'), { review: 'submitted' });
  assert.deepEqual(reviewIs('approved'), { review: 'approved' });
});

// ── submit ───────────────────────────────────────────────────────────────────

test('submit is allowed from in_progress, including a legacy page', () => {
  assert.equal(reviewTransitionError('submit', { review: 'in_progress' }), null);
  assert.equal(reviewTransitionError('submit', {}), null, 'a page predating the feature is submittable');
  assert.equal(reviewTransitionError('submit', { review: 'junk' }), null);
});

test('submit is refused once submitted or approved', () => {
  assert.match(String(reviewTransitionError('submit', { review: 'submitted' })), /already submitted/);
  assert.match(String(reviewTransitionError('submit', { review: 'approved' })), /already approved/);
});

// ── approve ──────────────────────────────────────────────────────────────────

test('approve is allowed from submitted', () => {
  assert.equal(reviewTransitionError('approve', { review: 'submitted' }), null);
});

test('approve is refused on a page nobody submitted', () => {
  assert.match(String(reviewTransitionError('approve', {})), /not submitted/);
  assert.match(String(reviewTransitionError('approve', { review: 'in_progress' })), /not submitted/);
});

test('a STALE approval can be re-approved, a fresh one cannot', () => {
  // Approved at rev 5 then edited to rev 7: the approval is untrustworthy, so the
  // owner must be able to refresh it or the page is stuck un-publishable forever.
  const stale = { review: 'approved', approvedAtRev: 5, rev: 7 };
  assert.equal(reviewTransitionError('approve', stale), null);
  const fresh = { review: 'approved', approvedAtRev: 7, rev: 7 };
  assert.match(String(reviewTransitionError('approve', fresh)), /no changes since/);
  // Approved with no recorded rev is never trusted, so it is always re-approvable.
  assert.equal(reviewTransitionError('approve', { review: 'approved', rev: 3 }), null);
});

// ── request-changes, which doubles as REOPEN ─────────────────────────────────

test('request-changes reopens an APPROVED page, not just a submitted one', () => {
  // loadEditablePage refuses edits with "ask the owner to reopen it" for BOTH
  // states. If this rejected 'approved', that message would be a lie.
  assert.equal(reviewTransitionError('request-changes', { review: 'submitted' }), null);
  assert.equal(reviewTransitionError('request-changes', { review: 'approved' }), null);
});

test('request-changes is refused when nothing was sent for review', () => {
  assert.match(String(reviewTransitionError('request-changes', {})), /nothing to send back/);
  assert.match(String(reviewTransitionError('request-changes', { review: 'in_progress' })), /nothing to send back/);
});

// ── who to notify ────────────────────────────────────────────────────────────

const collab = (over: Record<string, unknown>) => ({
  userId: 'u1',
  email: 'a@x.com',
  displayName: 'A',
  role: 'contributor',
  pageIds: ['p1'],
  ...over,
});

test('assigneesOfPage matches page-scoped and all-scoped collaborators', () => {
  const issue = {
    _id: 'm1',
    ownerId: 'owner',
    collaborators: [
      collab({ userId: 'sam', pageIds: ['p1', 'p2'] }),
      collab({ userId: 'jo', pageIds: ['p9'] }),
      collab({ userId: 'ali', pageIds: 'all' }),
    ],
  };
  assert.deepEqual(assigneesOfPage(issue, 'p1').map((c) => c.userId), ['sam', 'ali']);
  assert.deepEqual(assigneesOfPage(issue, 'p9').map((c) => c.userId), ['jo', 'ali']);
  // An unassigned page still concerns the 'all'-scoped collaborator, and nobody else.
  assert.deepEqual(assigneesOfPage(issue, 'p42').map((c) => c.userId), ['ali']);
});

test('assigneesOfPage survives a magazine with no collaborators or a junk field', () => {
  assert.deepEqual(assigneesOfPage({ _id: 'm', ownerId: 'o' }, 'p1'), []);
  assert.deepEqual(assigneesOfPage({ _id: 'm', ownerId: 'o', collaborators: 'nope' }, 'p1'), []);
  assert.deepEqual(assigneesOfPage({ _id: 'm', ownerId: 'o', collaborators: [collab({ pageIds: null })] }, 'p1'), []);
});

// ── naming pages to a human ──────────────────────────────────────────────────

test('pageNumbersLabel names pages the way the UI numbers them', () => {
  assert.equal(pageNumbersLabel([4]), 'page 4');
  assert.equal(pageNumbersLabel([4, 5]), 'pages 4 and 5');
  assert.equal(pageNumbersLabel([4, 5, 9]), 'pages 4, 5 and 9');
});

test('pageNumbersLabel sorts, de-duplicates and refuses to invent a label', () => {
  assert.equal(pageNumbersLabel([9, 4, 5]), 'pages 4, 5 and 9');
  // A repeated id resolved through the number map would otherwise read "4, 4 and 5".
  assert.equal(pageNumbersLabel([4, 4, 5]), 'pages 4 and 5');
  // Empty returns '' so the caller decides what no-pages means, rather than being
  // handed the dangling "pages ".
  assert.equal(pageNumbersLabel([]), '');
  assert.equal(pageNumbersLabel([NaN, 3]), 'page 3');
});
