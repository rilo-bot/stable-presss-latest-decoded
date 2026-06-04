import { Router } from 'express';
import { db } from '../lib/db.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

router.get('/', async (req, res) => {
  const items = await db.collection('horses').find();
  res.json(items.map(project));
});

router.post('/', async (req, res) => {
  const body = req.body as Partial<{
    name: string;
    isUnnamed: boolean;
    sex: string;
    dob: string;
    colour: string;
    country: string;
    handsSize: number;
    metricSize: number;
    sire: string;
    sireSire: string;
    sireDam: string;
    dam: string;
    damYob: number;
    damSire: string;
    damDam: string;
    ownerIds: string[];
    trainerIds: string[];
    jockeyIds: string[];
    breederIds: string[];
    bloodstockAgentIds: string[];
    syndicateManagerIds: string[];
    personnelIds: string[];
    careerRecord: string;
    careerWinnings: number;
    lastTenForm: string;
    seasonRecord: string;
    currentRating: number;
    pedigreeNotes: string;
    pullQuote: string;
    imageUrl: string;
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

  const id = await db.collection('horses').insertOne(doc);
  const created = await db.collection('horses').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

router.put('/:id', async (req, res) => {
  const body = req.body as Partial<{
    name: string;
    isUnnamed: boolean;
    sex: string;
    dob: string;
    colour: string;
    country: string;
    handsSize: number;
    metricSize: number;
    sire: string;
    sireSire: string;
    sireDam: string;
    dam: string;
    damYob: number;
    damSire: string;
    damDam: string;
    ownerIds: string[];
    trainerIds: string[];
    jockeyIds: string[];
    breederIds: string[];
    bloodstockAgentIds: string[];
    syndicateManagerIds: string[];
    personnelIds: string[];
    careerRecord: string;
    careerWinnings: number;
    lastTenForm: string;
    seasonRecord: string;
    currentRating: number;
    pedigreeNotes: string;
    pullQuote: string;
    imageUrl: string;
  }>;

  const now = new Date().toISOString();
  const updated_flag = await db.collection('horses').updateOne(req.params.id, { ...body, updatedAt: now });
  if (!updated_flag) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const updated = await db.collection('horses').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('horses').deleteOne(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;