import { AlertCircle, Search, Filter, PenLine, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { canEditArticle } from '@/lib/permissions';
import type { UserRole } from '@/stores/authStore';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { Article } from '@/types/article';
import type { RoleConfig } from '../constants';
import { StatusBadge } from '../components/StatusBadge';

interface AllStoriesViewProps {
  isContributor: boolean;
  currentRoleConfig: RoleConfig;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filteredArticles: Article[];
  onNewInColumn: (status: KanbanStatus) => void;
  userRole: UserRole | null;
  currentUserDisplayName: string | undefined;
  onEdit: (article: Article) => void;
}

export function AllStoriesView({
  isContributor,
  currentRoleConfig,
  searchQuery,
  setSearchQuery,
  filteredArticles,
  onNewInColumn,
  userRole,
  currentUserDisplayName,
  onEdit,
}: AllStoriesViewProps) {
  return (
    <div className="space-y-4">
      {isContributor && (
        <div
          className="flex items-start gap-2.5 px-4 py-3 rounded-sm border text-sm"
          style={{ borderColor: `${currentRoleConfig.color}40`, background: `${currentRoleConfig.color}08` }}
        >
          <AlertCircle size={14} style={{ color: currentRoleConfig.color }} className="flex-shrink-0 mt-0.5" />
          <span className="text-foreground/70">
            Showing your stories only. Submit a story to move it into the editorial queue.
          </span>
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search stories, authors, categories…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Search stories"
          />
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-sm" aria-label="Filter stories">
          <Filter size={12} />
          Filter
        </Button>
      </div>

      {filteredArticles.length === 0 ? (
        <EmptyState
          icon={PenLine}
          heading="No stories in the queue. The press is ready when you are."
          description="File your first dispatch to begin the newsroom record."
          ctaLabel="File a Story"
          onCta={() => onNewInColumn('draft')}
        />
      ) : (
        <div className="border border-border/60 rounded-sm overflow-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border/40">
                {['Story', 'Author', 'Category', 'Stage', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((article, idx) => {
                const editable = canEditArticle(userRole, article.author, currentUserDisplayName);
                return (
                  <tr key={article.id} className={cn('border-b border-border/30 transition-colors', idx % 2 === 0 ? 'bg-card' : 'bg-background')}>
                    <td className="px-4 py-3 max-w-[240px]">
                      <span className="font-medium text-sm text-foreground line-clamp-1 block">{article.title}</span>
                      {article.readingTime && (
                        <span className="text-[12px] text-muted-foreground">{article.readingTime} min read</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">{article.author}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-muted-foreground border border-border/50 px-2 py-0.5 rounded-sm whitespace-nowrap">
                        {article.category ?? 'General'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={article.status} /></td>
                    <td className="px-4 py-3">
                      {editable ? (
                        <button
                          onClick={() => onEdit(article)}
                          className="text-[12px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          Edit
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground/50">
                          <Lock size={10} />
                          Read-only
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
