import { CalendarClock, Clock, CheckCircle } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import type { ArticleStatus } from '@/types/article';
import type { Article } from '@/types/article';
import type { EditorTab } from '../constants';
import { StatusBadge } from '../components/StatusBadge';

interface EditorSchedulingProps {
  articles: Article[];
  buckets: Record<ArticleStatus, Article[]>;
  onAdvance: (articleId: string, toStatus: ArticleStatus) => void;
  setEditorTab: (tab: EditorTab) => void;
}

export function EditorScheduling({ articles, buckets, onAdvance, setEditorTab }: EditorSchedulingProps) {
  // Approved stories are booked straight in — the Publisher Review stage that
  // used to sit between Approved and Scheduled is gone.
  const schedulable = (articles ?? []).filter((a) => a.status === 'approved');
  const alreadyScheduled = buckets.scheduled;

  return (
    <div className="space-y-5">
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-sm border"
        style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.05)' }}
      >
        <CalendarClock size={15} className="text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground mb-0.5">Scheduled Publishing</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Approved and Publisher-reviewed stories can be queued for publication.
          </p>
        </div>
      </div>

      <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border/40 bg-primary/5 flex items-center gap-2">
          <Clock size={13} className="text-primary" />
          <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-foreground">Currently Scheduled</p>
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground tabular-nums">
            {alreadyScheduled.length}
          </span>
        </div>
        {alreadyScheduled.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] text-muted-foreground italic font-[family-name:var(--font-display)]">
              Nothing queued yet. Schedule approved stories below.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {alreadyScheduled.map((article) => (
              <div key={article.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-1">{article.title}</p>
                  <p className="text-[12px] text-muted-foreground">{article.author}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm bg-primary/10 text-primary">
                    Scheduled
                  </span>
                  <button
                    onClick={() => onAdvance(article.id, 'published')}
                    className="text-[12px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    Publish Now →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center gap-2">
          <CheckCircle size={13} className="text-muted-foreground" />
          <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Ready to Schedule</p>
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
            {schedulable.length}
          </span>
        </div>
        {schedulable.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              icon={CalendarClock}
              heading="Nothing ready to schedule yet."
              description="Approved stories appear here, ready to be booked in. Approve something in the review queue first."
              ctaLabel="Go to Review Queue"
              onCta={() => setEditorTab('review-queue')}
            />
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {schedulable.map((article) => (
              <div key={article.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-1">{article.title}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {article.author} · <StatusBadge status={article.status} />
                  </p>
                </div>
                <button
                  onClick={() => onAdvance(article.id, 'scheduled')}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-primary/30 bg-primary/8 text-primary text-[12px] uppercase tracking-[0.08em] font-semibold hover:bg-primary/15 transition-colors"
                >
                  <CalendarClock size={11} />
                  Schedule →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
