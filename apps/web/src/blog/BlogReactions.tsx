/**
 * The reader reaction bar at the foot of a blog post.
 *
 * ── THIS IS A FRONT-END PREVIEW. NOTHING IS RECORDED. ──
 *
 * There is no `reactions` collection, no endpoint and no storage behind this — not
 * even localStorage. A pick lives in component state and is gone on reload or on
 * navigating to another post. That is the whole intended scope for now.
 *
 * Which makes the copy the load-bearing part of this file. A row of emoji with
 * numbers under them IS a claim about what other readers thought, and the repo has
 * been here before: `docs/FAKE-DATA-REMOVED.md` records a sweep that pulled
 * invented follower counts, subscriber stats and issue numbers out of the app
 * chrome for exactly this reason. So:
 *
 *   • every count starts at ZERO. No seeded "1.2k readers loved it".
 *   • the only number that can ever move is the one you clicked, to 1.
 *   • the panel says, on screen, that it is not saved yet.
 *
 * An honest zero is worth more than a plausible number, because a plausible number
 * is a lie that someone eventually makes a decision on.
 *
 * The seven-point scale comes from `@/types/reactions`, shared with the staff
 * Emoji Analytics screen — that screen is the design for the system this bar would
 * feed, so the two must not fork.
 */
import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';
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

export function BlogReactions() {
  const [picked, setPicked] = useState<EmojiKey | null>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Arrow-key movement, because this is a radio group and a keyboard user expects
   * to arrow along a scale rather than Tab through seven separate stops. Moving
   * the focus also SELECTS, which is standard radio behaviour and right here: the
   * options are an ordinal scale, so landing on one is choosing it.
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
    setPicked(EMOJI_SCALE[next]!.key);
    tileRefs.current[next]?.focus();
  };

  return (
    <section className="mt-14 border-t border-border/50 pt-10" aria-labelledby="blog-reactions-heading">
      <header className="text-center">
        <Hairlines>
          <p
            className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'hsl(var(--brand-accent))' }}
          >
            Have your say
          </p>
        </Hairlines>

        <h2
          id="blog-reactions-heading"
          className="mx-auto mt-5 max-w-2xl font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-foreground md:text-3xl"
        >
          How did this one sit with you?
        </h2>

        {/* Says plainly that it goes nowhere. A reader who picks an emoji has
            given you something; letting them believe it was counted when it was
            not is the part that would actually be rude. */}
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          One reaction per reader. This is a preview — nothing is recorded yet, and your pick clears when you
          reload the page.
        </p>
      </header>

      <div
        role="radiogroup"
        aria-labelledby="blog-reactions-heading"
        className="mx-auto mt-8 grid max-w-4xl grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3"
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
              onClick={() => setPicked(step.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-sm border bg-card px-2 py-4 transition-all',
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
              <span className="text-2xl leading-none md:text-[28px]" aria-hidden="true">
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
              {/* Zero until you click, and only ever your own click. */}
              <span
                className={cn(
                  'font-[family-name:var(--font-display)] text-base font-bold tabular-nums',
                  isPicked ? 'text-foreground' : 'text-muted-foreground/60',
                )}
              >
                {isPicked ? 1 : 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Confirms the pick in words, not just as a ring — and keeps a way back to
          no answer, since a misclick on a one-per-reader control otherwise sticks. */}
      <div aria-live="polite" className="mt-5 text-center text-sm">
        {picked ? (
          <p className="text-muted-foreground">
            You picked{' '}
            <span className="font-semibold text-foreground">
              {EMOJI_SCALE.find((s) => s.key === picked)!.label.toLowerCase()}
            </span>
            .{' '}
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
            >
              Clear
            </button>
          </p>
        ) : (
          <p className="text-muted-foreground/70">Pick the one that fits.</p>
        )}
      </div>
    </section>
  );
}
