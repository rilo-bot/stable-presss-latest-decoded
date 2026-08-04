/**
 * The facts the ✨ field-composer is given to work from.
 *
 * `POST /api/agent/compose` writes ONE field and is told, in its own system
 * prompt, to use only what it is handed and never to invent racing detail. So what
 * goes in here is the whole difference between a summary of THIS post and a
 * plausible sentence about horses.
 *
 * Bounded on purpose: the opening of the body rather than all of it, and the
 * titles of the parts rather than their prose. The endpoint truncates its context
 * blob at 6000 characters, so an unbounded version would be silently cut — and the
 * part that got cut would be the end, which is where a post's argument usually is.
 */
import { blockText } from '@/blog/factories';
import type { Blog } from '@/types/blog';
import { readBlogField } from './blogFields';

const BODY_CHARS = 1200;

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function blogComposeContext(blog: Blog, field?: string): Record<string, unknown> {
  const body = blog.blocks
    .map((b) => plain(blockText(b)))
    .filter(Boolean)
    .join('\n\n');

  const ctx: Record<string, unknown> = {
    postTitle: blog.title || '(untitled)',
    standfirst: blog.subtitle ?? '',
    category: blog.category ?? '',
    tags: blog.tags,
    byline: blog.author.name,
    status: blog.status,
    bodyOpening: body.length > BODY_CHARS ? `${body.slice(0, BODY_CHARS)}…` : body,
    ...(blog.parts?.length
      ? { partTitles: blog.parts.map((p, i) => `Part ${i + 1}: ${p.title || '(untitled)'}`) }
      : {}),
  };

  // A part title is composed from THAT part's writing, not from the post's opening
  // — the post's first paragraph would produce a heading for the wrong section.
  const part = field?.match(/^part:(.+)\.title$/);
  if (part) {
    const text = readBlogField(blog, `part:${part[1]}.body`);
    ctx.thisPartsWriting = text.length > BODY_CHARS ? `${text.slice(0, BODY_CHARS)}…` : text;
  }

  // Alt text describes a photograph the model cannot see. Give it the filename and
  // say so plainly, so it asks rather than inventing what is in the picture.
  const alt = field?.match(/^media:(.+)\.alt$/);
  if (alt) {
    const asset = blog.media.find((m) => m.id === alt[1]);
    ctx.photoFilename = asset?.filename ?? '';
    ctx.photoCaption = asset?.caption ?? '';
    ctx.warning =
      'You cannot see this photograph. Do not describe its contents unless the caption or filename says what it shows — if there is nothing to go on, return an empty string.';
  }

  return ctx;
}
