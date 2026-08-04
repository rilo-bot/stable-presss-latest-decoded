/**
 * Browser-side execution of the Blog Studio assistant's tools.
 *
 * This file IS the security boundary's client half. Every tool runs here and goes
 * through `useBlogStore`, which calls the REST endpoints behind `blogsWriteGate` —
 * so `blog.create`, `blog.edit_own`, `blog.edit_any`, `blog.publish` and
 * `blog.delete` are enforced by the server, and a model that tries something the
 * user cannot do gets a 403 back as a tool result and has to say so.
 *
 * ── Two things here are easy to get wrong ──
 *
 * PUT /api/blogs/:id IS A FULL REPLACE. The server rebuilds every field from the
 * request body, so a "partial" save that omits `blocks` and `media` WIPES THE POST.
 * Every write below therefore reads the post first and sends a complete document
 * with the change merged in. `saveFull()` is the only place that talks to
 * `saveBlog`, so that rule has exactly one enforcement point.
 *
 * THE MODEL NEVER SEES A `Block[]`. It reads and writes `BodyItem[]`, and
 * `blog/bodyItems.ts` converts both ways — including `spliceBodyItems`, which is
 * what stops an AI copy-edit from deleting every photograph in a post.
 */

import { toast } from 'sonner';

import { authFetch } from '@/lib/api';
import { useBlogStore, type BlogSaveInput } from '@/stores/blogStore';
import { useBlogStudioUi, type BlogPostOption } from '@/stores/blogStudioUiStore';
import { useAuthStore } from '@/stores/authStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useArticleStore } from '@/stores/articleStore';
import {
  blockForItem,
  blocksToBodyItems,
  describeVisuals,
  isRefItem,
  spliceBodyItems,
  type BodyItem,
} from '@/blog/bodyItems';
import { useComposerStore } from '@/pages/blog-composer/composerStore';
import {
  applyAddPart,
  applyInsert,
  applyMovePart,
  applyRemovePart,
  applyReplaceSelection,
  applySetField,
  applyUpdatePart,
  editorBlog,
  editorOpenFor,
  type BridgeResult,
  type InsertWhere,
} from './blogEditorBridge';
import type { Blog, BlogMedia, BlogSeo } from '@/types/blog';
import type { SubscriptionTier } from '@/rbac/entitlement';

const CLIENT_TOOLS = new Set([
  'listBlogPosts',
  'openBlogPost',
  'createBlogDraft',
  'updateBlogPost',
  'replaceBlogBody',
  'setBlogPublished',
  'deleteBlogPost',
  'setBlogCover',
  // Editor commands — these edit the composer's live document rather than saving
  // a whole post. See blogEditorBridge.ts for why that is the right seam.
  'setBlogField',
  'insertBlogContent',
  'replaceBlogSelection',
  'addBlogPart',
  'updateBlogPart',
  'moveBlogPart',
  'removeBlogPart',
]);
// `searchStockPhotos` is deliberately NOT here: it runs on the server, because the
// stock provider's key must not reach the browser.

export function isBlogClientTool(name: string): boolean {
  return CLIENT_TOOLS.has(name);
}

const TIERS: SubscriptionTier[] = ['free', 'standard', 'premium'];

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max).trim() : '';
}

function strArray(v: unknown, max = 12): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, 80).toLowerCase()).filter(Boolean).slice(0, max);
}

/**
 * Coerce the model's body into `BodyItem[]`.
 *
 * The wire schema is ONE flat object shape with optional fields rather than a
 * union of four (the provider's structured-output support for `anyOf` is uneven —
 * see the note in instantPrompt.ts), so this is where an item becomes its actual
 * kind and fields that don't belong to that kind are dropped. Mirrors
 * `cleanBody()` on the server, including the two rules that were learned the hard
 * way: a one-point list is really a paragraph, and a body that opens with a
 * heading reads as a fragment of something longer.
 */
function toBodyItems(v: unknown): BodyItem[] {
  if (!Array.isArray(v)) return [];
  const out: BodyItem[] = [];

  for (const raw of v.slice(0, 60)) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const text = str(item.text, 5000);

    if (item.kind === 'heading') {
      if (!text) continue;
      out.push({ kind: 'heading', level: item.level === 3 ? 3 : 2, text: text.slice(0, 200) });
      continue;
    }

    if (item.kind === 'list') {
      const points = (Array.isArray(item.items) ? item.items : [])
        .slice(0, 12)
        .map((p) => {
          const point = (p ?? {}) as Record<string, unknown>;
          const lead = str(point.lead, 80);
          return { ...(lead ? { lead } : {}), text: str(point.text, 1000) };
        })
        .filter((p) => p.text.length > 0);
      if (points.length === 0) continue;
      if (points.length === 1) {
        const only = points[0]!;
        out.push({ kind: 'paragraph', text: only.lead ? `${only.lead}: ${only.text}` : only.text });
        continue;
      }
      out.push({ kind: 'list', ordered: item.ordered === true, items: points });
      continue;
    }

    if (item.kind === 'quote') {
      if (!text) continue;
      const attribution = str(item.attribution, 120);
      out.push({ kind: 'quote', text, ...(attribution ? { attribution } : {}) });
      continue;
    }

    if (item.kind === 'horseRef' || item.kind === 'partyRef' || item.kind === 'storyRef') {
      const refId = str(item.refId, 64);
      // Existence is checked separately, in resolveRefs — this only insists there
      // is something to check.
      if (refId) out.push({ kind: item.kind, refId });
      continue;
    }

    if (!text) continue;
    out.push({ kind: 'paragraph', text });
  }

  while (out.length > 0 && out[0]!.kind === 'heading') out.shift();
  return out;
}

/**
 * Drop reference items whose record does not exist.
 *
 * This is the one validation the server genuinely cannot do for us.
 * `normaliseBlocks` checks that a `horseId` is a *string* — not that the horse is
 * real — so a hallucinated id would persist perfectly happily and render on the
 * public page as "This horse record is no longer available". A dead card in the
 * middle of a piece is worse than no card, so an id that does not resolve is
 * removed here and reported back, and the assistant is told to say so.
 *
 * The stores are fetched first because the studio may be the first thing the user
 * opened — an empty store would otherwise reject every id as unknown.
 */
async function resolveRefs(items: BodyItem[]): Promise<{ items: BodyItem[]; dropped: string[] }> {
  const refs = items.filter(isRefItem);
  if (refs.length === 0) return { items, dropped: [] };

  await Promise.all([
    refs.some((r) => r.kind === 'horseRef') ? useHorseStore.getState().fetchHorses() : Promise.resolve(),
    refs.some((r) => r.kind === 'partyRef') ? usePartyStore.getState().fetchParties() : Promise.resolve(),
    refs.some((r) => r.kind === 'storyRef') ? useArticleStore.getState().fetchArticles() : Promise.resolve(),
  ]);

  const horses = new Set(useHorseStore.getState().horses.map((h) => h.id));
  const parties = new Set(usePartyStore.getState().parties.map((p) => p.id));
  const articles = new Set(useArticleStore.getState().articles.map((a) => a.id));

  const dropped: string[] = [];
  const kept = items.filter((item) => {
    if (!isRefItem(item)) return true;
    const exists =
      item.kind === 'horseRef' ? horses.has(item.refId)
      : item.kind === 'partyRef' ? parties.has(item.refId)
      : articles.has(item.refId);
    if (!exists) dropped.push(`${item.kind}:${item.refId}`);
    return exists;
  });

  return { items: kept, dropped };
}

/**
 * Merge the two SEO fields the assistant may write into a post's existing `seo`.
 *
 * Merged rather than replaced, deliberately. `seo` also holds `canonicalUrl`,
 * `ogMediaId` and `noindex` — an editorial decision, a picture, and a "keep this
 * out of search" flag. None of those are the assistant's to guess at, and a
 * wholesale replace would silently drop a `noindex` someone set on purpose.
 *
 * An explicit empty string clears a field; `undefined` (the key absent) leaves it.
 */
function mergeSeo(existing: BlogSeo | undefined, arg: Record<string, unknown>): BlogSeo | undefined {
  if (arg.metaTitle === undefined && arg.metaDescription === undefined) return undefined;
  const next: BlogSeo = { ...(existing ?? {}) };

  if (arg.metaTitle !== undefined) {
    const v = str(arg.metaTitle, 200);
    if (v) next.metaTitle = v;
    else delete next.metaTitle;
  }
  if (arg.metaDescription !== undefined) {
    const v = str(arg.metaDescription, 400);
    if (v) next.metaDescription = v;
    else delete next.metaDescription;
  }
  return next;
}

/** The linked-record ids a body implies, for the post's own link fields. */
function linksFrom(items: BodyItem[]): { linkedHorseIds: string[]; linkedPartyIds: string[] } {
  const horseIds = new Set<string>();
  const partyIds = new Set<string>();
  for (const item of items) {
    if (item.kind === 'horseRef') horseIds.add(item.refId);
    if (item.kind === 'partyRef') partyIds.add(item.refId);
  }
  return { linkedHorseIds: [...horseIds], linkedPartyIds: [...partyIds] };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Load one post in full. Returns null when it is gone or forbidden. */
async function load(id: string): Promise<Blog | null> {
  if (!id) return null;
  return useBlogStore.getState().fetchOne(id);
}

async function listPosts(arg: Record<string, unknown>): Promise<unknown> {
  const status = arg.status === 'draft' || arg.status === 'published' ? arg.status : undefined;
  const q = str(arg.q, 120) || undefined;

  await useBlogStore.getState().fetchList({ status, q, sort: 'updated' }, 1);
  const { items, total, listError } = useBlogStore.getState();
  if (listError) return { ok: false, error: listError };

  const posts = items.map((p) => ({
    id: p.id,
    title: p.title || 'Untitled post',
    slug: p.slug,
    status: p.status,
    ...(p.category ? { category: p.category } : {}),
    updatedAt: p.updatedAt,
  }));

  // Also surface it on screen as a read-only reference box, the same affordance
  // the Story Studio gives horses — the model names things, the user reads them.
  const options: BlogPostOption[] = posts.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    ...(p.category ? { category: p.category } : {}),
  }));
  useBlogStudioUi.getState().setPostList(options.length > 0 ? options : null);

  return { posts, total, showing: posts.length };
}

async function openPost(arg: Record<string, unknown>): Promise<unknown> {
  const post = await load(str(arg.id, 64));
  if (!post) return { ok: false, error: 'That post could not be opened — it may have been deleted, or you may not have permission.' };

  return {
    ok: true,
    id: post.id,
    title: post.title,
    subtitle: post.subtitle ?? '',
    excerpt: post.excerpt ?? '',
    category: post.category ?? '',
    tags: post.tags,
    minTier: post.minTier ?? 'free',
    status: post.status,
    slug: post.slug,
    readingTime: post.readingTime,
    body: blocksToBodyItems(post.blocks),
    // Named so the model knows they exist, are preserved, and are not its to edit.
    visuals: describeVisuals(post.blocks),
    // Same reason as `visuals`. `replaceBlogBody` rewrites the BODY, and a post
    // can carry titled parts after it — listing them is what stops the assistant
    // reporting a full rewrite of a post it had only half read.
    parts: (post.parts ?? []).map((p, i) => ({
      part: i + 1,
      title: p.title || '(untitled)',
      editable: false,
    })),
    hasCover: !!post.cover,
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * The ONLY path to `saveBlog`.
 *
 * Sends a COMPLETE document with `patch` merged over the post as loaded, because
 * PUT /api/blogs/:id replaces every field — a save that omitted `blocks` would
 * empty the post. `baseUpdatedAt` comes from the same read, so a genuine
 * concurrent edit still 409s rather than being silently overwritten.
 */
async function saveFull(post: Blog, patch: BlogSaveInput): Promise<{ ok: boolean; error?: string }> {
  const merged: BlogSaveInput = {
    title: post.title,
    subtitle: post.subtitle,
    excerpt: post.excerpt,
    slug: post.slug,
    author: post.author,
    category: post.category,
    tags: post.tags,
    linkedHorseIds: post.linkedHorseIds,
    linkedPartyIds: post.linkedPartyIds,
    blocks: post.blocks,
    // Carried through untouched. The model never sees or edits parts, so this is
    // purely so a copy-edit of the body doesn't take the post's sub-sections with
    // it. The server also treats an absent `parts` as "leave them", which makes
    // this belt and braces rather than the only guard.
    parts: post.parts,
    media: post.media,
    cover: post.cover ?? null,
    thumbnailMediaId: post.thumbnailMediaId ?? null,
    seo: post.seo,
    minTier: post.minTier,
    ...patch,
    baseUpdatedAt: post.updatedAt,
  };

  const saved = await useBlogStore.getState().saveBlog(post.id, merged);
  // saveBlog toasts its own reason on failure (including a 409 or a 403), so the
  // model is told plainly rather than being handed a generic failure.
  if (!saved) return { ok: false, error: 'The save was refused. You may not have permission to edit this post, or someone else changed it — tell the user rather than retrying.' };
  return { ok: true };
}

/**
 * `updateBlogPost` and `replaceBlogBody` predate the editor bridge, and a
 * whole-post save while the composer holds newer local state is exactly the
 * collision that produces a false "someone else saved this post" 409. So when the
 * editor is open on this post, both of them go through the composer instead —
 * `id` is what decides, and nothing else changes for the model.
 *
 * The alternative was forbidding them in the prompt, which would leave the
 * failure one disobeyed instruction away.
 */
async function updatePostInEditor(id: string, arg: Record<string, unknown>): Promise<unknown> {
  const pairs: Array<[string, string]> = [];
  if (arg.title !== undefined) {
    const title = str(arg.title, 300);
    if (!title) return { ok: false, error: 'A blank title was refused — a post needs one to publish.' };
    pairs.push(['title', title]);
  }
  if (arg.subtitle !== undefined) pairs.push(['subtitle', str(arg.subtitle, 300)]);
  if (arg.excerpt !== undefined) pairs.push(['excerpt', str(arg.excerpt, 500)]);
  if (arg.category !== undefined) pairs.push(['category', str(arg.category, 80)]);
  if (arg.tags !== undefined) pairs.push(['tags', strArray(arg.tags).join(', ')]);
  if (arg.minTier !== undefined) pairs.push(['tier', str(arg.minTier, 20)]);
  if (arg.metaTitle !== undefined) pairs.push(['seo.metaTitle', str(arg.metaTitle, 200)]);
  if (arg.metaDescription !== undefined) pairs.push(['seo.metaDescription', str(arg.metaDescription, 400)]);

  if (pairs.length === 0) return { ok: false, error: 'Nothing to change — pass the fields you are updating.' };

  const changed: string[] = [];
  for (const [field, value] of pairs) {
    const result = applySetField(id, field, value);
    // Stop at the first refusal rather than applying half the patch and reporting
    // failure: a partially-applied change the model thinks failed is worse than a
    // clean stop it can explain.
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        ...(changed.length ? { alsoApplied: changed, note: 'Those changes DID apply before the failure — say so.' } : {}),
      };
    }
    changed.push(result.changed);
  }
  toast.success(`Updated the ${changed.join(', ')}`, {
    action: { label: 'Undo', onClick: () => useComposerStore.getState().undo() },
  });
  return { ok: true, changed };
}

async function updatePost(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  if (editorOpenFor(id)) return updatePostInEditor(id, arg);

  const post = await load(id);
  if (!post) return { ok: false, error: 'That post could not be opened.' };

  // Only fields the model actually sent. `undefined` means "leave it alone", which
  // is why this cannot just spread `arg`.
  const patch: BlogSaveInput = {};
  if (arg.title !== undefined) {
    const title = str(arg.title, 300);
    if (!title) return { ok: false, error: 'A blank title was refused — a post needs one to publish.' };
    patch.title = title;
  }
  if (arg.subtitle !== undefined) patch.subtitle = str(arg.subtitle, 300);
  if (arg.excerpt !== undefined) patch.excerpt = str(arg.excerpt, 500);
  if (arg.category !== undefined) patch.category = str(arg.category, 80);
  if (arg.tags !== undefined) patch.tags = strArray(arg.tags);
  if (arg.minTier !== undefined) {
    const tier = str(arg.minTier, 20) as SubscriptionTier;
    if (TIERS.includes(tier)) patch.minTier = tier;
  }
  const seo = mergeSeo(post.seo, arg);
  if (seo) patch.seo = seo;

  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to change — no fields were given.' };

  const result = await saveFull(post, patch);
  return result.ok ? { ok: true, changed: Object.keys(patch) } : result;
}

async function replaceBody(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  // Live document when the editor is open — see updatePostInEditor above.
  const open = editorOpenFor(id) ? editorBlog() : null;
  const post = open ?? (await load(id));
  if (!post) return { ok: false, error: 'That post could not be opened.' };

  const { items, dropped } = await resolveRefs(toBodyItems(arg.body));
  if (items.length === 0) {
    return { ok: false, error: 'The new body was empty after validation — nothing was changed. Send the body as items with plain text.' };
  }

  // Overwriting LIVE writing needs a human. A model that mishears "cut that bit"
  // as "cut the post" must not be able to rewrite a published piece on its own.
  if (post.status === 'published') {
    const outcome = await useBlogStudioUi.getState().requestConfirm({
      kind: 'overwrite-live',
      title: post.title || 'Untitled post',
      detail: 'This post is live. Replacing its body will change what readers see straight away.',
    });
    if (outcome !== 'confirm') return { ok: false, cancelled: true, error: 'The user declined. Nothing was changed.' };
  }

  // Keeps images, galleries and embeds, re-anchored to where they were. Reference
  // cards are part of `items` now, so they move with the writing rather than being
  // re-anchored as though they were photographs.
  const { blocks, movedVisuals } = spliceBodyItems(post.blocks, items);

  if (open) {
    const { setBodyBlocks, patchPost, undo } = useComposerStore.getState();
    setBodyBlocks(blocks);
    patchPost(linksFrom(items));
    toast.success('Rewrote the body', { action: { label: 'Undo', onClick: () => undo() } });
  } else {
    const result = await saveFull(post, { blocks, ...linksFrom(items) });
    if (!result.ok) return result;
  }
  return {
    ok: true,
    items: items.length,
    movedVisuals,
    ...(dropped.length > 0
      ? { droppedRefs: dropped, note: `${dropped.length} record card(s) were dropped because those ids do not exist. Tell the user which, and search again for the right record rather than guessing.` }
      : {}),
    ...(movedVisuals > 0
      ? { photoNote: `${movedVisuals} photo/gallery block(s) ended up at the end because the new body is shorter. Tell the user to check the photo positions.` }
      : {}),
  };
}

async function createDraft(arg: Record<string, unknown>): Promise<unknown> {
  const title = str(arg.title, 300);
  const { items, dropped } = await resolveRefs(toBodyItems(arg.body));
  if (!title) return { ok: false, error: 'A title is required.' };
  if (items.length === 0) return { ok: false, error: 'The body was empty after validation. Send it as items with plain text.' };

  const blocks = items.map(blockForItem);

  // The cover is whatever the user attached with the image button, kept out of the
  // model's context so a data-URL never bloats the conversation.
  const attached = useBlogStudioUi.getState().attachedImageUrl?.trim();
  const media: BlogMedia[] = [];
  if (attached) {
    media.push({
      id: `cover-${Date.now().toString(36)}`,
      url: attached,
      kind: 'image',
      filename: 'cover.jpg',
      contentType: 'image/jpeg',
      alt: str(arg.title, 200),
      uploadedAt: new Date().toISOString(),
    });
  }

  const tier = str(arg.minTier, 20) as SubscriptionTier;

  const created = await useBlogStore.getState().createBlog({
    title,
    subtitle: str(arg.subtitle, 300) || undefined,
    excerpt: str(arg.excerpt, 500) || undefined,
    category: str(arg.category, 80) || undefined,
    tags: strArray(arg.tags),
    minTier: TIERS.includes(tier) ? tier : 'free',
    // Consumed immediately by `usePageMeta` on the public post page, so a post
    // written here gets a real browser-tab title and search summary rather than
    // the site's generic one.
    ...(mergeSeo(undefined, arg) ? { seo: mergeSeo(undefined, arg) } : {}),
    blocks,
    media,
    // Whatever the piece embeds is also recorded on the post itself, so the record
    // knows what it is about — these were saved empty on every AI post before.
    ...linksFrom(items),
    ...(media[0] ? { cover: { mediaId: media[0].id, treatment: 'side' as const } } : {}),
    // The byline is the signed-in member, never asked for and never model-supplied.
    author: { name: useAuthStore.getState().currentUser?.displayName?.trim() || 'Staff' },
    // Explicitly a draft. Publishing is always a separate, deliberate ask.
    status: 'draft',
  });

  if (!created) return { ok: false, error: 'Could not file the draft. You may not have permission to create posts.' };
  useBlogStudioUi.getState().setCreatedDraft(created.id);
  return {
    ok: true,
    id: created.id,
    slug: created.slug,
    ...(dropped.length > 0
      ? { droppedRefs: dropped, note: `${dropped.length} record card(s) were left out because those ids do not exist — search for the right record and add them to the post.` }
      : {}),
  };
}

async function setPublished(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  if (!id) return { ok: false, error: 'A post id is required.' };
  const published = arg.published !== false;

  const updated = await useBlogStore.getState().setPublished(id, published);
  if (!updated) {
    return {
      ok: false,
      error: published
        ? 'Publishing was refused. It needs a title and some content, and you need blog publishing rights — tell the user what came back rather than retrying.'
        : 'Unpublishing was refused — you may not have blog publishing rights.',
    };
  }
  return { ok: true, status: updated.status };
}

async function deletePost(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  if (!id) return { ok: false, error: 'A post id is required.' };

  const post = await load(id);
  if (!post) return { ok: false, error: 'That post could not be opened.' };

  const outcome = await useBlogStudioUi.getState().requestConfirm({
    kind: 'delete',
    title: post.title || 'Untitled post',
    detail:
      post.status === 'published'
        ? 'This post is LIVE. Deleting it removes it from the blog immediately.'
        : 'This draft will be removed from the Blogs list.',
  });
  if (outcome !== 'confirm') return { ok: false, cancelled: true, error: 'The user declined. The post was not deleted.' };

  const done = await useBlogStore.getState().removeBlog(id);
  if (!done) return { ok: false, error: 'The delete was refused — you may not have permission to delete posts.' };
  toast.success('Post deleted.');
  return { ok: true };
}

/**
 * Set a post's cover from a stock candidate — shown to the user first.
 *
 * The order here is the whole point of the rewrite. It used to take a URL from the
 * model and save it silently, so the author found out what had been chosen by
 * opening the post. Now:
 *
 *   1. the photo is sourced into the post's own media pool by the SERVER, which
 *      resolves the provider id, downloads the bytes into our bucket and keeps the
 *      photographer's credit — the browser never handles an image URL the model
 *      supplied, so an invented one cannot become a stored asset;
 *   2. the user SEES it and answers keep / another / their own;
 *   3. only "keep" actually points the post's cover at it.
 *
 * A photo they rejected stays in the pool rather than being deleted — it is a real
 * asset now, they may want it for a block, and silently binning something a person
 * just looked at is its own small surprise.
 */
async function setCover(arg: Record<string, unknown>): Promise<unknown> {
  const postId = str(arg.id, 64);
  const post = await load(postId);
  if (!post) return { ok: false, error: 'That post could not be opened.' };

  const photoId = str(arg.photoId, 12);
  if (!/^\d{1,12}$/.test(photoId)) {
    return { ok: false, error: 'That is not a photo id from searchStockPhotos. Search again and use a candidate\'s `id`.' };
  }

  // The server does the sourcing: it owns the provider key, and this endpoint is
  // behind the same RBAC gate as every other write to this post.
  const res = await authFetch(`/api/blogs/${postId}/media/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId, ...(str(arg.alt, 500) ? { alt: str(arg.alt, 500) } : {}) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; configured?: boolean };
    return {
      ok: false,
      ...(body.configured === false ? { configured: false } : {}),
      error: body.error ?? `Could not source that photo (HTTP ${res.status}).`,
    };
  }
  const { media: asset, attribution } = (await res.json()) as {
    media: BlogMedia;
    attribution?: { author?: string };
  };

  const outcome = await useBlogStudioUi.getState().requestConfirm({
    kind: 'cover',
    title: post.title || 'Untitled post',
    detail: 'This will be the post’s cover — beside the writing, and on its card in the blog index.',
    imageUrl: asset.url,
    ...(attribution?.author ? { credit: `Photo: ${attribution.author}` } : {}),
  });

  if (outcome === 'retry') {
    return { ok: false, retry: true, error: 'The user wants a different photo. Search again with a different description and offer new options.' };
  }
  if (outcome === 'cancel') {
    return { ok: false, cancelled: true, error: 'The user would rather choose their own photo — tell them to use the image button below the chat.' };
  }

  // With the editor open, take the new asset into the LIVE pool and set the cover
  // there. Re-reading and saving the whole post instead would throw away whatever
  // the author had typed since their last autosave — the endpoint that stored the
  // photo has already written to the document, so the composer's baseline needs
  // clearing either way (see adoptExternalMedia).
  if (editorOpenFor(postId)) {
    const { adoptExternalMedia, undo } = useComposerStore.getState();
    adoptExternalMedia(asset);
    const applied = applySetField(postId, 'cover', asset.id);
    if (!applied.ok) return { ok: false, error: applied.error };
    toast.success('Cover photo set', { action: { label: 'Undo', onClick: () => undo() } });
    return { ok: true, alt: asset.alt };
  }

  // Re-read: the media endpoint bumped updatedAt, so saving against the version we
  // loaded before it would 409 against a baseline we ourselves invalidated.
  const fresh = await load(postId);
  if (!fresh) return { ok: false, error: 'The post could not be re-read after adding the photo.' };

  const result = await saveFull(fresh, { cover: { mediaId: asset.id, treatment: 'side' } });
  return result.ok ? { ok: true, alt: asset.alt } : result;
}

// ── Editor commands ──────────────────────────────────────────────────────────
//
// These do NOT go through `saveFull`. They edit the composer's live document, so
// the change lands instantly, Ctrl+Z takes it back, and unsaved typing survives —
// see blogEditorBridge.ts for the full reasoning. Autosave still carries it
// through PUT /api/blogs/:id, so nothing about the RBAC gate or the block
// validator changes.
//
// One shared shape, because every one of them can fail for the same two reasons
// (the post isn't open; the ids are stale) and the model needs to hear that
// plainly rather than as a generic failure.

/** Report a bridge result, toasting success with a way to take it back. */
function reportEdit(result: BridgeResult, verb: string): unknown {
  if (!result.ok) return { ok: false, error: result.error };
  // The Undo is not decoration: an AI edit the author did not want is the thing
  // most likely to go wrong here, and it must be one click away, not a request
  // typed back into the chat.
  toast.success(`${verb} ${result.changed}`, {
    action: { label: 'Undo', onClick: () => useComposerStore.getState().undo() },
  });
  return { ok: true, changed: result.changed };
}

/** Body items, validated and with dead reference cards removed. */
async function editorItems(v: unknown): Promise<{ items: BodyItem[]; dropped: string[] }> {
  return resolveRefs(toBodyItems(v));
}

function droppedNote(dropped: string[]): Record<string, unknown> {
  return dropped.length > 0
    ? {
        droppedRefs: dropped,
        note: `${dropped.length} record card(s) were dropped because those ids do not exist. Tell the user which, and search again for the right record rather than guessing.`,
      }
    : {};
}

async function setField(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  const field = str(arg.field, 120);
  if (!id || !field) return { ok: false, error: 'A post id and a field id are required.' };
  // `value` is NOT trimmed to empty-as-missing here: an empty string is how an
  // optional field gets cleared, and str() already bounds the length.
  const value = typeof arg.value === 'string' ? arg.value.slice(0, 5000) : '';
  return reportEdit(applySetField(id, field, value), 'Updated the');
}

async function insertContent(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  if (!id) return { ok: false, error: 'A post id is required.' };

  const { items, dropped } = await editorItems(arg.body);
  if (items.length === 0) {
    return { ok: false, error: 'There was nothing to insert after validation. Send the text as body items in plain text.' };
  }

  const at = str(arg.where, 20);
  const where: InsertWhere =
    at === 'end' ? { at: 'end' }
    : at === 'start' ? { at: 'start' }
    : at === 'part' ? { at: 'part', partId: str(arg.partId, 64) }
    : { at: 'selection' };

  if (where.at === 'part' && !where.partId) {
    return { ok: false, error: 'A partId is required when inserting into a part.' };
  }

  const result = applyInsert(id, items, where);
  return { ...(reportEdit(result, 'Added') as Record<string, unknown>), ...droppedNote(dropped) };
}

async function replaceSelection(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  if (!id) return { ok: false, error: 'A post id is required.' };

  const { items, dropped } = await editorItems(arg.body);
  const result = applyReplaceSelection(id, items);
  return { ...(reportEdit(result, 'Rewrote') as Record<string, unknown>), ...droppedNote(dropped) };
}

async function addPart(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  if (!id) return { ok: false, error: 'A post id is required.' };

  const { items, dropped } = arg.body === undefined ? { items: [], dropped: [] } : await editorItems(arg.body);
  const result = applyAddPart(id, { title: str(arg.title, 200), items });
  return { ...(reportEdit(result, 'Added') as Record<string, unknown>), ...droppedNote(dropped) };
}

async function updatePart(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  const partId = str(arg.partId, 64);
  if (!id || !partId) return { ok: false, error: 'A post id and a part id are required.' };

  let items: BodyItem[] | undefined;
  let dropped: string[] = [];
  if (arg.body !== undefined) {
    const resolved = await editorItems(arg.body);
    items = resolved.items;
    dropped = resolved.dropped;
    if (items.length === 0) {
      return { ok: false, error: 'The new part body was empty after validation — nothing was changed.' };
    }
  }

  const result = applyUpdatePart(id, {
    partId,
    ...(typeof arg.title === 'string' ? { title: str(arg.title, 200) } : {}),
    ...(items ? { items } : {}),
  });
  return { ...(reportEdit(result, 'Updated') as Record<string, unknown>), ...droppedNote(dropped) };
}

async function movePart(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  const partId = str(arg.partId, 64);
  if (!id || !partId) return { ok: false, error: 'A post id and a part id are required.' };
  const direction = arg.direction === 'up' ? 'up' : 'down';
  return reportEdit(applyMovePart(id, partId, direction), 'Moved');
}

async function removePart(arg: Record<string, unknown>): Promise<unknown> {
  const id = str(arg.id, 64);
  const partId = str(arg.partId, 64);
  if (!id || !partId) return { ok: false, error: 'A post id and a part id are required.' };

  const blog = editorBlog();
  if (!blog || blog.id !== id) {
    return { ok: false, error: 'That post is not open in the editor, so its parts cannot be changed here.' };
  }
  const part = (blog.parts ?? []).find((p) => p.id === partId);
  if (!part) return { ok: false, error: `There is no part with id "${partId}" on this post.` };

  // Deleting writing takes a human click, exactly like deleting a post. Reader
  // reactions are recorded against the part id, so this is not only text going.
  const outcome = await useBlogStudioUi.getState().requestConfirm({
    kind: 'delete',
    title: part.title || 'Untitled part',
    detail:
      blog.status === 'published'
        ? 'This post is LIVE. Removing this part takes it off the page, along with any reactions readers left on it.'
        : 'The part and its writing will be removed from this draft.',
  });
  if (outcome !== 'confirm') {
    return { ok: false, cancelled: true, error: 'The user declined. The part was not removed.' };
  }

  return reportEdit(applyRemovePart(id, partId), 'Removed');
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export async function executeBlogTool(name: string, input: unknown): Promise<unknown> {
  const arg = (input ?? {}) as Record<string, unknown>;

  switch (name) {
    case 'listBlogPosts':
      return listPosts(arg);
    case 'openBlogPost':
      return openPost(arg);
    case 'createBlogDraft':
      return createDraft(arg);
    case 'updateBlogPost':
      return updatePost(arg);
    case 'replaceBlogBody':
      return replaceBody(arg);
    case 'setBlogPublished':
      return setPublished(arg);
    case 'deleteBlogPost':
      return deletePost(arg);
    case 'setBlogCover':
      return setCover(arg);
    case 'setBlogField':
      return setField(arg);
    case 'insertBlogContent':
      return insertContent(arg);
    case 'replaceBlogSelection':
      return replaceSelection(arg);
    case 'addBlogPart':
      return addPart(arg);
    case 'updateBlogPart':
      return updatePart(arg);
    case 'moveBlogPart':
      return movePart(arg);
    case 'removeBlogPart':
      return removePart(arg);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
