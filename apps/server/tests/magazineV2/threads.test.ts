// ---------------------------------------------------------------------------
// Chat threads — the access rules, and the title derivation.
//
// The access pair is the whole point of the feature: before threads existed,
// GET /issues/:id/chat returned every message in the magazine to anyone with
// access, including messages about pages a page-scoped collaborator cannot even
// open. These two functions are what replaced that, so they are worth pinning.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canReadThread, canWriteThread, titleFromMessage, cleanTitle, threadSummary, legacyThreadSummary, LEGACY_THREAD_ID } from '../../src/lib/magazineV2/threads.js';

const SAM = 'u_sam';
const PRIYA = 'u_priya';
const thread = (over: Record<string, unknown> = {}) => ({ _id: 't1', userId: SAM, title: 'Cover options', ...over });

// ── read ──────────────────────────────────────────────────────────────────────

test('you can read your own chat', () => {
  assert.equal(canReadThread(thread(), SAM, false), true);
});

test('the magazine owner can read a contributor’s chat', () => {
  // Deliberate: approving page 4, it helps to see what the contributor was trying
  // to do. The cost is disclosed in the panel, permanently.
  assert.equal(canReadThread(thread(), PRIYA, true), true);
});

test('another contributor cannot read it — this is the leak that started this', () => {
  assert.equal(canReadThread(thread(), PRIYA, false), false);
});

test('a missing thread is never readable', () => {
  assert.equal(canReadThread(null, SAM, true), false);
  assert.equal(canReadThread(undefined, SAM, true), false);
});

// ── write ─────────────────────────────────────────────────────────────────────

test('only the creator can write, rename or delete', () => {
  assert.equal(canWriteThread(thread(), SAM), true);
  assert.equal(canWriteThread(thread(), PRIYA), false);
});

test('READING IS NOT WRITING — the owner cannot speak into someone else’s chat', () => {
  // canWriteThread takes no owner flag ON PURPOSE, so no caller can widen this by
  // passing one. The assistant is 1:1: a second voice would appear in the creator's
  // next prompt as if they had said it themselves.
  assert.equal(canWriteThread(thread(), PRIYA), false);
  assert.equal(canWriteThread.length, 2, 'a third parameter would be an owner escape hatch');
});

// ── titles ────────────────────────────────────────────────────────────────────

test('a title comes from the first message, cut on a word boundary', () => {
  assert.equal(titleFromMessage('Make the headline bigger'), 'Make the headline bigger');
  const long = titleFromMessage('Please rewrite the cover headline so it feels less corporate and more like a real magazine');
  assert.ok(long.length <= 62, `got ${long.length}`);
  assert.ok(long.endsWith('…'));
  assert.ok(!long.includes('  '));
  // The cut must not land mid-word.
  assert.ok(!/\S…$/.test(long) || long.slice(0, -1).endsWith(long.slice(0, -1).split(' ').pop()!));
});

test('an empty or whitespace-only message still gets a usable title', () => {
  assert.equal(titleFromMessage(''), 'New chat');
  assert.equal(titleFromMessage('   \n  '), 'New chat');
  assert.equal(titleFromMessage(undefined as unknown as string), 'New chat');
});

test('a user-supplied title is trimmed, collapsed and clamped', () => {
  assert.equal(cleanTitle('  Cover   ideas  '), 'Cover ideas');
  assert.equal(cleanTitle(123), '', 'a non-string is no title at all');
  assert.equal(cleanTitle('x'.repeat(400)).length, 120);
});

// ── the wire shape ────────────────────────────────────────────────────────────

test('a summary marks other people’s chats read-only, so the composer can lock itself', () => {
  const own = threadSummary(thread(), SAM);
  assert.equal(own.mine, true);
  assert.equal(own.readOnly, false);
  const theirs = threadSummary(thread(), PRIYA);
  assert.equal(theirs.mine, false);
  assert.equal(theirs.readOnly, true);
});

test('a thread with no title still lists as something', () => {
  assert.equal(threadSummary(thread({ title: '' }), SAM).title, 'New chat');
});

test('the legacy log is read-only and belongs to nobody', () => {
  // Pre-threads messages carry no userId — the information was never recorded, so
  // they cannot be attributed and guessing would be worse than admitting it.
  const legacy = legacyThreadSummary(42, '2026-08-01T10:00:00.000Z');
  assert.equal(legacy.id, LEGACY_THREAD_ID);
  assert.equal(legacy.readOnly, true);
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.mine, false);
  assert.equal(legacy.userId, '');
  assert.equal(legacy.messageCount, 42);
});
