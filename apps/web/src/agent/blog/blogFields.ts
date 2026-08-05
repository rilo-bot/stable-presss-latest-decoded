/**
 * The blog editor's field registry — ONE vocabulary, used by three things:
 *
 *   • the ✨ compose button on each input (what to call the field, what it holds)
 *   • the context sent to the assistant each turn (what exists, what is filled)
 *   • the `setBlogField` tool (what may be written, and to what)
 *
 * Mirrors `agent/article/articleFields.ts`, with one structural difference that
 * matters: an article has a FIXED field list, and a blog does not. Blocks and
 * parts come and go as the author writes, so the registry is a FUNCTION OF THE
 * POST rather than a constant — `part:<id>.title` exists only while that part
 * does.
 *
 * ── What is deliberately absent ──
 *
 * `slug`, `canonicalUrl`, `noindex` and `status`. A published post's slug is its
 * public identity; canonical and noindex are editorial decisions about how the
 * piece appears in search; publishing is always its own human ask. The system
 * prompt already forbids all four — keeping them out of the registry makes that
 * true by construction rather than by instruction, because `setBlogField` can only
 * write what it can look up here.
 */
import type { Blog, BlogPart } from '@/types/blog';
import { blockText } from '@/blog/factories';
import { mediaById } from '@/types/blog';

/**
 * How a field's value is carried as text.
 *
 *   text      — one line
 *   longtext  — a sentence or paragraph
 *   tags      — comma-separated on the way in, an array in the post
 *   tier       — one of free | standard | premium
 *   mediaRef  — the id of an asset ALREADY in the post's pool (never a URL)
 *   body      — block content. Readable for context, NOT writable through
 *               `setBlogField`: prose is written with the body tools so it goes
 *               through the BodyItem seam instead of arriving as a lump of text.
 */
export type BlogFieldKind = 'text' | 'longtext' | 'tags' | 'mediaRef' | 'body';

export interface BlogFieldDef {
  /** Stable id. Dynamic ones are `part:<partId>.title`, `block:<blockId>`, `media:<mediaId>.alt`. */
  field: string;
  /** What a person calls it. Goes in the ✨ popover and the purple selection tag. */
  name: string;
  kind: BlogFieldKind;
  /** False for `body` kinds — see the note on BlogFieldKind. */
  writable: boolean;
}

const FIXED: Array<Omit<BlogFieldDef, 'writable'>> = [
  { field: 'title', name: 'Headline', kind: 'text' },
  { field: 'subtitle', name: 'Standfirst', kind: 'longtext' },
  { field: 'excerpt', name: 'Card summary', kind: 'longtext' },
  { field: 'category', name: 'Category', kind: 'text' },
  { field: 'tags', name: 'Tags', kind: 'tags' },
  { field: 'byline', name: 'Byline', kind: 'text' },
  { field: 'seo.metaTitle', name: 'Browser tab title', kind: 'text' },
  { field: 'seo.metaDescription', name: 'Search summary', kind: 'longtext' },
  { field: 'cover', name: 'Cover image', kind: 'mediaRef' },
  { field: 'thumbnail', name: 'Card image', kind: 'mediaRef' },
];

const writableKind = (kind: BlogFieldKind): boolean => kind !== 'body';

function def(d: Omit<BlogFieldDef, 'writable'>): BlogFieldDef {
  return { ...d, writable: writableKind(d.kind) };
}

/** Ordinal position of a part, for names a person recognises ("Part 2 title"). */
function partIndex(blog: Pick<Blog, 'parts'>, partId: string): number {
  return (blog.parts ?? []).findIndex((p) => p.id === partId);
}

/**
 * Every field this post currently has, in the order the editor shows them.
 *
 * Body blocks come last because there can be dozens of them and they are the
 * least likely thing to be addressed by name — the assistant reaches a block
 * through the SELECTION, not by hunting for its id in a list.
 */
export function blogFields(blog: Blog): BlogFieldDef[] {
  const out: BlogFieldDef[] = FIXED.map(def);

  for (const part of blog.parts ?? []) {
    const n = partIndex(blog, part.id) + 1;
    out.push(def({ field: `part:${part.id}.title`, name: `Part ${n} title`, kind: 'text' }));
    out.push(def({ field: `part:${part.id}.body`, name: `Part ${n} body`, kind: 'body' }));
  }

  for (const asset of blog.media) {
    out.push(def({ field: `media:${asset.id}.alt`, name: `Alt text — ${asset.filename}`, kind: 'text' }));
  }

  blog.blocks.forEach((block, i) => {
    out.push(def({ field: `block:${block.id}`, name: `Body block ${i + 1}`, kind: 'body' }));
  });

  return out;
}

export function blogFieldDef(blog: Blog, field: string): BlogFieldDef | undefined {
  return blogFields(blog).find((f) => f.field === field);
}

/** Strip inline HTML so a preview and a word count see words, not tags. */
function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const partOf = (blog: Blog, partId: string): BlogPart | undefined =>
  (blog.parts ?? []).find((p) => p.id === partId);

/**
 * The field's current value AS TEXT.
 *
 * Empty string means "not filled" for every kind, which is what `fieldFilled`
 * leans on — so a field that exists but holds nothing reads the same way whether
 * it is an absent string, an empty array or a dangling media id.
 */
export function readBlogField(blog: Blog, field: string): string {
  switch (field) {
    case 'title': return blog.title;
    case 'subtitle': return blog.subtitle ?? '';
    case 'excerpt': return blog.excerpt ?? '';
    case 'category': return blog.category ?? '';
    case 'tags': return blog.tags.join(', ');
    case 'byline': return blog.author.name;
    case 'seo.metaTitle': return blog.seo.metaTitle ?? '';
    case 'seo.metaDescription': return blog.seo.metaDescription ?? '';
    case 'cover': return mediaById(blog, blog.cover?.mediaId)?.filename ?? '';
    case 'thumbnail': return mediaById(blog, blog.thumbnailMediaId)?.filename ?? '';
    default: break;
  }

  const part = field.match(/^part:(.+)\.(title|body)$/);
  if (part) {
    const target = partOf(blog, part[1]!);
    if (!target) return '';
    if (part[2] === 'title') return target.title;
    return target.blocks.map((b) => plain(blockText(b))).filter(Boolean).join('\n\n');
  }

  const alt = field.match(/^media:(.+)\.alt$/);
  if (alt) return mediaById(blog, alt[1])?.alt ?? '';

  const block = field.match(/^block:(.+)$/);
  if (block) {
    const found = blog.blocks.find((b) => b.id === block[1]);
    return found ? plain(blockText(found)) : '';
  }

  return '';
}

export function blogFieldFilled(blog: Blog, field: string): boolean {
  return readBlogField(blog, field).trim().length > 0;
}

export function blogFieldPreview(blog: Blog, field: string, max = 90): string {
  const value = readBlogField(blog, field).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}…`;
}
