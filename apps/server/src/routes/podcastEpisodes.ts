import { Router } from 'express';
import { db } from '../lib/db.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

interface PodcastEpisode {
  title: string;
  description?: string;
  host?: string;
  durationSeconds?: number;
  audioUrl?: string;
  publishedAt?: string;
  relatedArticleIds?: string[];
  coverUrl?: string;
  season?: number;
  episodeNumber?: number;
  guests?: object[];
  scheduledFor?: string;
  distributionChannels?: string[];
  reviewNotes?: string;
  producedBy?: string;
}

router.get('/', async (req, res) => {
  const items = await db.collection('podcastEpisodes').find();
  res.json(items.map(project));
});

router.post('/', async (req, res) => {
  const body = req.body as Partial<PodcastEpisode>;
  if (!body || !body.title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    ...body,
    createdAt: now,
    updatedAt: now,
  };
  delete (doc as { id?: unknown }).id;
  const id = await db.collection('podcastEpisodes').insertOne(doc);
  const created = await db.collection('podcastEpisodes').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

router.put('/:id', async (req, res) => {
  const body = req.body as Partial<PodcastEpisode>;
  const now = new Date().toISOString();
  const updated_check = await db.collection('podcastEpisodes').updateOne(req.params.id, { ...body, updatedAt: now });
  if (!updated_check) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const updated = await db.collection('podcastEpisodes').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('podcastEpisodes').deleteOne(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;