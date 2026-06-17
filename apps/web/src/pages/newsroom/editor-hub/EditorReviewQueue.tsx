import { Inbox, Eye, RotateCcw } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { Article } from '@/types/article';
import { EditorReviewRow } from '../components/EditorReviewRow';

interface EditorReviewQueueProps {
  buckets: Record<KanbanStatus, Article[]>;
  onNewInColumn: (status: KanbanStatus) => void;
  onAdvance: (articleId: string, toStatus: KanbanStatus) => void;
  onEdit: (article: Article) => void;
}

export function EditorReviewQueue({ buckets, onNewInColumn, onAdvance, onEdit }: EditorReviewQueueProps) {
  const submitted = buckets.submitted;
  const inReview = buckets.editorial_review;
  const inRevision = buckets.revision;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: 'Awaiting Review',
            value: submitted.length,
            color: 'hsl(var(--chart-1))',
            icon: <Inbox size={14} />,
            urgent: submitted.length > 0,
          },
          {
            label: 'In Editorial Review',
            value: inReview.length,
            color: 'hsl(var(--chart-2))',
            icon: <Eye size={14} />,
            urgent: false,
          },
          {
            label: 'Sent for Revision',
            value: inRevision.length,
            color: '#e8a020',
            icon: <RotateCcw size={14} />,
            urgent: false,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={cn(
              'p-3 rounded-sm border',
              stat.urgent ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-card'
            )}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span style={{ color: stat.color }}>{stat.icon}</span>
              {stat.urgent && (
                <span
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold"
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
            <span className="block text-[12px] uppercase tracking-[0.08em] text-muted-foreground mt-0.5">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border/40 bg-primary/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox size={13} className="text-primary" />
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-foreground">
              Submitted — Awaiting Editorial Review
            </p>
            {submitted.length > 0 && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground tabular-nums">
                {submitted.length}
              </span>
            )}
          </div>
        </div>

        {submitted.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              icon={Inbox}
              heading="The queue is clear — no stories waiting for review."
              description="Submitted stories from contributors will appear here. Once a story lands, you can pull it into editorial review or send it back for revision."
              ctaLabel="File a Story"
              onCta={() => onNewInColumn('draft')}
            />
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {submitted.map((article) => (
              <EditorReviewRow
                key={article.id}
                article={article}
                onPullToReview={() => onAdvance(article.id, 'editorial_review')}
                onSendRevision={() => onAdvance(article.id, 'revision')}
                onEdit={() => onEdit(article)}
                actionLabel="Pull to Review"
                actionColor="hsl(var(--chart-2))"
              />
            ))}
          </div>
        )}
      </div>

      <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center gap-2">
          <Eye size={13} className="text-muted-foreground" />
          <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
            In Editorial Review
          </p>
          {inReview.length > 0 && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
              {inReview.length}
            </span>
          )}
        </div>

        {inReview.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] text-muted-foreground italic font-[family-name:var(--font-display)]">
              No stories currently under editorial review.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {inReview.map((article) => (
              <EditorReviewRow
                key={article.id}
                article={article}
                onPullToReview={() => onAdvance(article.id, 'legal_review')}
                onSendRevision={() => onAdvance(article.id, 'revision')}
                onEdit={() => onEdit(article)}
                actionLabel="Clear — Send to Legal"
                actionColor="hsl(var(--chart-3))"
              />
            ))}
          </div>
        )}
      </div>

      {inRevision.length > 0 && (
        <div className="border border-dashed border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center gap-2">
            <RotateCcw size={13} style={{ color: '#e8a020' }} />
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold" style={{ color: '#e8a020' }}>
              Sent Back for Revision
            </p>
            <span
              className="text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
              style={{ background: 'rgba(232,160,32,0.15)', color: '#e8a020' }}
            >
              {inRevision.length}
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {inRevision.map((article) => (
              <EditorReviewRow
                key={article.id}
                article={article}
                onPullToReview={() => onAdvance(article.id, 'editorial_review')}
                onSendRevision={() => {}}
                onEdit={() => onEdit(article)}
                actionLabel="Re-pull to Review"
                actionColor="#e8a020"
                hideRevision
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
