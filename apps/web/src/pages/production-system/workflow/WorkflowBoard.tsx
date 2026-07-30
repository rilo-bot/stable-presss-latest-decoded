import { useState } from 'react';
import { PenLine, Plus } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { enterPermission } from '@/lib/workflow';
import type { Move, StageMeta } from '@/lib/workflow';
import type { Article, ArticleStatus } from '@/types/article';

import { StoryCard } from './StoryCard';

interface WorkflowBoardProps {
  /** Stages this role may see — a subset of WORKFLOW_STAGES, in order. */
  visibleStages: StageMeta[];
  buckets: Record<ArticleStatus, Article[]>;
  isContributor: boolean;
  myStories: number;
  totalStories: number;
  currentUserDisplayName: string | null;
  onMove: (article: Article, move: Move, note?: string) => void;
  onEdit: (article: Article) => void;
  onDelete: (article: Article) => void;
  onNewInColumn: (status: ArticleStatus) => void;
  onOpenStudio: () => void;
}

/**
 * The story board — a column per stage, scrolling sideways.
 *
 * Columns are a fixed comfortable width so a card can carry a headline, a
 * standfirst and a byline without wrapping to nothing. The old board squeezed up
 * to six columns into a responsive grid, which at full width left each card
 * ~150px across — the reason they read as boxes rather than stories.
 */
export function WorkflowBoard({
  visibleStages, buckets, isContributor, myStories, totalStories,
  currentUserDisplayName, onMove, onEdit, onDelete, onNewInColumn, onOpenStudio,
}: WorkflowBoardProps) {
  const [pendingBack, setPendingBack] = useState<{ article: Article; move: Move } | null>(null);
  const [note, setNote] = useState('');

  const displayCount = isContributor ? myStories : totalStories;

  const handleMove = (article: Article, move: Move) => {
    // A send-back needs a reason — otherwise the writer sees "changes requested"
    // with nothing to act on.
    if (move.back && move.to === 'draft') {
      setPendingBack({ article, move });
      setNote(article.changesRequestedNote ?? '');
      return;
    }
    onMove(article, move);
  };

  const confirmBack = () => {
    if (!pendingBack) return;
    onMove(pendingBack.article, pendingBack.move, note.trim() || undefined);
    setPendingBack(null);
    setNote('');
  };

  if (displayCount === 0) {
    return (
      <EmptyState
        icon={PenLine}
        heading="No stories in the queue. The press is ready when you are."
        description="File your first dispatch to begin the newsroom record. The board will fill as your team starts writing."
        ctaLabel="File Your First Story"
        onCta={() => onNewInColumn('draft')}
        secondaryCtaLabel="Story Studio AI"
        onSecondaryCta={onOpenStudio}
      />
    );
  }

  return (
    <>
      {/* -mx/px pair lets the board bleed to the edge of the page padding, so the
          last column isn't clipped mid-card when it scrolls. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-4">
          {visibleStages.map((stage) => (
            <Column
              key={stage.status}
              stage={stage}
              articles={buckets[stage.status]}
              currentUserDisplayName={currentUserDisplayName}
              onMove={handleMove}
              onEdit={onEdit}
              onDelete={onDelete}
              onNewInColumn={onNewInColumn}
            />
          ))}
        </div>
      </div>

      <Dialog
        open={pendingBack !== null}
        onOpenChange={(open) => { if (!open) { setPendingBack(null); setNote(''); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send back for changes?</DialogTitle>
            <DialogDescription>
              “{pendingBack?.article.title}” returns to Draft. Tell the writer what needs
              changing — the note shows on the story's card.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="e.g. Tighten the opening and confirm the winning margin."
            aria-label="What needs changing"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendingBack(null); setNote(''); }}>
              Cancel
            </Button>
            <Button onClick={confirmBack}>Send back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ColumnProps {
  stage: StageMeta;
  articles: Article[];
  currentUserDisplayName: string | null;
  onMove: (article: Article, move: Move) => void;
  onEdit: (article: Article) => void;
  onDelete: (article: Article) => void;
  onNewInColumn: (status: ArticleStatus) => void;
}

function Column({
  stage, articles, currentUserDisplayName, onMove, onEdit, onDelete, onNewInColumn,
}: ColumnProps) {
  // The header's `+` files a story straight into this stage, which the server
  // allows only with the permission that stage demands — so the button is only
  // offered when the viewer actually holds it.
  const needed = enterPermission(stage.status);
  const canAddHere = can('content.draft.create') && (needed === null || can(needed));

  return (
    <section
      className="flex w-[300px] flex-shrink-0 flex-col"
      aria-label={`${stage.label} — ${articles.length} ${articles.length === 1 ? 'story' : 'stories'}`}
    >
      {/* Filled header: count, stage, and the add button. */}
      <div
        className="flex items-center gap-2 rounded-sm px-3 py-2.5"
        style={{ background: stage.accent, color: stage.onAccent }}
      >
        <span
          className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums"
          style={{ background: 'hsl(var(--card) / 0.25)' }}
        >
          {articles.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{stage.label}</span>
        {canAddHere && (
          <button
            onClick={() => onNewInColumn(stage.status)}
            aria-label={`New story in ${stage.label}`}
            title={`New story in ${stage.label}`}
            className="flex-shrink-0 rounded-sm p-0.5 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{stage.sublabel}</p>

      <div className="mt-2 flex flex-col gap-2.5">
        {articles.length === 0 && (
          <p className="rounded-sm border border-dashed border-border/60 px-3 py-8 text-center text-[12px] text-muted-foreground">
            Nothing in {stage.label.toLowerCase()}
          </p>
        )}
        {articles.map((article) => (
          <StoryCard
            key={article.id}
            article={article}
            currentUserDisplayName={currentUserDisplayName}
            onMove={onMove}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}
