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

import { useBlogStore, type BlogSaveInput } from '@/stores/blogStore';
import { useBlogStudioUi, type BlogPostOption } from '@/stores/blogStudioUiStore';
import { useAuthStore } from '@/stores/authStore';
import { suggestImages } from '@/agent/article/articleToolExecutor';
import {
  blockForItem,
  blocksToBodyItems,
  describeVisuals,
  spliceBodyItems,
  type BodyItem,
} from '@/blog/bodyItems';
import type { Blog, BlogMedia } from '@/types/blog';
import type { SubscriptionTier } from '@/rbac/entitlement';

const CLIENT_TOOLS = new Set([
  'listBlogPosts',
  'openBlogPost',
  'createBlogDraft',
  'updateBlogPost',
  'replaceBlogBody',
  'setBlogPublished',
  'deleteBlogPost',
  'suggestBlogImages',
  'setBlogCover',
]);

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

    if (!text) continue;
    out.push({ kind: 'paragraph', text });
  }

  while (out.length > 0 && out[0]!.kind === 'heading') out.shift();
  return out;
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

async function updatePost(arg: Record<string, unknown>): Promise<unknown> {
  const post = await load(str(arg.id, 64));
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

  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to change — no fields were given.' };

  const result = await saveFull(post, patch);
  return result.ok ? { ok: true, changed: Object.keys(patch) } : result;
}

async function replaceBody(arg: Record<string, unknown>): Promise<unknown> {
  const post = await load(str(arg.id, 64));
  if (!post) return { ok: false, error: 'That post could not be opened.' };

  const items = toBodyItems(arg.body);
  if (items.length === 0) {
    return { ok: false, error: 'The new body was empty after validation — nothing was changed. Send the body as items with plain text.' };
  }

  // Overwriting LIVE writing needs a human. A model that mishears "cut that bit"
  // as "cut the post" must not be able to rewrite a published piece on its own.
  if (post.status === 'published') {
    const ok = await useBlogStudioUi.getState().requestConfirm({
      kind: 'overwrite-live',
      title: post.title || 'Untitled post',
      detail: 'This post is live. Replacing its body will change what readers see straight away.',
    });
    if (!ok) return { ok: false, cancelled: true, error: 'The user declined. Nothing was changed.' };
  }

  // Keeps images, galleries, embeds and cards, re-anchored to where they were.
  const { blocks, movedVisuals } = spliceBodyItems(post.blocks, items);

  const result = await saveFull(post, { blocks });
  if (!result.ok) return result;
  return {
    ok: true,
    items: items.length,
    movedVisuals,
    ...(movedVisuals > 0
      ? { note: `${movedVisuals} visual block(s) ended up at the end because the new body is shorter. Tell the user to check the photo positions.` }
      : {}),
  };
}

async function createDraft(arg: Record<string, unknown>): Promise<unknown> {
  const title = str(arg.title, 300);
  const items = toBodyItems(arg.body);
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
    blocks,
    media,
    ...(media[0] ? { cover: { mediaId: media[0].id, treatment: 'side' as const } } : {}),
    // The byline is the signed-in member, never asked for and never model-supplied.
    author: { name: useAuthStore.getState().currentUser?.displayName?.trim() || 'Staff' },
    // Explicitly a draft. Publishing is always a separate, deliberate ask.
    status: 'draft',
  });

  if (!created) return { ok: false, error: 'Could not file the draft. You may not have permission to create posts.' };
  useBlogStudioUi.getState().setCreatedDraft(created.id);
  return { ok: true, id: created.id, slug: created.slug };
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

  const ok = await useBlogStudioUi.getState().requestConfirm({
    kind: 'delete',
    title: post.title || 'Untitled post',
    detail:
      post.status === 'published'
        ? 'This post is LIVE. Deleting it removes it from the blog immediately.'
        : 'This draft will be removed from the Blogs list.',
  });
  if (!ok) return { ok: false, cancelled: true, error: 'The user declined. The post was not deleted.' };

  const done = await useBlogStore.getState().removeBlog(id);
  if (!done) return { ok: false, error: 'The delete was refused — you may not have permission to delete posts.' };
  toast.success('Post deleted.');
  return { ok: true };
}

async function setCover(arg: Record<string, unknown>): Promise<unknown> {
  const post = await load(str(arg.id, 64));
  if (!post) return { ok: false, error: 'That post could not be opened.' };

  const src = str(arg.src, 2000);
  // Only http(s). The model is told never to invent URLs; this is what makes that
  // more than a request.
  if (!/^https?:\/\//i.test(src)) {
    return { ok: false, error: 'That is not a usable image URL. Use one returned by suggestBlogImages.' };
  }

  const existing = post.media.find((m) => m.url === src);
  const id = existing?.id ?? `cover-${Date.now().toString(36)}`;
  const media: BlogMedia[] = existing
    ? post.media
    : [
        ...post.media,
        {
          id,
          url: src,
          kind: 'image',
          filename: 'cover.jpg',
          contentType: 'image/jpeg',
          alt: str(arg.alt, 500),
          uploadedAt: new Date().toISOString(),
        },
      ];

  const result = await saveFull(post, { media, cover: { mediaId: id, treatment: 'side' } });
  return result.ok ? { ok: true } : result;
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
    case 'suggestBlogImages': {
      const candidates = suggestImages(arg.query ? String(arg.query) : undefined);
      return { candidates };
    }
    case 'setBlogCover':
      return setCover(arg);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
