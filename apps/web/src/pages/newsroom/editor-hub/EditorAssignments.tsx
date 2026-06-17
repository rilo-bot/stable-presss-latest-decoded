import { UserCheck, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { Article } from '@/types/article';
import { StatusBadge } from '../components/StatusBadge';

interface EditorAssignmentsProps {
  articles: Article[];
  assignDialogArticle: Article | null;
  setAssignDialogArticle: (a: Article | null) => void;
  assignNote: string;
  setAssignNote: (v: string) => void;
  updateArticle: (id: string, updates: Partial<Article>) => Promise<void>;
  onNewInColumn: (status: KanbanStatus) => void;
  onEdit: (article: Article) => void;
}

export function EditorAssignments({
  articles,
  assignDialogArticle,
  setAssignDialogArticle,
  assignNote,
  setAssignNote,
  updateArticle,
  onNewInColumn,
  onEdit,
}: EditorAssignmentsProps) {
  const allArticles = articles ?? [];
  const assignable = allArticles.filter(
    (a) => a.status === 'draft' || a.status === 'revision' || a.status === 'editorial_review'
  );

  return (
    <div className="space-y-5">
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-sm border"
        style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.05)' }}
      >
        <UserCheck size={15} className="text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground mb-0.5">Content Assignment & Modification</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            As Editor, you can claim stories in draft, editorial review, or revision — edit them directly, reassign notes, or push them forward in the workflow.
          </p>
        </div>
      </div>

      {assignDialogArticle && (
        <div className="border border-primary/30 rounded-sm bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              Assignment Note — <span className="font-normal text-muted-foreground">{assignDialogArticle.title}</span>
            </p>
            <button
              onClick={() => { setAssignDialogArticle(null); setAssignNote(''); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close assignment note"
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            rows={3}
            placeholder="Add an editorial note or assignment instruction for this story…"
            value={assignNote}
            onChange={(e) => setAssignNote(e.target.value)}
            aria-label="Assignment note"
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              className="text-sm"
              onClick={() => { setAssignDialogArticle(null); setAssignNote(''); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              onClick={async () => {
                try {
                  await updateArticle(assignDialogArticle.id, { assignmentNote: assignNote.trim() || undefined });
                  toast.success('Assignment note saved. Story flagged for action.');
                  setAssignDialogArticle(null);
                  setAssignNote('');
                } catch {
                  toast.error('Could not save the note — please try again.');
                }
              }}
            >
              <Check size={12} />
              Save Note
            </Button>
          </div>
        </div>
      )}

      <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between">
          <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
            Stories You Can Assign or Modify
          </p>
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {assignable.length} {assignable.length === 1 ? 'story' : 'stories'}
          </span>
        </div>

        {assignable.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={UserCheck}
              heading="No stories available for assignment right now."
              description="Stories in Draft, Revision, and Editorial Review stages will appear here."
              ctaLabel="File a Story"
              onCta={() => onNewInColumn('draft')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {['Story', 'Author', 'Stage', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignable.map((article, idx) => (
                  <tr
                    key={article.id}
                    className={cn(
                      'border-b border-border/30 hover:bg-muted/10 transition-colors',
                      idx % 2 === 0 ? 'bg-card' : 'bg-background'
                    )}
                  >
                    <td className="px-4 py-3 max-w-[240px]">
                      <span className="text-sm font-medium text-foreground line-clamp-1 block">
                        {article.title}
                      </span>
                      {article.category && (
                        <span className="text-[12px] text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-sm mt-0.5 inline-block">
                          {article.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">{article.author}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={article.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => onEdit(article)}
                          className="text-[12px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setAssignDialogArticle(article); setAssignNote(article.assignmentNote ?? ''); }}
                          className="text-[12px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Note
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
