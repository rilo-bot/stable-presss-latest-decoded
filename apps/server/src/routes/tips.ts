// ---------------------------------------------------------------------------
// Tips — the play-money wagers behind the public leaderboard.
//
// THE SERVER OWNS THE WHOLE TRANSACTION. This route used to be plain CRUD that
// spread `{ ...body }` into Mongo, and the browser did the bookkeeping around it:
// it posted a tip, then PUT its own debited `coinBalance` to
// /api/tipperProfiles. Four things followed from that, and the last one is the
// reason this file is no longer CRUD.
//
//  1. `userId` came from the body and was never compared to the caller, so a
//     signed-in member could place tips in anyone else's name.
//  2. `odds` came from the body — and /api/tipping/resolve pays
//     `wager * tip.odds`. A tip posted with `odds: 10000` collected 10000x on
//     resolution. Odds now come from the ENTRANT ON THE RACE; the body's are
//     ignored.
//  3. `payout` and `result` came from the body, so a tip could arrive
//     pre-settled as won.
//  4. The debit was a SECOND request the client made to itself. Skip it and the
//     tip stands with no coins taken. The balance is debited here, in the same
//     handler that writes the tip, conditional on the balance the check was made
//     against — so two concurrent tips cannot both spend the same coins.
//
// Everything a client may state is read explicitly below. Nothing else survives.
//
// Gating (see index.ts): `authedWriteGate` — GET is public, writes need an
// account. GET is scoped to the caller; the leaderboard reads
// /api/tipperProfiles, not this route.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../lib/db.js';
import { canAccessNewsroom } from '../lib/rbac.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

type Entrant = { horseId: string; horseName?: string; odds: number };

const router = Router();

/**
 * List tips.
 *
 * SCOPED TO THE CALLER. This returned the entire collection to anyone — every
 * `userId`, wager, selection and result on the platform, unauthenticated, and the
 * landing page fetched it anonymously on mount while displaying none of it. A
 * tipping record is the member's own; staff see everything for moderation.
 */
router.get('/', async (req, res) => {
  if (canAccessNewsroom(req.account)) {
    const all = await db.collection('tips').find();
    res.json(all.map(project));
    return;
  }
  if (!req.account) {
    // Not signed in: nothing of yours to return. Not a 401 — an anonymous
    // visitor legitimately has an empty tipping record.
    res.json([]);
    return;
  }
  const mine = await db.collection('tips').find({ userId: req.account.id });
  res.json(mine.map(project));
});

/**
 * Place a tip.
 *
 * The caller states only WHICH race and WHICH horse, and how much. Everything
 * that decides the money — whose tip it is, the odds, the resulting payout — is
 * read from the account and the race.
 */
router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Whose tip it is comes from the token, never the body.
  const userId = req.account?.id;
  if (!userId) {
    res.status(401).json({ error: 'Sign in to place a tip.' });
    return;
  }

  const raceId = typeof body.raceId === 'string' ? body.raceId : '';
  const horseId = typeof body.horseId === 'string' ? body.horseId : '';
  const wager = Math.floor(Number(body.wager));

  if (!raceId || !horseId) {
    res.status(400).json({ error: 'raceId and horseId are required.' });
    return;
  }
  // Mirrors the browser's own bounds so the two agree on what a legal wager is.
  if (!Number.isFinite(wager) || wager < 1) {
    res.status(400).json({ error: 'Minimum wager is 1 coin.' });
    return;
  }
  if (wager > 9999) {
    res.status(400).json({ error: 'Maximum wager is 9,999 coins.' });
    return;
  }

  const race = await db.collection('races').findById(raceId);
  if (!race) {
    res.status(404).json({ error: 'Race not found.' });
    return;
  }
  if (race.status !== 'open') {
    res.status(409).json({ error: 'This race is not open for tipping.' });
    return;
  }

  // Odds come from the race, so they cannot be stated by the caller. See note 2.
  const entrant = ((race.entrants as Entrant[] | undefined) ?? []).find((e) => e.horseId === horseId);
  if (!entrant) {
    res.status(400).json({ error: 'That horse is not in this race.' });
    return;
  }
  const odds = Number(entrant.odds);
  if (!Number.isFinite(odds) || odds <= 0) {
    res.status(409).json({ error: 'This runner has no odds set.' });
    return;
  }

  // One tip per race per tipper — enforced here, not only in the browser.
  const existing = await db.collection('tips').find({ raceId, userId });
  if (existing[0]) {
    res.status(409).json({ error: 'You have already placed a tip on this race.' });
    return;
  }

  const profiles = await db.collection('tipperProfiles').find({ userId });
  const profile = profiles[0];
  if (!profile) {
    res.status(409).json({ error: 'No tipper profile yet — reload the tipping ring.' });
    return;
  }
  const balance = Number(profile.coinBalance ?? 0);
  if (balance < wager) {
    res.status(409).json({ error: 'Insufficient coins in your balance.' });
    return;
  }

  // Debit FIRST, conditional on the balance we just checked. If a concurrent
  // request moved it, this write matches nothing and we stop before a tip exists
  // — the alternative ordering leaves a tip that was never paid for.
  const debited = await db.collection('tipperProfiles').updateOneIf(
    String(profile._id),
    { coinBalance: balance },
    {
      coinBalance: balance - wager,
      totalWagered: Number(profile.totalWagered ?? 0) + wager,
      tipsPlaced: Number(profile.tipsPlaced ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    },
  );
  if (!debited) {
    res.status(409).json({ error: 'Your balance changed — try again.' });
    return;
  }

  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    userId,
    raceId,
    horseId,
    horseName: typeof entrant.horseName === 'string' ? entrant.horseName : '',
    wager,
    odds,
    // A tip is always born unsettled. /api/tipping/resolve writes both.
    payout: null,
    result: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  const id = await db.collection('tips').insertOne(doc);
  const created = await db.collection('tips').findById(id);
  if (!created) {
    // The coins are already gone, so put them back rather than leaving the
    // tipper short for a tip that does not exist.
    await db.collection('tipperProfiles').updateOne(String(profile._id), {
      coinBalance: balance,
      totalWagered: Number(profile.totalWagered ?? 0),
      tipsPlaced: Number(profile.tipsPlaced ?? 0),
      updatedAt: new Date().toISOString(),
    });
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

/**
 * Amend a tip — STAFF ONLY.
 *
 * There is no member-facing edit: a placed tip is a placed tip, and settlement
 * is the resolver's job. This was open to any signed-in account and accepted
 * `{ ...body }`, so a member could rewrite their own `payout`, `result`, `odds`
 * or `wager` after the fact.
 */
router.put('/:id', async (req, res) => {
  if (!canAccessNewsroom(req.account)) {
    res.status(403).json({ error: 'Placed tips cannot be amended.' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const found = await db.collection('tips').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  // Even for staff, a whitelist: correcting a settlement is the only reason to
  // touch a placed tip, so identity and stake are not editable here.
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.result === 'pending' || body.result === 'won' || body.result === 'lost') {
    update.result = body.result;
  }
  if (body.payout === null || Number.isFinite(Number(body.payout))) {
    update.payout = body.payout === null ? null : Math.floor(Number(body.payout));
  }

  await db.collection('tips').updateOne(req.params.id, update);
  const updated = await db.collection('tips').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

export default router;
