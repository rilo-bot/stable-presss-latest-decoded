import { Router } from 'express';
import { db } from '../lib/db.js';
import { isStaff } from '../lib/rbac.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

// list — "authorised-only" reports (visibility !== 'public') are hidden from
// anonymous/reader callers. Staff see everything; party/org-scoped visibility
// for linked horses is layered in Phase C/D.  TODO(phase C/D): scope by horse link.
router.get('/', async (req, res) => {
  const items = await db.collection('reports').find();
  const visible = isStaff(req.account)
    ? items
    : items.filter((r) => (r.visibility ?? 'public') === 'public');
  res.json(visible.map(project));
});

// create
router.post('/', async (req, res) => {
  const body = req.body as Partial<{ horse_id: string; doc_type: string; title: string; visibility: string }>;
  if (!body || !body.horse_id || !body.title) {
    res.status(400).json({ error: 'horse_id and title are required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = { visibility: body.visibility ?? 'public', ...body, createdAt: now, updatedAt: now };
  delete (doc as { id?: unknown }).id;
  const id = await db.collection('reports').insertOne(doc);
  const createdDoc = await db.collection('reports').findById(id);
  if (!createdDoc) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(createdDoc));
});

// update
router.put('/:id', async (req, res) => {
  const found = await db.collection('reports').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date().toISOString() };
  delete (updateData as { id?: unknown }).id;
  await db.collection('reports').updateOne(req.params.id, updateData);
  const updated = await db.collection('reports').findById(req.params.id);
  res.json(project(updated!));
});

// delete
router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('reports').deleteOne(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
