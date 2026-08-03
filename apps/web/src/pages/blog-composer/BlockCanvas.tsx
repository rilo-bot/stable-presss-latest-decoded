/**
 * The editing canvas.
 *
 * Renders through `BlogRenderer` — the same component the public page uses —
 * and passes `wrapBlock` to layer selection, reordering and text editing over
 * the real output. Nothing here re-implements layout, so what an author places
 * is literally what a reader gets.
 *
 * Text blocks are edited IN PLACE rather than in a side panel: the inspector
 * owns structure and placement, the canvas owns words.
 */
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { BlogRenderer } from '@/blog/BlogRenderer';
import { resolvePlacement } from '@/blog/placement';
import { blockLabel, paragraph } from '@/blog/factories';
import { useComposerStore } from './composerStore';
import { InlineText } from './InlineText';
import { InsertMenu } from './InsertMenu';
import type { Block } from '@/types/blog';
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';

/** Text-family kinds are edited inline; everything else via the inspector. */
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

/** The inline editor for one block, styled to match its rendered output. */
function InlineEditorFor({ block, autoFocus }: { block: Block; autoFocus: boolean }) {
  const { updateBlock, insertBlock, removeBlock, blog } = useComposerStore();
  const index = blog?.blocks.findIndex((b) => b.id === block.id) ?? -1;

  const addAfter = () => insertBlock(paragraph(), index + 1);

  switch (block.kind) {
    case 'paragraph':
      return (
        <InlineText
          value={block.html}
          onChange={(html) => updateBlock(block.id, { html } as Partial<Block>)}
          placeholder="Write…"
          ariaLabel="Paragraph text"
          onEnter={addAfter}
          onEmptyBackspace={() => removeBlock(block.id)}
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
          {block.attribution && (
            <p
              className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              — {block.attribution}
            </p>
          )}
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
                // Enter adds the next item; Backspace on an empty one removes it,
                // which is how every list editor behaves.
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

export function BlockCanvas() {
  const { blog, selectedId, select, moveBlock, moveBlockTo, removeBlock, insertBlock } = useComposerStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // Focus a block only when it was just created, so clicking an existing block
  // to select it doesn't yank the caret away from wherever the user was typing.
  const justInserted = useRef<string | null>(null);
  const lastCount = useRef(blog?.blocks.length ?? 0);

  if (!blog) return null;

  if (blog.blocks.length !== lastCount.current) {
    if (blog.blocks.length > lastCount.current) justInserted.current = selectedId;
    lastCount.current = blog.blocks.length;
  }

  const count = blog.blocks.length;

  return (
    <div className="pb-32">
      {blog.blocks.length === 0 ? (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="mb-4 font-[family-name:var(--font-display)] text-lg italic text-muted-foreground">
            An empty page. Add the first block.
          </p>
          <InsertMenu onInsert={(b) => insertBlock(b, 0)} align="center" />
        </div>
      ) : (
        <BlogRenderer
          blocks={blog.blocks}
          media={blog.media}
          dropCap={false}
          wrapBlock={(block, rendered, index) => {
            const selected = block.id === selectedId;
            const editable = inlineEditable(block);

            // A floated block's wrapper would collapse to zero height, taking the
            // selection ring and the hover target with it. Move the float up onto
            // the wrapper; index.css neutralises the renderer's own float inside.
            const placement = block.kind === 'image' || block.kind === 'gallery' ? block.placement : null;
            const resolved = placement ? resolvePlacement(placement) : null;
            const hostFloat = resolved?.floating ? resolved.floatClass : '';

            return (
              <div className={cn('group/blk relative', hostFloat && `blog-float-host ${hostFloat}`)}>
                {/* Drop line above this block */}
                {dragId && dropIndex === index && (
                  <div className="pointer-events-none absolute -top-1 left-0 right-0 z-20 h-0.5 bg-primary" />
                )}

                <div
                  // A drag can start anywhere on the row but only from the handle,
                  // or a text selection inside a paragraph would begin a drag.
                  draggable={dragId === block.id}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropIndex(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    // Past the midpoint means "after me".
                    setDropIndex(e.clientY < r.top + r.height / 2 ? index : index + 1);
                  }}
                  onDrop={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    if (dropIndex !== null) moveBlockTo(dragId, dropIndex);
                    setDragId(null);
                    setDropIndex(null);
                  }}
                  onClick={() => select(block.id)}
                  className={cn(
                    'relative rounded-sm transition-shadow',
                    selected
                      ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
                      : 'hover:ring-1 hover:ring-border',
                    dragId === block.id && 'opacity-40',
                  )}
                >
                  {/* Row controls, in the gutter so they never cover the content. */}
                  <div
                    className={cn(
                      'absolute -left-11 top-0 z-10 flex flex-col items-center gap-0.5 transition-opacity',
                      selected ? 'opacity-100' : 'opacity-0 group-hover/blk:opacity-100',
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`Drag ${blockLabel(block)}`}
                      title="Drag to reorder"
                      onMouseDown={() => setDragId(block.id)}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', block.id)}
                      className="cursor-grab rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    >
                      <GripVertical size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Move up"
                      title="Move up"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveBlock(block.id, -1);
                      }}
                      className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground disabled:opacity-25"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      title="Move down"
                      disabled={index === count - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveBlock(block.id, 1);
                      }}
                      className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground disabled:opacity-25"
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete block"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBlock(block.id);
                      }}
                      className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {editable ? (
                    <InlineEditorFor block={block} autoFocus={justInserted.current === block.id} />
                  ) : (
                    rendered
                  )}
                </div>

                {/* Insert point after every block, revealed on hover. */}
                <div className="relative h-4 opacity-0 transition-opacity focus-within:opacity-100 group-hover/blk:opacity-100">
                  <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center">
                    <InsertMenu onInsert={(b) => insertBlock(b, index + 1)} compact />
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
    </div>
  );
}
