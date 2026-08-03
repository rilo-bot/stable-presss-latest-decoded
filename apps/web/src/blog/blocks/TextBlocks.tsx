/**
 * Text-family block renderers: paragraph, heading, list, quote, callout,
 * divider, code.
 *
 * Every one of these renders inside the reading measure, so none of them
 * consult Placement — that is only carried by the visual blocks.
 *
 * All rich text goes through `sanitizeBlogHtml` at RENDER time, not just on
 * write. The server sanitizes on the way in, but a payload can reach this
 * component from a cache, a draft in local state, or a future import path, and
 * `dangerouslySetInnerHTML` is not the place to assume provenance.
 */
import { cn } from '@/lib/utils';
import { sanitizeBlogHtml } from '@/blog/sanitize';
import type {
  CalloutBlock,
  CodeBlock,
  DividerBlock,
  HeadingBlock,
  ListBlock,
  ParagraphBlock,
  QuoteBlock,
} from '@/types/blog';
import { Info, Lightbulb, TriangleAlert } from 'lucide-react';

/** Shared inline-HTML renderer, so the sanitize call has exactly one site. */
function RichText({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(html) }} />;
}

/**
 * Vertical rhythm lives on the blocks themselves, not as a `space-y-*` on the
 * flow container. `space-y` sets margin on adjacent siblings, which a floated
 * figure between two paragraphs breaks — and margin-collapsing round floats is
 * exactly where that goes wrong. Explicit margins are predictable here.
 */
export function ParagraphBlockView({ block, dropCap }: { block: ParagraphBlock; dropCap?: boolean }) {
  return (
    <p
      className={cn(
        'mb-5 text-base text-foreground/85 leading-relaxed last:mb-0',
        // The first paragraph of a post gets the drop cap, matching the
        // treatment ArticleDetail already gives a story's opening.
        dropCap && 'blog-dropcap',
      )}
      style={{ lineHeight: 1.78 }}
    >
      <RichText html={block.html} />
    </p>
  );
}

/** Level → tag. A lookup, not a template literal: `h${n}` widens to `string`. */
const HEADING_TAGS = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

export function HeadingBlockView({ block }: { block: HeadingBlock }) {
  const Tag = HEADING_TAGS[block.level] ?? 'h2';
  const size =
    block.level === 2 ? 'text-2xl md:text-3xl' : block.level === 3 ? 'text-xl md:text-2xl' : 'text-lg md:text-xl';
  return (
    <Tag
      className={cn(
        'font-[family-name:var(--font-display)] font-bold leading-tight text-foreground',
        'mt-10 mb-1 first:mt-0',
        size,
      )}
      // Anchor target, so a heading can be deep-linked from a table of contents.
      id={block.id}
    >
      {block.text}
    </Tag>
  );
}

export function ListBlockView({ block }: { block: ListBlock }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={cn(
        'mb-5 space-y-2 pl-6 text-base leading-relaxed text-foreground/85 last:mb-0',
        block.ordered ? 'list-decimal' : 'list-disc',
      )}
      style={{ lineHeight: 1.78 }}
    >
      {block.items.map((item, i) => (
        <li key={i} className="pl-1">
          <RichText html={item} />
        </li>
      ))}
    </Tag>
  );
}

export function QuoteBlockView({ block }: { block: QuoteBlock }) {
  // 'pull' is the display treatment used for a standout line; 'block' is a
  // conventional indented quotation.
  if (block.style === 'pull') {
    return (
      <figure className="my-8 pl-5 border-l-[3px] py-2" style={{ borderColor: 'hsl(var(--brand-accent))' }}>
        <blockquote className="font-[family-name:var(--font-display)] italic text-xl md:text-2xl font-semibold text-foreground/85 leading-snug">
          <RichText html={block.html} />
        </blockquote>
        {block.attribution && (
          <figcaption
            className="mt-3 text-[10px] uppercase tracking-[0.14em] font-bold not-italic"
            style={{ color: 'hsl(var(--brand-accent))' }}
          >
            — {block.attribution}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure className="my-6 rounded-sm border border-border/60 bg-muted/20 px-5 py-4">
      <blockquote className="text-base italic text-foreground/85 leading-relaxed">
        <RichText html={block.html} />
      </blockquote>
      {block.attribution && (
        <figcaption className="mt-2 text-xs text-muted-foreground not-italic">— {block.attribution}</figcaption>
      )}
    </figure>
  );
}

const CALLOUT_META = {
  info: { Icon: Info, ring: 'border-primary/30', tint: 'bg-primary/5', fg: 'text-primary' },
  tip: { Icon: Lightbulb, ring: 'border-emerald-500/30', tint: 'bg-emerald-500/5', fg: 'text-emerald-600' },
  warning: { Icon: TriangleAlert, ring: 'border-amber-500/40', tint: 'bg-amber-500/5', fg: 'text-amber-600' },
} as const;

export function CalloutBlockView({ block }: { block: CalloutBlock }) {
  const { Icon, ring, tint, fg } = CALLOUT_META[block.tone] ?? CALLOUT_META.info;
  return (
    <aside className={cn('my-6 flex gap-3 rounded-sm border px-4 py-3.5', ring, tint)}>
      <Icon size={16} className={cn('mt-0.5 flex-shrink-0', fg)} aria-hidden="true" />
      <div className="text-sm text-foreground/85 leading-relaxed">
        <RichText html={block.html} />
      </div>
    </aside>
  );
}

export function DividerBlockView({ block }: { block: DividerBlock }) {
  if (block.style === 'space') return <div className="h-10" aria-hidden="true" />;

  if (block.style === 'ornament') {
    return (
      <div className="my-10 flex items-center justify-center gap-3" aria-hidden="true">
        <span className="h-px w-16" style={{ background: 'hsl(var(--border))' }} />
        <span
          className="font-[family-name:var(--font-display)] text-lg leading-none"
          style={{ color: 'hsl(var(--brand-accent))' }}
        >
          ❧
        </span>
        <span className="h-px w-16" style={{ background: 'hsl(var(--border))' }} />
      </div>
    );
  }

  return <hr className="my-8 border-border/60" />;
}

export function CodeBlockView({ block }: { block: CodeBlock }) {
  return (
    <pre className="my-6 overflow-x-auto rounded-sm border border-border/60 bg-muted/40 p-4 text-[13px] leading-relaxed">
      <code className={block.language ? `language-${block.language}` : undefined}>{block.text}</code>
    </pre>
  );
}
