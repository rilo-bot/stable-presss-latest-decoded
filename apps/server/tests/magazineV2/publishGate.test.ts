// ---------------------------------------------------------------------------
// S4 — the publish approval gate, and the solo-owner rule underneath it.
//
// This is the last check between unreviewed work and the public newsstand, and it
// has to fail in BOTH directions to be any good:
//
//   • too loose → a collaborator's unapproved page goes public;
//   • too strict → a solo owner must approve their own eight pages before they can
//     publish anything, which is the ceremony that makes people abandon a workflow
//     feature entirely.
//
// So the matrix below is deliberately as interested in what publishes FREELY as in
// what gets blocked.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { publishApprovalBlock } from '../../src/lib/magazineV2/publishGate.js';
import { isInReviewScope } from '../../src/lib/magazineV2/access.js';

const SAM = 'u_sam';

const solo = { _id: 'm1', ownerId: 'u_owner', collaborators: [] };
const shared = (pageIds: string[] | 'all') => ({
  _id: 'm1',
  ownerId: 'u_owner',
  collaborators: [{ userId: SAM, email: 's@x.com', displayName: 'Sam', role: 'contributor', pageIds }],
});

/** Pages p1..pN; number = position + 1, matching the editor's page rail. */
const pages = (...over: Record<string, unknown>[]) => over.map((o, i) => ({ _id: `p${i + 1}`, rev: 1, ...o }));
const numberOf = (id: string) => Number(String(id).replace('p', '')) || 0;

const approved = (rev = 1) => ({ review: 'approved', approvedAtRev: rev, rev });
const staleApproval = { review: 'approved', approvedAtRev: 1, rev: 4 };

// ── The solo-owner rule ──────────────────────────────────────────────────────

test('a magazine with no collaborators has NOTHING in review scope', () => {
  assert.equal(isInReviewScope(solo, 'p1'), false);
  assert.equal(isInReviewScope(solo, 'p9'), false);
});

test('a solo owner publishes freely with nothing approved', () => {
  // The whole point: review must not bind where nobody else is involved, or the
  // common case (one person, eight pages) becomes eight pointless approvals.
  const block = publishApprovalBlock(solo, pages({}, {}, {}), numberOf);
  assert.equal(block, null);
});

test('review scope follows the assignment, including all-scoped', () => {
  assert.equal(isInReviewScope(shared(['p2']), 'p2'), true);
  assert.equal(isInReviewScope(shared(['p2']), 'p1'), false);
  assert.equal(isInReviewScope(shared('all'), 'p7'), true);
});

// ── Blocking ─────────────────────────────────────────────────────────────────

test('an in-scope page that is not approved blocks the publish and is NAMED', () => {
  const block = publishApprovalBlock(shared(['p2']), pages({}, {}), numberOf);
  assert.ok(block, 'an unapproved collaborator page must not publish');
  assert.equal(block.reason, 'needs-approval');
  assert.deepEqual(block.pageNumbers, [2]);
  assert.match(block.error, /page 2 is not approved yet/);
});

test('a submitted-but-not-approved page still blocks — submitting is not approving', () => {
  const block = publishApprovalBlock(shared(['p1']), pages({ review: 'submitted' }), numberOf);
  assert.ok(block);
  assert.deepEqual(block.pageNumbers, [1]);
});

test('a STALE approval blocks, with its own wording', () => {
  // Approved at rev 1, now at rev 4: someone edited it after sign-off. Publishing it
  // as "approved" would put content live that nobody approved in its current form.
  const block = publishApprovalBlock(shared(['p1']), pages(staleApproval), numberOf);
  assert.ok(block);
  assert.match(block.error, /approved and then edited/);
  assert.match(block.error, /it needs approving again/);
});

test('waiting and stale pages are reported together, numbers ascending', () => {
  const issue = shared('all');
  const block = publishApprovalBlock(issue, pages(approved(1), staleApproval, {}), numberOf);
  assert.ok(block);
  assert.match(block.error, /page 3 is not approved yet/);
  assert.match(block.error, /page 2 was approved and then edited/);
  assert.deepEqual(block.pageNumbers, [2, 3]);
});

// ── Passing ──────────────────────────────────────────────────────────────────

test('approved-and-fresh in-scope pages publish', () => {
  assert.equal(publishApprovalBlock(shared('all'), pages(approved(3), approved(1)), numberOf), null);
});

test("an unapproved OUT-of-scope page does not block its neighbours", () => {
  // p1 is Sam's and approved; p2 is the owner's own and untouched. Only p1 is reviewed.
  const block = publishApprovalBlock(shared(['p1']), pages(approved(1), {}), numberOf);
  assert.equal(block, null);
});

test('an unapproved page left OUT of the edition does not block it', () => {
  // `included` is the selected subset — the gate only judges what is actually going
  // out, which is what makes "leave it out of this edition" a real option.
  const issue = shared('all');
  const all = pages(approved(1), {});
  assert.equal(publishApprovalBlock(issue, [all[0]!], numberOf), null);
  assert.ok(publishApprovalBlock(issue, all, numberOf), 'including it must still block');
});

test('un-sharing a magazine un-scopes its pages, so they publish again', () => {
  // Removing the collaborator removes the review obligation — otherwise a page would
  // be permanently unpublishable once the only person who could submit it was gone.
  const unapproved = pages({ review: 'submitted' });
  assert.ok(publishApprovalBlock(shared('all'), unapproved, numberOf));
  assert.equal(publishApprovalBlock(solo, unapproved, numberOf), null);
});
