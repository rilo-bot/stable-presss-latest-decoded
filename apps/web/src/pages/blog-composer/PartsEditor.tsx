/**
 * Post parts — the "add part" repeater under the body.
 *
 *   Post parts                                              [ Add part ]
 *   Optional titled sections…
 *   ┌ PART 1 · Two-year-olds                       ↑  ↓  Remove ┐
 *   │ Part title  [ Two-year-olds                             ] │
 *   │ Part body   ┌ B I U │ H2 H3 ¶ │ • List 1. List " │ … ─┐   │
 *   │             │ …blocks…                              │   │
 *   └────────────────────────────────────────────────────────────┘
 *
 * A part is a title and a body, and its body is edited with the SAME canvas as
 * the post's own — so a sub-section can hold a photograph or a pull quote, and
 * there is one editing surface to keep working rather than two that drift.
 *
 * Two details are load-bearing:
 *
 * EACH CARD HAS ITS OWN TOOLBAR, scoped to its own part (`containerId`). The
 * selection is a single block id for the whole post, so an unscoped toolbar would
 * light up whenever anything anywhere were selected and its H2 button would
 * retype a paragraph in a different section.
 *
 * THE CARD IS KEYED BY `part.id`, which is minted here and preserved by the
 * server through every save. Keying on the array index instead would remount the
 * body — and blow away the caret — the moment a part was reordered or removed.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { partHasContent, type BlogPart } from '@/types/blog';
import { useComposerStore } from './composerStore';
import { BlockCanvas } from './BlockCanvas';
import { BodyToolbar } from './BodyToolbar';
import { FieldAi, inputCls } from './controls';
import type { RefOptions } from './ToolsRail';

/** Mirrors MAX_PARTS in the server's lib/blog/blocks.ts. */
const MAX_PARTS = 20;

function PartCard({
  part,
  index,
  total,
  refs,
  autoFocusTitle,
}: {
  part: BlogPart;
  index: number;
  total: number;
  refs: RefOptions;
  autoFocusTitle: boolean;
}) {
  const { updatePart, movePart, removePart, select, selectField, selectedFieldId } = useComposerStore();
  /** Per-card counter for the toolbar's Image button — see BlockCanvas. */
  const [imageRequest, setImageRequest] = useState(0);

  const title = part.title.trim();
  const empty = !partHasContent(part);

  return (
    // `data-part-id` names the card in the DOM. Every other handle on it —
    // "Part 2", a title, a position — either changes as the author works or isn't
    // unique, so this is what tooling and tests can hold onto.
    <div data-part-id={part.id} className="rounded-sm border border-border/60 bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <p className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Part {index + 1}
          {title && (
            <span className="font-semibold normal-case tracking-normal text-foreground"> · {title}</span>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`Move part ${index + 1} up`}
            title="Move up"
            disabled={index === 0}
            onClick={() => movePart(part.id, -1)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            aria-label={`Move part ${index + 1} down`}
            title="Move down"
            disabled={index === total - 1}
            onClick={() => movePart(part.id, 1)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ArrowDown size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              // Confirm only when there is something to lose. A card the author
              // just added and hasn't filled in shouldn't need a dialog to undo.
              const ok =
                empty ||
                window.confirm(
                  `Remove part ${index + 1}${title ? ` — “${title}”` : ''}? Its writing goes with it.`,
                );
              if (ok) removePart(part.id);
            }}
            className="ml-1 inline-flex items-center gap-1 rounded-sm border border-border/60 px-1.5 py-1 text-[11px] text-muted-foreground hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 size={11} />
            Remove
          </button>
        </div>
      </div>

      <div className="space-y-4 p-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor={`part-title-${part.id}`}
              className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Part title
            </label>
            {/* Composed from THIS part's writing, not the post's opening — see
                blogComposeContext. */}
            <FieldAi field={`part:${part.id}.title`} />
          </div>
          <input
            id={`part-title-${part.id}`}
            value={part.title}
            autoFocus={autoFocusTitle}
            placeholder="A heading for this section"
            // On the input, not the wrapper — see the note in controls.tsx.
            onFocus={() => selectField(`part:${part.id}.title`)}
            onChange={(e) => updatePart(part.id, { title: e.target.value })}
            className={cn(
              inputCls,
              'font-[family-name:var(--font-display)] font-semibold',
              selectedFieldId === `part:${part.id}.title` &&
                'ring-2 ring-purple-500/70 ring-offset-2 ring-offset-background',
            )}
          />
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Part body
          </p>
          <div className="rounded-sm border border-border/60">
            {/* Sticky within THIS card, at the same offset the body's toolbar
                uses (the newsroom's own pinned bar is 56px tall). Only one is
                ever pinned at a time, because each is confined to its own box. */}
            <div className="sticky top-14 z-20 bg-background">
              <BodyToolbar containerId={part.id} onAddImage={() => setImageRequest((n) => n + 1)} />
            </div>
            {/* Clicking the margin deselects. `target === currentTarget` is what
                makes that safe — a block's own click selects it and then bubbles
                up here, so an unconditional handler would deselect every block
                the instant it was selected. */}
            <div
              className="px-3 py-4 pl-9"
              onClick={(e) => {
                if (e.target === e.currentTarget) select(null);
              }}
            >
              <BlockCanvas
                compact
                containerId={part.id}
                imageRequest={imageRequest}
                horses={refs.horses}
                parties={refs.parties}
                articles={refs.articles}
              />
            </div>
          </div>
        </div>

        {/* Said plainly rather than letting the part quietly not appear. */}
        {empty && (
          <p className="text-[11px] text-muted-foreground/80">
            Nothing in this part yet — it won&rsquo;t show on the published post until it has a title or
            some writing.
          </p>
        )}
      </div>
    </div>
  );
}

export function PartsEditor({ refs }: { refs: RefOptions }) {
  const { blog, addPart } = useComposerStore();
  /** The part whose title should take the caret — set when one is added. */
  const [focusPartId, setFocusPartId] = useState<string | null>(null);

  if (!blog) return null;
  const parts = blog.parts ?? [];
  const atCap = parts.length >= MAX_PARTS;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Post parts
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Optional titled sections, shown after the body. Each one gets its own reaction scale on the
            published post, so readers can respond to a section rather than to the whole piece.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 shrink-0 gap-1.5 text-xs"
          disabled={atCap}
          title={atCap ? `Up to ${MAX_PARTS} parts per post` : undefined}
          onClick={() => setFocusPartId(addPart())}
        >
          <Plus size={13} />
          Add part
        </Button>
      </div>

      {parts.length > 0 && (
        <div className="mt-4 space-y-4">
          {parts.map((part, i) => (
            <PartCard
              key={part.id}
              part={part}
              index={i}
              total={parts.length}
              refs={refs}
              autoFocusTitle={part.id === focusPartId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
