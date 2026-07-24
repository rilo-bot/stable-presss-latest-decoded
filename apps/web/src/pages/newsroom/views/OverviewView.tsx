import {
  AlertCircle, Edit, ChevronRight, BookOpen, ArrowRight, File, Flag,
  FileText, Eye, Clock, TrendingUp, PenLine,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NewsroomDashboard } from '@/components/newsroom/NewsroomDashboard';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { can, canEditArticle } from '@/lib/permissions';
import { WORKFLOW_STAGES } from '@/components/KanbanColumn';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { UserRole } from '@/stores/authStore';
import type { Article } from '@/types/article';
import type { MediaItem } from '@/types/mediaItem';
import type { RacingEntry } from '@/types/racingEntry';
import type { RoleConfig } from '../constants';
import { StatusBadge } from '../components/StatusBadge';
import { MAGAZINE_TEMPLATES } from '@/editor/templates/galleryTemplates';

interface OverviewViewProps {
  isContributor: boolean;
  myStories: number;
  totalStories: number;
  currentRoleConfig: RoleConfig;
  userRole: UserRole | null;
  pendingReview: number;
  setActiveNav: (nav: string) => void;
  setActiveColumn: (status: KanbanStatus) => void;
  mediaItems: MediaItem[];
  racingEntries: RacingEntry[];
  scheduledCount: number;
  publishedCount: number;
  buckets: Record<KanbanStatus, Article[]>;
  onNewInColumn: (status: KanbanStatus) => void;
  onOpenStudio: () => void;
  filteredArticles: Article[];
  currentUserDisplayName: string | undefined;
  onEdit: (article: Article) => void;
}

export function OverviewView({
  isContributor,
  myStories,
  totalStories,
  currentRoleConfig,
  userRole,
  pendingReview,
  setActiveNav,
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
      <NewsroomDashboard onNavigate={(where) => (where === 'claims' ? navigate('/claims') : setActiveNav(where))} />

      {isContributor && (
        <div
          className="flex items-start gap-2.5 px-4 py-3 rounded-sm border text-sm"
          style={{ borderColor: `${currentRoleConfig.color}40`, background: `${currentRoleConfig.color}08` }}
        >
          <AlertCircle size={14} style={{ color: currentRoleConfig.color }} className="flex-shrink-0 mt-0.5" />
          <span className="text-foreground/70">
            You are viewing your own stories only. Editors and administrators can see the full newsroom.
          </span>
        </div>
      )}

      {can(userRole, 'content.editorial_review') && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-sm border"
          style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.05)' }}
        >
          <div className="flex items-center gap-2">
            <Edit size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Editor Hub</span>
            {pendingReview > 0 && (
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
              >
                {pendingReview} awaiting action
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-sm gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setActiveNav('editor-hub')}
          >
            Open Editor Hub
            <ChevronRight size={11} />
          </Button>
        </div>
      )}

      {/* Bulletin Templates shortcut */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-sm border"
        style={{ borderColor: 'hsl(var(--brand-accent) / 0.3)', background: 'hsl(var(--brand-accent) / 0.05)' }}
      >
        <div className="flex items-center gap-2">
          <BookOpen size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
          <span className="text-sm font-semibold text-foreground">Bulletin Templates</span>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-[0.1em]"
            style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
          >
            New
          </span>
          <span className="text-[13px] text-muted-foreground hidden sm:inline">
            — {MAGAZINE_TEMPLATES.length} {MAGAZINE_TEMPLATES.length === 1 ? 'template' : 'templates'} ready to use
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="text-sm gap-1.5"
          style={{ borderColor: 'hsl(var(--brand-accent) / 0.4)', color: 'hsl(var(--brand-accent))' }}
          onClick={() => setActiveNav('bulletin-templates')}
        >
          Open Studio
          <ArrowRight size={11} />
        </Button>
      </div>

      {/* Media Records shortcut */}
      {can(userRole, 'content.draft.create') && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-sm border"
          style={{ borderColor: 'hsl(var(--chart-3) / 0.3)', background: 'hsl(var(--chart-3) / 0.05)' }}
        >
          <div className="flex items-center gap-2">
            <File size={14} style={{ color: 'hsl(var(--chart-3))' }} />
            <span className="text-sm font-semibold text-foreground">Media Records Production System</span>
            {(mediaItems ?? []).length > 0 && (
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'hsl(var(--chart-3) / 0.15)', color: 'hsl(var(--chart-3))' }}
              >
                {(mediaItems ?? []).length} records
              </span>
            )}
            <span className="text-[13px] text-muted-foreground hidden sm:inline">
              — articles, photos, videos &amp; press releases
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-sm gap-1.5"
            style={{ borderColor: 'hsl(var(--chart-3) / 0.4)', color: 'hsl(var(--chart-3))' }}
            onClick={() => setActiveNav('media-production-system')}
          >
            Manage Media
            <ArrowRight size={11} />
          </Button>
        </div>
      )}

      {/* Racing Data shortcut */}
      {can(userRole, 'content.draft.create') && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-sm border"
          style={{ borderColor: 'hsl(var(--chart-1) / 0.3)', background: 'hsl(var(--chart-1) / 0.05)' }}
        >
          <div className="flex items-center gap-2">
            <Flag size={14} style={{ color: 'hsl(var(--chart-1))' }} />
            <span className="text-sm font-semibold text-foreground">Racing Data Production System</span>
            {(racingEntries ?? []).length > 0 && (
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'hsl(var(--chart-1) / 0.15)', color: 'hsl(var(--chart-1))' }}
              >
                {(racingEntries ?? []).length} records
              </span>
            )}
            <span className="text-[13px] text-muted-foreground hidden sm:inline">
              — race entries, results &amp; performance
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-sm gap-1.5"
            style={{ borderColor: 'hsl(var(--chart-1) / 0.4)', color: 'hsl(var(--chart-1))' }}
            onClick={() => setActiveNav('racing-production-system')}
          >
            Manage Racing
            <ArrowRight size={11} />
          </Button>
        </div>
      )}

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
            isContributor ? currentRoleConfig.allowedStatuses.includes(s.status) : true
          ).map((stage) => (
            <button
              key={stage.status}
              onClick={() => { setActiveNav('workflow'); setActiveColumn(stage.status); }}
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
                  const editable = canEditArticle(userRole, article.author, currentUserDisplayName);
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
