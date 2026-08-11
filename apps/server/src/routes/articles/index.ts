// ---------------------------------------------------------------------------
// Stories API. Plain CRUD over the `articles` collection, plus the one thing
// that is not CRUD: the five-stage editorial workflow.
//
// Three rules hold this file together.
//
//  1. WRITES ARE WHITELISTED. Every field a client may set is listed in
//     `readBody`, coerced there, and nothing else survives. The route used to
//     `{ ...body }` straight into Mongo, so a caller could write `deletedAt`,
//     `createdByUserId`, `publishedAt` or any field it invented.
//
//  2. THE SERVER OWNS DERIVED STATE. `publishedAt`, `changesRequested` and the
//     clearing of `scheduledFor` follow from the transition, not from what the
//     client sends. The browser used to send `publishedAt: new Date()` on every
//     save, which reset a live story's publish date each time it was edited.
//
//  3. STATUS IS A MOVE, NOT A FIELD. A status write must be a legal move from
//     where the story actually is, made by someone holding that move's
//     permission. See lib/workflow.ts.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../../lib/db.js';
import { accountCan } from '../../lib/effectiveAccess.js';
import { isAdmin } from '../../lib/rbac.js';
import {
  ARTICLE_STATUSES,
  enterPermission,
  findMove,
  isArticleStatus,
  normaliseLegacyStatus,
} from '../../lib/workflow.js';
import type { ArticleStatus } from '../../lib/workflow.js';
import { project, type WithMongoId } from '../../lib/project.js';


const router = Router();

type Account = Parameters<typeof accountCan>[0];

// ── Visibility ──────────────────────────────────────────────────────────────

/**
 * May this caller see stories that aren't live — drafts, submitted copy, and the
 * editorial notes attached to them?
 */
function canSeePipeline(account: Account): boolean {
  // `stories.view` is the honest question now: it is what opening the Stories
  // screen requires, and scope decides whose drafts come back (see the query
  // filter at the list endpoint), not whether any do.
  return isAdmin(account) || accountCan(account, 'stories.view');
}

/**
 * The fields a public reader gets. A whitelist rather than a blacklist so a
 * field added later is withheld by default instead of leaking by omission.
 *
 * Deliberately absent: `assignmentNote` and `changesRequestedNote` (internal
 * editorial correspondence), `changesRequested`, `scheduledFor`,
 * `createdByUserId` and `updatedAt`.
 *
 * `summary` — the whole story body — is HERE, and a published story is readable
 * in full by anyone. It used to be trimmed to a teaser by `gateArticleForTier`
 * (lib/paywall.ts) for readers below its `minTier`; subscriptions are gone, so
 * both the tier and the gate went with them rather than being left as a gate
 * that never closes. See routes/blogs/visibility.ts for the same removal.
 */
const PUBLIC_FIELDS = [
  'id', 'title', 'summary', 'author', 'publishedAt', 'linkedHorseIds', 'status',
  'imageUrl', 'category', 'readingTime', 'tags', 'createdAt',
] as const;

function publicView(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_FIELDS) {
    if (doc[key] !== undefined) out[key] = doc[key];
  }
  return out;
}

/** Newest first. `publishedAt` for live stories, `createdAt` for the rest. */
function recencyKey(doc: Record<string, unknown>): number {
  const raw = (doc.publishedAt ?? doc.createdAt) as unknown;
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  }
  if (raw instanceof Date) return raw.getTime();
  return 0;
}

// ── Read-time reconciliation ────────────────────────────────────────────────

const SWEEP_THROTTLE_MS = 15_000;
let lastSweep = 0;

/**
 * Publish any scheduled story whose slot has passed, and fold any story still
 * stored under a retired status into the five.
 *
 * Both are resolved on READ rather than by a cron or a migration script, for the
 * reason routes/blogs.ts gives: nothing in this codebase has ever reliably run a
 * scheduled job, and a story parked behind a forgotten cron — or behind a
 * migration nobody remembered to apply — stays parked forever. Every page that
 * shows stories hits this endpoint on mount, so the first read after a slot
 * passes performs the flip, and the first read of a legacy row repairs it.
 *
 * Unlike the blog's read-time check, this PERSISTS both changes instead of
 * reinterpreting the row on the way out. Otherwise `status` and "is it actually
 * live" would disagree, and the board would show a published story sitting in
 * the Scheduled column forever.
 *
 * `updateOneIf` makes each write atomic on the status it expects to find, so two
 * concurrent requests (or two API instances) cannot both stamp `publishedAt`.
 */
async function reconcileStories(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < SWEEP_THROTTLE_MS) return;
  lastSweep = now;

  const iso = new Date(now).toISOString();

  // Due schedules → live.
  const scheduled = await db.collection('articles').find({ status: 'scheduled' });
  for (const doc of scheduled) {
    const due = typeof doc.scheduledFor === 'string' ? Date.parse(doc.scheduledFor) : NaN;
    if (!Number.isFinite(due) || due > now) continue;
    await db.collection('articles').updateOneIf(
      doc._id,
      { status: 'scheduled' },
      { status: 'published', publishedAt: doc.publishedAt ?? iso, scheduledFor: '', updatedAt: iso },
    );
  }

  // Retired statuses → the five. Cheap: matches nothing once healed.
  const legacy = await db
    .collection('articles')
    .find({ status: { $nin: [...ARTICLE_STATUSES] } });
  for (const doc of legacy) {
    const mapped = normaliseLegacyStatus(doc.status);
    if (!mapped) continue;
    const update: Record<string, unknown> = { status: mapped.status, updatedAt: iso };
    if (mapped.changesRequested) update.changesRequested = true;
    if (mapped.status === 'published' && !doc.publishedAt) update.publishedAt = doc.createdAt ?? iso;
    // `?? null` so a document with NO status field is matched explicitly rather
    // than relying on how the driver serialises `undefined`. `$nin` above matches
    // a missing field too, and such a row belongs in Draft like any other
    // unrecognised one.
    await db.collection('articles').updateOneIf(doc._id, { status: doc.status ?? null }, update);
  }
}

// ── Body coercion ───────────────────────────────────────────────────────────

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function strArray(v: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  for (const item of v) {
    const s = str(item, itemMax).trim();
    if (s) seen.add(s);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * Everything a client may write, coerced. Only keys actually present in the body
 * end up in the result, so a PUT stays a partial update.
 *
 * `publishedAt`, `createdAt`, `createdByUserId`, `changesRequested` and
 * `deletedAt` are absent on purpose — the server owns all five.
 */
function readBody(raw: unknown): Record<string, unknown> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('title')) out.title = str(body.title, 300).trim();
  if (has('summary')) out.summary = str(body.summary, 200_000);
  if (has('author')) out.author = str(body.author, 120).trim();
  if (has('category')) out.category = str(body.category, 80).trim();
  if (has('imageUrl')) out.imageUrl = str(body.imageUrl, 500_000).trim();
  if (has('assignmentNote')) out.assignmentNote = str(body.assignmentNote, 2_000).trim();
  if (has('changesRequestedNote')) out.changesRequestedNote = str(body.changesRequestedNote, 2_000).trim();
  if (has('tags')) out.tags = strArray(body.tags, 20, 40);
  if (has('linkedHorseIds')) out.linkedHorseIds = strArray(body.linkedHorseIds, 100, 64);

  if (has('readingTime')) {
    const n = Number(body.readingTime);
    out.readingTime = Number.isFinite(n) && n > 0 ? Math.min(999, Math.round(n)) : null;
  }
  return out;
}

/**
 * Read a publish slot off the wire. A story cannot enter Scheduled without one:
 * that was the whole reason Scheduled did nothing — the stage existed, the field
 * existed, and no caller ever set it.
 */
function readSlot(raw: unknown): { ok: true; at: string } | { ok: false; error: string } {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { ok: false, error: 'Pick a date and time for this story to go live.' };
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return { ok: false, error: 'That publish date could not be read.' };
  return { ok: true, at: new Date(t).toISOString() };
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * List. Public callers get live stories in a public projection; anyone who works
 * on stories gets the full pipeline. It used to return every non-deleted
 * document, unfiltered and unauthenticated, to everybody.
 *
 * This is also the ONLY read path for a single story — there is no
 * `GET /:id`, so `/articles/:id` resolves out of this list client-side. Which
 * means the tier gate applied here is the one that protects the reader page too;
 * there is no second endpoint that could disagree with it.
 */
router.get('/', async (req, res) => {
  await reconcileStories();

  const seesPipeline = canSeePipeline(req.account);

  // The `status: 'published'` filter is applied by MONGODB for public callers, not
  // afterwards in JS. Two reasons, and the second is the important one:
  //   1. it uses the articles status index instead of scanning the collection, and
  //   2. an unpublished draft never leaves the database for a caller who may not see
  //      it — so the tier gate below is no longer the only thing standing between a
  //      public request and the whole pipeline.
  // find() already excludes soft-deleted docs.
  const items = await db.collection('articles').find(seesPipeline ? {} : { status: 'published' });
  const sorted = items.sort((a, b) => recencyKey(b) - recencyKey(a)).map(project);

  if (seesPipeline) {
    res.json(sorted);
    return;
  }
  // Public projection, each story cut to what this reader's subscription tier
  // entitles them to.
  res.json(sorted.map((d) => publicView(d)));
});

// create
router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields = readBody(body);

  if (!fields.title || !fields.author) {
    res.status(400).json({ error: 'title and author are required' });
    return;
  }

  const status = body.status === undefined ? 'draft' : body.status;
  if (!isArticleStatus(status)) {
    res.status(400).json({ error: `Unknown status "${String(status)}".` });
    return;
  }
  // Creating a story straight into a later stage needs the permission that stage
  // demands — otherwise "new story, status: published" walks past the workflow.
  const needed = enterPermission(status);
  if (needed && !accountCan(req.account, needed)) {
    res.status(403).json({ error: `You cannot create a story as ${status}.` });
    return;
  }

  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    ...fields,
    status,
    changesRequested: false,
    publishedAt: status === 'published' ? now : null,
    createdByUserId: req.account?.id ?? null,
    createdAt: now,
    updatedAt: now,
  };

  if (status === 'scheduled') {
    const slot = readSlot(body.scheduledFor);
    if (!slot.ok) {
      res.status(400).json({ error: slot.error });
      return;
    }
    doc.scheduledFor = slot.at;
  } else {
    doc.scheduledFor = '';
  }

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
  const body = (req.body ?? {}) as Record<string, unknown>;

  const found = await db.collection('articles').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { ...readBody(body), updatedAt: now };

  const from: ArticleStatus = isArticleStatus(found.status) ? found.status : 'draft';
  let to = from;

  // ── Status transition ──
  // A status write is a workflow move, not a field edit: it must be a legal move
  // from where the story actually is, and the caller must hold the permission
  // that move demands. `content.draft.edit_any` deliberately does NOT bypass
  // this — that it did is how a contributor could self-publish.
  if (body.status !== undefined) {
    if (!isArticleStatus(body.status)) {
      res.status(400).json({ error: `Unknown status "${String(body.status)}".` });
      return;
    }
    to = body.status;

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
      updateData.status = to;

      // Sending a story back to Draft is a rejection: flag it so its card reads
      // differently from a draft nobody has looked at yet. Any other move
      // clears the flag.
      if (to === 'draft' && from === 'submitted') {
        updateData.changesRequested = true;
      } else {
        updateData.changesRequested = false;
        updateData.changesRequestedNote = '';
      }

      // Going live stamps the date, once. Re-saving a live story must not move
      // it — that is what reordered the news index on every edit.
      if (to === 'published' && !found.publishedAt) updateData.publishedAt = now;
    }
  }

  // ── The publish slot ──
  // A story in Scheduled must carry one; leaving the stage drops it. Setting or
  // re-timing a slot is the scheduler's call — but merely editing the copy of an
  // already-scheduled story is not, so an editor can still fix a typo without
  // holding `stories.publish`.
  if (to === 'scheduled') {
    const entering = from !== 'scheduled';
    const retiming = body.scheduledFor !== undefined;
    if ((entering || retiming) && !accountCan(req.account, 'stories.publish')) {
      res.status(403).json({ error: 'You cannot schedule stories.' });
      return;
    }
    if (entering || retiming) {
      const slot = readSlot(retiming ? body.scheduledFor : found.scheduledFor);
      if (!slot.ok) {
        res.status(400).json({ error: slot.error });
        return;
      }
      updateData.scheduledFor = slot.at;
    }
    // Otherwise the stored slot stands — leave the field alone entirely.
  } else {
    updateData.scheduledFor = '';
  }

  // A `channels` key on the body is silently dropped: `readBody` does not accept
  // it, so a stale client still sending one gets a normal save rather than a 400.

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
