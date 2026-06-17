import { PenLine, Plus } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { can } from '@/lib/permissions';
import { KanbanColumn, WORKFLOW_STAGES } from '@/components/KanbanColumn';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { Article } from '@/types/article';
import type { UserRole } from '@/stores/authStore';
import { WorkflowFlowBar } from '../components/WorkflowFlowBar';

interface WorkflowBoardViewProps {
  isContributor: boolean;
  myStories: number;
  totalStories: number;
  onNewInColumn: (status: KanbanStatus) => void;
  visibleStages: typeof WORKFLOW_STAGES;
  activeColumn: KanbanStatus;
  setActiveColumn: (status: KanbanStatus) => void;
  buckets: Record<KanbanStatus, Article[]>;
  userRole: UserRole | null;
  onAdvance: (articleId: string, toStatus: KanbanStatus) => void;
  onEdit: (article: Article) => void;
  currentUserDisplayName: string | null;
}

export function WorkflowBoardView({
  isContributor,
  myStories,
  totalStories,
  onNewInColumn,
  visibleStages,
  activeColumn,
  setActiveColumn,
  buckets,
  userRole,
  onAdvance,
  onEdit,
  currentUserDisplayName,
}: WorkflowBoardViewProps) {
  const displayCount = isContributor ? myStories : totalStories;
  return (
    <div className="space-y-5">
      {displayCount === 0 && (
        <EmptyState
          icon={PenLine}
          heading="No stories in the queue. The press is ready when you are."
          description="File your first dispatch to begin the newsroom record. The board will fill as your team starts writing."
          ctaLabel="File Your First Story"
          onCta={() => onNewInColumn('draft')}
          className="mb-6"
        />
      )}

      <div className="flex md:hidden gap-1.5 overflow-x-auto pb-1">
        {visibleStages.map((col) => (
          <button
            key={col.status}
            onClick={() => setActiveColumn(col.status)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 text-[12px] uppercase tracking-[0.08em] font-semibold rounded-sm border transition-colors',
              activeColumn === col.status
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border/60 text-muted-foreground hover:text-foreground'
            )}
          >
            {col.label}
            <span className="ml-1.5 tabular-nums font-bold">({buckets[col.status].length})</span>
          </button>
        ))}
      </div>

      <div className="hidden md:block">
        <WorkflowFlowBar
          buckets={buckets}
          onStageClick={(s) => setActiveColumn(s)}
          activeColumn={activeColumn}
          visibleStages={visibleStages}
        />
      </div>

      <div
        className={cn(
          'hidden md:grid gap-3',
          visibleStages.length >= 6
            ? 'grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
            : visibleStages.length === 5
            ? 'grid-cols-3 lg:grid-cols-5'
            : visibleStages.length === 4
            ? 'grid-cols-2 lg:grid-cols-4'
            : visibleStages.length === 3
            ? 'grid-cols-3'
            : 'grid-cols-2'
        )}
      >
        {visibleStages.map((col) => {
          const canAdd = can(userRole, 'content.draft.create') && col.status === 'draft';
          return (
            <div key={col.status} className="flex flex-col gap-2">
              <KanbanColumn
                status={col.status}
                label={col.label}
                articles={buckets[col.status]}
                isActiveColumn={col.status === activeColumn}
                onAdvance={onAdvance}
                onEdit={onEdit}
                currentUserDisplayName={currentUserDisplayName}
                userRole={userRole}
              />
              {canAdd && (
                <button
                  onClick={() => onNewInColumn(col.status)}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded-sm border border-dashed border-border/60 text-[12px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  aria-label={`Add story to ${col.label}`}
                >
                  <Plus size={11} />
                  Add
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="md:hidden">
        {visibleStages
          .filter((col) => col.status === activeColumn)
          .map((col) => (
            <div key={col.status} className="flex flex-col gap-3">
              <KanbanColumn
                status={col.status}
                label={col.label}
                articles={buckets[col.status]}
                isActiveColumn
                onAdvance={onAdvance}
                onEdit={onEdit}
                currentUserDisplayName={currentUserDisplayName}
                userRole={userRole}
              />
              {can(userRole, 'content.draft.create') && col.status === 'draft' && (
                <button
                  onClick={() => onNewInColumn(col.status)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-sm border border-dashed border-border/60 text-[12px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  <Plus size={11} />
                  Add to {col.label}
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
