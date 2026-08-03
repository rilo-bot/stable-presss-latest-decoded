/**
 * Per-block settings. The placement controls live here — this is the surface
 * that answers "where do I want this image?".
 *
 * Options that cannot apply are HIDDEN rather than disabled: float width is
 * meaningless without a float, and float itself is impossible on a breakout
 * width (the server drops that combination, so offering it would let someone set
 * something that silently reverts on save).
 */
import { cn } from '@/lib/utils';
import { describePlacement } from '@/blog/placement';
import { blockLabel } from '@/blog/factories';
import { useComposerStore } from './composerStore';
import type { Block, Placement } from '@/types/blog';
import {
  AlignCenter, AlignLeft, AlignRight, Copy, Trash2,
  WrapText, Maximize, Square,
} from 'lucide-react';

/* ── Small controls ───────────────────────────────────────── */

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function SegGroup<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode; title?: string }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title ?? o.label}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs transition-colors',
            value === o.value
              ? 'border-primary/40 bg-primary/10 font-semibold text-primary'
              : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-sm border border-border/60 bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none"
    />
  );
}

/* ── Placement ────────────────────────────────────────────── */

function PlacementControls({ block }: { block: Block & { placement: Placement } }) {
  const updatePlacement = useComposerStore((s) => s.updatePlacement);
  const p = block.placement;
  const set = (patch: Partial<Placement>) => updatePlacement(block.id, patch);

  // A float only exists in-column; a breakout cannot wrap text.
  const canFloat = p.width === 'inline';
  const isFloating = canFloat && p.float !== 'none';

  return (
    <>
      <Field
        label="Width"
        hint={
          p.width === 'full-bleed'
            ? 'Spans the full viewport, edge to edge.'
            : p.width === 'wide'
              ? 'Breaks out past the text column.'
              : 'Sits within the reading column.'
        }
      >
        <SegGroup
          ariaLabel="Image width"
          value={p.width}
          onChange={(width) => {
            // Moving to a breakout clears the float in the same action, so the
            // UI never shows a state the server would reject.
            set(width === 'inline' ? { width } : { width, float: 'none' });
          }}
          options={[
            { value: 'inline', label: 'In column', icon: <Square size={12} /> },
            { value: 'wide', label: 'Wide', icon: <WrapText size={12} /> },
            { value: 'full-bleed', label: 'Full bleed', icon: <Maximize size={12} /> },
          ]}
        />
      </Field>

      {canFloat && (
        <Field label="Text wrap" hint={isFloating ? 'Body text flows beside the image.' : undefined}>
          <SegGroup
            ariaLabel="Text wrap"
            value={p.float}
            onChange={(float) => set({ float, floatWidth: float === 'none' ? undefined : (p.floatWidth ?? '1/2') })}
            // Labelled by where the IMAGE sits, matching `describePlacement`
            // below and the underlying CSS float. Labelling them by where the
            // text goes read as a contradiction next to the summary line.
            options={[
              { value: 'none', label: 'None' },
              { value: 'left', label: 'Image left', title: 'Image on the left, text wraps down the right' },
              { value: 'right', label: 'Image right', title: 'Image on the right, text wraps down the left' },
            ]}
          />
        </Field>
      )}

      {isFloating && (
        <Field label="Wrap width">
          <SegGroup
            ariaLabel="Float width"
            value={p.floatWidth ?? '1/2'}
            onChange={(floatWidth) => set({ floatWidth })}
            options={[
              { value: '1/3', label: 'One third' },
              { value: '1/2', label: 'Half' },
            ]}
          />
        </Field>
      )}

      {!isFloating && (
        <Field label="Align">
          <SegGroup
            ariaLabel="Alignment"
            value={p.align}
            onChange={(align) => set({ align })}
            options={[
              { value: 'left', label: '', icon: <AlignLeft size={13} />, title: 'Left' },
              { value: 'center', label: '', icon: <AlignCenter size={13} />, title: 'Centre' },
              { value: 'right', label: '', icon: <AlignRight size={13} />, title: 'Right' },
            ]}
          />
        </Field>
      )}

      <Field label="Shape" hint={p.aspect === 'original' ? "The image's own proportions." : 'Cropped to fit.'}>
        <SegGroup
          ariaLabel="Aspect ratio"
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

      <Field label="Caption position">
        <SegGroup
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

      <p className="mt-1 rounded-sm bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
        {describePlacement(p)}
      </p>
    </>
  );
}

/* ── Focal point ──────────────────────────────────────────── */

/**
 * Click-to-set focal point. Only shown when an aspect is forced, because that is
 * the only time anything is actually being cropped away.
 */
function FocalPicker({ block }: { block: Extract<Block, { kind: 'image' }> }) {
  const { blog, updateBlock } = useComposerStore();
  const media = blog?.media.find((m) => m.id === block.mediaId);
  if (!media || block.placement.aspect === 'original') return null;

  const [fx, fy] = block.focal ?? [0.5, 0.5];

  return (
    <Field label="Focal point" hint="Click the part of the image that must stay in frame.">
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
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, background: 'hsl(var(--brand-accent))' }}
        />
      </button>
    </Field>
  );
}

/* ── Per-kind bodies ──────────────────────────────────────── */

function ImageSettings({ block }: { block: Extract<Block, { kind: 'image' }> }) {
  const { blog, updateBlock, patchMedia } = useComposerStore();
  const media = blog?.media.find((m) => m.id === block.mediaId);

  return (
    <>
      {media && (
        <>
          <Field
            label="Alt text"
            hint="Describes the image for screen readers and when it fails to load. Shared across every placement of this asset."
          >
            <TextInput
              ariaLabel="Alt text"
              value={media.alt}
              placeholder="A chestnut yearling in the sales ring"
              onChange={(alt) => patchMedia(media.id, { alt })}
            />
          </Field>
          <Field label="Caption">
            <TextInput
              ariaLabel="Caption"
              value={block.caption ?? media.caption ?? ''}
              placeholder="Optional caption"
              onChange={(caption) => updateBlock(block.id, { caption } as Partial<Block>)}
            />
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
      <PlacementControls block={block} />
      <FocalPicker block={block} />
      <Field label="Link" hint="Wraps the image in a link. Opens in a new tab.">
        <TextInput
          ariaLabel="Image link URL"
          value={block.linkUrl ?? ''}
          placeholder="https://…"
          onChange={(linkUrl) => updateBlock(block.id, { linkUrl } as Partial<Block>)}
        />
      </Field>
    </>
  );
}

function GallerySettings({ block }: { block: Extract<Block, { kind: 'gallery' }> }) {
  const { blog, updateBlock } = useComposerStore();

  return (
    <>
      <Field label="Layout">
        <SegGroup
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

      {/* Columns only mean something for the two that lay out in a grid. */}
      {(block.layout === 'grid' || block.layout === 'masonry') && (
        <Field label="Columns">
          <SegGroup
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

      <Field label={`Images (${block.items.length})`} hint="Drag images in from the tray below to add more.">
        <div className="space-y-1.5">
          {block.items.map((item, i) => {
            const media = blog?.media.find((m) => m.id === item.mediaId);
            return (
              <div key={`${item.mediaId}-${i}`} className="flex items-center gap-2 rounded-sm border border-border/50 p-1.5">
                {media && (
                  <img src={media.url} alt="" crossOrigin="anonymous" className="h-8 w-8 flex-shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {media?.filename ?? 'Missing'}
                </span>
                {block.layout === 'grid' && (
                  <button
                    type="button"
                    title="Span two columns"
                    aria-pressed={item.span === 2}
                    onClick={() =>
                      updateBlock(block.id, {
                        items: block.items.map((it, j) =>
                          j === i ? { ...it, span: it.span === 2 ? 1 : 2 } : it,
                        ),
                      } as Partial<Block>)
                    }
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                      item.span === 2 ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    2×
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Remove from gallery"
                  onClick={() =>
                    updateBlock(block.id, { items: block.items.filter((_, j) => j !== i) } as Partial<Block>)
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          {block.items.length === 0 && (
            <p className="rounded-sm border border-dashed border-border/60 px-2.5 py-3 text-center text-[11px] italic text-muted-foreground">
              Empty. A gallery with no images is dropped on save.
            </p>
          )}
        </div>
      </Field>

      <PlacementControls block={block} />
    </>
  );
}

function SimpleSettings({ block }: { block: Block }) {
  const updateBlock = useComposerStore((s) => s.updateBlock);

  switch (block.kind) {
    case 'heading':
      return (
        <Field label="Level" hint="Headings should step down in order — a level 3 under a level 2.">
          <SegGroup
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
          <SegGroup
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
        <>
          <Field label="Style">
            <SegGroup
              ariaLabel="Quote style"
              value={block.style}
              onChange={(style) => updateBlock(block.id, { style } as Partial<Block>)}
              options={[
                { value: 'pull', label: 'Pull quote' },
                { value: 'block', label: 'Blockquote' },
              ]}
            />
          </Field>
          <Field label="Attribution">
            <TextInput
              ariaLabel="Attribution"
              value={block.attribution ?? ''}
              placeholder="Who said it"
              onChange={(attribution) => updateBlock(block.id, { attribution } as Partial<Block>)}
            />
          </Field>
        </>
      );

    case 'callout':
      return (
        <Field label="Tone">
          <SegGroup
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
          <SegGroup
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
          <Field label="Provider">
            <SegGroup
              ariaLabel="Embed provider"
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
          <Field label="URL" hint="Paste the normal share or watch link.">
            <TextInput
              ariaLabel="Embed URL"
              value={block.url}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(url) => updateBlock(block.id, { url } as Partial<Block>)}
            />
          </Field>
          <Field label="Shape">
            <SegGroup
              ariaLabel="Embed ratio"
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

    case 'code':
      return (
        <Field label="Language">
          <TextInput
            ariaLabel="Code language"
            value={block.language ?? ''}
            placeholder="ts, sql, bash…"
            onChange={(language) => updateBlock(block.id, { language } as Partial<Block>)}
          />
        </Field>
      );

    default:
      return null;
  }
}

/* ── Record pickers ───────────────────────────────────────── */

/**
 * Reference pickers are searchable selects rather than free-text id fields —
 * nobody knows a Mongo ObjectId by sight, and a mistyped one produces a block
 * that renders as "no longer available".
 */
function RecordPicker({
  block,
  field,
  options,
  label,
  empty,
}: {
  block: Block;
  field: 'horseId' | 'partyId' | 'articleId';
  options: Array<{ id: string; name: string }>;
  label: string;
  empty: string;
}) {
  const updateBlock = useComposerStore((s) => s.updateBlock);
  const currentId = (block as unknown as Record<string, string>)[field] ?? '';

  return (
    <Field label={label}>
      {options.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">{empty}</p>
      ) : (
        <select
          aria-label={label}
          value={currentId}
          onChange={(e) => updateBlock(block.id, { [field]: e.target.value } as Partial<Block>)}
          className="w-full rounded-sm border border-border/60 bg-background px-2.5 py-1.5 text-sm focus:border-primary/40 focus:outline-none"
        >
          <option value="">— choose —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/* ── Shell ────────────────────────────────────────────────── */

export function BlockInspector({
  horses,
  parties,
  articles,
}: {
  horses: Array<{ id: string; name: string }>;
  parties: Array<{ id: string; name: string }>;
  articles: Array<{ id: string; name: string }>;
}) {
  const { blog, selectedId, duplicate, removeBlock } = useComposerStore();
  const block = blog?.blocks.find((b) => b.id === selectedId);

  if (!block) {
    return (
      <p className="px-4 py-6 text-center text-xs italic text-muted-foreground">
        Select a block to edit its settings.
      </p>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-border/50 pb-3">
        <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
          {blockLabel(block)}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Duplicate block"
            title="Duplicate"
            onClick={() => duplicate(block.id)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            aria-label="Delete block"
            title="Delete"
            onClick={() => removeBlock(block.id)}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {block.kind === 'image' ? (
        <ImageSettings block={block} />
      ) : block.kind === 'gallery' ? (
        <GallerySettings block={block} />
      ) : block.kind === 'horseCard' ? (
        <RecordPicker
          block={block}
          field="horseId"
          label="Horse"
          options={horses}
          empty="No horse records are loaded."
        />
      ) : block.kind === 'partyCard' ? (
        <RecordPicker
          block={block}
          field="partyId"
          label="Profile"
          options={parties}
          empty="No profiles are loaded."
        />
      ) : block.kind === 'articleRef' ? (
        <RecordPicker
          block={block}
          field="articleId"
          label="Story"
          options={articles}
          empty="No stories are loaded."
        />
      ) : (
        <SimpleSettings block={block} />
      )}
    </div>
  );
}
