import {
  AlertCircle, Edit, BookOpen, ArrowRight, File, Flag,
  FileText, Eye, Clock, TrendingUp, PenLine, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NewsroomDashboard } from '@/components/newsroom/NewsroomDashboard';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { can, canAny, canEditArticle, visibleWorkflowStages } from '@/lib/permissions';
import { WORKFLOW_STAGES } from '@/lib/workflow';
import type { ArticleStatus } from '@/types/article';
import type { Article } from '@/types/article';
import type { MediaItem } from '@/types/mediaItem';
import type { RacingEntry } from '@/types/racingEntry';

import { StatusBadge } from '../components/StatusBadge';

/**
 * One shortcut card, used for every module entry point on this screen.
 *
 * These were five hand-written full-width bands, each tinted a different hue
 * (primary, primary, brand-accent, chart-3, chart-1) at 5% alpha. That failed
 * twice over: the hues carried no meaning — Media Records was red for no
 * reason — and at 5% on cream they all resolved to within ~1 L* of the page, so
 * the screen paid the cost of five colours and got the separation of none.
 *
 * Now: one white raised surface, one accent, differentiated by icon and label
 * only. Colour is reserved for state (the `alert` flag), never for identity.
 */
function ShortcutCard({
  icon, title, meta, badge, badgeTone = 'neutral', action, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  badge?: string;
  badgeTone?: 'neutral' | 'new';
  action: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-sm border border-border bg-card p-3.5 text-left',
        'transition-colors hover:bg-muted/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span
              className={cn(
                'rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
                badgeTone === 'new'
                  ? 'bg-brand-accent text-brand-accent-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {badge}
            </span>
          )}
        </span>
        {meta && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{meta}</span>}
      </span>
      <span className="flex flex-shrink-0 items-center gap-1 text-[12px] font-medium text-primary">
        {action}
        <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

interface OverviewViewProps {
  isContributor: boolean;
  myStories: number;
  totalStories: number;
  roleLabel: string;
  accentColor: string;
  pendingReview: number;
  onNavigate: (nav: string) => void;
  setActiveColumn: (status: ArticleStatus) => void;
  mediaItems: MediaItem[];
  racingEntries: RacingEntry[];
  scheduledCount: number;
  publishedCount: number;
  buckets: Record<ArticleStatus, Article[]>;
  onNewInColumn: (status: ArticleStatus) => void;
  onOpenStudio: () => void;
  filteredArticles: Article[];
  currentUserDisplayName: string | undefined;
  onEdit: (article: Article) => void;
}

export function OverviewView({
  isContributor,
  myStories,
  totalStories,
  roleLabel,
  accentColor,
  pendingReview,
  onNavigate,
  setActiveColumn,
  mediaItems,
  racingEntries,
  scheduledCount,
  publishedCount,
  buckets,
  onNewInColumn,
  onOpenStudio,
  filteredArticles,
  currentUserDisplayName,
  onEdit,
}: OverviewViewProps) {
  const displayTotal = isContributor ? myStories : totalStories;
  const navigate = useNavigate();
  return (
    <div className="space-y-8">
      {/* AI-powered Production System dashboard: live summary, needs-your-attention, quick actions. */}
      <NewsroomDashboard onNavigate={(where) => (where === 'claims' ? navigate('/claims') : onNavigate(where))} />

      {isContributor && (
        <div
          className="flex items-start gap-2.5 px-4 py-3 rounded-sm border text-sm"
          style={{ borderColor: `${accentColor}40`, background: `${accentColor}08` }}
        >
          <AlertCircle size={14} style={{ color: accentColor }} className="flex-shrink-0 mt-0.5" />
          <span className="text-foreground/70">
            You are viewing your own stories only. Editors and administrators can see the full newsroom.
          </span>
        </div>
      )}

      {/* Module shortcuts — one uniform card each, in a grid rather than five
          full-width bands stacked down the page. See ShortcutCard above for why
          the per-band tints are gone.
          Built as a filtered ARRAY rather than five inline `&&` blocks so the
          layout can react to how many cards this role actually sees. With a bare
          two-column grid an odd count strands the last card beside an empty half
          — which is exactly what it looked like. The last card of an odd set
          spans the full width instead. */}
      {(() => {
        const shortcuts = [
          can('content.editorial_review') && {
            key: 'editor-hub',
            icon: <Edit size={15} />,
            title: 'Editor Hub',
            meta: 'Review, revise and move stories through the pipeline',
            badge: pendingReview > 0 ? `${pendingReview} awaiting action` : undefined,
            action: 'Open',
            nav: 'editor-hub',
          },
          // Instant — the one entry point that starts from a photo rather than a
          // blank form, so it belongs where someone lands, not only in the rail.
          canAny(['content.draft.create', 'blog.create']) && {
            key: 'instant',
            icon: <Zap size={15} />,
            title: 'Instant',
            meta: 'Snap a photo or talk it through, and review the draft it writes',
            badge: 'New',
            badgeTone: 'new' as const,
            action: 'Capture',
            nav: 'instant',
          },
          {
            // Was "Bulletin Templates", captioned with a count of the v1 template
            // builder's starter gallery. There is no gallery now: the Builder starts
            // from blank, from a brief, from an uploaded PDF, or from another
            // magazine's layout.
            key: 'bulletins',
            icon: <BookOpen size={15} />,
            title: 'Magazine Builder',
            meta: 'Build a bulletin from a brief, a PDF, or another edition’s layout',
            action: 'Open builder',
            nav: 'magazine-v2',
          },
          can('content.draft.create') && {
            key: 'media',
            icon: <File size={15} />,
            title: 'Media Records',
            meta: 'Articles, photos, videos & press releases',
            badge: (mediaItems ?? []).length > 0 ? `${(mediaItems ?? []).length} records` : undefined,
            action: 'Manage',
            nav: 'media-production-system',
          },
          can('content.draft.create') && {
            key: 'racing',
            icon: <Flag size={15} />,
            title: 'Racing Data',
            meta: 'Race entries, results & performance',
            badge: (racingEntries ?? []).length > 0 ? `${(racingEntries ?? []).length} records` : undefined,
            action: 'Manage',
            nav: 'racing-production-system',
          },
        ].filter(Boolean) as Array<{
          key: string; icon: React.ReactNode; title: string; meta: string;
          badge?: string; badgeTone?: 'new'; action: string; nav: string;
        }>;

        if (shortcuts.length === 0) return null;
        const odd = shortcuts.length % 2 === 1;

        return (
          <div className="grid gap-3 lg:grid-cols-2">
            {shortcuts.map((sc, i) => (
              <div key={sc.key} className={cn(odd && i === shortcuts.length - 1 && 'lg:col-span-2')}>
                <ShortcutCard
                  icon={sc.icon}
                  title={sc.title}
                  meta={sc.meta}
                  badge={sc.badge}
                  badgeTone={sc.badgeTone ?? 'neutral'}
                  action={sc.action}
                  onClick={() => onNavigate(sc.nav)}
                />
              </div>
            ))}
          </div>
        );
      })()}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: isContributor ? 'My Stories' : 'Total Stories',
            value: displayTotal,
            icon: <FileText size={16} />,
            delta: isContributor ? 'Stories you have filed' : 'In the system',
          },
          {
            label: 'Awaiting Action',
            value: pendingReview,
            icon: <Eye size={16} />,
            delta: 'Editorial + Submitted',
            alert: pendingReview > 0,
          },
          {
            label: 'Scheduled',
            value: scheduledCount,
            icon: <Clock size={16} />,
            delta: 'Ready to publish',
          },
          {
            label: 'In Print',
            value: publishedCount,
            icon: <TrendingUp size={16} />,
            delta: 'Published & distributed',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={cn(
              'p-4 rounded-sm border',
              stat.alert
                ? 'border-[hsl(var(--brand-accent)/0.5)] bg-[hsl(var(--brand-accent)/0.05)]'
                : 'border-border/60 bg-card'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={cn('opacity-50', stat.alert && 'text-[hsl(var(--brand-accent))]')}>{stat.icon}</span>
              {stat.alert && (
                <span
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                >
                  Action
                </span>
              )}
            </div>
            <span
              className="block font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums"
              style={{ color: stat.alert ? 'hsl(var(--brand-accent))' : 'hsl(var(--primary))' }}
            >
              {stat.value}
            </span>
            <span className="block text-[12px] text-muted-foreground mt-1 uppercase tracking-[0.08em]">{stat.label}</span>
            <span className="block text-[12px] text-muted-foreground/60 mt-0.5">{stat.delta}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">Pipeline Status</h3>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {WORKFLOW_STAGES.filter((s) =>
            isContributor ? visibleWorkflowStages().includes(s.status) : true
          ).map((stage) => (
            <button
              key={stage.status}
              onClick={() => { onNavigate('workflow'); setActiveColumn(stage.status); }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-sm border border-border/60 bg-card hover:border-primary/30 transition-colors text-center"
            >
              <span style={{ color: stage.accent }}>{stage.icon}</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: stage.accent }}>
                {buckets[stage.status].length}
              </span>
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground leading-tight">
                {stage.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {displayTotal === 0 && (
        <EmptyState
          icon={PenLine}
          heading="No stories in the queue. The press is ready when you are."
          description="File your first story to begin building the newsroom record."
          ctaLabel="File a Story"
          onCta={() => onNewInColumn('draft')}
          secondaryCtaLabel="Story Studio AI"
          onSecondaryCta={onOpenStudio}
        />
      )}

      {displayTotal > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
              {isContributor ? 'My Recent Stories' : 'Recent Activity'}
            </h3>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="border border-border/60 rounded-sm overflow-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border/40">
                  {['Story', 'Author', 'Category', 'Stage'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredArticles.slice(0, 10).map((article, idx) => {
                  const editable = canEditArticle(article.author, currentUserDisplayName);
                  return (
                    <tr
                      key={article.id}
                      className={cn(
                        'border-b border-border/30 transition-colors',
                        editable ? 'hover:bg-muted/20 cursor-pointer' : 'opacity-70',
                        idx % 2 === 0 ? 'bg-card' : 'bg-background'
                      )}
                      onClick={() => editable && onEdit(article)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-sm text-foreground line-clamp-1">{article.title}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">{article.author}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-muted-foreground border border-border/50 px-2 py-0.5 rounded-sm">
                          {article.category ?? 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={article.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
