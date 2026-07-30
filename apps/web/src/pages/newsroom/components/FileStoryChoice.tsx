/**
 * FileStoryChoice — the two ways to start a story, behind one "File a Story"
 * button. Previously the topbar carried a button for each, which meant two
 * primary actions competing in the same corner for what is one decision.
 * Presentational: the caller wires what each choice does.
 */
import { useEffect } from 'react';
import { X, Sparkles, PenLine, ArrowRight } from 'lucide-react';

interface FileStoryChoiceProps {
  open: boolean;
  onClose: () => void;
  /** Story Studio AI — drafts with the agent. */
  onAI: () => void;
  /** The plain article form. */
  onManual: () => void;
}

export function FileStoryChoice({ open, onClose, onAI, onManual }: FileStoryChoiceProps) {
  // Escape closes — nothing here is destructive, so a cheap exit is right.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="File a story"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
    >
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />

      <div className="relative z-[1] w-[min(94vw,560px)] rounded-sm border border-border/60 bg-card shadow-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-border/50">
          <span className="text-sm font-bold text-foreground">File a story</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground mb-4">How would you like to start?</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* AI */}
            <button
              type="button"
              autoFocus
              onClick={onAI}
              className="group flex flex-col items-start gap-2 text-left p-4 rounded-sm border border-border/60 bg-background hover:border-primary/50 hover:bg-primary/[0.03] transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="text-[10px] uppercase tracking-[0.08em] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'hsl(var(--brand-accent) / 0.16)', color: 'hsl(var(--brand-accent))' }}
              >
                Recommended
              </span>
              <span className="w-9 h-9 rounded-full grid place-items-center bg-primary/10 text-primary">
                <Sparkles size={17} />
              </span>
              <span className="text-sm font-bold text-foreground">Story Studio AI</span>
              <span className="text-[13px] text-muted-foreground leading-relaxed flex-1">
                Describe the story and draft it with the agent — it pulls in horses, parties and racing
                records as it writes.
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.06em] font-bold text-primary">
                Open studio <ArrowRight size={11} />
              </span>
            </button>

            {/* Manual */}
            <button
              type="button"
              onClick={onManual}
              className="group flex flex-col items-start gap-2 text-left p-4 rounded-sm border border-border/60 bg-background hover:border-primary/50 hover:bg-primary/[0.03] transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-h-[17px]" />
              <span className="w-9 h-9 rounded-full grid place-items-center bg-muted text-muted-foreground">
                <PenLine size={17} />
              </span>
              <span className="text-sm font-bold text-foreground">Write it yourself</span>
              <span className="text-[13px] text-muted-foreground leading-relaxed flex-1">
                Open the blank article form and type it up — fastest when you already have the copy.
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.06em] font-bold text-muted-foreground group-hover:text-primary transition-colors">
                Open form <ArrowRight size={11} />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
