import { Layers, ChevronRight, Scale, RotateCcw, CheckCircle, BookOpen } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { Article } from '@/types/article';
import type { EditorTab } from '../constants';
import { StatusBadge } from '../components/StatusBadge';

interface EditorApprovalRoutingProps {
  articles: Article[];
  onAdvance: (articleId: string, toStatus: KanbanStatus) => void;
  setEditorTab: (tab: EditorTab) => void;
}

export function EditorApprovalRouting({ articles, onAdvance, setEditorTab }: EditorApprovalRoutingProps) {
  const toRoute = (articles ?? []).filter(
    (a) =>
      a.status === 'editorial_review' ||
      a.status === 'approved' ||
      a.status === 'legal_review' ||
      a.status === 'compliance'
  );

  type RouteAction = {
    label: string;
    toStatus: KanbanStatus;
    color: string;
    icon: React.ReactNode;
  };

  const routeActions = (article: Article): RouteAction[] => {
    if (article.status === 'editorial_review') {
      return [
        { label: 'Route → Legal Review', toStatus: 'legal_review', color: 'hsl(var(--chart-3))', icon: <Scale size={11} /> },
        { label: 'Send Back for Revision', toStatus: 'revision', color: '#e8a020', icon: <RotateCcw size={11} /> },
      ];
    }
    if (article.status === 'legal_review') {
      return [{ label: 'Route → Compliance', toStatus: 'compliance', color: 'hsl(var(--chart-4))', icon: <CheckCircle size={11} /> }];
    }
    if (article.status === 'compliance') {
      return [{ label: 'Route → Approved', toStatus: 'approved', color: '#5da854', icon: <CheckCircle size={11} /> }];
    }
    if (article.status === 'approved') {
      return [{ label: 'Route → Publisher', toStatus: 'publisher_review', color: 'hsl(var(--brand-accent))', icon: <BookOpen size={11} /> }];
    }
    return [];
  };

  return (
    <div className="space-y-5">
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-sm border"
        style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.05)' }}
      >
        <Layers size={15} className="text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground mb-0.5">Approval Workflow Routing</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Stories that have passed editorial review need routing to the next stage — Legal, Compliance, Approved, or back for Revision.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-[0.1em]">Routing path:</span>
        {[
          { label: 'Editorial Review', color: 'hsl(var(--chart-2))' },
          { label: 'Legal Review', color: 'hsl(var(--chart-3))' },
          { label: 'Compliance', color: 'hsl(var(--chart-4))' },
          { label: 'Approved', color: '#5da854' },
          { label: 'Publisher', color: 'hsl(var(--brand-accent))' },
        ].map((step, idx, arr) => (
          <span key={step.label} className="flex items-center gap-1.5">
            <span
              className="px-2 py-0.5 rounded-sm font-semibold"
              style={{ background: `${step.color}18`, color: step.color }}
            >
              {step.label}
            </span>
            {idx < arr.length - 1 && <ChevronRight size={10} className="text-border" />}
          </span>
        ))}
      </div>

      {toRoute.length === 0 ? (
        <EmptyState
          icon={Layers}
          heading="All stories are properly routed."
          description="When stories reach Editorial Review, Legal, Compliance, or Approved stages they will appear here for routing."
          ctaLabel="Go to Review Queue"
          onCta={() => setEditorTab('review-queue')}
        />
      ) : (
        <div className="space-y-3">
          {toRoute.map((article) => {
            const actions = routeActions(article);
            return (
              <div
                key={article.id}
                className="border border-border/60 rounded-sm bg-card p-4"
                style={{ boxShadow: 'inset 3px 0 0 hsl(var(--chart-2))' }}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground line-clamp-1">{article.title}</p>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                      {article.author} · {article.category ?? 'General'}
                    </p>
                    <div className="mt-1.5">
                      <StatusBadge status={article.status} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    {actions.map((action) => (
                      <button
                        key={action.toStatus}
                        onClick={() => onAdvance(article.id, action.toStatus)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[12px] uppercase tracking-[0.08em] font-semibold transition-colors hover:opacity-80"
                        style={{
                          borderColor: `${action.color}40`,
                          background: `${action.color}10`,
                          color: action.color,
                        }}
                      >
                        {action.icon}
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
