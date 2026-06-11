import { Router } from 'express';
import { db } from '../lib/db.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

router.get('/', async (req, res) => {
  const items = await db.collection('horsePartyLinks').find();
  res.json(items.map(project));
});

router.post('/', async (req, res) => {
  const body = req.body as {
    horse_id?: string;
    party_id?: string;
    relationship_type?: string;
    start_date?: string;
    end_date?: string | null;
    context?: string;
  };
  if (!body || !body.horse_id) {
    res.status(400).json({ error: 'horse_id is required' });
    return;
  }
  if (!body.party_id) {
    res.status(400).json({ error: 'party_id is required' });
    return;
  }
  if (!body.relationship_type) {
    res.status(400).json({ error: 'relationship_type is required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    ...body,
    createdAt: now,
    updatedAt: now,
  };
  delete (doc as { id?: unknown }).id;
  const id = await db.collection('horsePartyLinks').insertOne(doc);
  const created = await db.collection('horsePartyLinks').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

router.put('/:id', async (req, res) => {
  const body = req.body as {
    horse_id?: string;
    party_id?: string;
    relationship_type?: string;
    start_date?: string;
    end_date?: string | null;
    context?: string;
  };
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    ...body,
    updatedAt: now,
  };
  delete (updateData as { id?: unknown }).id;
  const found = await db.collection('horsePartyLinks').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await db.collection('horsePartyLinks').updateOne(req.params.id, updateData);
  const updated = await db.collection('horsePartyLinks').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

router.delete('/:id', async (req, res) => {
  const found = await db.collection('horsePartyLinks').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await db.collection('horsePartyLinks').deleteOne(req.params.id);
  res.json({ success: true });
});

export default router;