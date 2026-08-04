/**
 * The editor bridge — where an assistant's edit becomes an ordinary editor step.
 *
 * ── Why this exists ──
 *
 * The Blog Studio's original tools read a post from the server and wrote it back
 * with a whole PUT (`saveFull` in blogToolExecutor). That is right from the blog
 * LIST, where there is no editor open. It is wrong while the author is in the
 * composer, because the composer holds the live document with a 1.5s autosave:
 * the assistant would read a version seconds stale, write over unsaved
 * keystrokes, and leave the editor to reload — losing the undo history with it.
 *
 * So while the editor has that post open, every write goes THROUGH THE COMPOSER
 * STORE instead. Four things follow from that, and they are the whole point:
 *
 *   1. It is instant, and it is UNDOABLE — composer mutations push undo history,
 *      so Ctrl+Z takes back an AI edit exactly like a human one.
 *   2. It works on a draft with unsaved typing in it. No forced save, no 409.
 *   3. The human and the assistant share ONE mutation path, so the assistant
 *      cannot produce a document a person couldn't have made by hand. Same rule
 *      as the BodyItem seam, one level up.
 *   4. Validation is unchanged: autosave still sends it through the server's
 *      normaliseBlocks / normaliseParts, and the route still re-checks RBAC.
 *
 * NEVER add a path from here straight to the database or to a bespoke endpoint.
 * The gate is real because every write still leaves via PUT /api/blogs/:id.
 */
import { useComposerStore } from '@/pages/blog-composer/composerStore';
import { blockForItem, type BodyItem } from '@/blog/bodyItems';
import { blogFieldDef } from './blogFields';
import type { Block, Blog, BlogMedia } from '@/types/blog';
import { mediaById } from '@/types/blog';

export type BridgeResult =
  /** `changed` is one short human phrase, for the toast and for the model to repeat. */
  | { ok: true; changed: string }
  | { ok: false; error: string };

const fail = (error: string): BridgeResult => ({ ok: false, error });
const done = (changed: string): BridgeResult => ({ ok: true, changed });

/** The post open in the composer, if any. */
export function editorBlog(): Blog | null {
  return useComposerStore.getState().blog;
}

/**
 * Is the editor open on THIS post? The one question that decides whether a tool
 * edits the live document or goes through the API.
 */
export function editorOpenFor(postId: string): boolean {
  return useComposerStore.getState().blog?.id === postId;
}

const NOT_OPEN =
  'That post is not open in the editor, so this tool cannot be used on it. Open it first, or use the whole-post tools.';

/** Guard + narrow in one step, so every apply* below starts the same way. */
function withEditor(postId: string): { blog: Blog } | { error: string } {
  const blog = useComposerStore.getState().blog;
  if (!blog || blog.id !== postId) return { error: NOT_OPEN };
  return { blog };
}

// ── Fields ──────────────────────────────────────────────────────────────────

/**
 * Length ceilings, mirroring the server's `str(v, max)` calls in routes/blogs.ts.
 *
 * Enforced by REFUSING rather than truncating. The server truncates silently,
 * which is the right call for a hand-typed form (you can see what you typed) and
 * the wrong one here: a model given no feedback would leave a sentence cut off
 * mid-word and report success.
 */
const LIMITS: Record<string, number> = {
  title: 300,
  subtitle: 300,
  excerpt: 500,
  category: 80,
  byline: 120,
  'seo.metaTitle': 200,
  'seo.metaDescription': 400,
  alt: 500,
  partTitle: 200,
};

const TIERS = ['free', 'standard', 'premium'] as const;

function tooLong(name: string, value: string, max: number): string | null {
  return value.length > max
    ? `That ${name} is ${value.length} characters; the limit is ${max}. Shorten it and try again.`
    : null;
}

/** Split a comma-separated tag string the way the tags input does. */
function parseTags(value: string): string[] {
  const seen = new Set<string>();
  for (const raw of value.split(',')) {
    const tag = raw.trim();
    if (tag && tag.length <= 80) seen.add(tag);
    if (seen.size >= 50) break;
  }
  return [...seen];
}

/**
 * Write one registry field on the open post.
 *
 * `body`-kind fields (a block, a part's body) are refused on purpose: prose is
 * written with the body tools so it arrives as BodyItems and goes through the
 * seam, rather than as a lump of text that would have to be parsed here.
 */
export function applySetField(postId: string, field: string, value: string): BridgeResult {
  const found = withEditor(postId);
  if ('error' in found) return fail(found.error);
  const { blog } = found;

  const def = blogFieldDef(blog, field);
  if (!def) {
    return fail(
      `There is no field called "${field}" on this post. Ask for the field list again — parts, blocks and photos come and go, so ids from an earlier turn may be stale.`,
    );
  }
  if (!def.writable) {
    return fail(
      `"${def.name}" is body content, so it cannot be set as text. Use the body tools (insert / replace) so the writing goes in as real blocks.`,
    );
  }

  const { patchPost, updatePart, patchMedia } = useComposerStore.getState();
  const text = value.trim();

  switch (field) {
    case 'title': {
      const err = tooLong('headline', text, LIMITS.title!);
      if (err) return fail(err);
      patchPost({ title: text });
      return done('headline');
    }
    case 'subtitle': {
      const err = tooLong('standfirst', text, LIMITS.subtitle!);
      if (err) return fail(err);
      patchPost({ subtitle: text });
      return done('standfirst');
    }
    case 'excerpt': {
      const err = tooLong('summary', text, LIMITS.excerpt!);
      if (err) return fail(err);
      patchPost({ excerpt: text });
      return done('card summary');
    }
    case 'category': {
      const err = tooLong('category', text, LIMITS.category!);
      if (err) return fail(err);
      patchPost({ category: text });
      return done('category');
    }
    case 'tags': {
      const tags = parseTags(value);
      patchPost({ tags });
      return done(tags.length ? `tags (${tags.join(', ')})` : 'tags (cleared)');
    }
    case 'byline': {
      const err = tooLong('byline', text, LIMITS.byline!);
      if (err) return fail(err);
      if (!text) return fail('A post needs a byline. Give a name rather than clearing it.');
      patchPost({ author: { ...blog.author, name: text } });
      return done('byline');
    }
    case 'tier': {
      const tier = text.toLowerCase();
      if (!(TIERS as readonly string[]).includes(tier)) {
        return fail(`Who-can-read-it must be one of ${TIERS.join(', ')}.`);
      }
      patchPost({ minTier: tier as (typeof TIERS)[number] });
      return done(`who can read it (${tier})`);
    }
    case 'seo.metaTitle':
    case 'seo.metaDescription': {
      const key = field === 'seo.metaTitle' ? 'metaTitle' : 'metaDescription';
      const err = tooLong(def.name.toLowerCase(), text, LIMITS[field]!);
      if (err) return fail(err);
      patchPost({ seo: { ...blog.seo, [key]: text || undefined } });
      return done(def.name.toLowerCase());
    }
    case 'cover':
    case 'thumbnail': {
      if (!text) {
        patchPost(field === 'cover' ? { cover: undefined } : { thumbnailMediaId: undefined });
        return done(`${def.name.toLowerCase()} (cleared)`);
      }
      const asset = mediaById(blog, text);
      if (!asset) {
        return fail(
          `There is no photo with id "${text}" attached to this post. Pick one of the ids in the media pool, or ask the user to attach a photo — never invent an id or a URL.`,
        );
      }
      if (field === 'cover') {
        patchPost({ cover: { mediaId: asset.id, treatment: blog.cover?.treatment ?? 'side' } });
      } else {
        patchPost({ thumbnailMediaId: asset.id });
      }
      return done(`${def.name.toLowerCase()} (${asset.filename})`);
    }
    default:
      break;
  }

  const part = field.match(/^part:(.+)\.title$/);
  if (part) {
    const err = tooLong('part title', text, LIMITS.partTitle!);
    if (err) return fail(err);
    updatePart(part[1]!, { title: text });
    return done(def.name.toLowerCase());
  }

  const alt = field.match(/^media:(.+)\.alt$/);
  if (alt) {
    const err = tooLong('alt text', text, LIMITS.alt!);
    if (err) return fail(err);
    patchMedia(alt[1]!, { alt: text });
    return done(def.name.toLowerCase());
  }

  // Unreachable while the registry and this switch agree; a plain refusal beats a
  // silent no-op if they ever drift.
  return fail(`"${def.name}" cannot be written yet.`);
}

// ── Body ────────────────────────────────────────────────────────────────────

/**
 * Where new content goes.
 *
 * `selection` is the one that makes "add this here" mean anything: it resolves
 * against whatever the author last pointed at — a body block, or a part (through
 * either of its fields).
 */
export type InsertWhere =
  | { at: 'selection' }
  | { at: 'end' }
  | { at: 'start' }
  | { at: 'part'; partId: string };

/** Which container holds a block, and where in it. `null` container = the body. */
function locate(blog: Blog, blockId: string): { container: string | null; index: number } | null {
  const bodyAt = blog.blocks.findIndex((b) => b.id === blockId);
  if (bodyAt >= 0) return { container: null, index: bodyAt };
  for (const part of blog.parts ?? []) {
    const at = part.blocks.findIndex((b) => b.id === blockId);
    if (at >= 0) return { container: part.id, index: at };
  }
  return null;
}

/** A selected field of the form `part:<id>.*` means that part. */
function selectedPartId(blog: Blog, selectedFieldId: string | null): string | null {
  const m = selectedFieldId?.match(/^part:(.+)\.(title|body)$/);
  if (!m) return null;
  return (blog.parts ?? []).some((p) => p.id === m[1]) ? m[1]! : null;
}

function toBlocks(items: BodyItem[]): Block[] {
  return items.map(blockForItem);
}

function describe(items: BodyItem[]): string {
  const n = items.length;
  return `${n} ${n === 1 ? 'block' : 'blocks'}`;
}

/**
 * Insert body items into the open post.
 *
 * Refuses an empty list rather than reporting a successful no-op — a model that
 * has been told "done" stops trying.
 */
export function applyInsert(postId: string, items: BodyItem[], where: InsertWhere): BridgeResult {
  const found = withEditor(postId);
  if ('error' in found) return fail(found.error);
  const { blog } = found;
  if (items.length === 0) return fail('There was nothing to insert — send at least one body item.');

  const { selectedId, selectedFieldId, insertBlocks } = useComposerStore.getState();
  const blocks = toBlocks(items);

  if (where.at === 'part') {
    const part = (blog.parts ?? []).find((p) => p.id === where.partId);
    if (!part) return fail(`There is no part with id "${where.partId}" on this post.`);
    insertBlocks(blocks, part.blocks.length, part.id);
    return done(`${describe(items)} at the end of “${part.title || 'that part'}”`);
  }

  if (where.at === 'start') {
    insertBlocks(blocks, 0, null);
    return done(`${describe(items)} at the top of the post`);
  }

  if (where.at === 'end') {
    insertBlocks(blocks, blog.blocks.length, null);
    return done(`${describe(items)} at the end of the body`);
  }

  // 'selection' — a block, then a part, then the end of the body as the fallback.
  if (selectedId) {
    const at = locate(blog, selectedId);
    if (at) {
      insertBlocks(blocks, at.index + 1, at.container);
      return done(`${describe(items)} after the selected block`);
    }
  }
  const partId = selectedPartId(blog, selectedFieldId);
  if (partId) {
    const part = (blog.parts ?? []).find((p) => p.id === partId)!;
    insertBlocks(blocks, part.blocks.length, partId);
    return done(`${describe(items)} at the end of “${part.title || 'the selected part'}”`);
  }
  insertBlocks(blocks, blog.blocks.length, null);
  return done(`${describe(items)} at the end of the body`);
}

/**
 * Replace what the author has selected.
 *
 * Only ever ONE block, or one part's body — never a guess at a range. If nothing
 * is selected it refuses, because "replace the selection" with no selection would
 * otherwise have to mean "replace something", and picking which is not this
 * function's decision to make.
 */
export function applyReplaceSelection(postId: string, items: BodyItem[]): BridgeResult {
  const found = withEditor(postId);
  if ('error' in found) return fail(found.error);
  const { blog } = found;

  const { selectedId, selectedFieldId, replaceBlockWith, setPartBlocks } = useComposerStore.getState();

  if (selectedId) {
    if (!locate(blog, selectedId)) return fail('The selected block is no longer in the post.');
    if (items.length === 0) return fail('Send the replacement text, or use the delete tool to remove a block.');
    replaceBlockWith(selectedId, toBlocks(items));
    return done(`the selected block, rewritten as ${describe(items)}`);
  }

  const partId = selectedPartId(blog, selectedFieldId);
  if (partId) {
    if (items.length === 0) return fail('Send the replacement text — a part cannot have an empty body.');
    const part = (blog.parts ?? []).find((p) => p.id === partId)!;
    setPartBlocks(partId, toBlocks(items));
    return done(`the body of “${part.title || 'that part'}”`);
  }

  return fail(
    'Nothing is selected in the editor, so there is nothing to replace. Ask the user to click the paragraph or the part they mean, or insert instead.',
  );
}

// ── Parts ───────────────────────────────────────────────────────────────────

export function applyAddPart(
  postId: string,
  input: { title: string; items: BodyItem[] },
): BridgeResult {
  const found = withEditor(postId);
  if ('error' in found) return fail(found.error);
  const { blog } = found;

  if ((blog.parts ?? []).length >= 20) {
    return fail('This post already has the maximum of 20 parts.');
  }
  const title = input.title.trim();
  const err = tooLong('part title', title, LIMITS.partTitle!);
  if (err) return fail(err);
  if (!title && input.items.length === 0) {
    return fail('A new part needs a title, some writing, or both.');
  }

  const id = useComposerStore.getState().addPart({
    title,
    blocks: input.items.length ? toBlocks(input.items) : undefined,
  });
  if (!id) return fail('The part could not be added.');
  return done(`a new part${title ? ` — “${title}”` : ''}`);
}

export function applyUpdatePart(
  postId: string,
  input: { partId: string; title?: string; items?: BodyItem[] },
): BridgeResult {
  const found = withEditor(postId);
  if ('error' in found) return fail(found.error);
  const { blog } = found;

  const part = (blog.parts ?? []).find((p) => p.id === input.partId);
  if (!part) return fail(`There is no part with id "${input.partId}" on this post.`);
  if (input.title === undefined && input.items === undefined) {
    return fail('Nothing to change — pass a title, a body, or both.');
  }

  const { updatePart, setPartBlocks } = useComposerStore.getState();
  const changed: string[] = [];

  if (input.title !== undefined) {
    const title = input.title.trim();
    const err = tooLong('part title', title, LIMITS.partTitle!);
    if (err) return fail(err);
    updatePart(part.id, { title });
    changed.push('title');
  }
  if (input.items !== undefined) {
    if (input.items.length === 0) return fail('A part cannot have an empty body.');
    setPartBlocks(part.id, toBlocks(input.items));
    changed.push('body');
  }
  return done(`the ${changed.join(' and ')} of “${input.title?.trim() || part.title || 'that part'}”`);
}

export function applyMovePart(postId: string, partId: string, direction: 'up' | 'down'): BridgeResult {
  const found = withEditor(postId);
  if ('error' in found) return fail(found.error);
  const { blog } = found;

  const parts = blog.parts ?? [];
  const at = parts.findIndex((p) => p.id === partId);
  if (at < 0) return fail(`There is no part with id "${partId}" on this post.`);
  const delta = direction === 'up' ? -1 : 1;
  if (at + delta < 0 || at + delta >= parts.length) {
    return fail(`“${parts[at]!.title || 'That part'}” is already ${direction === 'up' ? 'first' : 'last'}.`);
  }
  useComposerStore.getState().movePart(partId, delta);
  return done(`“${parts[at]!.title || 'that part'}” moved ${direction}`);
}

export function applyRemovePart(postId: string, partId: string): BridgeResult {
  const found = withEditor(postId);
  if ('error' in found) return fail(found.error);
  const { blog } = found;

  const part = (blog.parts ?? []).find((p) => p.id === partId);
  if (!part) return fail(`There is no part with id "${partId}" on this post.`);
  useComposerStore.getState().removePart(partId);
  return done(`the part “${part.title || 'untitled'}” removed`);
}

/** Alt text for every photo that has none — the list the assistant should offer to fix. */
export function missingAlt(blog: Blog): BlogMedia[] {
  return blog.media.filter((m) => m.kind === 'image' && !m.alt.trim());
}
