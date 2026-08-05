// ---------------------------------------------------------------------------
// Tipper profiles — the identities and balances behind the public leaderboard.
//
// NO CLIENT EVER WRITES A BALANCE. There are exactly three places coins move,
// all of them server-side:
//
//   grant   here, on create — STARTING_BALANCE, set by the server
//   debit   routes/tips.ts, in the same handler that writes the tip
//   credit  routes/tipping.ts, on race resolution
//
// This is a change of ownership, not a tightening. Both writes used to spread
// `{ ...req.body }`, with the PUT deleting `totalWon` and nothing else — so
// `coinBalance` was writable by the profile's owner. That is the field the
// landing-page leaderboard sorts by (`sort((a,b) => b.coinBalance - a.coinBalance)`),
// so one PUT of `{ coinBalance: 999999 }` against your own profile put you at the
// top of the front page. The POST had the same hole a step earlier: the browser
// sends `coinBalance: 500`, but nothing made a hand-written request agree.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../../lib/db.js';
import { canAccessNewsroom } from '../../lib/rbac.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

/**
 * Coins a new tipper starts with.
 *
 * The browser has its own `STARTING_BALANCE = 500` in stores/tippingStore.ts for
 * its optimistic first render. THIS is the one that reaches the database; the
 * client's value is no longer read. Keep the two numbers in step.
 */
const STARTING_BALANCE = 500;

const router = Router();

// list — powers the public leaderboard, so display name and totals are public by
// design. Nothing here identifies an account beyond the name it chose.
router.get('/', async (_req, res) => {
  const items = await db.collection('tipperProfiles').find();
  res.json(items.map(project));
});

// create — one per user, with the server's starting grant
router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }
  // A member may only create their own tipper profile (staff may seed any).
  if (!canAccessNewsroom(req.account) && userId !== req.account?.id) {
    res.status(403).json({ error: 'You can only create your own tipper profile.' });
    return;
  }
  // One profile per user — return the existing one if already present.
  const existing = await db.collection('tipperProfiles').find({ userId });
  if (existing[0]) {
    res.status(200).json(project(existing[0]));
    return;
  }

  const now = new Date().toISOString();
  // Whitelisted. `displayName` is the only thing the caller decides; every
  // number is the server's opening position.
  const doc: Record<string, unknown> = {
    userId,
    displayName: typeof body.displayName === 'string' ? body.displayName.trim() : '',
    coinBalance: STARTING_BALANCE,
    totalWon: 0,
    totalWagered: 0,
    tipsPlaced: 0,
    createdAt: now,
    updatedAt: now,
  };
  const id = await db.collection('tipperProfiles').insertOne(doc);
  const createdDoc = await db.collection('tipperProfiles').findById(id);
  if (!createdDoc) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(createdDoc));
});

/**
 * Update a profile — the display name, and that is all.
 *
 * Every balance field is refused here for everyone, including staff: the three
 * places coins move are listed at the top of this file, and adding a fourth
 * behind an admin flag is how the leaderboard stops being explainable. A staff
 * correction belongs in a script that says what it is doing.
 */
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const found = await db.collection('tipperProfiles').findById(id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  // Owner-only, or staff (who may fix an inappropriate display name).
  if (!canAccessNewsroom(req.account) && String(found.userId) !== req.account?.id) {
    res.status(403).json({ error: 'You can only update your own tipper profile.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.displayName === 'string' && body.displayName.trim()) {
    update.displayName = body.displayName.trim();
  }

  await db.collection('tipperProfiles').updateOne(id, update);
  const updated = await db.collection('tipperProfiles').findById(id);
  res.json(project(updated!));
});

export default router;
