import { Lock, DollarSign } from 'lucide-react';
import { isLive } from '@/types/article';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import type { ArticleStatus } from '@/types/article';

interface CompensationViewProps {
  articles: Article[];
  currentUserDisplayName: string | undefined;
  onNavigate: (nav: string) => void;
  onNewInColumn: (status: ArticleStatus) => void;
  onOpenStudio: () => void;
}

export function CompensationView({ articles, currentUserDisplayName, onNavigate, onNewInColumn, onOpenStudio }: CompensationViewProps) {
  const myPublished = (articles ?? []).filter(
    (a) =>
      a.author === currentUserDisplayName &&
      isLive(a)
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'Stories Published',
            value: myPublished.length,
            sub: 'Your work in print',
            color: 'hsl(var(--primary))',
          },
          {
            label: 'Stories Filed',
            value: (articles ?? []).filter((a) => a.author === currentUserDisplayName).length,
            sub: 'Total in the system',
            color: 'hsl(var(--chart-1))',
          },
          {
            label: 'Pending Payment',
            value: '—',
            sub: 'Connects to payroll in production',
            color: 'hsl(var(--muted-foreground))',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="p-4 border border-border/60 rounded-sm bg-card"
          >
            <span
              className="block font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums mb-1"
              style={{ color: stat.color }}
            >
              {stat.value}
            </span>
            <span className="block text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
              {stat.label}
            </span>
            <span className="block text-[12px] text-muted-foreground/60 mt-0.5">
              {stat.sub}
            </span>
          </div>
        ))}
      </div>

      <div className="border border-border/60 rounded-sm bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between">
          <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
            Payout History
          </p>
          <span className="text-[12px] text-muted-foreground/60 italic">
            Personal — only visible to you
          </span>
        </div>

        {myPublished.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={DollarSign}
              heading="No published stories yet."
              description="Your compensation record will populate here once your first story is published. Keep writing — the press is waiting."
              ctaLabel="File a Story"
              onCta={() => {
                onNavigate('workflow');
                onNewInColumn('draft');
              }}
              secondaryCtaLabel="Story Studio AI"
              onSecondaryCta={onOpenStudio}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {['Story', 'Status', 'Published', 'Rate'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myPublished.map((article, idx) => (
                  <tr
                    key={article.id}
                    className={cn(
                      'border-b border-border/30',
                      idx % 2 === 0 ? 'bg-card' : 'bg-background'
                    )}
                  >
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="text-sm font-medium text-foreground line-clamp-1 block">
                        {article.title}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm bg-primary text-primary-foreground">
                        Published
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {article.publishedAt
                          ? new Date(article.publishedAt).toLocaleDateString('en-AU', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground italic">
                        Connects to payroll
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
        <Lock size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Your compensation data is private and visible only to you and the Administrator.
          Payment processing connects to your payroll provider in production.
        </p>
      </div>
    </div>
  );
}
