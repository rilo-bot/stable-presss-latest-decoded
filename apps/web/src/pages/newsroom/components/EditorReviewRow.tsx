import { Clock } from 'lucide-react';
import type { Article } from '@/types/article';

/* ── Editor Review Row ─────────────────────────────────── */

interface EditorReviewRowProps {
  article: Article;
  onPullToReview: () => void;
  onSendRevision: () => void;
  onEdit: () => void;
  actionLabel: string;
  actionColor: string;
  hideRevision?: boolean;
}

export function EditorReviewRow({
  article,
  onPullToReview,
  onSendRevision,
  onEdit,
  actionLabel,
  actionColor,
  hideRevision = false,
}: EditorReviewRowProps) {
  return (
    <div className="px-4 py-3.5 flex items-start justify-between gap-4 hover:bg-muted/10 transition-colors flex-wrap">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground line-clamp-1">{article.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[13px] text-muted-foreground">{article.author}</span>
          {article.category && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[12px] text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-sm">
                {article.category}
              </span>
            </>
          )}
          {article.readingTime && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[12px] text-muted-foreground flex items-center gap-0.5">
                <Clock size={9} />
                {article.readingTime}m
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button
          onClick={onEdit}
          className="text-[12px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-sm border border-border/50 hover:border-border"
        >
          Edit
        </button>
        {!hideRevision && (
          <button
            onClick={onSendRevision}
            className="text-[12px] uppercase tracking-[0.08em] font-semibold px-2 py-1 rounded-sm border transition-colors"
            style={{ color: '#e8a020', borderColor: 'rgba(232,160,32,0.3)', background: 'rgba(232,160,32,0.06)' }}
          >
            Send for Revision
          </button>
        )}
        <button
          onClick={onPullToReview}
          className="text-[12px] uppercase tracking-[0.08em] font-semibold px-2 py-1 rounded-sm border transition-colors"
          style={{ color: actionColor, borderColor: `${actionColor}40`, background: `${actionColor}10` }}
        >
          {actionLabel} →
        </button>
      </div>
    </div>
  );
}
