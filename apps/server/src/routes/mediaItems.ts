import { Router } from 'express';
import { db } from '../lib/db.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

// list
router.get('/', async (_req, res) => {
  const items = await db.collection('mediaItems').find();
  res.json(items.map(project));
});

// create
router.post('/', async (req, res) => {
  const body = req.body as Partial<{ title: string }>;
  if (!body || !body.title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = { ...body, createdAt: now, updatedAt: now };
  delete (doc as { id?: unknown }).id;
  const id = await db.collection('mediaItems').insertOne(doc);
  const createdDoc = await db.collection('mediaItems').findById(id);
  if (!createdDoc) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(createdDoc));
});

// update
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const found = await db.collection('mediaItems').findById(id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date().toISOString() };
  delete (updateData as { id?: unknown }).id;
  await db.collection('mediaItems').updateOne(id, updateData);
  const updated = await db.collection('mediaItems').findById(id);
  res.json(project(updated!));
});

// delete
router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('mediaItems').deleteOne(String(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
