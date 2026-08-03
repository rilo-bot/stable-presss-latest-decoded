/**
 * The Blog content model.
 *
 * Mirrored server-side by `apps/server/src/lib/blog/blocks.ts`, which is the
 * authority — the browser's copy exists so the composer can build and validate
 * blocks without a round-trip, but the server re-validates everything on write.
 * The two files are hand-mirrored, the same arrangement `types/article.ts` and
 * `lib/workflow.ts` already use.
 *
 * Why a separate type from `Article`: an article's entire body is one plain-text
 * `summary` field that `ArticleDetail` splits on blank lines into a fixed
 * drop-cap layout. It has exactly one image and no way to say where it goes.
 * Blogs need an ordered block list, a pool of many images, and per-image
 * placement — a shape the article model cannot express. See
 * docs/BLOG-SYSTEM-PLAN.md §2.
 */
import type { SubscriptionTier } from '@/rbac/entitlement';

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Two states, deliberately. Blogs do NOT use the five-stage article workflow
 * (`lib/workflow.ts`): there is no review queue and no per-move transition
 * table, just a field guarded by `blog.publish`. See BLOG-SYSTEM-PLAN §3.5 —
 * the consequences (no review step, absent from the kanban board) are accepted.
 */
export const BLOG_STATUSES = ['draft', 'published'] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

export function isBlogStatus(v: unknown): v is BlogStatus {
  return typeof v === 'string' && (BLOG_STATUSES as readonly string[]).includes(v);
}

// ── Media pool ──────────────────────────────────────────────────────────────

export const BLOG_MEDIA_KINDS = ['image', 'video', 'file'] as const;
export type BlogMediaKind = (typeof BLOG_MEDIA_KINDS)[number];

/**
 * One asset in a post's own pool.
 *
 * Blocks reference `id`, never `url`. That indirection is what lets the same
 * upload appear in several places, keeps alt/credit edited in exactly one spot,
 * and means deleting an asset can name the blocks that would break. It is also
 * the seam the AI phase needs: an agent picks from a pool and assigns
 * placements, rather than inventing URLs.
 */
export interface BlogMedia {
  id: string;
  url: string;
  /** S3 object key, absent when the dev data-URL fallback was used. */
  key?: string;
  kind: BlogMediaKind;
  filename: string;
  contentType: string;
  width?: number;
  height?: number;
  bytes?: number;
  /** Always present (possibly empty) so the renderer never emits a missing alt. */
  alt: string;
  caption?: string;
  credit?: string;
  uploadedAt: string;
  uploadedByUserId?: string;
}

// ── Placement ───────────────────────────────────────────────────────────────

export const PLACEMENT_WIDTHS = ['inline', 'wide', 'full-bleed'] as const;
export type PlacementWidth = (typeof PLACEMENT_WIDTHS)[number];

export const PLACEMENT_FLOATS = ['none', 'left', 'right'] as const;
export type PlacementFloat = (typeof PLACEMENT_FLOATS)[number];

export const PLACEMENT_FLOAT_WIDTHS = ['1/3', '1/2'] as const;
export type PlacementFloatWidth = (typeof PLACEMENT_FLOAT_WIDTHS)[number];

export const PLACEMENT_ALIGNS = ['left', 'center', 'right'] as const;
export type PlacementAlign = (typeof PLACEMENT_ALIGNS)[number];

export const CAPTION_POSITIONS = ['below', 'overlay', 'side'] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

export const PLACEMENT_ASPECTS = ['original', '16:9', '4:3', '1:1', '3:4'] as const;
export type PlacementAspect = (typeof PLACEMENT_ASPECTS)[number];

/**
 * How a visual block occupies the column. This is the second of the three
 * placement axes — the first is the block's index in `blocks[]` (drag to
 * reorder) and the third is the named slots on the post itself (`cover`,
 * `thumbnailMediaId`, `seo.ogMediaId`).
 *
 * `placement.ts` is the single module that turns this into layout classes, and
 * both the composer canvas and the public page call it — the same "one render
 * path" rule that keeps a published magazine identical to its editor.
 */
export interface Placement {
  width: PlacementWidth;
  float: PlacementFloat;
  /** Only meaningful when `float` is not 'none'. */
  floatWidth?: PlacementFloatWidth;
  align: PlacementAlign;
  captionPosition: CaptionPosition;
  aspect: PlacementAspect;
}

export const DEFAULT_PLACEMENT: Placement = {
  width: 'inline',
  float: 'none',
  align: 'center',
  captionPosition: 'below',
  aspect: 'original',
};

/**
 * A float and a breakout are mutually exclusive — you cannot wrap text around
 * something that spans wider than the text column. The composer hides the
 * combination, and the server normaliser drops the float, but a renderer may
 * still be handed a hand-edited payload, so it asks here.
 */
export function placementFloats(p: Placement): boolean {
  return p.float !== 'none' && p.width === 'inline';
}

// ── Blocks ──────────────────────────────────────────────────────────────────

export const BLOCK_KINDS = [
  'paragraph', 'heading', 'list', 'quote', 'callout', 'divider',
  'image', 'gallery', 'embed', 'horseCard', 'partyCard', 'articleRef', 'code',
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

interface BlockBase {
  id: string;
  kind: BlockKind;
}

/** Inline rich text only — `sanitizeBlogInline` on the server is the allowlist. */
export interface ParagraphBlock extends BlockBase { kind: 'paragraph'; html: string }

export const HEADING_LEVELS = [2, 3, 4] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];
export interface HeadingBlock extends BlockBase { kind: 'heading'; level: HeadingLevel; text: string }

export interface ListBlock extends BlockBase { kind: 'list'; ordered: boolean; items: string[] }

export const QUOTE_STYLES = ['pull', 'block'] as const;
export type QuoteStyle = (typeof QUOTE_STYLES)[number];
export interface QuoteBlock extends BlockBase {
  kind: 'quote';
  html: string;
  attribution?: string;
  style: QuoteStyle;
}

export const CALLOUT_TONES = ['info', 'tip', 'warning'] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];
export interface CalloutBlock extends BlockBase { kind: 'callout'; tone: CalloutTone; html: string }

export const DIVIDER_STYLES = ['rule', 'ornament', 'space'] as const;
export type DividerStyle = (typeof DIVIDER_STYLES)[number];
export interface DividerBlock extends BlockBase { kind: 'divider'; style: DividerStyle }

export interface ImageBlock extends BlockBase {
  kind: 'image';
  mediaId: string;
  placement: Placement;
  /** Per-placement overrides. Absent means "inherit from the pool asset". */
  caption?: string;
  credit?: string;
  alt?: string;
  /** Focal point as 0..1 fractions, for cropping to a forced aspect. */
  focal?: [number, number];
  linkUrl?: string;
}

export const GALLERY_LAYOUTS = ['grid', 'masonry', 'carousel', 'filmstrip'] as const;
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];
export const GALLERY_COLUMNS = [2, 3, 4] as const;
export type GalleryColumns = (typeof GALLERY_COLUMNS)[number];

export interface GalleryItem {
  mediaId: string;
  /** Cells this item spans in a grid layout. Ignored by carousel/filmstrip. */
  span?: 1 | 2;
  caption?: string;
}
export interface GalleryBlock extends BlockBase {
  kind: 'gallery';
  layout: GalleryLayout;
  columns: GalleryColumns;
  items: GalleryItem[];
  placement: Placement;
}

export const EMBED_PROVIDERS = ['youtube', 'vimeo', 'x', 'spotify'] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];
export const EMBED_RATIOS = ['16:9', '1:1', '4:5'] as const;
export type EmbedRatio = (typeof EMBED_RATIOS)[number];
export interface EmbedBlock extends BlockBase {
  kind: 'embed';
  provider: EmbedProvider;
  url: string;
  ratio: EmbedRatio;
}

/** Native cross-links into the platform's own records — this is a racing site. */
export interface HorseCardBlock extends BlockBase { kind: 'horseCard'; horseId: string }
export interface PartyCardBlock extends BlockBase { kind: 'partyCard'; partyId: string }
export interface ArticleRefBlock extends BlockBase { kind: 'articleRef'; articleId: string }

export interface CodeBlock extends BlockBase { kind: 'code'; language?: string; text: string }

export type Block =
  | ParagraphBlock | HeadingBlock | ListBlock | QuoteBlock | CalloutBlock | DividerBlock
  | ImageBlock | GalleryBlock | EmbedBlock
  | HorseCardBlock | PartyCardBlock | ArticleRefBlock | CodeBlock;

/** Blocks that carry a `placement` and draw from the media pool. */
export type VisualBlock = ImageBlock | GalleryBlock;

export function isVisualBlock(b: Block): b is VisualBlock {
  return b.kind === 'image' || b.kind === 'gallery';
}

/** Blocks whose text contributes to the reading-time estimate. */
export function blockText(b: Block): string {
  switch (b.kind) {
    case 'paragraph': return b.html;
    case 'heading': return b.text;
    case 'list': return b.items.join(' ');
    case 'quote': return `${b.html} ${b.attribution ?? ''}`;
    case 'callout': return b.html;
    case 'code': return b.text;
    default: return '';
  }
}

/** Every media id a block references, in order. */
export function blockMediaIds(b: Block): string[] {
  if (b.kind === 'image') return [b.mediaId];
  if (b.kind === 'gallery') return b.items.map((i) => i.mediaId);
  return [];
}

// ── The post ────────────────────────────────────────────────────────────────

export const COVER_TREATMENTS = ['hero-full', 'hero-split', 'inset', 'none'] as const;
export type CoverTreatment = (typeof COVER_TREATMENTS)[number];

export interface BlogCover {
  mediaId: string;
  treatment: CoverTreatment;
  /** Focal point as 0..1 fractions, so a wide hero crop keeps the subject. */
  focal?: [number, number];
}

/** "Blog by" — a display name always, optionally bound to a real Party record. */
export interface BlogAuthor {
  name: string;
  partyId?: string;
  userId?: string;
  avatarUrl?: string;
  bio?: string;
}

export interface BlogSeo {
  metaTitle?: string;
  metaDescription?: string;
  ogMediaId?: string;
  canonicalUrl?: string;
  noindex?: boolean;
}

export interface Blog {
  id: string;
  slug: string;
  /** Previous slugs, so an old link still resolves after a rename. */
  slugHistory: string[];
  /**
   * Set once someone chooses a slug deliberately. Until then an unpublished
   * post's slug follows its title — otherwise a post created as "Untitled post"
   * keeps that slug forever and every draft lands on /blog/untitled-post-N.
   */
  slugLocked?: boolean;

  title: string;
  subtitle?: string;
  /** Hand-written, or derived from the first paragraph on save when left blank. */
  excerpt?: string;

  author: BlogAuthor;
  coAuthors?: BlogAuthor[];

  blocks: Block[];
  media: BlogMedia[];

  cover?: BlogCover;
  /** Card image on /blog and in shares. Falls back to the cover. */
  thumbnailMediaId?: string;

  category?: string;
  tags: string[];
  linkedHorseIds: string[];
  linkedPartyIds: string[];

  status: BlogStatus;
  publishedAt?: string | null;
  /** P5 — future-dated publish, resolved at read time. Absent in v1. */
  publishAt?: string | null;

  seo: BlogSeo;
  minTier?: SubscriptionTier;
  /** Computed server-side from the blocks on every save, never typed by hand. */
  readingTime: number;

  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
}

/**
 * The projection the list endpoint returns — cards need none of the body, and
 * shipping `blocks` + `media` for every post is what makes an index page slow.
 */
export interface BlogSummary {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt?: string;
  author: BlogAuthor;
  category?: string;
  tags: string[];
  status: BlogStatus;
  publishedAt?: string | null;
  readingTime: number;
  updatedAt: string;
  /** Resolved server-side from thumbnailMediaId ?? cover.mediaId. */
  thumbnailUrl?: string;
  thumbnailAlt?: string;
}

// ── Read helpers ────────────────────────────────────────────────────────────

/**
 * Is this post visible to the public? One place answers the question, mirroring
 * `isLive` in types/article.ts.
 *
 * `publishAt` is honoured here rather than by a timer: nothing in this codebase
 * ever flips a scheduled record to live (articles have had that hole since the
 * status was added), so a future-dated post becomes live by being *read* after
 * its date, which needs no moving parts. See BLOG-SYSTEM-PLAN §7.1.
 */
export function isBlogLive(
  blog: Pick<Blog, 'status' | 'publishAt'>,
  now: Date = new Date(),
): boolean {
  if (blog.status !== 'published') return false;
  if (blog.publishAt) return new Date(blog.publishAt).getTime() <= now.getTime();
  return true;
}

/** Look an asset up in the post's pool. */
export function mediaById(blog: Pick<Blog, 'media'>, id: string | undefined): BlogMedia | undefined {
  if (!id) return undefined;
  return blog.media.find((m) => m.id === id);
}

/** The asset a card should show: explicit thumbnail, else the cover. */
export function thumbnailOf(blog: Pick<Blog, 'media' | 'thumbnailMediaId' | 'cover'>): BlogMedia | undefined {
  return mediaById(blog, blog.thumbnailMediaId) ?? mediaById(blog, blog.cover?.mediaId);
}

/** Which blocks reference a given asset — powers the "still in use" delete guard. */
export function blocksUsingMedia(blocks: Block[], mediaId: string): Block[] {
  return blocks.filter((b) => blockMediaIds(b).includes(mediaId));
}
