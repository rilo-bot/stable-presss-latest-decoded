import { Router } from 'express';
import { db } from '../lib/db.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

// list — soft-deleted articles (deletedAt set) are excluded.
router.get('/', async (req, res) => {
  const items = await db.collection('articles').find();
  res.json(items.filter((d) => !d.deletedAt).map(project));
});

// create
router.post('/', async (req, res) => {
  const body = req.body as Partial<{
    title: string;
    summary: string;
    author: string;
    publishedAt: string | null;
    linkedHorseIds: string[];
    status: string;
    imageUrl: string;
    category: string;
    readingTime: number;
    tags: string[];
  }>;

  if (!body || !body.title || !body.author) {
    res.status(400).json({ error: 'title and author are required' });
    return;
  }

  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    ...body,
    status: body.status ?? 'draft',
    createdAt: now,
    updatedAt: now,
  };
  delete (doc as { id?: unknown }).id;

  const id = await db.collection('articles').insertOne(doc);
  const created = await db.collection('articles').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

// update
router.put('/:id', async (req, res) => {
  const body = req.body as Partial<{
    title: string;
    summary: string;
    author: string;
    publishedAt: string | null;
    linkedHorseIds: string[];
    status: string;
    imageUrl: string;
    category: string;
    readingTime: number;
    tags: string[];
  }>;

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    ...body,
    updatedAt: now,
  };
  delete (updateData as { id?: unknown }).id;

  const found = await db.collection('articles').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  await db.collection('articles').updateOne(req.params.id, updateData);
  const updated = await db.collection('articles').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

// delete — soft delete: stamp deletedAt instead of removing the document, so
// the story drops off the board/list but the record is retained.
router.delete('/:id', async (req, res) => {
  const found = await db.collection('articles').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const now = new Date().toISOString();
  await db.collection('articles').updateOne(req.params.id, {
    deletedAt: now,
    updatedAt: now,
  });
  res.json({ success: true });
});

export default router;