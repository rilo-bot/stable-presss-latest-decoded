/**
 * NewPostChoice — the two ways to start a blog post, behind one "New post"
 * button. The same decision, and the same shape, as FileStoryChoice in the
 * newsroom: one primary action in the corner rather than two competing for it.
 *
 * Presentational; the caller wires what each choice does.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, PenLine, ArrowRight } from 'lucide-react';

interface NewPostChoiceProps {
  open: boolean;
  onClose: () => void;
  /** Blog Studio AI — writes the post with the agent. */
  onAI: () => void;
  /** The plain create form. */
  onManual: () => void;
}

export function NewPostChoice({ open, onClose, onAI, onManual }: NewPostChoiceProps) {
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

  // Portalled to <body> for the reason FileStoryChoice documents: the production
  // system's header has `backdrop-blur`, and a non-`none` backdrop-filter makes an
  // element the containing block for its fixed-position descendants — so
  // `fixed inset-0` would resolve to the 56px header box rather than the viewport.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New blog post"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
    >
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />

      <div className="relative z-[1] w-[min(94vw,560px)] overflow-hidden rounded-sm border border-border/60 bg-card shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-5 py-3">
          <span className="text-sm font-bold text-foreground">New blog post</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-4 text-sm text-muted-foreground">How would you like to start?</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* AI */}
            <button
              type="button"
              autoFocus
              onClick={onAI}
              className="group flex flex-col items-start gap-2 rounded-sm border border-border/60 bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ background: 'hsl(var(--brand-accent) / 0.16)', color: 'hsl(var(--brand-accent))' }}
              >
                Recommended
              </span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                <Sparkles size={17} />
              </span>
              <span className="text-sm font-bold text-foreground">Blog Studio AI</span>
              <span className="flex-1 text-[13px] leading-relaxed text-muted-foreground">
                Describe the piece and write it with the agent — it drafts the whole thing, then asks about
                the cover, who can read it, and how to file it.
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-primary">
                Open studio <ArrowRight size={11} />
              </span>
            </button>

            {/* Manual */}
            <button
              type="button"
              onClick={onManual}
              className="group flex flex-col items-start gap-2 rounded-sm border border-border/60 bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-h-[17px]" />
              <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
                <PenLine size={17} />
              </span>
              <span className="text-sm font-bold text-foreground">Write it yourself</span>
              <span className="flex-1 text-[13px] leading-relaxed text-muted-foreground">
                Open the blank post form and build it block by block — fastest when you already have the
                copy, or the layout matters.
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors group-hover:text-primary">
                Open form <ArrowRight size={11} />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
