/**
 * The editorial workflow, read top to bottom.
 *
 * Driven entirely by `lib/workflow` — the stages, their order and the moves out
 * of each one come from the same table the board and the server use, so this
 * screen cannot drift from the workflow again. It previously hardcoded twelve
 * stages (editorial_review, legal_review, compliance, publisher_review,
 * newsletter, bulletin …) and read `buckets` keys that no longer exist.
 */
import { ChevronRight, CornerUpLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { WORKFLOW_STAGES, movesFrom } from '@/lib/workflow';
import type { Article, ArticleStatus } from '@/types/article';

interface PipelineMapViewProps {
  buckets: Record<ArticleStatus, Article[]>;
}

export function PipelineMapView({ buckets }: PipelineMapViewProps) {
  // Tolerate a partial map rather than crashing the screen: a status with no
  // bucket simply reads as zero.
  const count = (status: ArticleStatus) => buckets?.[status]?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">Editorial Pipeline</h3>
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Full Workflow Map</span>
      </div>

      <div className="space-y-3">
        {WORKFLOW_STAGES.map((stage, idx) => {
          const moves = movesFrom(stage.status);
          return (
            <div key={stage.status} className="relative">
              <div
                className="flex items-stretch gap-0 rounded-sm border border-border/60 overflow-hidden"
                style={{ boxShadow: `inset 3px 0 0 ${stage.accent}` }}
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3 min-w-[190px] border-r border-border/40"
                  style={{ background: `color-mix(in srgb, ${stage.accent} 8%, transparent)` }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-foreground flex-shrink-0"
                    style={{ background: stage.accent }}
                  >
                    {idx + 1}
                  </span>
                  <span style={{ color: stage.accent }}>{stage.icon}</span>
                  <div>
                    <p className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: stage.accent }}>
                      {stage.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{stage.sublabel}</p>
                  </div>
                </div>

                <div className="flex-1 flex flex-wrap items-center gap-2 px-4 py-3 bg-card">
                  {moves.length === 0 ? (
                    <span className="text-[12px] text-muted-foreground italic">End of the workflow — distribution below.</span>
                  ) : (
                    moves.map((move) => (
                      <span
                        key={`${move.to}-${move.label}`}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-[13px] font-medium',
                          move.back
                            ? 'border-dashed border-border/60 bg-muted/30 text-muted-foreground'
                            : 'border-border/60 bg-background text-foreground',
                        )}
                      >
                        {move.back ? <CornerUpLeft size={11} /> : <ChevronRight size={11} />}
                        <span className="whitespace-nowrap">{move.label}</span>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          → {WORKFLOW_STAGES.find((s) => s.status === move.to)?.label ?? move.to}
                        </span>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex items-center px-3 border-l border-border/40 bg-muted/20">
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: stage.accent }}>
                    {count(stage.status)}
                  </span>
                </div>
              </div>

              {idx < WORKFLOW_STAGES.length - 1 && (
                <div className="flex justify-center my-1">
                  <ChevronRight size={14} className="text-border rotate-90" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* A "Distribution" row sat here: three tiles counting how many published
          stories ran on the news site, the newsletter and the bulletin. The
          `channels` axis is gone — a published story is news — so all three tiles
          would have shown the same number, which is the least useful thing a
          dashboard can do. The stage counts above already say how many are live. */}
    </div>
  );
}
