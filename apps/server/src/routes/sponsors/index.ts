// ---------------------------------------------------------------------------
// Sponsors / partners shown on the public landing page.
//
// Gating (see index.ts): GET is public (the marketing site renders them);
// create / edit / delete are staff-only (staffWriteGate). Ordered by an
// explicit `sortOrder`, falling back to creation time.
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

// list — public
router.get('/', async (_req, res) => {
  const items = await db.collection('sponsors').find();
  items.sort(bySortOrder);
  res.json(items.map(project));
});

// create — staff
router.post('/', async (req, res) => {
  const body = req.body as Partial<{
    name: string;
    category: string;
    tagline: string;
    websiteUrl: string;
    sortOrder: number;
  }>;
  if (!body || !body.name || !body.name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    name: body.name.trim(),
    category: typeof body.category === 'string' ? body.category.trim() : '',
    tagline: typeof body.tagline === 'string' ? body.tagline.trim() : '',
    websiteUrl: typeof body.websiteUrl === 'string' ? body.websiteUrl.trim() : '',
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
    createdAt: now,
    updatedAt: now,
  };
  const id = await db.collection('sponsors').insertOne(doc);
  const created = await db.collection('sponsors').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

// update — staff
router.put('/:id', async (req, res) => {
  const found = await db.collection('sponsors').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date().toISOString() };
  delete (updateData as { id?: unknown }).id;
  await db.collection('sponsors').updateOne(req.params.id, updateData);
  const updated = await db.collection('sponsors').findById(req.params.id);
  res.json(project(updated!));
});

// delete — staff
router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('sponsors').deleteOne(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
