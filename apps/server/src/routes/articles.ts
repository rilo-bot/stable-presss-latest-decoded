import { Router } from 'express';
import { db } from '../lib/db.js';
import { accountCan } from '../lib/effectiveAccess.js';
import {
  channelPermission,
  enterPermission,
  findMove,
  isArticleStatus,
  normaliseChannels,
} from '../lib/workflow.js';
import type { ArticleStatus } from '../lib/workflow.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

/** Body fields a client may set. `status`/`channels` are validated separately. */
type ArticleBody = Partial<{
  title: string;
  summary: string;
  author: string;
  publishedAt: string | null;
  linkedHorseIds: string[];
  status: string;
  channels: unknown;
  changesRequested: boolean;
  changesRequestedNote: string;
  scheduledFor: string | null;
  imageUrl: string;
  category: string;
  readingTime: number;
  tags: string[];
}>;

type Account = Parameters<typeof accountCan>[0];

/**
 * Vet the channels on a write. A story may only go out on a channel the caller
 * is allowed to publish to.
 */
function vetChannels(
  body: ArticleBody,
  account: Account,
): { ok: true; channels?: string[] } | { ok: false; error: string } {
  const channels = normaliseChannels(body.channels);
  if (!channels) return { ok: true, channels: undefined };
  for (const channel of channels) {
    const needed = channelPermission(channel);
    if (needed && !accountCan(account, needed)) {
      return { ok: false, error: `You cannot publish to the ${channel}.` };
    }
  }
  return { ok: true, channels };
}

// list — soft-deleted articles (deletedAt set) are excluded.
router.get('/', async (req, res) => {
  const items = await db.collection('articles').find();
  res.json(items.filter((d) => !d.deletedAt).map(project));
});

// create
router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as ArticleBody;

  if (!body.title || !body.author) {
    res.status(400).json({ error: 'title and author are required' });
    return;
  }

  const status = body.status ?? 'draft';
  if (!isArticleStatus(status)) {
    res.status(400).json({ error: `Unknown status "${status}".` });
    return;
  }
  // Creating a story straight into a later stage needs the permission that stage
  // demands — otherwise "new story, status: published" walks past the workflow.
  const needed = enterPermission(status);
  if (needed && !accountCan(req.account, needed)) {
    res.status(403).json({ error: `You cannot create a story as ${status}.` });
    return;
  }

  const vetted = vetChannels(body, req.account);
  if (!vetted.ok) {
    res.status(403).json({ error: vetted.error });
    return;
  }

  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    ...body,
    status,
    createdAt: now,
    updatedAt: now,
  };
  if (vetted.channels) doc.channels = vetted.channels;
  else delete doc.channels;
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
  const body = (req.body ?? {}) as ArticleBody;

  const found = await db.collection('articles').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { ...body, updatedAt: now };
  delete (updateData as { id?: unknown }).id;

  // ── Status transition ──
  // A status write is a workflow move, not a field edit: it must be a legal move
  // from where the story actually is, and the caller must hold the permission
  // that move demands. `content.draft.edit_any` deliberately does NOT bypass
  // this — that it did is how a contributor could self-publish.
  if (body.status !== undefined) {
    const to = body.status;
    if (!isArticleStatus(to)) {
      res.status(400).json({ error: `Unknown status "${to}".` });
      return;
    }
    const from: ArticleStatus = isArticleStatus(found.status) ? found.status : 'draft';

    if (to !== from) {
      const move = findMove(from, to);
      if (!move) {
        res.status(409).json({ error: `A story cannot go from ${from} to ${to}.` });
        return;
      }
      if (!accountCan(req.account, move.permission)) {
        res.status(403).json({ error: `You cannot ${move.label.toLowerCase()} this story.` });
        return;
      }

      // Sending a story back to Draft is a rejection: flag it so its card reads
      // differently from a draft nobody has looked at yet. Any other move
      // clears the flag.
      if (to === 'draft' && from === 'submitted') {
        updateData.changesRequested = true;
        if (typeof body.changesRequestedNote === 'string') {
          updateData.changesRequestedNote = body.changesRequestedNote;
        }
      } else {
        updateData.changesRequested = false;
        updateData.changesRequestedNote = '';
      }

      // Leaving the schedule drops the slot; going live stamps the date.
      if (to !== 'scheduled') updateData.scheduledFor = '';
      if (to === 'published' && !found.publishedAt) updateData.publishedAt = now;
    }
  }

  // ── Channels ──
  if (body.channels !== undefined) {
    const vetted = vetChannels(body, req.account);
    if (!vetted.ok) {
      res.status(403).json({ error: vetted.error });
      return;
    }
    updateData.channels = vetted.channels ?? [];
  }

  // Booking a slot is the scheduler's call, not any editor's.
  if (body.scheduledFor !== undefined && !accountCan(req.account, 'content.schedule')) {
    res.status(403).json({ error: 'You cannot schedule stories.' });
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
