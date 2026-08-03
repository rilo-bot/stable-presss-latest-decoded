/**
 * Turn a reviewed Instant draft into the payloads the existing create endpoints
 * take. Plain functions, no model involved.
 *
 * This is the deliberate seam in the design: the agent never emits `Block[]`. It
 * returns a flat list of typed body items (paragraph / heading / list / quote),
 * and the blocks are assembled HERE, in code, through the same
 * `@/blog/factories` the composer's own toolbar uses — then validated again by
 * `normaliseBlocks` on the server. A generated post therefore cannot hold a shape
 * a hand-authored one couldn't, and there is no model output path into the block
 * model at all.
 *
 * Photo placement is deliberately predictable rather than clever:
 *   • the cover photo is the cover, and does not also appear inline
 *   • every other usable photo gets one image block, placed before a heading so
 *     it sits at a natural break, with the leftovers appended at the end
 */
import { heading, image, list, paragraph, quote } from '@/blog/factories';
import { DEFAULT_PLACEMENT, type Block, type BlogCover, type BlogMedia } from '@/types/blog';

import type { BlogFields, BodyItem, CapturedPhoto } from './types';
import { isUsable } from './types';

/**
 * Escape plain text for a block's inline HTML.
 *
 * The agent is told to return plain text and does, but it costs nothing to be
 * certain: an unescaped `<` would either vanish in `sanitizeBlogInline` or, worse,
 * change the markup around it.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** A list point as inline HTML, with its optional label rendered bold. */
function pointHtml(point: { lead?: string; text: string }): string {
  const body = escapeHtml(point.text);
  return point.lead ? `<strong>${escapeHtml(point.lead)}:</strong> ${body}` : body;
}

/** Split a textarea's contents into paragraphs on blank lines. */
export function toParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+\n/g, '\n').trim())
    .filter(Boolean);
}

/** Join paragraphs back into the textarea form. */
export function fromParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}

/** Rough reading time in minutes, at 200 wpm — never zero. */
export function readingTimeFor(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** One body item → one block, built with the composer's own factories. */
function blockForItem(item: BodyItem): Block {
  switch (item.kind) {
    case 'heading': {
      const b = heading(item.level, item.text);
      return b;
    }
    case 'list': {
      const b = list(item.ordered);
      // `list()` seeds one empty item so a hand-inserted list is editable; a
      // generated one carries its real points instead.
      b.items = item.items.map(pointHtml);
      return b;
    }
    case 'quote': {
      const b = quote();
      b.html = escapeHtml(item.text);
      if (item.attribution) b.attribution = item.attribution;
      return b;
    }
    case 'paragraph':
    default:
      return paragraph(escapeHtml(item.text));
  }
}

/** The media pool entry for one uploaded photo. */
function mediaFor(photo: CapturedPhoto): BlogMedia {
  return {
    id: photo.id,
    url: photo.url!,
    ...(photo.key ? { key: photo.key } : {}),
    kind: 'image',
    filename: photo.file.name || 'photo.jpg',
    contentType: 'image/jpeg',
    ...(photo.width ? { width: photo.width } : {}),
    ...(photo.height ? { height: photo.height } : {}),
    // The caption doubles as alt text: it is a description of the photo written
    // from a description of the photo, which is exactly what alt text is. An
    // empty alt would be worse than an imperfect one here.
    alt: photo.caption || '',
    ...(photo.caption ? { caption: photo.caption } : {}),
    uploadedAt: new Date().toISOString(),
  };
}

/** An inline image block for a photo, sized to break out of the text column. */
function imageBlockFor(photo: CapturedPhoto): Block {
  const b = image(photo.id);
  b.placement = { ...DEFAULT_PLACEMENT, width: 'wide' };
  if (photo.caption) {
    b.caption = photo.caption;
    b.alt = photo.caption;
  }
  return b;
}

export interface BlogPayload {
  blocks: Block[];
  media: BlogMedia[];
  cover: BlogCover | null;
}

/**
 * Build the blocks, media pool and cover for a blog post.
 *
 * `coverPhotoId` is whichever photo the user picked as the cover (defaults to the
 * first usable one). Every other usable photo lands inline.
 */
export function buildBlogPayload(
  fields: BlogFields,
  photos: CapturedPhoto[],
  coverPhotoId: string | null,
): BlogPayload {
  const usable = photos.filter(isUsable);
  const media = usable.map(mediaFor);

  const coverId = coverPhotoId && usable.some((p) => p.id === coverPhotoId)
    ? coverPhotoId
    : usable[0]?.id ?? null;
  const cover: BlogCover | null = coverId ? { mediaId: coverId, treatment: 'hero-full' } : null;

  const inline = usable.filter((p) => p.id !== coverId);

  const blocks: Block[] = [];
  let nextPhoto = 0;

  fields.body.forEach((item, i) => {
    // A photo reads best at a section break, so it goes BEFORE a heading rather
    // than after a paragraph — never before the opening item, which would put a
    // picture above the first line of the piece.
    if (item.kind === 'heading' && i > 0 && inline[nextPhoto]) {
      blocks.push(imageBlockFor(inline[nextPhoto]!));
      nextPhoto += 1;
    }
    blocks.push(blockForItem(item));
  });

  // More photos than breaks — the rest go at the end rather than being dropped.
  for (const photo of inline.slice(nextPhoto)) {
    blocks.push(imageBlockFor(photo));
  }

  return { blocks, media, cover };
}

/** Plain text of a blog draft — for the excerpt ✨ and reading-time estimates. */
export function blogPlainText(fields: BlogFields): string {
  return fields.body
    .map((item) => {
      switch (item.kind) {
        case 'list':
          return item.items.map((p) => (p.lead ? `${p.lead}: ${p.text}` : p.text)).join('\n');
        case 'quote':
          return item.attribution ? `"${item.text}" — ${item.attribution}` : `"${item.text}"`;
        default:
          return item.text;
      }
    })
    .filter(Boolean)
    .join('\n\n');
}
