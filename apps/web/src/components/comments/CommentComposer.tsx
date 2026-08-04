/**
 * The comment composer — a place on the scale, then the words.
 *
 * ONE component for both jobs: leaving a comment and editing one. An edit form
 * that was a separate component is an edit form that drifts from the thing it
 * edits, and both need the same two controls with the same rules.
 *
 * ── WHY THE SCALE IS HERE AT ALL ──
 *
 * The category on a comment (Positive / Neutral / Negative) is DERIVED from a pick
 * on the seven-point scale, not chosen from a second list. So the composer asks
 * for the pick, in the same seven steps and the same order as the reaction bar
 * further up the page — because it IS that pick: posting sends it through the same
 * endpoint the bar writes to, and the bar refreshes to match.
 *
 * That is why the row is pre-selected from the reader's existing reaction and says
 * so. Two controls for one question is confusing; two controls for one question
 * that disagree is worse. This is one control, shown twice, and the copy admits it.
 *
 * The seven steps come from `@/types/reactions` — shared with the reaction bar and
 * the staff Emoji Analytics screen. Nothing here holds a second copy of the scale,
 * the weights, or the three-way mapping.
 */
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { MAX_COMMENT_LENGTH } from '@/stores/commentStore';
import { EMOJI_SCALE, SIDE_LABEL, STEP_FILL, sideOf, type EmojiKey } from '@/types/reactions';

export interface CommentComposerProps {
  /** Unique per composer on the page — the edit form and the new-comment form
   *  are both on screen at once, and duplicated ids would point every label at
   *  the first control. */
  idPrefix: string;
  /** Pre-selected step. For a new comment this is the reader's own reaction. */
  initialEmoji: EmojiKey | null;
  initialBody?: string;
  /** True while the write is in flight — the whole form disables. */
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  /** Shown under the scale when the pick came from an existing reaction. */
  scaleNote: string;
  /** Rendered above the buttons. The store's per-thread write error. */
  error?: string | null;
  onSubmit: (body: string, emoji: EmojiKey) => void;
  /** Present on the edit form only; absent on the new-comment form. */
  onCancel?: () => void;
  /** Focus the textarea on mount — right for an edit form, wrong for the page. */
  autoFocus?: boolean;
}

/** Below this many characters remaining, the counter appears. */
const COUNTER_THRESHOLD = 200;

export function CommentComposer({
  idPrefix,
  initialEmoji,
  initialBody = '',
  busy,
  submitLabel,
  busyLabel,
  scaleNote,
  error,
  onSubmit,
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const [emoji, setEmoji] = useState<EmojiKey | null>(initialEmoji);
  const [body, setBody] = useState(initialBody);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scaleLabelId = `${idPrefix}-scale-label`;
  const bodyId = `${idPrefix}-body`;

  /**
   * Adopt a reaction the reader makes on the BAR while this form is open.
   *
   * Only while the pick here is still untouched (`emoji === null` or unchanged
   * from what was handed in) — once they have chosen inside the form, the form
   * wins. Without this the bar and the form disagree the moment someone taps the
   * bar with the composer open, which is the exact confusion this design avoids.
   */
  useEffect(() => {
    setEmoji((current) => (current === null ? initialEmoji : current));
  }, [initialEmoji]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const trimmed = body.trim();
  const remaining = MAX_COMMENT_LENGTH - body.length;
  const ready = !!emoji && trimmed.length >= 2 && remaining >= 0;

  const submit = () => {
    if (!ready || busy || !emoji) return;
    onSubmit(trimmed, emoji);
  };

  /**
   * Arrow-key movement along the scale, matching `ReactionBar` exactly — this is
   * a radio group and a keyboard user expects to arrow along an ordinal scale
   * rather than Tab through seven stops. Moving focus also selects, which is
   * standard radio behaviour and correct here: landing on a step IS choosing it.
   */
  const onScaleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
      : e.key === 'Home' ? -index
      : e.key === 'End' ? EMOJI_SCALE.length - 1 - index
      : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(EMOJI_SCALE.length - 1, Math.max(0, index + delta));
    tileRefs.current[next]?.focus();
    setEmoji(EMOJI_SCALE[next]!.key);
  };

  const picked = emoji ? EMOJI_SCALE.find((s) => s.key === emoji) : undefined;

  return (
    <form
      className="rounded-sm border border-border/60 bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* ── 1 · Where you stand ── */}
      <p id={scaleLabelId} className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/80">
        Where do you stand?
      </p>

      <div
        role="radiogroup"
        aria-labelledby={scaleLabelId}
        className={cn('mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-2', busy && 'opacity-70')}
      >
        {EMOJI_SCALE.map((step, i) => {
          const isPicked = emoji === step.key;
          return (
            <button
              key={step.key}
              ref={(el) => {
                tileRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isPicked}
              disabled={busy}
              // Roving tabindex: the group is ONE tab stop. Before a pick, the
              // first step takes it so the group is reachable at all.
              tabIndex={isPicked || (!emoji && i === 0) ? 0 : -1}
              onClick={() => setEmoji(step.key)}
              onKeyDown={(e) => onScaleKeyDown(e, i)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-sm border px-1 py-2 transition-all disabled:cursor-not-allowed',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isPicked
                  ? 'border-transparent shadow-sm ring-2'
                  : 'border-border/60 bg-background hover:border-primary/30 hover:bg-muted/30',
              )}
              style={
                isPicked
                  ? // The step's own colour from the diverging scale, so a pick
                    // reads as a position ON the scale rather than just "on".
                    // Never colour alone — the label sits right underneath.
                    ({
                      '--tw-ring-color': STEP_FILL[step.key],
                      background: `color-mix(in oklab, ${STEP_FILL[step.key]} 8%, transparent)`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <span className="text-xl leading-none" aria-hidden="true">
                {step.emoji}
              </span>
              <span
                className={cn(
                  'text-center text-[9px] font-bold uppercase leading-tight tracking-[0.06em]',
                  isPicked ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* What the pick means for the rest of the platform, said plainly. The
          reader is choosing one thing that appears in two places, and a control
          that quietly writes somewhere else is the kind of surprise that makes
          people stop using it. */}
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
        {picked ? (
          <>
            Filed as{' '}
            <span className="font-semibold text-foreground">{SIDE_LABEL[sideOf(picked.key)]}</span> —{' '}
            {picked.label.toLowerCase()}. {scaleNote}
          </>
        ) : (
          'Pick a step before you write — a comment says whether you are for or against, and this is where it says it.'
        )}
      </p>

      {/* ── 2 · The words ── */}
      <label htmlFor={bodyId} className="mt-4 block text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/80">
        And why
      </label>
      <textarea
        id={bodyId}
        ref={textareaRef}
        value={body}
        disabled={busy}
        // maxLength is a courtesy, not the constraint — lib/comments.ts enforces
        // the same number, because this endpoint is reachable without this form.
        maxLength={MAX_COMMENT_LENGTH}
        rows={4}
        placeholder="What did you make of it?"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // ⌘/Ctrl+Enter posts. A bare Enter must not: this is a paragraph field,
          // and losing a half-written comment to a stray newline keystroke is the
          // fastest way to teach someone never to comment again.
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        className={cn(
          'mt-2 w-full resize-y rounded-sm border border-border/60 bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground',
          'placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-70',
        )}
      />

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {/* The counter appears only when it starts to matter. A character count
            sitting under an empty box is a limit presented as a target. */}
        <p className="text-[11.5px] tabular-nums text-muted-foreground" aria-live="polite">
          {remaining <= COUNTER_THRESHOLD
            ? `${remaining.toLocaleString()} character${remaining === 1 ? '' : 's'} left`
            : ''}
        </p>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-sm px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!ready || busy}
            className={cn(
              'rounded-sm bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground transition-opacity',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45',
            )}
          >
            {busy ? busyLabel : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
