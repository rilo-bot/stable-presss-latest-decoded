import { FileText, Eye, AlertTriangle, Scale, CheckCircle, BookOpen, TrendingDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { Article } from '@/types/article';

interface PipelineMapViewProps {
  buckets: Record<KanbanStatus, Article[]>;
}

export function PipelineMapView({ buckets }: PipelineMapViewProps) {
  const stages = [
    { key: 'contributor', label: 'Contributor', steps: ['Create Draft', 'Submit For Review'], color: 'hsl(var(--chart-1))', icon: <FileText size={15} /> },
    { key: 'editorial', label: 'Editor Review', steps: ['Editorial Review'], color: 'hsl(var(--chart-2))', icon: <Eye size={15} />, branch: true },
    { key: 'revision', label: 'Revision (if needed)', steps: ['Contributor Updates', 'Re-submit'], color: '#e8a020', icon: <AlertTriangle size={15} />, isBranch: true },
    { key: 'legal', label: 'Legal & Compliance', steps: ['Legal Review', 'Compliance Check'], color: 'hsl(var(--chart-3))', icon: <Scale size={15} /> },
    { key: 'approval', label: 'Approval', steps: ['Approved'], color: '#5da854', icon: <CheckCircle size={15} /> },
    { key: 'publisher', label: 'Publisher Review', steps: ['Publisher Review', 'Schedule Publish'], color: 'hsl(var(--brand-accent))', icon: <BookOpen size={15} /> },
    { key: 'distribution', label: 'Distribution', steps: ['Published', 'Website + App', 'Newsletter + Podcast', 'Bulletin Inclusion'], color: 'hsl(var(--primary))', icon: <TrendingDown size={15} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">Editorial Pipeline</h3>
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Full Workflow Map</span>
      </div>

      <div className="relative">
        <div className="space-y-3">
          {stages.map((stage, idx) => (
            <div key={stage.key} className="relative">
              {stage.isBranch && (
                <div className="hidden md:flex items-center gap-2 mb-2 ml-4">
                  <div className="h-px w-8 bg-[#e8a020]/40" />
                  <span className="text-[11px] text-muted-foreground italic">Revision path — returns to Editorial Review</span>
                </div>
              )}
              <div
                className={cn(
                  'flex items-stretch gap-0 rounded-sm border overflow-hidden transition-all',
                  stage.isBranch ? 'border-dashed border-border/50 opacity-90' : 'border-border/60'
                )}
                style={{ boxShadow: `inset 3px 0 0 ${stage.color}` }}
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3 min-w-[180px] border-r border-border/40"
                  style={{ background: `${stage.color}10` }}
                >
                  <span style={{ color: stage.color }}>{stage.icon}</span>
                  <div>
                    <p className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: stage.color }}>
                      {stage.label}
                    </p>
                  </div>
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-2 px-4 py-3 bg-card">
                  {stage.steps.map((step, stepIdx) => (
                    <div key={step} className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border/60 bg-background">
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-foreground flex-shrink-0"
                          style={{ background: stage.color }}
                        >
                          {idx * 3 + stepIdx + 1}
                        </span>
                        <span className="text-[13px] font-medium text-foreground whitespace-nowrap">{step}</span>
                      </div>
                      {stepIdx < stage.steps.length - 1 && (
                        <ChevronRight size={10} className="text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center px-3 border-l border-border/40 bg-muted/20">
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: stage.color }}>
                    {stage.key === 'contributor'
                      ? buckets.draft.length + buckets.submitted.length
                      : stage.key === 'editorial'
                      ? buckets.editorial_review.length
                      : stage.key === 'revision'
                      ? buckets.revision.length
                      : stage.key === 'legal'
                      ? buckets.legal_review.length + buckets.compliance.length
                      : stage.key === 'approval'
                      ? buckets.approved.length
                      : stage.key === 'publisher'
                      ? buckets.publisher_review.length + buckets.scheduled.length
                      : buckets.published.length + buckets.newsletter.length + buckets.bulletin.length}
                  </span>
                </div>
              </div>
              {idx < stages.length - 1 && !stages[idx + 1].isBranch && (
                <div className="flex justify-center my-1">
                  <ChevronRight size={14} className="text-border rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
