/**
 * Block factories — every new block in the composer is minted here.
 *
 * Defaults matter more than they look. The server normaliser clamps anything
 * out of range, so a factory that omitted `placement` would have it silently
 * filled in on save and the composer's preview would disagree with the stored
 * post until the next reload. Creating blocks fully-formed keeps the two in step.
 */
import { DEFAULT_PLACEMENT } from '@/types/blog';
import type {
  Block,
  BlockKind,
  CalloutBlock,
  CodeBlock,
  DividerBlock,
  GalleryBlock,
  HeadingBlock,
  ImageBlock,
  ListBlock,
  ParagraphBlock,
  QuoteBlock,
  EmbedBlock,
  HorseCardBlock,
  PartyCardBlock,
  ArticleRefBlock,
} from '@/types/blog';

/**
 * `crypto.randomUUID` needs a secure context. Vite dev over plain http on a LAN
 * address is not one, so fall back rather than throwing on someone's phone.
 */
export function newBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function paragraph(html = ''): ParagraphBlock {
  return { id: newBlockId(), kind: 'paragraph', html };
}
export function heading(level: 2 | 3 | 4 = 2, text = ''): HeadingBlock {
  return { id: newBlockId(), kind: 'heading', level, text };
}
export function list(ordered = false): ListBlock {
  return { id: newBlockId(), kind: 'list', ordered, items: [''] };
}
export function quote(): QuoteBlock {
  return { id: newBlockId(), kind: 'quote', html: '', style: 'pull' };
}
export function callout(): CalloutBlock {
  return { id: newBlockId(), kind: 'callout', tone: 'info', html: '' };
}
export function divider(): DividerBlock {
  return { id: newBlockId(), kind: 'divider', style: 'rule' };
}
export function code(): CodeBlock {
  return { id: newBlockId(), kind: 'code', text: '' };
}
export function image(mediaId: string): ImageBlock {
  return { id: newBlockId(), kind: 'image', mediaId, placement: { ...DEFAULT_PLACEMENT } };
}
export function gallery(mediaIds: string[] = []): GalleryBlock {
  return {
    id: newBlockId(),
    kind: 'gallery',
    layout: 'grid',
    columns: 3,
    items: mediaIds.map((mediaId) => ({ mediaId })),
    placement: { ...DEFAULT_PLACEMENT, width: 'wide' },
  };
}
export function embed(url = ''): EmbedBlock {
  return { id: newBlockId(), kind: 'embed', provider: 'youtube', url, ratio: '16:9' };
}
export function horseCard(horseId = ''): HorseCardBlock {
  return { id: newBlockId(), kind: 'horseCard', horseId };
}
export function partyCard(partyId = ''): PartyCardBlock {
  return { id: newBlockId(), kind: 'partyCard', partyId };
}
export function articleRef(articleId = ''): ArticleRefBlock {
  return { id: newBlockId(), kind: 'articleRef', articleId };
}

/**
 * Kinds the "insert block" menu offers, in menu order.
 *
 * `image` and `gallery` are absent on purpose: they need a media id, so they are
 * created by picking from the media tray rather than from this list. Offering an
 * empty image block would produce a block the validator drops on save.
 */
export const INSERTABLE_KINDS: Array<{
  kind: BlockKind;
  label: string;
  hint: string;
  make: () => Block;
}> = [
  { kind: 'paragraph', label: 'Paragraph', hint: 'Body copy', make: () => paragraph() },
  { kind: 'heading', label: 'Heading', hint: 'Section title', make: () => heading(2) },
  { kind: 'list', label: 'List', hint: 'Bulleted or numbered', make: () => list(false) },
  { kind: 'quote', label: 'Quote', hint: 'Pull quote or blockquote', make: () => quote() },
  { kind: 'callout', label: 'Callout', hint: 'Note, tip or warning', make: () => callout() },
  { kind: 'divider', label: 'Divider', hint: 'Rule, ornament or space', make: () => divider() },
  { kind: 'embed', label: 'Embed', hint: 'YouTube, Vimeo, Spotify', make: () => embed() },
  { kind: 'horseCard', label: 'Horse card', hint: 'Link a horse record', make: () => horseCard() },
  { kind: 'partyCard', label: 'Profile card', hint: 'Link a person', make: () => partyCard() },
  { kind: 'articleRef', label: 'Story link', hint: 'Link a news story', make: () => articleRef() },
  { kind: 'code', label: 'Code', hint: 'Preformatted text', make: () => code() },
];

/** Human label for a block, for the outline and the inspector header. */
export function blockLabel(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
      return 'Paragraph';
    case 'heading':
      return `Heading ${block.level}`;
    case 'list':
      return block.ordered ? 'Numbered list' : 'Bulleted list';
    case 'quote':
      return block.style === 'pull' ? 'Pull quote' : 'Blockquote';
    case 'callout':
      return `Callout · ${block.tone}`;
    case 'divider':
      return 'Divider';
    case 'image':
      return 'Image';
    case 'gallery':
      return `Gallery · ${block.layout}`;
    case 'embed':
      return `Embed · ${block.provider}`;
    case 'horseCard':
      return 'Horse card';
    case 'partyCard':
      return 'Profile card';
    case 'articleRef':
      return 'Story link';
    case 'code':
      return 'Code';
    default:
      return 'Block';
  }
}

/**
 * A deep-enough copy for duplication, with fresh ids.
 *
 * Nested arrays are rebuilt rather than shared — a shallow spread would leave a
 * duplicated gallery sharing its `items` array with the original, so editing one
 * would silently edit both.
 */
export function duplicateBlock(block: Block): Block {
  const copy = { ...block, id: newBlockId() } as Block;
  if (copy.kind === 'gallery') {
    copy.items = copy.items.map((i) => ({ ...i }));
    copy.placement = { ...copy.placement };
  }
  if (copy.kind === 'image') {
    copy.placement = { ...copy.placement };
    if (copy.focal) copy.focal = [...copy.focal] as [number, number];
  }
  if (copy.kind === 'list') copy.items = [...copy.items];
  return copy;
}
