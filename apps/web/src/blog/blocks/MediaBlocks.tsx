/**
 * Visual block renderers: image, gallery, embed.
 *
 * These are the blocks that carry a Placement, and every layout decision they
 * make comes from `placement.ts` — the same module the composer calls. Nothing
 * here computes its own geometry, so "what I placed" and "what a reader sees"
 * cannot drift apart.
 */
import { cn } from '@/lib/utils';
import { aspectClass, focalStyle, resolvePlacement } from '@/blog/placement';
import type { EmbedBlock, GalleryBlock, ImageBlock, BlogMedia } from '@/types/blog';
import { ImageOff } from 'lucide-react';

/** Look an asset up in the post's pool. */
export type MediaLookup = (id: string) => BlogMedia | undefined;

/**
 * A caption + credit line. Rendered as a real <figcaption> so the association
 * with the image is in the markup, not just visually implied.
 */
function Caption({
  caption,
  credit,
  overlay,
  className,
}: {
  caption?: string;
  credit?: string;
  overlay?: boolean;
  className?: string;
}) {
  if (!caption && !credit) return null;
  return (
    <figcaption
      className={cn(
        'text-xs leading-relaxed',
        overlay
          ? 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-3 pt-8 text-white'
          : 'mt-2 text-muted-foreground',
        className,
      )}
    >
      {caption}
      {/* The credit sits on its OWN line below the caption rather than trailing
          it inline. Inline, a photographer's name wraps mid-phrase and reads as
          part of the sentence — "Floated left, square crop. Stable Press". */}
      {credit && (
        <span
          className={cn(
            'mt-0.5 block text-[10px] uppercase tracking-[0.08em]',
            overlay ? 'text-white/70' : 'text-muted-foreground/70',
          )}
        >
          {credit}
        </span>
      )}
    </figcaption>
  );
}

/** Shown when a block points at an asset the pool no longer has. */
function MissingAsset({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border/60 bg-muted/20 py-10 text-muted-foreground">
      <ImageOff size={20} aria-hidden="true" />
      <p className="text-xs italic">{label}</p>
    </div>
  );
}

export function ImageBlockView({ block, lookup }: { block: ImageBlock; lookup: MediaLookup }) {
  const media = lookup(block.mediaId);
  const p = resolvePlacement(block.placement);

  // The server drops dangling references on write, so this only shows for a
  // payload that reached the renderer another way — a stale local draft, say.
  // Better a labelled gap than an invisible one.
  if (!media) return <MissingAsset label="This image is no longer available." />;

  // Block-level overrides win; otherwise inherit from the pool asset, which is
  // the point of storing alt/credit once per asset rather than per placement.
  const alt = block.alt ?? media.alt ?? '';
  const caption = block.caption ?? media.caption;
  const credit = block.credit ?? media.credit;
  const overlay = p.captionPosition === 'overlay';
  const aspect = aspectClass(block.placement);

  const image = (
    <img
      src={media.url}
      alt={alt}
      // Matches the crossOrigin already used on article/horse imagery, so a
      // private-bucket asset served through /api/uploads/file loads the same way.
      crossOrigin="anonymous"
      loading="lazy"
      decoding="async"
      width={media.width}
      height={media.height}
      className={cn('w-full', aspect ? 'h-full object-cover' : 'h-auto')}
      style={focalStyle(block.placement, block.focal)}
    />
  );

  // 'side' puts the caption in a column beside the image; only sensible when
  // there is room, so it collapses to below on narrow screens.
  const sideCaption = p.captionPosition === 'side' && !p.floating;

  return (
    <figure className={cn('my-6', p.floatClass, !p.floating && p.alignClass, sideCaption && 'sm:flex sm:gap-5')}>
      <div className={cn('relative overflow-hidden rounded-sm', aspect, sideCaption && 'sm:flex-1')}>
        {block.linkUrl ? (
          <a href={block.linkUrl} target="_blank" rel="nofollow noopener noreferrer">
            {image}
          </a>
        ) : (
          image
        )}
        {overlay && <Caption caption={caption} credit={credit} overlay />}
      </div>
      {!overlay && <Caption caption={caption} credit={credit} className={cn(sideCaption && 'sm:mt-0 sm:w-40 sm:flex-shrink-0')} />}
    </figure>
  );
}

/** Column count → class. Literal strings, so Tailwind can see them. */
const GALLERY_COLS = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
} as const;

export function GalleryBlockView({ block, lookup }: { block: GalleryBlock; lookup: MediaLookup }) {
  const p = resolvePlacement(block.placement);
  const resolved = block.items
    .map((item) => ({ item, media: lookup(item.mediaId) }))
    .filter((r): r is { item: (typeof block.items)[number]; media: BlogMedia } => !!r.media);

  if (resolved.length === 0) return <MissingAsset label="This gallery has no available images." />;

  // Carousel and filmstrip are both horizontal scrollers; they differ in item
  // size. Snap points make the carousel behave on touch without a JS library.
  if (block.layout === 'carousel' || block.layout === 'filmstrip') {
    const itemWidth = block.layout === 'carousel' ? 'w-[85%] sm:w-[60%]' : 'w-40';
    return (
      <figure className={cn('my-6', p.floatClass, !p.floating && p.alignClass)}>
        {/* `items-start` matters: the default `stretch` made every item as tall
            as the tallest, and because `overflow-x: auto` forces the y-axis to
            compute as `auto` too, anything past that height — the captions —
            was silently clipped out of view. */}
        <div className="slim-scroll flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2">
          {resolved.map(({ item, media }, i) => (
            <div key={`${item.mediaId}-${i}`} className={cn('flex-shrink-0 snap-start', itemWidth)}>
              <img
                src={media.url}
                alt={media.alt}
                crossOrigin="anonymous"
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full rounded-sm object-cover"
              />
              {item.caption && <p className="mt-1.5 text-xs text-muted-foreground">{item.caption}</p>}
            </div>
          ))}
        </div>
      </figure>
    );
  }

  // Masonry via CSS columns — items flow into balanced columns and keep their
  // natural aspect, which a grid cannot do without fixed row heights.
  if (block.layout === 'masonry') {
    const cols = block.columns === 2 ? 'sm:columns-2' : block.columns === 4 ? 'sm:columns-4' : 'sm:columns-3';
    return (
      <figure className={cn('my-6', p.floatClass, !p.floating && p.alignClass)}>
        <div className={cn('columns-1 gap-3', cols)}>
          {resolved.map(({ item, media }, i) => (
            // break-inside-avoid stops a column break splitting an image from
            // its caption.
            <div key={`${item.mediaId}-${i}`} className="mb-3 break-inside-avoid">
              <img
                src={media.url}
                alt={media.alt}
                crossOrigin="anonymous"
                loading="lazy"
                decoding="async"
                className="w-full rounded-sm"
              />
              {item.caption && <p className="mt-1.5 text-xs text-muted-foreground">{item.caption}</p>}
            </div>
          ))}
        </div>
      </figure>
    );
  }

  // Grid — uniform cells, an item may span two columns.
  return (
    <figure className={cn('my-6', p.floatClass, !p.floating && p.alignClass)}>
      <div className={cn('grid gap-3', GALLERY_COLS[block.columns] ?? GALLERY_COLS[3])}>
        {resolved.map(({ item, media }, i) => (
          <div key={`${item.mediaId}-${i}`} className={cn(item.span === 2 && 'col-span-2')}>
            <img
              src={media.url}
              alt={media.alt}
              crossOrigin="anonymous"
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] w-full rounded-sm object-cover"
            />
            {item.caption && <p className="mt-1.5 text-xs text-muted-foreground">{item.caption}</p>}
          </div>
        ))}
      </div>
    </figure>
  );
}

const EMBED_RATIO = { '16:9': 'aspect-[16/9]', '1:1': 'aspect-square', '4:5': 'aspect-[4/5]' } as const;

/**
 * Turn a provider watch/share URL into its embeddable form.
 *
 * Returns null when the URL isn't one this provider can embed, so the block
 * degrades to a plain link rather than dropping an iframe pointed at an
 * arbitrary page.
 */
function embedSrc(block: EmbedBlock): string | null {
  let url: URL;
  try {
    url = new URL(block.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  switch (block.provider) {
    case 'youtube': {
      const host = url.hostname.replace(/^www\./, '');
      const id =
        host === 'youtu.be'
          ? url.pathname.slice(1)
          : url.searchParams.get('v') ?? (url.pathname.startsWith('/embed/') ? url.pathname.slice(7) : '');
      return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    case 'vimeo': {
      const id = url.pathname.split('/').filter(Boolean).pop() ?? '';
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    case 'spotify': {
      // open.spotify.com/track/ID → open.spotify.com/embed/track/ID
      const parts = url.pathname.split('/').filter(Boolean);
      if (!url.hostname.endsWith('spotify.com') || parts.length < 2) return null;
      return `https://open.spotify.com/embed/${parts.join('/')}`;
    }
    default:
      // X/Twitter has no script-free iframe embed; fall through to a link.
      return null;
  }
}

export function EmbedBlockView({ block }: { block: EmbedBlock }) {
  const src = embedSrc(block);

  if (!src) {
    return (
      <p className="my-6 text-sm">
        <a
          href={block.url}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:opacity-80"
        >
          {block.url}
        </a>
      </p>
    );
  }

  return (
    <div className={cn('my-6 overflow-hidden rounded-sm border border-border/60', EMBED_RATIO[block.ratio])}>
      <iframe
        src={src}
        title={`${block.provider} embed`}
        loading="lazy"
        // No allow-same-origin: the frame must not reach back into this origin.
        sandbox="allow-scripts allow-presentation allow-popups allow-popups-to-escape-sandbox"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full border-0"
      />
    </div>
  );
}
