import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WORKFLOW_STAGES } from '@/components/KanbanColumn';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { Article } from '@/types/article';

/* ── Workflow flow bar ─────────────────────────────────── */

interface WorkflowFlowBarProps {
  buckets: Record<KanbanStatus, Article[]>;
  onStageClick: (status: KanbanStatus) => void;
  activeColumn: KanbanStatus;
  visibleStages: typeof WORKFLOW_STAGES;
}

export function WorkflowFlowBar({ buckets, onStageClick, activeColumn, visibleStages }: WorkflowFlowBarProps) {
  return (
    <div className="relative">
      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {visibleStages.map((stage, idx) => {
          const count = buckets[stage.status].length;
          const isActive = stage.status === activeColumn;
          const isRevision = stage.status === 'revision';
          return (
            <div key={stage.status} className="flex items-center">
              <button
                onClick={() => onStageClick(stage.status)}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-sm border transition-all min-w-[80px] text-center',
                  isActive
                    ? 'border-primary/40 bg-primary/8'
                    : isRevision
                    ? 'border-dashed border-border/50 bg-muted/20'
                    : 'border-border/40 bg-card hover:border-primary/25 hover:bg-muted/30'
                )}
                style={{
                  borderTopColor: isActive ? stage.accent : undefined,
                  borderTopWidth: isActive ? '2px' : undefined,
                }}
                aria-label={`Go to ${stage.label} column`}
              >
                <span style={{ color: isActive ? stage.accent : 'hsl(var(--muted-foreground))' }}>
                  {stage.icon}
                </span>
                <span
                  className="text-[11px] font-bold tabular-nums"
                  style={{ color: isActive ? stage.accent : 'hsl(var(--foreground))' }}
                >
                  {count}
                </span>
                <span
                  className="text-[8px] uppercase tracking-[0.08em] leading-tight text-center"
                  style={{ color: isActive ? stage.accent : 'hsl(var(--muted-foreground))' }}
                >
                  {stage.label.replace(' ', '\n')}
                </span>
              </button>
              {idx < visibleStages.length - 1 && (
                <div className="flex items-center px-0.5">
                  <ChevronRight size={10} className="text-border flex-shrink-0" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
