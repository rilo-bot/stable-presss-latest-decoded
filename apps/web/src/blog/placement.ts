/**
 * Placement → layout. The single module that decides how a visual block sits on
 * the page, called by BOTH the public post and the composer canvas.
 *
 * That shared call is the point. The magazine builder keeps a published issue
 * pixel-identical to its editor by rendering through one path, and the same
 * rule applies here: if the composer computed its own preview layout, "what I
 * placed" and "what readers see" would drift the first time either side was
 * touched. Everything visual about a Placement is decided here and nowhere else.
 *
 * The content column is a fixed measure (~68ch) for readability. `wide` and
 * `full-bleed` escape it, which is why the post body uses a CSS grid with named
 * columns rather than a plain max-width wrapper — a nested element cannot break
 * out of a parent's max-width without negative-margin hacks that misbehave at
 * every breakpoint.
 */
import type { Placement } from '@/types/blog';

/**
 * Grid column a block occupies. The post body defines these three tracks; a
 * block just names one.
 *
 *   full  ─────────────────────────────────  edge to edge
 *   wide    ───────────────────────────      past the text, inside the page
 *   text        ───────────────────          the reading measure
 */
export type GridSpan = 'text' | 'wide' | 'full';

export function gridSpanFor(p: Placement): GridSpan {
  switch (p.width) {
    case 'full-bleed':
      return 'full';
    case 'wide':
      return 'wide';
    default:
      return 'text';
  }
}

/**
 * The grid-column class for a span. These, and the `.blog-grid` tracks they
 * name, are defined together in index.css — Tailwind only emits classes it can
 * read as complete literals in the source, so a grid this shape cannot be
 * expressed as an assembled arbitrary value.
 */
export function spanClass(span: GridSpan): string {
  switch (span) {
    case 'full':
      return 'blog-span-full';
    case 'wide':
      return 'blog-span-wide';
    default:
      return 'blog-span-text';
  }
}

/** The class that establishes the three-track body grid (see index.css). */
export const BLOG_GRID_CLASS = 'blog-grid';

/**
 * Is this block floated, with text wrapping around it?
 *
 * Only an `inline`-width block can float — you cannot wrap text around
 * something wider than the column it flows in. The server normaliser already
 * drops that combination, but the renderer must not assume it was reached
 * through the API.
 */
export function isFloating(p: Placement): boolean {
  return p.float !== 'none' && p.width === 'inline';
}

/**
 * Float + width classes for a floated block.
 *
 * `blog-float` is the responsive escape hatch: below 640px there is no room to
 * wrap text beside an image, so index.css unsets the float entirely rather than
 * leaving an unreadable ribbon of text down one side.
 */
export function floatClass(p: Placement): string {
  if (!isFloating(p)) return '';
  const width = p.floatWidth === '1/3' ? 'w-1/3' : 'w-1/2';
  // Bottom margin as well as side margin, or the following paragraph's first
  // line sits flush against the caption.
  return p.float === 'left'
    ? `blog-float float-left ${width} mr-6 mb-4 clear-left`
    : `blog-float float-right ${width} ml-6 mb-4 clear-right`;
}

/** Horizontal alignment for a block narrower than its column. */
export function alignClass(p: Placement): string {
  if (isFloating(p)) return '';
  switch (p.align) {
    case 'left':
      return 'mr-auto';
    case 'right':
      return 'ml-auto';
    default:
      return 'mx-auto';
  }
}

/**
 * The aspect-ratio class, or '' for the image's natural shape.
 *
 * Returned as whole class strings rather than built by interpolation —
 * Tailwind scans source text, so `aspect-[${x}]` would never be emitted.
 */
export function aspectClass(p: Placement): string {
  switch (p.aspect) {
    case '16:9':
      return 'aspect-[16/9]';
    case '4:3':
      return 'aspect-[4/3]';
    case '1:1':
      return 'aspect-square';
    case '3:4':
      return 'aspect-[3/4]';
    default:
      return '';
  }
}

/**
 * `object-position` for a forced crop, from the block's focal point.
 *
 * Only meaningful when an aspect is forced — otherwise nothing is being cropped
 * and the value has no effect. Defaults to centre.
 */
export function focalStyle(
  p: Placement,
  focal: [number, number] | undefined,
): { objectPosition?: string } {
  if (p.aspect === 'original' || !focal) return {};
  const [x, y] = focal;
  return { objectPosition: `${Math.round(x * 100)}% ${Math.round(y * 100)}%` };
}

/** Everything a visual block needs, resolved in one call. */
export interface ResolvedPlacement {
  span: GridSpan;
  spanClass: string;
  floatClass: string;
  alignClass: string;
  aspectClass: string;
  floating: boolean;
  captionPosition: Placement['captionPosition'];
}

/**
 * Resolve a Placement once per block.
 *
 * A floated block is NOT a grid child — it sits inside the text flow so the
 * paragraphs after it can wrap. Its span is therefore always `text`, whatever
 * the width says.
 */
export function resolvePlacement(p: Placement): ResolvedPlacement {
  const floating = isFloating(p);
  const span: GridSpan = floating ? 'text' : gridSpanFor(p);
  return {
    span,
    spanClass: spanClass(span),
    floatClass: floatClass(p),
    alignClass: alignClass(p),
    aspectClass: aspectClass(p),
    floating,
    captionPosition: p.captionPosition,
  };
}

/**
 * Human label for a placement, for the composer's inspector and for the
 * accessible description on the public page.
 */
export function describePlacement(p: Placement): string {
  const parts: string[] = [];
  if (p.width === 'full-bleed') parts.push('Full bleed');
  else if (p.width === 'wide') parts.push('Wide');
  else parts.push('In column');
  if (isFloating(p)) {
    // Phrased by where the IMAGE sits and which way the text runs, matching the
    // inspector's own button labels — "wrapped left" alongside a button reading
    // "Wrap right" looked like one of the two was wrong.
    const side = p.float === 'left' ? 'left' : 'right';
    const textSide = p.float === 'left' ? 'right' : 'left';
    parts.push(`image ${side} at ${p.floatWidth ?? '1/2'}, text down the ${textSide}`);
  }
  if (p.aspect !== 'original') parts.push(p.aspect);
  return parts.join(' · ');
}
