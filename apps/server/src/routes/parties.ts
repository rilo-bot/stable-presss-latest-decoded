import { Router } from 'express';
import { db } from '../lib/db.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

router.get('/', async (req, res) => {
  const items = await db.collection('parties').find();
  res.json(items.map(project));
});

router.post('/', async (req, res) => {
  const body = req.body as Partial<{
    party_type: string;
    roles: string[];
    name: string;
    photo?: string;
    profession?: string;
    date_of_birth?: string;
    country_of_birth?: string;
    base_location?: string;
    started_year?: number;
    personnel_subtype?: string[];
  }>;

  if (!body || !body.name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    ...body,
    createdAt: now,
    updatedAt: now,
  };
  delete (doc as { id?: unknown }).id;

  const id = await db.collection('parties').insertOne(doc);
  const created = await db.collection('parties').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

router.put('/:id', async (req, res) => {
  const body = req.body as Partial<{
    party_type: string;
    roles: string[];
    name: string;
    photo?: string;
    profession?: string;
    date_of_birth?: string;
    country_of_birth?: string;
    base_location?: string;
    started_year?: number;
    personnel_subtype?: string[];
  }>;

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    ...body,
    updatedAt: now,
  };
  delete (updateData as { id?: unknown }).id;

  const found = await db.collection('parties').updateOne(req.params.id, updateData);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const updated = await db.collection('parties').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

router.delete('/:id', async (req, res) => {
  const found = await db.collection('parties').deleteOne(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;