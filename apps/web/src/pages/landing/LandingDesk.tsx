/**
 * "How the desk works" — the five stages between a writer and this page.
 *
 * THE STAGES ARE REAL. They are `ARTICLE_STATUSES` in types/article.ts —
 * draft → submitted → approved → scheduled → published — the same five the
 * newsroom's workflow board runs on, after the twelve-status set was collapsed
 * into five (memory note `story-workflow-5-stages`). So this block describes the
 * pipeline rather than advertising one: if the pipeline changes, this reads wrong
 * and someone will notice.
 *
 * It is the "why trust us" block, and it needs no fabricated evidence to be one.
 * A process a reader can check beats a testimonial we would have to invent —
 * see the rule at the top of copy.ts.
 *
 * SURFACE. Full-width `bg-card` band, the same furniture-on-the-sheet treatment as
 * the manifesto, with a gold rule threaded through the five markers. Nothing green.
 */
import { DESK } from './copy';

export function LandingDesk() {
  return (
    <section className="border-y border-border bg-card">
      <div className="px-6 md:px-10 lg:px-16 py-14 md:py-20">

        <div className="max-w-2xl mb-10 md:mb-14">
          <p
            className="text-[11px] uppercase tracking-[0.16em] font-bold mb-3"
            style={{ color: 'hsl(var(--brand-accent-ink))' }}
          >
            {DESK.kicker}
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold leading-tight text-foreground text-balance mb-3">
            {DESK.heading}
          </h2>
          <p className="text-sm md:text-[15px] leading-relaxed text-muted-foreground">
            {DESK.standfirst}
          </p>
        </div>

        {/* Five across on desktop, stacked on a phone.
            `items-start` and a shared top rule mean the five markers line up on a
            single axis whatever each stage's copy runs to. */}
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-6">
          {DESK.stages.map((stage, idx) => (
            <li key={stage.status} className="relative">
              {/* The thread between markers. Hidden on the last one and at the
                  breakpoints where the steps stack, so it never points at nothing. */}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-[7px] hidden h-px w-full ${
                  idx < DESK.stages.length - 1 ? 'lg:block' : ''
                }`}
                style={{ background: 'hsl(var(--brand-accent) / 0.35)' }}
              />

              <span
                aria-hidden="true"
                className="relative z-10 mb-4 block h-[15px] w-[15px] rounded-full border-[3px] bg-card"
                style={{ borderColor: 'hsl(var(--brand-accent))' }}
              />

              <p
                className="text-[11px] uppercase tracking-[0.14em] font-bold mb-1.5 tabular-nums"
                style={{ color: 'hsl(var(--brand-accent-ink))' }}
              >
                Stage {idx + 1}
              </p>
              <h3 className="font-[family-name:var(--font-display)] text-base md:text-lg font-bold text-foreground leading-tight mb-1.5">
                {stage.name}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {stage.line}
              </p>
            </li>
          ))}
        </ol>

      </div>
    </section>
  );
}
