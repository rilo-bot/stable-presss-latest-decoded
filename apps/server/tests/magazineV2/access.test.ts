// ---------------------------------------------------------------------------
// The review axis + the single editability decision point.
//
// pageEditBlock is the ONLY thing standing between a collaborator and a page they
// should not be touching — every element write, the AI agent and Fill/Adjust all
// reach it through loadEditablePage. So the matrix below is the contract:
// who × review state. A regression here is silent and expensive.
//
// Publishing is NOT part of that matrix any more. The immutable-edition model, where
// a published magazine was read-only until the owner opened a revision, was dropped:
// publishing locks nothing, and the divergence it creates is REPORTED (needsRepublish)
// rather than prevented. The tests below pin both halves of that.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  reviewOf,
  reviewRoundOf,
  approvedAtRevOf,
  isApprovalStale,
  isApprovedAndFresh,
  needsRepublish,
  pageEditedSincePublish,
} from '../../src/lib/magazineV2/review.js';
import { canViewPage, canEditPage, pageEditBlock, roleOnMagazine } from '../../src/lib/magazineV2/access.js';

const OWNER = 'u_owner';
const SAM = 'u_sam';
const STRANGER = 'u_stranger';

/** A magazine shared with Sam, scoped to page p1 only. */
const issue = (over: Record<string, unknown> = {}) => ({
  _id: 'm1',
  ownerId: OWNER,
  status: 'ready',
  collaborators: [{ userId: SAM, email: 's@x.com', displayName: 'Sam', pageIds: ['p1'] }],
  ...over,
});

const page = (over: Record<string, unknown> = {}) => ({ _id: 'p1', rev: 5, ...over });

// ── review accessors: absent fields must never lock a page ────────────────────

test('reviewOf defaults to in_progress for absent, unknown and junk values', () => {
  assert.equal(reviewOf(undefined), 'in_progress');
  assert.equal(reviewOf(null), 'in_progress');
  assert.equal(reviewOf({}), 'in_progress', 'a page predating the feature must read as editable');
  assert.equal(reviewOf({ review: 'nonsense' }), 'in_progress');
  assert.equal(reviewOf({ review: 42 }), 'in_progress');
  assert.equal(reviewOf({ review: 'submitted' }), 'submitted');
  assert.equal(reviewOf({ review: 'approved' }), 'approved');
});

test('reviewRoundOf and approvedAtRevOf tolerate absent and invalid values', () => {
  assert.equal(reviewRoundOf({}), 0);
  assert.equal(reviewRoundOf({ reviewRound: -3 }), 0);
  assert.equal(reviewRoundOf({ reviewRound: 2.7 }), 2);
  assert.equal(approvedAtRevOf({}), null);
  assert.equal(approvedAtRevOf({ approvedAtRev: 'x' }), null);
  assert.equal(approvedAtRevOf({ approvedAtRev: 0 }), 0, 'rev 0 is a real rev, not absent');
});

// ── the staleness rule — the thing that stops unreviewed content publishing ────

test('an approval goes stale as soon as the page changes', () => {
  assert.equal(isApprovalStale(page({ review: 'approved', approvedAtRev: 5, rev: 5 })), false);
  assert.equal(isApprovalStale(page({ review: 'approved', approvedAtRev: 5, rev: 6 })), true);
  assert.equal(isApprovedAndFresh(page({ review: 'approved', approvedAtRev: 5, rev: 5 })), true);
  assert.equal(isApprovedAndFresh(page({ review: 'approved', approvedAtRev: 5, rev: 6 })), false);
});

test('an approval with no recorded rev is NOT trusted', () => {
  // Fail closed: an approved page we cannot prove is unchanged must not publish.
  assert.equal(isApprovalStale(page({ review: 'approved' })), true);
  assert.equal(isApprovedAndFresh(page({ review: 'approved' })), false);
});

test('staleness is meaningless for a page that was never approved', () => {
  assert.equal(isApprovalStale(page({ review: 'in_progress', rev: 99 })), false);
  assert.equal(isApprovalStale(page({ review: 'submitted', rev: 99 })), false);
});

// ── published, then edited: reported, not prevented ───────────────────────────

test('a PUBLISHED magazine is still editable — publishing locks nothing', () => {
  // This is the reversal of the immutable-edition model. It used to return
  // 'draft-closed' for everyone including the owner.
  const i = issue({ status: 'published' });
  assert.equal(pageEditBlock(i, OWNER, 'p1', page()), null);
  assert.equal(pageEditBlock(i, SAM, 'p1', page({ review: 'in_progress' })), null);
});

test('needsRepublish only fires on a published magazine that has since changed', () => {
  const published = { status: 'published', publishedAt: '2026-08-11T10:00:00.000Z', updatedAt: '2026-08-11T10:00:00.000Z' };
  const untouched = [{ updatedAt: '2026-08-11T09:59:00.000Z' }];
  assert.equal(needsRepublish(published, untouched), false, 'just published = in sync');
  // A page edited after the snapshot.
  assert.equal(needsRepublish(published, [{ updatedAt: '2026-08-11T10:00:01.000Z' }]), true);
  // Structure or title: the magazine's own clock moves instead.
  assert.equal(needsRepublish({ ...published, updatedAt: '2026-08-11T10:05:00.000Z' }, untouched), true);
  // Never fires when there is nothing live to be behind.
  assert.equal(needsRepublish({ status: 'ready', publishedAt: '2026-08-11T10:00:00.000Z' }, [{ updatedAt: '2026-08-11T11:00:00.000Z' }]), false);
  assert.equal(needsRepublish({ status: 'published' }, [{ updatedAt: '2026-08-11T11:00:00.000Z' }]), false, 'no publishedAt = nothing to compare');
});

test('pageEditedSincePublish marks only the pages a republish would change', () => {
  const i = { status: 'published', publishedAt: '2026-08-11T10:00:00.000Z' };
  assert.equal(pageEditedSincePublish(i, { updatedAt: '2026-08-11T10:00:01.000Z' }), true);
  assert.equal(pageEditedSincePublish(i, { updatedAt: '2026-08-11T09:00:00.000Z' }), false);
  assert.equal(pageEditedSincePublish(i, {}), false, 'unknown is not "changed"');
});

// ── there are exactly TWO magazine roles ──────────────────────────────────────

test('a magazine role is owner or collaborator — never a stored badge', () => {
  // 'editor' used to be a third value, stamped from `magazine.publish` at share
  // time. It gated nothing (every check is `!== null` or isOwner) and only ever
  // rendered a shield in the share dialog. Publishing is gated by the permission
  // on the publish routes now, so membership is the whole fact here.
  assert.equal(roleOnMagazine(issue(), OWNER), 'owner');
  assert.equal(roleOnMagazine(issue(), SAM), 'collaborator');
  assert.equal(roleOnMagazine(issue(), STRANGER), null);
});

test('a legacy stored role is IGNORED, not trusted', () => {
  // Documents written before the removal still carry `role: 'editor'`. Reading it
  // back would resurrect the fiction — and worse, an 'editor' string would fail
  // `isOwner` while looking authoritative in a log.
  const legacy = issue({
    collaborators: [{ userId: SAM, email: 's@x.com', displayName: 'Sam', role: 'editor', pageIds: 'all' }],
  });
  assert.equal(roleOnMagazine(legacy, SAM), 'collaborator');
  assert.equal(canEditPage(legacy, SAM, 'p9', page({ _id: 'p9' })), true, 'still a normal collaborator');
});

// ── canViewPage vs canEditPage — the split that protects submitted work ───────

test('a collaborator can still READ a page they have submitted', () => {
  const i = issue();
  const p = page({ review: 'submitted' });
  assert.equal(canViewPage(i, SAM, 'p1'), true, 'reading your own submitted work must not 404');
  assert.equal(canEditPage(i, SAM, 'p1', p), false, 'but editing it is blocked');
});

test('assignment still gates viewing', () => {
  const i = issue();
  assert.equal(canViewPage(i, SAM, 'p2'), false, 'p2 was never shared with Sam');
  assert.equal(canViewPage(i, STRANGER, 'p1'), false);
  assert.equal(canViewPage(i, OWNER, 'p2'), true, 'the owner sees every page');
});

// ── the matrix ────────────────────────────────────────────────────────────────

test('an unassigned user is refused before any review state is revealed', () => {
  // Order matters: 'not-assigned' must win, so the response cannot leak whether the
  // page is submitted or approved.
  assert.equal(pageEditBlock(issue(), STRANGER, 'p1', page({ review: 'approved' })), 'not-assigned');
  assert.equal(pageEditBlock(issue(), SAM, 'p2', page({ review: 'approved' })), 'not-assigned');
});

test('review state blocks the collaborator but never the owner', () => {
  const i = issue();
  for (const review of ['submitted', 'approved'] as const) {
    assert.equal(pageEditBlock(i, SAM, 'p1', page({ review })), `page-${review}`);
    assert.equal(pageEditBlock(i, OWNER, 'p1', page({ review })), null, 'the approver cannot be locked out');
  }
  assert.equal(pageEditBlock(i, SAM, 'p1', page({ review: 'in_progress' })), null);
});

test('a page sent back for changes is editable again', () => {
  const i = issue();
  const p = page({ review: 'in_progress', reviewRound: 1, reviewNote: 'tighten the deck' });
  assert.equal(pageEditBlock(i, SAM, 'p1', p), null);
  assert.equal(reviewRoundOf(p), 1, 'the round survives so the board can show "needs changes"');
});

test('a missing page document does not accidentally block an assigned editor', () => {
  // loadEditablePage always has the page, but the signature allows omission — and
  // failing OPEN here is right: the review axis defaults to in_progress everywhere.
  assert.equal(pageEditBlock(issue(), SAM, 'p1'), null);
  assert.equal(pageEditBlock(issue(), SAM, 'p1', null), null);
});

test("an 'all'-scoped collaborator is gated by review like anyone else", () => {
  const i = issue({
    collaborators: [{ userId: SAM, email: 's@x.com', displayName: 'Sam', pageIds: 'all' }],
  });
  assert.equal(pageEditBlock(i, SAM, 'p7', page({ review: 'in_progress' })), null);
  assert.equal(pageEditBlock(i, SAM, 'p7', page({ review: 'submitted' })), 'page-submitted');
});
