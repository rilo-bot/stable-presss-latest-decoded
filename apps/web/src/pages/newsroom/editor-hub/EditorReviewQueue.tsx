import { Inbox, RotateCcw } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { Article, ArticleStatus } from '@/types/article';
import { EditorReviewRow } from '../components/EditorReviewRow';

interface EditorReviewQueueProps {
  buckets: Record<ArticleStatus, Article[]>;
  onNewInColumn: (status: ArticleStatus) => void;
  onOpenStudio: () => void;
  onAdvance: (articleId: string, toStatus: ArticleStatus) => void;
  onEdit: (article: Article) => void;
}

/**
 * The editorial queue: what needs a decision, and what has been handed back.
 *
 * Was three lists — Submitted, In Editorial Review, Sent for Revision — because
 * a story moved through a separate status for each department's sign-off.
 * Approval is one action now, so there is a single queue to work. Stories an
 * editor sent back are Drafts carrying a `changesRequested` flag, listed
 * underneath so they don't vanish from the editor's view.
 */
export function EditorReviewQueue({
  buckets, onNewInColumn, onOpenStudio, onAdvance, onEdit,
}: EditorReviewQueueProps) {
  const submitted = buckets.submitted;
  const sentBack = buckets.draft.filter((a) => a.changesRequested);

  const stats = [
    {
      label: 'Awaiting your approval',
      value: submitted.length,
      color: 'hsl(var(--brand-accent))',
      icon: <Inbox size={14} />,
      urgent: submitted.length > 0,
    },
    {
      label: 'Sent back for changes',
      value: sentBack.length,
      color: 'hsl(var(--chart-3))',
      icon: <RotateCcw size={14} />,
      urgent: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              'rounded-xl border p-3',
              stat.urgent ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-card',
            )}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span style={{ color: stat.color }}>{stat.icon}</span>
              {stat.urgent && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: 'hsl(var(--brand-accent))',
                    color: 'hsl(var(--brand-accent-foreground))',
                  }}
                >
                  Action
                </span>
              )}
            </div>
            <span
              className="block font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums"
              style={{ color: stat.color }}
            >
              {stat.value}
            </span>
            <span className="mt-0.5 block text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── The one queue ── */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center justify-between border-b border-border/40 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Inbox size={13} className="text-primary" />
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-foreground">
              Submitted — awaiting approval
            </p>
            {submitted.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-primary-foreground">
                {submitted.length}
              </span>
            )}
          </div>
        </div>

        {submitted.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              icon={Inbox}
              heading="The queue is clear — no stories waiting for approval."
              description="Submitted stories appear here. Approve one to clear it for publication, or send it back with a note saying what needs changing."
              ctaLabel="File a Story"
              onCta={() => onNewInColumn('draft')}
              secondaryCtaLabel="Story Studio AI"
              onSecondaryCta={onOpenStudio}
            />
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {submitted.map((article) => (
              <EditorReviewRow
                key={article.id}
                article={article}
                onPullToReview={() => onAdvance(article.id, 'approved')}
                onSendRevision={() => onAdvance(article.id, 'draft')}
                onEdit={() => onEdit(article)}
                actionLabel="Approve"
                actionColor="hsl(var(--chart-1))"
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Handed back ── */}
      {sentBack.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-dashed border-border/60 bg-card">
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
            <RotateCcw size={13} style={{ color: 'hsl(var(--chart-3))' }} />
            <p
              className="text-[12px] font-bold uppercase tracking-[0.12em]"
              style={{ color: 'hsl(var(--chart-3))' }}
            >
              Sent back for changes
            </p>
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
              style={{ background: 'hsl(var(--chart-3)/0.15)', color: 'hsl(var(--chart-3))' }}
            >
              {sentBack.length}
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {sentBack.map((article) => (
              <div key={article.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                    {article.title || 'Untitled story'}
                  </span>
                  <span className="flex-shrink-0 text-[11.5px] text-muted-foreground">
                    {article.author}
                  </span>
                  <button
                    onClick={() => onEdit(article)}
                    className="flex-shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open
                  </button>
                </div>
                {article.changesRequestedNote && (
                  <p
                    className="mt-1 border-l-2 pl-2 text-[12px] italic text-foreground/70"
                    style={{ borderColor: 'hsl(var(--chart-3))' }}
                  >
                    {article.changesRequestedNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
