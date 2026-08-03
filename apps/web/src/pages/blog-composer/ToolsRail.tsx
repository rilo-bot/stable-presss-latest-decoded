/**
 * The tools rail — the right-hand column of the editor.
 *
 * ONE home for every control. An earlier pass had a floating toolbar over the
 * selected block AND a settings panel, which meant two places to look for the
 * same setting; the rail is the single answer instead.
 *
 * Order matters: the selected block's controls come first, because that is what
 * someone is looking at when they reach for the rail. Post-level settings sit
 * below, in the order a post is actually finished — cover, filing, sharing,
 * access.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { describePlacement } from '@/blog/placement';
import { mediaById } from '@/types/blog';
import { useComposerStore } from './composerStore';
import { Field, RailSection, Seg, TextArea, TextInput, inputCls } from './controls';
import type { Block, CoverTreatment, Placement } from '@/types/blog';
import type { SubscriptionTier } from '@/rbac/entitlement';
import {
  AlignCenter, AlignLeft, AlignRight, Copy, ImageIcon, Maximize,
  RectangleHorizontal, Square, Trash2, X,
} from 'lucide-react';

/* ── Block section ────────────────────────────────────────── */

function PlacementFields({ block }: { block: Extract<Block, { kind: 'image' | 'gallery' }> }) {
  const updatePlacement = useComposerStore((s) => s.updatePlacement);
  const p = block.placement;
  const set = (patch: Partial<Placement>) => updatePlacement(block.id, patch);

  const canFloat = p.width === 'inline';
  const floating = canFloat && p.float !== 'none';

  return (
    <>
      <Field label="Size">
        <Seg
          ariaLabel="Image width"
          value={p.width}
          // Moving to a breakout clears the float in the same action, so the UI
          // never shows a state the server would reject.
          onChange={(width) => set(width === 'inline' ? { width } : { width, float: 'none' })}
          options={[
            { value: 'inline', label: 'In column', icon: <Square size={11} /> },
            { value: 'wide', label: 'Wide', icon: <RectangleHorizontal size={11} /> },
            { value: 'full-bleed', label: 'Full width', icon: <Maximize size={11} /> },
          ]}
        />
      </Field>

      {/* A float only exists in-column: text cannot wrap around something wider
          than the column it flows in. */}
      {canFloat && (
        <Field label="Text wrap" hint={floating ? 'Body text flows beside the image.' : undefined}>
          <Seg
            ariaLabel="Text wrap"
            value={p.float}
            onChange={(float) => set({ float, floatWidth: float === 'none' ? undefined : (p.floatWidth ?? '1/2') })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'left', label: 'Image left' },
              { value: 'right', label: 'Image right' },
            ]}
          />
        </Field>
      )}

      {floating && (
        <Field label="Wrap width">
          <Seg
            ariaLabel="Wrap width"
            value={p.floatWidth ?? '1/2'}
            onChange={(floatWidth) => set({ floatWidth })}
            options={[
              { value: '1/3', label: 'One third' },
              { value: '1/2', label: 'Half' },
            ]}
          />
        </Field>
      )}

      {!floating && (
        <Field label="Align">
          <Seg
            ariaLabel="Alignment"
            value={p.align}
            onChange={(align) => set({ align })}
            options={[
              { value: 'left', label: '', icon: <AlignLeft size={12} />, title: 'Left' },
              { value: 'center', label: '', icon: <AlignCenter size={12} />, title: 'Centre' },
              { value: 'right', label: '', icon: <AlignRight size={12} />, title: 'Right' },
            ]}
          />
        </Field>
      )}

      <Field label="Shape">
        <Seg
          ariaLabel="Shape"
          value={p.aspect}
          onChange={(aspect) => set({ aspect })}
          options={[
            { value: 'original', label: 'Original' },
            { value: '16:9', label: '16:9' },
            { value: '4:3', label: '4:3' },
            { value: '1:1', label: '1:1' },
            { value: '3:4', label: '3:4' },
          ]}
        />
      </Field>

      <Field label="Caption">
        <Seg
          ariaLabel="Caption position"
          value={p.captionPosition}
          onChange={(captionPosition) => set({ captionPosition })}
          options={[
            { value: 'below', label: 'Below' },
            { value: 'overlay', label: 'On image' },
            { value: 'side', label: 'Beside' },
          ]}
        />
      </Field>

      <p className="rounded-sm bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        {describePlacement(p)}
      </p>
    </>
  );
}

function ImageFields({ block }: { block: Extract<Block, { kind: 'image' }> }) {
  const { blog, patchMedia, updateBlock } = useComposerStore();
  const media = blog?.media.find((m) => m.id === block.mediaId);

  return (
    <>
      {media && (
        <>
          <img
            src={media.url}
            alt=""
            crossOrigin="anonymous"
            className="mb-3 aspect-[16/9] w-full rounded-sm border border-border/60 object-cover"
          />
          <Field
            label="Alt text"
            hint="For screen readers and when the image fails to load. Stored per image, so every placement of it shares this."
          >
            <TextInput
              ariaLabel="Alt text"
              value={media.alt}
              placeholder="A chestnut yearling in the ring"
              onChange={(alt) => patchMedia(media.id, { alt })}
            />
            {!media.alt && <p className="mt-1 text-[11px] text-amber-600">Missing — add one before publishing.</p>}
          </Field>
          <Field label="Credit">
            <TextInput
              ariaLabel="Credit"
              value={block.credit ?? media.credit ?? ''}
              placeholder="Photographer or agency"
              onChange={(credit) => updateBlock(block.id, { credit } as Partial<Block>)}
            />
          </Field>
        </>
      )}

      <PlacementFields block={block} />

      {/* Only meaningful when a crop is being forced — nothing is cut off otherwise. */}
      {block.placement.aspect !== 'original' && media && (
        <Field label="Focal point" hint="Click what must stay in frame.">
          <button
            type="button"
            aria-label="Set focal point"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
              const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
              updateBlock(block.id, { focal: [x, y] } as Partial<Block>);
            }}
            className="relative block w-full overflow-hidden rounded-sm border border-border/60"
          >
            <img src={media.url} alt="" crossOrigin="anonymous" className="block w-full" />
            <span
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                left: `${(block.focal?.[0] ?? 0.5) * 100}%`,
                top: `${(block.focal?.[1] ?? 0.5) * 100}%`,
                background: 'hsl(var(--brand-accent))',
              }}
            />
          </button>
        </Field>
      )}

      <Field label="Link" hint="Wraps the image in a link, opened in a new tab.">
        <TextInput
          ariaLabel="Image link"
          value={block.linkUrl ?? ''}
          placeholder="https://…"
          onChange={(linkUrl) => updateBlock(block.id, { linkUrl } as Partial<Block>)}
        />
      </Field>
    </>
  );
}

function SimpleBlockFields({ block, refs }: { block: Block; refs: RefOptions }) {
  const updateBlock = useComposerStore((s) => s.updateBlock);

  switch (block.kind) {
    case 'heading':
      return (
        <Field label="Level" hint="Headings should step down in order.">
          <Seg
            ariaLabel="Heading level"
            value={block.level}
            onChange={(level) => updateBlock(block.id, { level } as Partial<Block>)}
            options={[
              { value: 2, label: 'H2' },
              { value: 3, label: 'H3' },
              { value: 4, label: 'H4' },
            ]}
          />
        </Field>
      );
    case 'list':
      return (
        <Field label="Style">
          <Seg
            ariaLabel="List style"
            value={block.ordered ? 'ordered' : 'bulleted'}
            onChange={(v) => updateBlock(block.id, { ordered: v === 'ordered' } as Partial<Block>)}
            options={[
              { value: 'bulleted', label: 'Bulleted' },
              { value: 'ordered', label: 'Numbered' },
            ]}
          />
        </Field>
      );
    case 'quote':
      return (
        <Field label="Style">
          <Seg
            ariaLabel="Quote style"
            value={block.style}
            onChange={(style) => updateBlock(block.id, { style } as Partial<Block>)}
            options={[
              { value: 'pull', label: 'Pull quote' },
              { value: 'block', label: 'Blockquote' },
            ]}
          />
        </Field>
      );
    case 'callout':
      return (
        <Field label="Tone">
          <Seg
            ariaLabel="Callout tone"
            value={block.tone}
            onChange={(tone) => updateBlock(block.id, { tone } as Partial<Block>)}
            options={[
              { value: 'info', label: 'Note' },
              { value: 'tip', label: 'Tip' },
              { value: 'warning', label: 'Warning' },
            ]}
          />
        </Field>
      );
    case 'divider':
      return (
        <Field label="Style">
          <Seg
            ariaLabel="Divider style"
            value={block.style}
            onChange={(style) => updateBlock(block.id, { style } as Partial<Block>)}
            options={[
              { value: 'rule', label: 'Rule' },
              { value: 'ornament', label: 'Ornament' },
              { value: 'space', label: 'Space' },
            ]}
          />
        </Field>
      );
    case 'embed':
      return (
        <>
          <Field label="Link" hint="Paste the normal share or watch URL.">
            <TextInput
              ariaLabel="Embed URL"
              value={block.url}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(url) => updateBlock(block.id, { url } as Partial<Block>)}
            />
          </Field>
          <Field label="Provider">
            <Seg
              ariaLabel="Provider"
              value={block.provider}
              onChange={(provider) => updateBlock(block.id, { provider } as Partial<Block>)}
              options={[
                { value: 'youtube', label: 'YouTube' },
                { value: 'vimeo', label: 'Vimeo' },
                { value: 'spotify', label: 'Spotify' },
                { value: 'x', label: 'X' },
              ]}
            />
          </Field>
          <Field label="Shape">
            <Seg
              ariaLabel="Shape"
              value={block.ratio}
              onChange={(ratio) => updateBlock(block.id, { ratio } as Partial<Block>)}
              options={[
                { value: '16:9', label: '16:9' },
                { value: '1:1', label: '1:1' },
                { value: '4:5', label: '4:5' },
              ]}
            />
          </Field>
        </>
      );
    case 'horseCard':
    case 'partyCard':
    case 'articleRef': {
      const cfg =
        block.kind === 'horseCard'
          ? { field: 'horseId' as const, label: 'Horse', options: refs.horses }
          : block.kind === 'partyCard'
            ? { field: 'partyId' as const, label: 'Profile', options: refs.parties }
            : { field: 'articleId' as const, label: 'Story', options: refs.articles };
      const value = (block as unknown as Record<string, string>)[cfg.field] ?? '';
      return (
        <Field label={cfg.label} hint="Reads live from the record, so it stays current.">
          <select
            aria-label={cfg.label}
            value={value}
            onChange={(e) => useComposerStore.getState().updateBlock(block.id, { [cfg.field]: e.target.value } as Partial<Block>)}
            className={inputCls}
          >
            <option value="">— choose —</option>
            {cfg.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      );
    }
    case 'gallery':
      return (
        <>
          <Field label="Layout">
            <Seg
              ariaLabel="Gallery layout"
              value={block.layout}
              onChange={(layout) => updateBlock(block.id, { layout } as Partial<Block>)}
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'masonry', label: 'Masonry' },
                { value: 'carousel', label: 'Carousel' },
                { value: 'filmstrip', label: 'Filmstrip' },
              ]}
            />
          </Field>
          {(block.layout === 'grid' || block.layout === 'masonry') && (
            <Field label="Columns">
              <Seg
                ariaLabel="Columns"
                value={block.columns}
                onChange={(columns) => updateBlock(block.id, { columns } as Partial<Block>)}
                options={[
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                  { value: 4, label: '4' },
                ]}
              />
            </Field>
          )}
          <PlacementFields block={block} />
        </>
      );
    case 'code':
      return (
        <Field label="Language">
          <TextInput
            ariaLabel="Language"
            value={block.language ?? ''}
            placeholder="ts, sql, bash…"
            onChange={(language) => updateBlock(block.id, { language } as Partial<Block>)}
          />
        </Field>
      );
    default:
      return <p className="text-[11px] italic text-muted-foreground">Nothing to configure — just type.</p>;
  }
}

const KIND_LABEL: Record<string, string> = {
  paragraph: 'Text', heading: 'Heading', list: 'List', quote: 'Quote', callout: 'Callout',
  divider: 'Divider', image: 'Image', gallery: 'Gallery', embed: 'Embed',
  horseCard: 'Horse card', partyCard: 'Profile card', articleRef: 'Story link', code: 'Code',
};

/* ── Post section ─────────────────────────────────────────── */

function PostFields({ onPickCover }: { onPickCover: () => void }) {
  const { blog, patchPost } = useComposerStore();
  const [tagInput, setTagInput] = useState('');
  if (!blog) return null;

  const cover = mediaById(blog, blog.cover?.mediaId);

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !blog.tags.includes(tag)) patchPost({ tags: [...blog.tags, tag] });
    setTagInput('');
  };

  return (
    <>
      <Field label="Cover image" hint="Shown at the top of the post and on cards.">
        {cover ? (
          <>
            <img
              src={cover.url}
              alt=""
              crossOrigin="anonymous"
              className="mb-2 aspect-[16/9] w-full rounded-sm border border-border/60 object-cover"
            />
            <Seg
              ariaLabel="Cover treatment"
              value={(blog.cover?.treatment ?? 'hero-full') as CoverTreatment}
              onChange={(treatment) => patchPost({ cover: blog.cover ? { ...blog.cover, treatment } : undefined })}
              options={[
                { value: 'hero-full', label: 'Full hero' },
                { value: 'hero-split', label: 'Below title' },
                { value: 'inset', label: 'Inset' },
                { value: 'none', label: 'Hidden' },
              ]}
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={onPickCover} className="text-[11px] text-primary underline">
                Replace
              </button>
              <button
                type="button"
                onClick={() => patchPost({ cover: undefined })}
                className="text-[11px] text-muted-foreground underline hover:text-destructive"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onPickCover}
            className="flex w-full flex-col items-center gap-1.5 rounded-sm border border-dashed border-border/60 py-6 transition-colors hover:border-primary/40"
          >
            <ImageIcon size={18} className="text-muted-foreground/50" />
            <span className="text-[11px] text-muted-foreground">Choose a cover image</span>
          </button>
        )}
      </Field>

      <Field label="Category">
        <TextInput
          ariaLabel="Category"
          value={blog.category ?? ''}
          placeholder="Bloodstock, Racing, Opinion…"
          onChange={(category) => patchPost({ category })}
        />
      </Field>

      <Field label="Tags">
        {blog.tags.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {blog.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-sm border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px]"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => patchPost({ tags: blog.tags.filter((t) => t !== tag) })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Commits on Enter, comma and blur — a typed tag is never lost by
            clicking away. */}
        <TextInput
          ariaLabel="Add a tag"
          value={tagInput}
          placeholder="Type a tag, press Enter"
          onChange={setTagInput}
          onCommit={addTag}
        />
      </Field>

      <Field label="Byline">
        <TextInput
          ariaLabel="Author name"
          value={blog.author.name}
          placeholder="Who wrote it"
          onChange={(name) => patchPost({ author: { ...blog.author, name } })}
        />
      </Field>

      <Field label="Excerpt" hint="Card and share summary. Taken from the first paragraph if left blank.">
        <TextArea
          ariaLabel="Excerpt"
          value={blog.excerpt ?? ''}
          onChange={(excerpt) => patchPost({ excerpt })}
        />
      </Field>

      <Field
        label="URL"
        hint={
          blog.publishedAt
            ? 'Published. Changing this keeps the old link working via a redirect.'
            : 'Follows the title until you change it here.'
        }
      >
        <TextInput ariaLabel="URL slug" value={blog.slug} onChange={(slug) => patchPost({ slug })} />
        <p className="mt-1 truncate text-[11px] text-muted-foreground/70">/blog/{blog.slug}</p>
      </Field>

      <Field label="Who can read it">
        <Seg
          ariaLabel="Minimum tier"
          value={(blog.minTier ?? 'free') as SubscriptionTier}
          onChange={(minTier) => patchPost({ minTier })}
          options={[
            { value: 'free', label: 'Everyone' },
            { value: 'standard', label: 'Standard' },
            { value: 'premium', label: 'Premium' },
          ]}
        />
      </Field>

      <p className="mt-1 text-[11px] text-muted-foreground/70">
        {blog.readingTime} min read · {blog.blocks.length} blocks · {blog.media.length} images
      </p>
    </>
  );
}

/* ── Rail ─────────────────────────────────────────────────── */

export interface RefOptions {
  horses: Array<{ id: string; name: string }>;
  parties: Array<{ id: string; name: string }>;
  articles: Array<{ id: string; name: string }>;
}

export function ToolsRail({ refs, onPickCover }: { refs: RefOptions; onPickCover: () => void }) {
  const { blog, selectedId, select, duplicate, removeBlock } = useComposerStore();
  const block = blog?.blocks.find((b) => b.id === selectedId);

  return (
    <div className="slim-scroll h-full overflow-y-auto">
      {block ? (
        <RailSection title={KIND_LABEL[block.kind] ?? 'Block'}>
          <div className="mb-3 flex items-center gap-1">
            <button
              type="button"
              onClick={() => duplicate(block.id)}
              className="inline-flex items-center gap-1 rounded-sm border border-border/60 px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Copy size={11} />
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => removeBlock(block.id)}
              className="inline-flex items-center gap-1 rounded-sm border border-border/60 px-1.5 py-1 text-[11px] text-muted-foreground hover:border-destructive/40 hover:text-destructive"
            >
              <Trash2 size={11} />
              Delete
            </button>
            <button
              type="button"
              onClick={() => select(null)}
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Deselect block"
              title="Deselect"
            >
              <X size={13} />
            </button>
          </div>

          {block.kind === 'image' ? (
            <ImageFields block={block} />
          ) : (
            <SimpleBlockFields block={block} refs={refs} />
          )}
        </RailSection>
      ) : (
        <RailSection title="Block">
          <p className="text-[11px] italic text-muted-foreground">
            Click a block in the post to change how it looks.
          </p>
        </RailSection>
      )}

      <RailSection title="Post">
        <PostFields onPickCover={onPickCover} />
      </RailSection>
    </div>
  );
}
