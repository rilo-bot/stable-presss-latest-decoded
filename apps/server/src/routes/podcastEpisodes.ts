import { Router } from 'express';
import type { Request } from 'express';
import { db } from '../lib/db.js';
import { attachAccount, attachAccountOptional } from '../lib/auth.js';
import { accountCan } from '../lib/effectiveAccess.js';

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
  status?: string;
  guests?: object[];
  scheduledFor?: string;
  distributionChannels?: string[];
  reviewNotes?: string;
  producedBy?: string;
}

/**
 * The acting user's display name. `req.account` is the LIVE user record loaded
 * by attachAccount, so this no longer needs its own lookup.
 */
function actingDisplayName(req: Request): string | null {
  return req.account ? String(req.account.displayName ?? '') : null;
}

// ── List — drafts/unpublished are visible only to podcast roles ──────────────
router.get('/', attachAccountOptional, async (req, res) => {
  const items = await db.collection('podcastEpisodes').find();
  const seesAll = accountCan(req.account, 'podcast.read_all');
  const visible = seesAll ? items : items.filter((e) => e.status === 'published');
  res.json(visible.map(project));
});

// ── Create — producers/admins only ───────────────────────────────────────────
router.post('/', attachAccount, async (req, res) => {
  if (!accountCan(req.account, 'podcast.episode.create')) {
    res.status(403).json({ error: 'You do not have permission to create episodes.' });
    return;
  }
  const body = req.body as Partial<PodcastEpisode>;
  if (!body || !body.title) {
    res.status(400).json({ error: 'title is required' });
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
  const id = await db.collection('podcastEpisodes').insertOne(doc);
  const created = await db.collection('podcastEpisodes').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

// ── Update — edit_any, or edit_own when you produced it; approve gates publish ─
router.put('/:id', attachAccount, async (req, res) => {
  const body = req.body as Partial<PodcastEpisode>;
  const account = req.account;
  const id = String(req.params.id);

  const existing = await db.collection('podcastEpisodes').findById(id);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const displayName = actingDisplayName(req);
  const isOwn = !!existing.producedBy && existing.producedBy === displayName;

  // Publishing / un-publishing requires approval authority.
  const isApprovalMove =
    body.status === 'published' ||
    (existing.status === 'in_review' && body.status === 'scheduled');

  let allowed: boolean;
  if (isApprovalMove) {
    allowed = accountCan(account, 'podcast.episode.approve');
  } else {
    allowed =
      accountCan(account, 'podcast.episode.edit_any') ||
      (accountCan(account, 'podcast.episode.edit_own') && isOwn);
  }
  if (!allowed) {
    res.status(403).json({ error: 'You do not have permission to modify this episode.' });
    return;
  }

  const update: Record<string, unknown> = { ...body, updatedAt: new Date().toISOString() };
  delete (update as { id?: unknown }).id;
  // Stamp the publish date authoritatively the first time it goes live.
  if (body.status === 'published' && !existing.publishedAt) {
    update.publishedAt = new Date().toISOString();
  }

  await db.collection('podcastEpisodes').updateOne(id, update);
  const updated = await db.collection('podcastEpisodes').findById(id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

// ── Delete — delete permission, not published, and own (or edit_any) ──────────
router.delete('/:id', attachAccount, async (req, res) => {
  const account = req.account;
  const id = String(req.params.id);
  const existing = await db.collection('podcastEpisodes').findById(id);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const displayName = actingDisplayName(req);
  const isOwn = !!existing.producedBy && existing.producedBy === displayName;
  const allowed =
    accountCan(account, 'podcast.episode.delete') &&
    existing.status !== 'published' &&
    (isOwn || accountCan(account, 'podcast.episode.edit_any'));
  if (!allowed) {
    res.status(403).json({ error: 'You do not have permission to delete this episode.' });
    return;
  }

  await db.collection('podcastEpisodes').deleteOne(id);
  res.json({ success: true });
});

export default router;
