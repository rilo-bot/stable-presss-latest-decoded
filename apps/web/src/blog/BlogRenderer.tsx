/**
 * THE blog render path.
 *
 * Used by the public post page and (in P3) by the composer canvas, so a post in
 * the editor and the same post as a reader sees it come out of one component.
 * The magazine builder keeps that guarantee by rendering the editor host and
 * the published issue through one path; blogs follow the same rule.
 *
 * ── Why blocks are grouped before rendering ──
 *
 * A floated image only wraps text that shares its block-formatting context. If
 * every block were its own grid child, a float would have nothing to wrap: the
 * next paragraph would be a sibling grid item and simply sit below it. So
 * consecutive in-column blocks are collected into one flow container, and only
 * blocks that break out of the measure (`wide`, `full-bleed`) become their own
 * grid children. That is also what makes a breakout end the wrap — which is the
 * behaviour you want, since a full-bleed image mid-wrap would look like a bug.
 */
import { Fragment, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { BLOG_GRID_CLASS, resolvePlacement, spanClass } from '@/blog/placement';
import type { Block, Blog, BlogMedia } from '@/types/blog';
import { isVisualBlock } from '@/types/blog';

import {
  CalloutBlockView,
  CodeBlockView,
  DividerBlockView,
  HeadingBlockView,
  ListBlockView,
  ParagraphBlockView,
  QuoteBlockView,
} from './blocks/TextBlocks';
import { EmbedBlockView, GalleryBlockView, ImageBlockView, type MediaLookup } from './blocks/MediaBlocks';
import { ArticleRefBlockView, HorseCardBlockView, PartyCardBlockView } from './blocks/RefBlocks';

// ── Grouping ────────────────────────────────────────────────────────────────

type Segment =
  /** Consecutive in-column blocks sharing one formatting context (floats wrap here). */
  | { kind: 'flow'; blocks: Block[] }
  /** A single block that breaks out of the reading measure. */
  | { kind: 'break'; block: Block; span: 'wide' | 'full' };

/** Does this block escape the text column? */
function breakoutSpan(block: Block): 'wide' | 'full' | null {
  if (!isVisualBlock(block)) return null;
  const p = resolvePlacement(block.placement);
  if (p.floating) return null; // a float stays in the flow, whatever its width says
  return p.span === 'wide' ? 'wide' : p.span === 'full' ? 'full' : null;
}

export function groupBlocks(blocks: Block[]): Segment[] {
  const segments: Segment[] = [];
  let flow: Block[] = [];

  const flushFlow = () => {
    if (flow.length) {
      segments.push({ kind: 'flow', blocks: flow });
      flow = [];
    }
  };

  for (const block of blocks) {
    const span = breakoutSpan(block);
    if (span) {
      flushFlow();
      segments.push({ kind: 'break', block, span });
    } else {
      flow.push(block);
    }
  }
  flushFlow();
  return segments;
}

// ── Block dispatch ──────────────────────────────────────────────────────────

interface BlockViewProps {
  block: Block;
  lookup: MediaLookup;
  /** True only for the very first paragraph of the post. */
  dropCap?: boolean;
}

function BlockView({ block, lookup, dropCap }: BlockViewProps) {
  switch (block.kind) {
    case 'paragraph':
      return <ParagraphBlockView block={block} dropCap={dropCap} />;
    case 'heading':
      return <HeadingBlockView block={block} />;
    case 'list':
      return <ListBlockView block={block} />;
    case 'quote':
      return <QuoteBlockView block={block} />;
    case 'callout':
      return <CalloutBlockView block={block} />;
    case 'divider':
      return <DividerBlockView block={block} />;
    case 'code':
      return <CodeBlockView block={block} />;
    case 'image':
      return <ImageBlockView block={block} lookup={lookup} />;
    case 'gallery':
      return <GalleryBlockView block={block} lookup={lookup} />;
    case 'embed':
      return <EmbedBlockView block={block} />;
    case 'horseCard':
      return <HorseCardBlockView horseId={block.horseId} />;
    case 'partyCard':
      return <PartyCardBlockView partyId={block.partyId} />;
    case 'articleRef':
      return <ArticleRefBlockView articleId={block.articleId} />;
    default:
      // The union is exhaustive; a payload from an older or newer client could
      // still carry a kind this build doesn't know. Render nothing rather than
      // throwing and taking the whole post down.
      return null;
  }
}

// ── Renderer ────────────────────────────────────────────────────────────────

export interface BlogRendererProps {
  blocks: Block[];
  media: BlogMedia[];
  /**
   * Wrap each block so the composer can attach selection handles. Given the
   * block and its rendered output; must return an element. Absent on the
   * public page, which renders the output directly.
   */
  wrapBlock?: (block: Block, rendered: React.ReactNode, index: number) => React.ReactNode;
  className?: string;
  /** Drop cap on the opening paragraph. On by default; off in the composer. */
  dropCap?: boolean;
}

export function BlogRenderer({ blocks, media, wrapBlock, className, dropCap = true }: BlogRendererProps) {
  // Map once per render rather than scanning the pool for every image block —
  // a gallery-heavy post would otherwise be quadratic in pool size.
  const lookup = useMemo<MediaLookup>(() => {
    const byId = new Map(media.map((m) => [m.id, m]));
    return (id: string) => byId.get(id);
  }, [media]);

  const segments = useMemo(() => groupBlocks(blocks), [blocks]);

  // Index of the first paragraph, so the drop cap lands on the opening prose
  // and not on a paragraph that happens to follow a pull quote.
  const firstParagraphId = useMemo(() => blocks.find((b) => b.kind === 'paragraph')?.id, [blocks]);

  let flatIndex = 0;

  return (
    <div className={cn(BLOG_GRID_CLASS, 'gap-y-1', className)}>
      {segments.map((segment, si) => {
        if (segment.kind === 'break') {
          const index = flatIndex++;
          const rendered = <BlockView block={segment.block} lookup={lookup} />;
          return (
            <div key={segment.block.id} className={spanClass(segment.span)}>
              {wrapBlock ? wrapBlock(segment.block, rendered, index) : rendered}
            </div>
          );
        }

        return (
          <div key={`flow-${si}`} className={cn(spanClass('text'), 'blog-flow')}>
            {segment.blocks.map((block) => {
              const index = flatIndex++;
              const rendered = (
                <BlockView
                  block={block}
                  lookup={lookup}
                  dropCap={dropCap && block.id === firstParagraphId}
                />
              );
              return (
                <Fragment key={block.id}>
                  {wrapBlock ? wrapBlock(block, rendered, index) : rendered}
                </Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Convenience wrapper for a whole post document. */
export function BlogBody({ blog, className }: { blog: Blog; className?: string }) {
  return <BlogRenderer blocks={blog.blocks} media={blog.media} className={className} />;
}
