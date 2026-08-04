/**
 * The reader reaction bar. ONE component, four surfaces.
 *
 * This replaces `blog/BlogReactions`, which was a front-end preview that
 * recorded nothing — every count was a zero on purpose, and the copy said so.
 * It is real now: a pick is stored against your account through
 * `/api/reactions`, one per reader per thing, and it survives a reload. The
 * honesty rule that shaped the preview still holds, it just points the other
 * way — the numbers here are counts of PEOPLE, because the identity is an
 * account rather than a device, so nothing needs a "this counts reactions, not
 * readers" caveat.
 *
 * ── Counts appear AFTER you pick ──
 *
 * Before you answer you see the size of the room ("412 readers have had their
 * say") and no breakdown. A visible tally is a nudge: seven numbers under seven
 * emoji tell you what the popular answer is before you have given your own, and
 * the whole value of this scale is that it is not a popularity poll. Once you
 * have picked, the split is yours to see.
 *
 * The seven-point scale comes from `@/types/reactions`, shared with the staff
 * Emoji Analytics screen — that screen ranks on these very rows, so the two must
 * never fork.
 *
 * ── One bar, several places ──
 *
 * A post with parts draws one of these per part plus one for the post as a
 * whole. Every element id derives from `idPrefix`, and each bar addresses its
 * own target: a duplicated id would point every `aria-labelledby` at the first
 * heading, so a screen reader would announce every scale as belonging to the
 * post overall — precisely the thing per-part scales exist to distinguish.
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  emptyCounts,
  reactionKey,
  useReactionStore,
  type ReactionTargetType,
} from '@/stores/reactionStore';
import { EMOJI_SCALE, STEP_FILL, type EmojiKey } from '@/types/reactions';

/** Hairline rules either side of a centred label. Matches the post's masthead. */
function Hairlines({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="h-px w-12 bg-border sm:w-16" aria-hidden="true" />
      {children}
      <span className="h-px w-12 bg-border sm:w-16" aria-hidden="true" />
    </div>
  );
}

export interface ReactionBarProps {
  targetType: ReactionTargetType;
  targetId: string;
  /**
   * For a `blogPart`, the id of the post it sits on. The server stores it so a
   * post and all of its parts come back in one query, and re-checks that the
   * part is really on that post before recording anything.
   */
  parentId?: string;
  /** Unique per bar on the page — see the note above about `aria-labelledby`. */
  idPrefix?: string;
  heading?: string;
  /** The line under the heading. */
  note?: string;
  /**
   * `compact` is the per-part bar: smaller, in a bordered card, sized to sit
   * under a section rather than to close the page.
   */
  variant?: 'full' | 'compact';
}

export function ReactionBar({
  targetType,
  targetId,
  parentId,
  idPrefix = 'reactions',
  heading = 'How did this one sit with you?',
  note = 'One reaction per reader. You can change it any time.',
  variant = 'full',
}: ReactionBarProps) {
  const key = reactionKey(targetType, targetId);
  const data = useReactionStore((s) => s.byKey[key]) ?? emptyCounts(targetType, targetId);
  const busy = useReactionStore((s) => s.pending[key]) ?? false;
  const error = useReactionStore((s) => s.errors[key]) ?? null;
  const react = useReactionStore((s) => s.react);
  const clearReaction = useReactionStore((s) => s.clear);
  const signedIn = useAuthStore((s) => Boolean(s.currentUser));

  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const headingId = `${idPrefix}-heading`;
  const compact = variant === 'compact';
  const picked = data.mine;
  // D1: the breakdown is the reward for answering, not the prompt.
  const showCounts = picked !== null;

  /**
   * Arrow-key movement, because this is a radio group and a keyboard user
   * expects to arrow along a scale rather than Tab through seven separate stops.
   * Moving the focus also SELECTS — standard radio behaviour, and right here,
   * since the options are an ordinal scale so landing on one is choosing it.
   *
   * A signed-out reader still gets the movement; the write is what is refused,
   * and it is refused with a sentence rather than a dead control.
   */
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
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
    if (signedIn) void react(targetType, targetId, EMOJI_SCALE[next]!.key, parentId);
  };

  const pick = (emoji: EmojiKey) => {
    if (!signedIn || busy) return;
    // Tapping your current pick again takes it back, which is the only way off a
    // one-per-reader control once you are on it.
    if (emoji === picked) void clearReaction(targetType, targetId);
    else void react(targetType, targetId, emoji, parentId);
  };

  return (
    <section
      className={cn(
        compact
          ? 'mt-6 rounded-sm border border-border/60 bg-card px-4 py-5 sm:px-5'
          : 'mt-14 border-t border-border/50 pt-10',
      )}
      aria-labelledby={headingId}
    >
      <header className="text-center">
        {!compact && (
          <Hairlines>
            <p
              className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em]"
              // --brand-accent-ink is the gold darkened for TEXT; the raw accent
              // is a 2.06:1 fill colour and fails as type (docs/THEME-REVIEW.md).
              style={{ color: 'hsl(var(--brand-accent-ink))' }}
            >
              Have your say
            </p>
          </Hairlines>
        )}

        <h2
          id={headingId}
          className={
            compact
              ? 'text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/80'
              : 'mx-auto mt-5 max-w-2xl font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-foreground md:text-3xl'
          }
        >
          {heading}
        </h2>

        <p
          className={cn(
            'mx-auto leading-relaxed text-muted-foreground',
            compact ? 'mt-2 max-w-lg text-xs' : 'mt-3 max-w-xl text-sm',
          )}
        >
          {note}
        </p>
      </header>

      <div
        role="radiogroup"
        aria-labelledby={headingId}
        className={cn(
          'mx-auto grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3',
          compact ? 'mt-5 max-w-3xl' : 'mt-8 max-w-4xl',
          busy && 'opacity-70',
        )}
      >
        {EMOJI_SCALE.map((step, i) => {
          const isPicked = picked === step.key;
          return (
            <button
              key={step.key}
              ref={(el) => {
                tileRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isPicked}
              // Roving tabindex: the group is ONE tab stop. Before a pick, the
              // first tile takes it so the group is reachable at all.
              tabIndex={isPicked || (!picked && i === 0) ? 0 : -1}
              onClick={() => pick(step.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-sm border bg-card px-2 transition-all',
                compact ? 'py-2.5' : 'py-4',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isPicked
                  ? 'border-transparent shadow-sm ring-2'
                  : 'border-border/60 hover:border-primary/30 hover:bg-muted/30',
              )}
              style={
                isPicked
                  ? // The step's own colour from the diverging scale, so a pick
                    // reads as a position ON the scale rather than just "on".
                    // Never colour alone — the label and the count are right there.
                    //
                    // `color-mix` for the wash so one hex drives both the ring and
                    // the tint. Where it is unsupported the tile simply has no
                    // tint and the ring still carries the state.
                    ({
                      '--tw-ring-color': STEP_FILL[step.key],
                      background: `color-mix(in oklab, ${STEP_FILL[step.key]} 8%, transparent)`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <span
                className={cn('leading-none', compact ? 'text-xl' : 'text-2xl md:text-[28px]')}
                aria-hidden="true"
              >
                {step.emoji}
              </span>
              <span
                className={cn(
                  'text-center text-[10px] font-bold uppercase leading-tight tracking-[0.08em]',
                  isPicked ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
              {/* Hidden until you have answered — a tally you can see is a tally
                  you are answering against. The slot is held either way so the
                  tiles do not jump height when the numbers arrive. */}
              <span
                className={cn(
                  'font-[family-name:var(--font-display)] font-bold tabular-nums',
                  compact ? 'text-sm' : 'text-base',
                  isPicked ? 'text-foreground' : 'text-muted-foreground/60',
                  !showCounts && 'invisible',
                )}
                aria-hidden={!showCounts}
              >
                {data.counts[step.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* One line under the bar: what you picked, or what to do about not being
          able to pick, or what went wrong. */}
      <div aria-live="polite" className={cn('text-center', compact ? 'mt-4 text-xs' : 'mt-5 text-sm')}>
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : !signedIn ? (
          <p className="text-muted-foreground">
            <Link to="/login" className="font-semibold text-primary underline underline-offset-2 hover:opacity-80">
              Sign in
            </Link>{' '}
            to have your say.
            {data.total > 0 && ` ${readerLine(data.total)} so far.`}
          </p>
        ) : picked ? (
          <p className="text-muted-foreground">
            You picked{' '}
            <span className="font-semibold text-foreground">
              {EMOJI_SCALE.find((s) => s.key === picked)!.label.toLowerCase()}
            </span>
            .{' '}
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearReaction(targetType, targetId)}
              className="font-semibold text-primary underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            >
              Clear
            </button>
          </p>
        ) : (
          <p className="text-muted-foreground/70">
            {data.total > 0 ? `${readerLine(data.total)}. Add yours.` : 'Be the first to have your say.'}
          </p>
        )}
      </div>
    </section>
  );
}

/** "1 reader has" / "412 readers have" — a count of people, not of reactions. */
function readerLine(total: number): string {
  return total === 1 ? '1 reader has had their say' : `${total.toLocaleString()} readers have had their say`;
}
