import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarClock, Clock, MoreHorizontal, Pencil, Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { can, canEditArticle } from '@/lib/permissions';
import { FORWARD_MOVE, OTHER_MOVES } from '@/lib/workflow';
import type { Move } from '@/lib/workflow';
import type { Article } from '@/types/article';

function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return '';
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return '';
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function scheduleLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Small pill above the headline. */
function Tag({ label, tone }: { label: string; tone: 'alert' | 'muted' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold',
        tone === 'alert'
          ? 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {tone === 'alert' && <AlertTriangle size={9} />}
      {label}
    </span>
  );
}

interface StoryCardProps {
  article: Article;
  currentUserDisplayName: string | null;
  onMove: (article: Article, move: Move) => void;
  onEdit: (article: Article) => void;
  onDelete: (article: Article) => void;
}

/**
 * One story on the board: tag, headline, standfirst, then who and when.
 *
 * The old card showed a title, a status pill repeating the column it already sat
 * in, and an unlabelled chevron — no summary, and no indication of where the
 * chevron sent the story or whether you were allowed to press it. The forward
 * move is named here, and is absent rather than disabled when you can't make it.
 */
export function StoryCard({
  article, currentUserDisplayName, onMove, onEdit, onDelete,
}: StoryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const forward = FORWARD_MOVE[article.status];
  const canForward = !!forward && can(forward.permission);
  const others = OTHER_MOVES[article.status].filter((m) => can(m.permission));
  const editable = canEditArticle(article.author, currentUserDisplayName ?? undefined);
  const scheduled = scheduleLabel(article.scheduledFor);
  const hasMenu = others.length > 0 || editable;

  return (
    <article className="group rounded-sm border border-border/60 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md focus-within:shadow-md">
      {/* Tag row. Real data only — the category the desk filed it under, plus a
          rejection flag when an editor has sent it back. */}
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {article.changesRequested && <Tag label="Changes requested" tone="alert" />}
          {article.category && <Tag label={article.category} tone="muted" />}
          {/* "Newsletter" / "Bulletin" pills sat here, for any channel beyond
              `news`. The axis is gone — every published story is news — so the
              pill could only ever have said the one thing every card said. */}
        </div>
        {hasMenu && (
          <div ref={menuRef} className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`More actions for ${article.title || 'this story'}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className={cn(
                'rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
                menuOpen && 'md:opacity-100',
              )}
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-sm border border-border bg-popover shadow-lg"
              >
                {others.map((move) => (
                  <button
                    key={`${move.to}-${move.label}`}
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onMove(article, move); }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-muted/70',
                      move.back ? 'text-[hsl(var(--chart-3))]' : 'text-foreground',
                    )}
                  >
                    {move.back && <AlertTriangle size={13} className="flex-shrink-0" />}
                    {move.label}
                  </button>
                ))}
                {editable && (
                  <>
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); onEdit(article); }}
                      className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted/70"
                    >
                      <Pencil size={13} className="flex-shrink-0 text-muted-foreground" />
                      Edit story
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); onDelete(article); }}
                      className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 size={13} className="flex-shrink-0" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <h3 className="mt-2 text-[14.5px] font-bold leading-snug text-foreground line-clamp-2">
        {article.title || 'Untitled story'}
      </h3>

      {article.summary && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground line-clamp-2">
          {article.summary}
        </p>
      )}

      {article.changesRequestedNote && (
        <p className="mt-1.5 line-clamp-2 border-l-2 pl-2 text-[12px] italic leading-snug text-foreground/70"
          style={{ borderColor: 'hsl(var(--chart-3))' }}
        >
          {article.changesRequestedNote}
        </p>
      )}

      {/* Footer: who wrote it, and when. */}
      <div className="mt-3 flex items-center gap-2">
        <span
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold uppercase text-primary"
          title={article.author || 'Unattributed'}
        >
          {(article.author || '?').charAt(0)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
          {article.author || 'Unattributed'}
        </span>
        {article.status === 'scheduled' ? (
          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-[hsl(var(--chart-4))]">
            <CalendarClock size={11} />
            {scheduled ?? 'no date'}
          </span>
        ) : (
          relativeTime(article.createdAt) && (
            <span className="flex flex-shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <Clock size={10} />
              {relativeTime(article.createdAt)}
            </span>
          )
        )}
      </div>

      {forward && canForward && (
        <button
          onClick={() => onMove(article, forward)}
          className="mt-3 w-full rounded-sm bg-primary/10 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {forward.label}
        </button>
      )}
    </article>
  );
}
