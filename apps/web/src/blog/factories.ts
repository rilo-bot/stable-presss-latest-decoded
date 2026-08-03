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

/* ── Converting between text kinds ──────────────────────────────────────────
 *
 * The body toolbar's H2 / H3 / ¶ / list / quote buttons RETYPE the block under
 * the caret rather than inserting a new one — that is what those buttons do in
 * every editor people already know. Text has to survive the change, and the
 * `id` has to survive it too: it keys the React tree and holds the selection,
 * so minting a fresh one would tear down the field mid-edit and drop the caret.
 */

/** The text of a text-family block, as one string. Empty for everything else. */
export function blockText(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
    case 'quote':
    case 'callout':
      return block.html;
    case 'heading':
      return block.text;
    case 'code':
      return block.text;
    // Items join with a space rather than a newline: the target is usually a
    // paragraph, where a newline would be invisible anyway.
    case 'list':
      return block.items.filter(Boolean).join(' ');
    default:
      return '';
  }
}

/** Strip tags — for the kinds that store plain text (heading, code). */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** Kinds `convertBlock` can move between. */
export const TEXT_KINDS = new Set<BlockKind>([
  'paragraph',
  'heading',
  'list',
  'quote',
  'callout',
  'code',
]);

/**
 * Kinds whose text is stored as HTML, so inline marks (bold, italic, a link)
 * mean something. `heading` and `code` store plain text — the sanitiser would
 * strip any markup on save, so the toolbar greys those buttons out instead of
 * letting someone apply formatting that silently disappears.
 */
export const RICH_TEXT_KINDS = new Set<BlockKind>(['paragraph', 'quote', 'callout', 'list']);

export type TextKindTarget =
  | { kind: 'paragraph' }
  | { kind: 'heading'; level: 2 | 3 | 4 }
  | { kind: 'list'; ordered: boolean }
  | { kind: 'quote' }
  | { kind: 'callout' }
  | { kind: 'code' };

/**
 * Retype a text block, carrying its text across and KEEPING its id.
 *
 * Returns the block unchanged when it isn't a text kind (an image has no text
 * to reinterpret), so the caller can hand any block over without checking.
 */
export function convertBlock(block: Block, to: TextKindTarget): Block {
  const text = blockText(block);
  if (!TEXT_KINDS.has(block.kind)) return block;

  switch (to.kind) {
    case 'paragraph':
      return { id: block.id, kind: 'paragraph', html: text };
    case 'heading':
      return { id: block.id, kind: 'heading', level: to.level, text: stripTags(text) };
    case 'list':
      return { id: block.id, kind: 'list', ordered: to.ordered, items: [text] };
    case 'quote':
      return { id: block.id, kind: 'quote', html: text, style: 'pull' };
    case 'callout':
      return { id: block.id, kind: 'callout', tone: 'info', html: text };
    case 'code':
      return { id: block.id, kind: 'code', text: stripTags(text) };
  }
}

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
