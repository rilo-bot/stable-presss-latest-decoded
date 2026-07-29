import { Router } from 'express';
import { db } from '../lib/db.js';
import { canAccessNewsroom } from '../lib/rbac.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

// list — powers the public leaderboard
router.get('/', async (_req, res) => {
  const items = await db.collection('tipperProfiles').find();
  res.json(items.map(project));
});

// create
router.post('/', async (req, res) => {
  const body = req.body as Partial<{ userId: string; displayName: string }>;
  if (!body || !body.userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }
  // A member may only create their own tipper profile (staff may seed any).
  if (!canAccessNewsroom(req.account) && body.userId !== req.account?.id) {
    res.status(403).json({ error: 'You can only create your own tipper profile.' });
    return;
  }
  // One profile per user — return the existing one if already present.
  const existing = await db.collection('tipperProfiles').find({ userId: body.userId });
  if (existing[0]) {
    res.status(200).json(project(existing[0]));
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = { ...body, createdAt: now, updatedAt: now };
  delete (doc as { id?: unknown }).id;
  const id = await db.collection('tipperProfiles').insertOne(doc);
  const createdDoc = await db.collection('tipperProfiles').findById(id);
  if (!createdDoc) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(createdDoc));
});

// update — balance / totals after placing or resolving tips
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const found = await db.collection('tipperProfiles').findById(id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  // Owner-only: a member may update their own profile (e.g. debit on placing a
  // tip). Winnings are credited server-side by /api/tipping/resolve, never here,
  // so no one can inflate another tipper's balance.
  if (!canAccessNewsroom(req.account) && String(found.userId) !== req.account?.id) {
    res.status(403).json({ error: 'You can only update your own tipper profile.' });
    return;
  }
  // Balances are credited only by server-side race resolution; block client
  // attempts to set winnings fields directly on the self-service PUT path.
  const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date().toISOString() };
  if (!canAccessNewsroom(req.account)) {
    delete (updateData as { totalWon?: unknown }).totalWon;
  }
  delete (updateData as { id?: unknown }).id;
  await db.collection('tipperProfiles').updateOne(id, updateData);
  const updated = await db.collection('tipperProfiles').findById(id);
  res.json(project(updated!));
});

export default router;
