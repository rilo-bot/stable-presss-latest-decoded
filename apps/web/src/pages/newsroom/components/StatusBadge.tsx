import { stageMeta } from '@/lib/workflow';
import type { ArticleStatus } from '@/types/article';

/**
 * A story's stage, as a pill.
 *
 * Label and colour come from `stageMeta` — the same table the kanban columns
 * use. This file used to carry its own map of twelve statuses with its own
 * colours, so Editorial Review, Legal Review, Compliance, Publisher Review,
 * Revision, Newsletter, Bulletin and Archived all still had badge styling long
 * after the workflow stopped being able to produce them, and the four surviving
 * stages were coloured differently here than on the board.
 */
export function StatusBadge({ status }: { status: ArticleStatus }) {
  const stage = stageMeta(status);
  return (
    <span
      className="text-[11px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap"
      style={{ background: stage.accent, color: stage.onAccent }}
    >
      {stage.label}
    </span>
  );
}
