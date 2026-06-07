import { Router } from 'express';
import { db } from '../lib/db.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

interface RacingEntry {
  horseId: string;
  raceId: string;
  jockeyId?: string;
  trainerId?: string;
  saddleNumber?: number | string;
  barrierNumber?: number;
  weight?: number;
  handicap?: number;
  status?: string;
  finishPosition?: number | null;
  finishTime?: string | null;
  odds?: number | null;
  notes?: string;
}

const router = Router();

// list
router.get('/', async (req, res) => {
  const items = await db.collection('racingEntries').find();
  res.json(items.map(project));
});

// create
router.post('/', async (req, res) => {
  const body = req.body as Partial<RacingEntry>;
  if (!body || !body.horseId) {
    res.status(400).json({ error: 'horseId is required' });
    return;
  }
  if (!body.raceId) {
    res.status(400).json({ error: 'raceId is required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    ...body,
    status: body.status ?? 'entered',
    createdAt: now,
    updatedAt: now,
  };
  delete (doc as { id?: unknown }).id;
  const id = await db.collection('racingEntries').insertOne(doc);
  const created = await db.collection('racingEntries').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

// update
router.put('/:id', async (req, res) => {
  const body = req.body as Partial<RacingEntry>;
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    ...body,
    updatedAt: now,
  };
  delete (updateData as { id?: unknown }).id;
  const found = await db.collection('racingEntries').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await db.collection('racingEntries').updateOne(req.params.id, updateData);
  const updated = await db.collection('racingEntries').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

// delete
router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('racingEntries').deleteOne(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
