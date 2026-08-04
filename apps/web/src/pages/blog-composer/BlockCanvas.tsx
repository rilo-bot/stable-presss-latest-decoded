/**
 * The editing canvas — one column, no side panels.
 *
 * Renders through `BlogRenderer` with a `wrapBlock` hook, so selection and
 * editing layer over the real output. Nothing here re-implements layout, so what
 * an author places is what a reader gets.
 *
 * What changed from the first pass: the per-block gutter controls (drag, up,
 * down, delete) are gone. Everything now hangs off the contextual toolbar that
 * appears above the selected block, and captions are edited in place under the
 * image rather than in a panel field. The canvas holds text and pictures; the
 * toolbar holds decisions.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { BlogRenderer } from '@/blog/BlogRenderer';
import { resolvePlacement } from '@/blog/placement';
import { paragraph, image as makeImage } from '@/blog/factories';
import { useComposerStore, type ContainerId } from './composerStore';
import { InlineText } from './InlineText';
import { InsertMenu, InsertList, filterInsertOptions } from './InsertMenu';
import { ImagePicker } from './ImagePicker';
import type { Block } from '@/types/blog';
import { GripVertical, ImagePlus } from 'lucide-react';

/** Text-family kinds are edited in place; the rest are configured in the toolbar. */
function inlineEditable(block: Block): boolean {
  return (
    block.kind === 'paragraph' ||
    block.kind === 'heading' ||
    block.kind === 'quote' ||
    block.kind === 'callout' ||
    block.kind === 'code' ||
    block.kind === 'list'
  );
}

/* ── Slash menu ───────────────────────────────────────────── */

function SlashMenu({
  query,
  onQuery,
  onPick,
  onAddImage,
  onClose,
}: {
  query: string;
  onQuery: (q: string) => void;
  onPick: (block: Block) => void;
  onAddImage: () => void;
  onClose: () => void;
}) {
  const options = filterInsertOptions(query);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActive(0), [query]);

  return (
    <div
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className="slim-scroll absolute left-0 top-full z-40 mt-1 max-h-72 w-60 overflow-y-auto rounded-sm border border-border bg-popover p-1 shadow-lg"
    >
      <input
        ref={inputRef}
        value={query}
        aria-label="Filter block types"
        placeholder="Type to filter…"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const chosen = options[active];
            if (chosen) onPick(chosen.make());
          }
        }}
        className="mb-1 w-full rounded-sm border border-border/60 bg-background px-2 py-1 text-xs focus:border-primary/40 focus:outline-none"
      />
      <InsertList
        options={options}
        activeIndex={active}
        onAddImage={onAddImage}
        onPick={(o) => onPick(o.make())}
      />
    </div>
  );
}

/* ── Inline editors ───────────────────────────────────────── */

function InlineEditorFor({
  block,
  blocks,
  containerId,
  autoFocus,
  onSlash,
}: {
  block: Block;
  /** The list this block belongs to — the body's, or one part's. */
  blocks: Block[];
  containerId: ContainerId;
  autoFocus: boolean;
  onSlash: () => void;
}) {
  const { updateBlock, insertBlock, removeBlock } = useComposerStore();
  const index = blocks.findIndex((b) => b.id === block.id);
  const addAfter = () => insertBlock(paragraph(), index + 1, containerId);

  switch (block.kind) {
    case 'paragraph':
      return (
        <InlineText
          value={block.html}
          onChange={(html) => updateBlock(block.id, { html } as Partial<Block>)}
          placeholder="Write, or press / for blocks"
          ariaLabel="Paragraph text"
          onEnter={addAfter}
          onEmptyBackspace={() => removeBlock(block.id)}
          onSlash={onSlash}
          autoFocus={autoFocus}
          className="mb-5 text-base leading-relaxed text-foreground/85"
        />
      );

    case 'heading': {
      const size =
        block.level === 2 ? 'text-2xl md:text-3xl' : block.level === 3 ? 'text-xl md:text-2xl' : 'text-lg md:text-xl';
      return (
        <InlineText
          plain
          value={block.text}
          onChange={(text) => updateBlock(block.id, { text } as Partial<Block>)}
          placeholder="Section heading"
          ariaLabel="Heading text"
          onEnter={addAfter}
          onEmptyBackspace={() => removeBlock(block.id)}
          autoFocus={autoFocus}
          className={cn(
            'mt-10 mb-1 font-[family-name:var(--font-display)] font-bold leading-tight text-foreground first:mt-0',
            size,
          )}
        />
      );
    }

    case 'quote':
      return (
        <div className="my-8 border-l-[3px] py-2 pl-5" style={{ borderColor: 'hsl(var(--brand-accent))' }}>
          <InlineText
            value={block.html}
            onChange={(html) => updateBlock(block.id, { html } as Partial<Block>)}
            placeholder="The quote…"
            ariaLabel="Quote text"
            autoFocus={autoFocus}
            className="font-[family-name:var(--font-display)] text-xl font-semibold italic leading-snug text-foreground/85 md:text-2xl"
          />
          {/* Attribution edited in place too, rather than hidden in a panel. */}
          <InlineText
            plain
            value={block.attribution ?? ''}
            onChange={(attribution) => updateBlock(block.id, { attribution } as Partial<Block>)}
            placeholder="— attribution"
            ariaLabel="Quote attribution"
            className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em]"
          />
        </div>
      );

    case 'callout':
      return (
        <div className="my-6 rounded-sm border border-primary/30 bg-primary/5 px-4 py-3.5">
          <InlineText
            value={block.html}
            onChange={(html) => updateBlock(block.id, { html } as Partial<Block>)}
            placeholder="Callout text…"
            ariaLabel="Callout text"
            autoFocus={autoFocus}
            className="text-sm leading-relaxed text-foreground/85"
          />
        </div>
      );

    case 'code':
      return (
        <InlineText
          plain
          value={block.text}
          onChange={(text) => updateBlock(block.id, { text } as Partial<Block>)}
          placeholder="Code…"
          ariaLabel="Code text"
          autoFocus={autoFocus}
          className="my-6 whitespace-pre-wrap rounded-sm border border-border/60 bg-muted/40 p-4 font-mono text-[13px] leading-relaxed"
        />
      );

    case 'list':
      return (
        <div className="mb-5">
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <span className="select-none pt-0.5 text-sm text-muted-foreground">
                {block.ordered ? `${i + 1}.` : '•'}
              </span>
              <InlineText
                value={item}
                onChange={(html) =>
                  updateBlock(block.id, {
                    items: block.items.map((it, j) => (j === i ? html : it)),
                  } as Partial<Block>)
                }
                placeholder="List item"
                ariaLabel={`List item ${i + 1}`}
                autoFocus={autoFocus && i === 0}
                onEnter={() =>
                  updateBlock(block.id, {
                    items: [...block.items.slice(0, i + 1), '', ...block.items.slice(i + 1)],
                  } as Partial<Block>)
                }
                onEmptyBackspace={() => {
                  if (block.items.length === 1) removeBlock(block.id);
                  else
                    updateBlock(block.id, {
                      items: block.items.filter((_, j) => j !== i),
                    } as Partial<Block>);
                }}
                className="flex-1 text-base leading-relaxed text-foreground/85"
              />
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
}

/** Caption editing sits under the image, where the caption actually appears. */
function CaptionEditor({ block }: { block: Extract<Block, { kind: 'image' }> }) {
  const { blog, updateBlock } = useComposerStore();
  const media = blog?.media.find((m) => m.id === block.mediaId);
  const value = block.caption ?? media?.caption ?? '';

  // An overlay caption is drawn by the renderer on top of the image, so a second
  // editable copy beneath it would be confusing. Edit it via the toolbar there.
  if (block.placement.captionPosition === 'overlay') return null;

  return (
    <InlineText
      plain
      value={value}
      onChange={(caption) => updateBlock(block.id, { caption } as Partial<Block>)}
      placeholder="Add a caption…"
      ariaLabel="Image caption"
      className="mt-1.5 text-xs text-muted-foreground"
    />
  );
}

/* ── Canvas ───────────────────────────────────────────────── */

export function BlockCanvas({
  horses,
  parties,
  articles,
  imageRequest = 0,
  containerId = null,
  compact = false,
}: {
  horses: Array<{ id: string; name: string }>;
  parties: Array<{ id: string; name: string }>;
  articles: Array<{ id: string; name: string }>;
  /**
   * A counter the toolbar's Image button increments to ask for the picker.
   *
   * A counter rather than a boolean so pressing the button twice in a row opens
   * it twice — with a boolean the second press would be indistinguishable from
   * the first and nothing would happen.
   */
  imageRequest?: number;
  /**
   * Which block list to edit: the post body (`null`) or a part, by id. A part's
   * body is edited with THIS canvas rather than a simpler second editor, so a
   * sub-section can hold a photograph, a pull quote or a horse card exactly like
   * the body can — and there is one editing surface to keep working, not two.
   */
  containerId?: ContainerId;
  /** Tighter spacing for a part card, which sits inside a page that already scrolls. */
  compact?: boolean;
}) {
  const { blog, selectedId, select, moveBlockTo, insertBlock, addMedia } = useComposerStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [slashAt, setSlashAt] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);

  // This canvas's own list. A part that has been removed resolves to undefined,
  // which is the render guard below — not an empty array, so a vanished part
  // doesn't briefly draw as an empty page.
  const blocks =
    containerId === null ? blog?.blocks : blog?.parts?.find((p) => p.id === containerId)?.blocks;

  // Focus a block only when it was just created, so clicking an existing block
  // doesn't yank the caret out of whatever was being typed.
  const justInserted = useRef<string | null>(null);
  const lastCount = useRef(blocks?.length ?? 0);
  if (blocks && blocks.length !== lastCount.current) {
    if (blocks.length > lastCount.current) justInserted.current = selectedId;
    lastCount.current = blocks.length;
  }

  // The toolbar's Image button lands the picture after the block being edited,
  // or at the end when nothing is selected — the same place the slash menu and
  // the hover `+` would put it. Read from the store rather than the closure so a
  // stale `blocks` from an earlier render can't misplace it.
  useEffect(() => {
    if (imageRequest === 0) return;
    const state = useComposerStore.getState();
    const list =
      containerId === null
        ? state.blog?.blocks ?? []
        : state.blog?.parts?.find((p) => p.id === containerId)?.blocks ?? [];
    const found = state.selectedId ? list.findIndex((b) => b.id === state.selectedId) : -1;
    setPickerFor(found < 0 ? list.length : found + 1);
  }, [imageRequest, containerId]);

  if (!blog || !blocks) return null;
  const count = blocks.length;

  const openPicker = (atIndex: number) => setPickerFor(atIndex);

  const closeSlash = () => {
    setSlashAt(null);
    setSlashQuery('');
  };

  /** Files dropped anywhere on the canvas land at the end. */
  const onFileDrop = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const media = await addMedia(file);
      if (media) insertBlock(makeImage(media.id), undefined, containerId);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        // Only react to FILES; a block reorder drag carries text/plain.
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setFileDragOver(true);
      }}
      onDragLeave={() => setFileDragOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setFileDragOver(false);
        void onFileDrop(e.dataTransfer.files);
      }}
      className={cn(
        'relative',
        // Room below the last block for the slash menu to open downwards. A part
        // card doesn't need anything like as much — it would just be a tall gap
        // inside the card.
        compact ? 'pb-12' : 'pb-32',
        fileDragOver && 'rounded-sm ring-2 ring-inset ring-primary/40',
      )}
    >
      {fileDragOver && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow">
            <ImagePlus size={13} />
            Drop to add images
          </span>
        </div>
      )}

      {count === 0 ? (
        <div className={cn('mx-auto max-w-lg px-4 text-center', compact ? 'py-8' : 'py-16')}>
          <p className="mb-1 font-[family-name:var(--font-display)] text-lg italic text-muted-foreground">
            {compact ? 'This part is empty.' : 'An empty page.'}
          </p>
          <p className="mb-5 text-xs text-muted-foreground/70">
            Start typing, drop in a photograph, or press <kbd className="rounded border border-border/60 px-1">/</kbd>
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => insertBlock(paragraph(), 0, containerId)}
              className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Start writing
            </button>
            <InsertMenu onInsert={(b) => insertBlock(b, 0, containerId)} onAddImage={() => openPicker(0)} />
          </div>
        </div>
      ) : (
        <BlogRenderer
          blocks={blocks}
          media={blog.media}
          dropCap={false}
          wrapBlock={(block, rendered, index) => {
            const selected = block.id === selectedId;
            const editable = inlineEditable(block);

            // A floated block's wrapper would collapse to zero height, taking the
            // selection ring, toolbar anchor and hover target with it. Move the
            // float onto the wrapper; index.css neutralises the inner one.
            const placement = block.kind === 'image' || block.kind === 'gallery' ? block.placement : null;
            const resolved = placement ? resolvePlacement(placement) : null;
            const hostFloat = resolved?.floating ? resolved.floatClass : '';

            return (
              <div className={cn('group/blk relative', hostFloat && `blog-float-host ${hostFloat}`)}>
                {dragId && dropIndex === index && (
                  <div className="pointer-events-none absolute -top-1 left-0 right-0 z-20 h-0.5 bg-primary" />
                )}

                <div
                  draggable={dragId === block.id}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropIndex(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    setDropIndex(e.clientY < r.top + r.height / 2 ? index : index + 1);
                  }}
                  onDrop={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    if (dropIndex !== null) moveBlockTo(dragId, dropIndex);
                    setDragId(null);
                    setDropIndex(null);
                  }}
                  onClick={() => {
                    select(block.id);
                    closeSlash();
                  }}
                  className={cn(
                    'relative rounded-sm',
                    selected && 'ring-2 ring-primary/40 ring-offset-4 ring-offset-background',
                    dragId === block.id && 'opacity-40',
                  )}
                >
                  {/* Only a drag handle stays in the gutter — everything else
                      moved to the contextual toolbar. */}
                  <button
                    type="button"
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    onMouseDown={() => setDragId(block.id)}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', block.id)}
                    className={cn(
                      'absolute -left-7 top-0.5 cursor-grab rounded p-1 text-muted-foreground/40 transition-opacity hover:text-foreground',
                      selected ? 'opacity-100' : 'opacity-0 group-hover/blk:opacity-100',
                    )}
                  >
                    <GripVertical size={13} />
                  </button>


                  {editable ? (
                    <>
                      <InlineEditorFor
                        block={block}
                        blocks={blocks}
                        containerId={containerId}
                        autoFocus={justInserted.current === block.id}
                        onSlash={() => {
                          setSlashAt(block.id);
                          setSlashQuery('');
                        }}
                      />
                      {slashAt === block.id && (
                        <SlashMenu
                          query={slashQuery}
                          onQuery={setSlashQuery}
                          onAddImage={() => {
                            closeSlash();
                            openPicker(index + 1);
                          }}
                          onPick={(b) => {
                            closeSlash();
                            // Replace an empty paragraph rather than leaving a
                            // blank one above whatever was just chosen.
                            const isEmptyPara =
                              block.kind === 'paragraph' && block.html.trim().length === 0;
                            if (isEmptyPara) {
                              useComposerStore.getState().removeBlock(block.id);
                              insertBlock(b, index, containerId);
                            } else {
                              insertBlock(b, index + 1, containerId);
                            }
                          }}
                          onClose={closeSlash}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      {rendered}
                      {block.kind === 'image' && <CaptionEditor block={block} />}
                    </>
                  )}
                </div>

                {/* Hover-revealed insert point after every block. */}
                <div className="relative h-5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/blk:opacity-100">
                  <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
                    <InsertMenu
                      compact
                      onInsert={(b) => insertBlock(b, index + 1, containerId)}
                      onAddImage={() => openPicker(index + 1)}
                    />
                    <span className="h-px flex-1 bg-border/50" aria-hidden="true" />
                  </div>
                </div>

                {dragId && dropIndex === index + 1 && index === count - 1 && (
                  <div className="pointer-events-none absolute -bottom-1 left-0 right-0 z-20 h-0.5 bg-primary" />
                )}
              </div>
            );
          }}
        />
      )}

      <ImagePicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onChoose={(media) => {
          const at = pickerFor ?? blocks.length;
          insertBlock(makeImage(media.id), at, containerId);
        }}
      />
    </div>
  );
}
