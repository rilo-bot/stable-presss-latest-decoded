// ---------------------------------------------------------------------------
// Breaking-news ticker items shown on the public landing page.
//
// Gating (see index.ts): GET is public; create / edit / delete are staff-only
// (staffWriteGate). All items are returned (sorted); the landing page filters
// to `active` ones, and the admin editor shows every item so inactive ones can
// be toggled back on.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../../lib/db.js';
import { project, type WithMongoId } from '../../lib/project.js';


const bySortOrder = (a: WithMongoId, b: WithMongoId) => {
  const ao = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
  const bo = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
  if (ao !== bo) return ao - bo;
  return String(a.createdAt) < String(b.createdAt) ? -1 : 1;
};

const router = Router();

// list — public (all items; client filters by `active`)
router.get('/', async (_req, res) => {
  const items = await db.collection('breakingNews').find();
  items.sort(bySortOrder);
  res.json(items.map(project));
});

// create — staff
router.post('/', async (req, res) => {
  const body = req.body as Partial<{ text: string; active: boolean; sortOrder: number }>;
  if (!body || !body.text || !body.text.trim()) {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    text: body.text.trim(),
    active: body.active !== false,
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
    createdAt: now,
    updatedAt: now,
  };
  const id = await db.collection('breakingNews').insertOne(doc);
  const created = await db.collection('breakingNews').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

// update — staff
router.put('/:id', async (req, res) => {
  const found = await db.collection('breakingNews').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date().toISOString() };
  delete (updateData as { id?: unknown }).id;
  await db.collection('breakingNews').updateOne(req.params.id, updateData);
  const updated = await db.collection('breakingNews').findById(req.params.id);
  res.json(project(updated!));
});

// delete — staff
router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('breakingNews').deleteOne(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
