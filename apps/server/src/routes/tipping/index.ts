import { Router } from 'express';
import { db } from '../../lib/db.js';
import { project, type WithMongoId } from '../../lib/project.js';


const router = Router();

type Entrant = { horseId: string; odds: number };

/**
 * Resolve a race server-side. The winner is chosen authoritatively (weighted by
 * implied probability), tips are settled, and winning tippers' balances are
 * credited HERE — clients never write balances directly, which is why
 * /api/tipperProfiles writes are owner-only. Any signed-in user may trigger a
 * resolution (the play-money "Run Race"), but cannot influence the payout maths.
 */
router.post('/resolve', async (req, res) => {
  const raceId = String((req.body as { raceId?: string })?.raceId ?? '');
  if (!raceId) {
    res.status(400).json({ error: 'raceId is required' });
    return;
  }

  const race = await db.collection('races').findById(raceId);
  if (!race) {
    res.status(404).json({ error: 'Race not found' });
    return;
  }
  if (race.status === 'resolved') {
    res.json({ race: project(race), alreadyResolved: true });
    return;
  }

  const entrants = (race.entrants as Entrant[] | undefined) ?? [];
  if (entrants.length === 0) {
    res.status(400).json({ error: 'Race has no entrants' });
    return;
  }

  // Server-authoritative winner: weighted by implied probability (1 / odds).
  const weights = entrants.map((e) => (e.odds > 0 ? 1 / e.odds : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let r = Math.random() * total;
  let winner = entrants[entrants.length - 1];
  for (let i = 0; i < entrants.length; i++) {
    r -= weights[i];
    if (r <= 0) { winner = entrants[i]; break; }
  }
  const winnerHorseId = winner.horseId;
  const now = new Date().toISOString();

  await db.collection('races').updateOne(raceId, { status: 'resolved', winnerHorseId, updatedAt: now });

  // Settle every tip on the race and accumulate per-user credits.
  const tips = await db.collection('tips').find({ raceId });
  const credits: Record<string, number> = {};
  for (const tip of tips) {
    const won = tip.horseId === winnerHorseId;
    const payout = won ? Math.floor(Number(tip.wager) * Number(tip.odds)) : 0;
    await db.collection('tips').updateOne(tip._id, { result: won ? 'won' : 'lost', payout, updatedAt: now });
    if (won && payout > 0) {
      const uid = String(tip.userId);
      credits[uid] = (credits[uid] ?? 0) + payout;
    }
  }

  // Credit winning tippers' profiles — server-side only.
  for (const [userId, credit] of Object.entries(credits)) {
    const profiles = await db.collection('tipperProfiles').find({ userId });
    const prof = profiles[0];
    if (prof) {
      await db.collection('tipperProfiles').updateOne(prof._id, {
        coinBalance: Number(prof.coinBalance ?? 0) + credit,
        totalWon: Number(prof.totalWon ?? 0) + credit,
        updatedAt: now,
      });
    }
  }

  const updatedRace = await db.collection('races').findById(raceId);
  res.json({ race: updatedRace ? project(updatedRace) : null, winnerHorseId });
});

export default router;
