/**
 * Block insertion — a `+` button and a `/` command over the same list.
 *
 * Six common kinds are offered up front; the rest sit behind "More". A long flat
 * list of thirteen was the thing that made adding a block feel like configuring
 * something.
 *
 * Image and gallery are absent: both need a media id, so they arrive by dropping
 * a file or picking from the pool. An empty image block would be dropped by the
 * validator on the next save, which reads to the author as content vanishing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Block } from '@/types/blog';
import {
  callout, code, divider, embed, heading, horseCard, list, paragraph, partyCard, quote, articleRef,
} from '@/blog/factories';
import {
  Code2, Heading2, Image as ImageIcon, Info, Link2, List as ListIcon, Minus,
  Newspaper, Plus, Quote as QuoteIcon, Type, User, Video,
} from 'lucide-react';

export interface InsertOption {
  key: string;
  label: string;
  hint: string;
  /** Extra words the slash filter should match ("photo" → Image). */
  keywords: string[];
  icon: React.ReactNode;
  make: () => Block;
  primary?: boolean;
}

export const INSERT_OPTIONS: InsertOption[] = [
  { key: 'paragraph', label: 'Text', hint: 'Body copy', keywords: ['paragraph', 'p', 'body'], icon: <Type size={14} />, make: () => paragraph(), primary: true },
  { key: 'heading', label: 'Heading', hint: 'Section title', keywords: ['h2', 'h3', 'title'], icon: <Heading2 size={14} />, make: () => heading(2), primary: true },
  { key: 'list', label: 'List', hint: 'Bulleted or numbered', keywords: ['bullet', 'ul', 'ol', 'numbered'], icon: <ListIcon size={14} />, make: () => list(false), primary: true },
  { key: 'quote', label: 'Quote', hint: 'Pull quote', keywords: ['blockquote', 'pull'], icon: <QuoteIcon size={14} />, make: () => quote(), primary: true },
  { key: 'divider', label: 'Divider', hint: 'Rule or ornament', keywords: ['hr', 'rule', 'break', 'space'], icon: <Minus size={14} />, make: () => divider(), primary: true },
  { key: 'callout', label: 'Callout', hint: 'Note, tip or warning', keywords: ['note', 'tip', 'warning', 'aside'], icon: <Info size={14} />, make: () => callout(), primary: true },

  { key: 'embed', label: 'Embed', hint: 'YouTube, Vimeo, Spotify', keywords: ['video', 'youtube', 'vimeo', 'spotify', 'iframe'], icon: <Video size={14} />, make: () => embed() },
  { key: 'horseCard', label: 'Horse card', hint: 'Link a horse record', keywords: ['horse', 'record'], icon: <Link2 size={14} />, make: () => horseCard() },
  { key: 'partyCard', label: 'Profile card', hint: 'Link a person', keywords: ['person', 'party', 'trainer', 'jockey', 'owner'], icon: <User size={14} />, make: () => partyCard() },
  { key: 'articleRef', label: 'Story link', hint: 'Link a news story', keywords: ['article', 'news'], icon: <Newspaper size={14} />, make: () => articleRef() },
  { key: 'code', label: 'Code', hint: 'Preformatted text', keywords: ['pre', 'snippet'], icon: <Code2 size={14} />, make: () => code() },
];

/** Filter for the slash command. Empty query returns the primary six. */
export function filterInsertOptions(query: string): InsertOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return INSERT_OPTIONS.filter((o) => o.primary);
  return INSERT_OPTIONS.filter(
    (o) => o.label.toLowerCase().includes(q) || o.keywords.some((k) => k.includes(q)),
  );
}

/* ── Shared list body, used by both the + menu and the / menu ── */

export function InsertList({
  options,
  activeIndex,
  onPick,
  onAddImage,
}: {
  options: InsertOption[];
  activeIndex?: number;
  onPick: (option: InsertOption) => void;
  onAddImage?: () => void;
}) {
  return (
    <>
      {onAddImage && (
        <button
          type="button"
          role="menuitem"
          onClick={onAddImage}
          className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-muted"
        >
          <span className="text-muted-foreground">
            <ImageIcon size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-foreground">Image</span>
            <span className="block text-[11px] text-muted-foreground">Upload or choose one</span>
          </span>
        </button>
      )}
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          role="menuitem"
          onClick={() => onPick(o)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors',
            i === activeIndex ? 'bg-muted' : 'hover:bg-muted',
          )}
        >
          <span className="text-muted-foreground">{o.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-foreground">{o.label}</span>
            <span className="block text-[11px] text-muted-foreground">{o.hint}</span>
          </span>
        </button>
      ))}
      {options.length === 0 && (
        <p className="px-2 py-3 text-center text-[11px] italic text-muted-foreground">Nothing matches.</p>
      )}
    </>
  );
}

/* ── The + button ─────────────────────────────────────────── */

export function InsertMenu({
  onInsert,
  onAddImage,
  compact,
  align = 'left',
}: {
  onInsert: (block: Block) => void;
  onAddImage?: () => void;
  compact?: boolean;
  align?: 'left' | 'center';
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Collapse back to the short list each time it reopens, so "More" never
  // becomes the permanent state.
  useEffect(() => {
    if (!open) setShowAll(false);
  }, [open]);

  const options = useMemo(() => (showAll ? INSERT_OPTIONS : INSERT_OPTIONS.filter((o) => o.primary)), [showAll]);

  return (
    <div ref={wrapRef} className={cn('relative', align === 'center' && 'flex justify-center')}>
      <button
        type="button"
        aria-label="Add a block"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm transition-colors',
          open
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground/70 hover:bg-muted hover:text-foreground',
          compact ? 'px-1.5 py-0.5 text-[11px]' : 'border border-dashed border-border/70 px-3 py-1.5 text-xs',
        )}
      >
        <Plus size={compact ? 12 : 13} />
        {compact ? '' : 'Add a block'}
      </button>

      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'slim-scroll absolute z-40 mt-1 max-h-80 w-56 overflow-y-auto rounded-sm border border-border bg-popover p-1 shadow-lg',
            align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0',
          )}
        >
          <InsertList
            options={options}
            onAddImage={
              onAddImage
                ? () => {
                    onAddImage();
                    setOpen(false);
                  }
                : undefined
            }
            onPick={(o) => {
              onInsert(o.make());
              setOpen(false);
            }}
          />
          {!showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-1 w-full rounded-sm border-t border-border/50 px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              More block types…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
