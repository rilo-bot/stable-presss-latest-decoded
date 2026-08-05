import { Router } from 'express';
import type { Request } from 'express';
import { db } from '../../lib/db.js';
import { attachAccount, attachAccountOptional } from '../../lib/auth.js';
import { accountCan } from '../../lib/effectiveAccess.js';
import type { PermissionAction } from '../../lib/permissionCatalogue.js';

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
 * Fields a client may set. Everything else on an episode document — `publishedAt`,
 * `createdAt`, `producedByUserId` — is stamped by the server.
 */
const WRITABLE_FIELDS = [
  'title', 'description', 'host', 'durationSeconds', 'audioUrl',
  'relatedArticleIds', 'coverUrl', 'season', 'episodeNumber', 'status',
  'guests', 'scheduledFor', 'distributionChannels', 'reviewNotes',
] as const;

/**
 * Did this account produce the episode?
 *
 * Keyed on `producedByUserId`, with the legacy `producedBy` display-name match as
 * a fallback for episodes that predate the field. Comparing display names alone —
 * which is all this route used to do — breaks the moment two staff share a name or
 * one is renamed, and it is a free-text field. Same fix as `ownsArticle` in
 * lib/rbac.ts and the blog `createdByUserId` check.
 */
function ownsEpisode(doc: Record<string, unknown>, req: Request): boolean {
  const account = req.account;
  if (!account) return false;
  if (typeof doc.producedByUserId === 'string' && doc.producedByUserId) {
    return doc.producedByUserId === account.id;
  }
  return typeof doc.producedBy === 'string' && doc.producedBy === String(account.displayName ?? '');
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
  const doc: Record<string, unknown> = { createdAt: now, updatedAt: now };
  for (const field of WRITABLE_FIELDS) {
    if (field in body) doc[field] = (body as Record<string, unknown>)[field];
  }

  // Creating straight into a published state would walk past `statusPermission`
  // entirely — the same hole blogs and articles each had to close.
  const wanted = typeof body.status === 'string' ? body.status : 'draft';
  if (wanted !== 'draft' && !accountCan(req.account, 'podcast.manage')) {
    const needed = statusPermission('draft', wanted);
    if (needed && !accountCan(req.account, needed)) {
      res.status(403).json({ error: `You cannot create an episode as ${wanted}.` });
      return;
    }
  }
  doc.status = wanted;
  doc.publishedAt = wanted === 'published' ? now : null;

  // Ownership is stamped server-side, never taken from the body — `edit_own`
  // depends on it, so a client that could set it could grant itself ownership.
  doc.producedByUserId = req.account!.id;
  doc.producedBy = String(req.account!.displayName ?? '');

  const id = await db.collection('podcastEpisodes').insertOne(doc);
  const created = await db.collection('podcastEpisodes').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

/**
 * WHICH FIELD NEEDS WHICH PERMISSION.
 *
 * The catalogue advertises "may upload audio", "may manage guests", "may manage
 * distribution" and "may schedule" as separate powers, but this route used to
 * collapse them into one `edit_own`/`edit_any` check — so anyone who could edit an
 * episode could do all four, and granting only `podcast.audio.upload` granted
 * nothing at all. See docs/CRM-MODULES-PERMISSIONS-REVIEW.md §4.2.
 *
 * `podcast.manage` is the umbrella: holding it satisfies any of these.
 */
const FIELD_PERMISSIONS: Array<{ fields: string[]; permission: PermissionAction; what: string }> = [
  { fields: ['audioUrl', 'durationSeconds'], permission: 'podcast.audio.upload', what: 'change the audio' },
  { fields: ['guests'], permission: 'podcast.guests.manage', what: 'manage guests' },
  { fields: ['distributionChannels'], permission: 'podcast.distribution.manage', what: 'change distribution' },
  { fields: ['scheduledFor'], permission: 'podcast.episode.schedule', what: 'schedule episodes' },
];

/** Which permission a status MOVE requires, or null when it needs no special power. */
function statusPermission(from: string, to: string): PermissionAction | null {
  if (to === from) return null;
  // Publish and approve are DIFFERENT powers. Publishing used to be gated on
  // `podcast.episode.approve`, which meant granting approve silently granted
  // publish, and `podcast.episode.publish` was enforced nowhere at all.
  if (to === 'published') return 'podcast.episode.publish';
  if (to === 'in_review') return 'podcast.episode.submit_review';
  if (to === 'scheduled') {
    // Coming out of review is an approval; scheduling your own draft is not.
    return from === 'in_review' ? 'podcast.episode.approve' : 'podcast.episode.schedule';
  }
  // Pulling a live episode back down is an approval-grade act.
  if (from === 'published') return 'podcast.episode.approve';
  return null;
}

// ── Update — edit_any, or edit_own when you produced it; then per-field checks ─
router.put('/:id', attachAccount, async (req, res) => {
  const body = req.body as Partial<PodcastEpisode>;
  const account = req.account;
  const id = String(req.params.id);

  const existing = await db.collection('podcastEpisodes').findById(id);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const isOwn = ownsEpisode(existing, req);
  const umbrella = accountCan(account, 'podcast.manage');

  // 1. May they touch this episode AT ALL?
  const mayEdit =
    umbrella ||
    accountCan(account, 'podcast.episode.edit_any') ||
    (accountCan(account, 'podcast.episode.edit_own') && isOwn);
  if (!mayEdit) {
    res.status(403).json({ error: 'You do not have permission to modify this episode.' });
    return;
  }

  // 2. Does the STATUS move need a power of its own?
  const from = typeof existing.status === 'string' ? existing.status : 'draft';
  if (typeof body.status === 'string') {
    const needed = statusPermission(from, body.status);
    if (needed && !umbrella && !accountCan(account, needed)) {
      res.status(403).json({ error: `You do not have permission to move this episode to ${body.status}.` });
      return;
    }
  }

  // 3. Does any FIELD they are changing need a power of its own? Only fields whose
  //    value actually differs are checked, so a client that round-trips the whole
  //    object is not refused for fields it left alone.
  for (const rule of FIELD_PERMISSIONS) {
    const touched = rule.fields.some(
      (f) => f in body && JSON.stringify((body as Record<string, unknown>)[f]) !== JSON.stringify(existing[f]),
    );
    if (touched && !umbrella && !accountCan(account, rule.permission)) {
      res.status(403).json({ error: `You do not have permission to ${rule.what}.` });
      return;
    }
  }

  // WRITE ALLOW-LIST, not `{ ...body }`. Spreading the request body let a caller
  // set `publishedAt`, `createdAt`, `producedBy` — or any field a future gate keys
  // on — straight past the checks above. This is the mass-assignment pattern the
  // auth review flagged across three routes.
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const field of WRITABLE_FIELDS) {
    if (field in body) update[field] = (body as Record<string, unknown>)[field];
  }
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

  const isOwn = ownsEpisode(existing, req);
  const allowed =
    (accountCan(account, 'podcast.episode.delete') || accountCan(account, 'podcast.manage')) &&
    existing.status !== 'published' &&
    (isOwn || accountCan(account, 'podcast.episode.edit_any') || accountCan(account, 'podcast.manage'));
  if (!allowed) {
    res.status(403).json({ error: 'You do not have permission to delete this episode.' });
    return;
  }

  await db.collection('podcastEpisodes').deleteOne(id);
  res.json({ success: true });
});

export default router;
