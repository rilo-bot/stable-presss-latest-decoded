/**
 * "What an account gets you", and the four questions it raises.
 *
 * THIS BLOCK REPLACES A LIST OF THINGS THAT WERE NOT TRUE. The sidebar's
 * membership card promised "Tipping ring entry" — the ring is built but not open,
 * and was deliberately taken off this page — and a "Fortnightly print bulletin",
 * a cadence that exists nowhere in the code or the data. It also sat under
 * "Full access to every article", on a site with no paywall. Every line here maps
 * to a surface that ships today; the mapping is written beside each one in copy.ts.
 *
 * IT HAS NO CALL TO ACTION, ON PURPOSE. The 2026-08-04 rebuild cut the page from
 * six join CTAs to two (the rail's email form and the full-width band) on the
 * grounds that six ways to be asked is not six chances to convert — it is a page
 * with no primary action. This block explains; the band immediately below it asks.
 * Adding a button here would make it three. Don't.
 *
 * THE FAQ ANSWERS "NO" THREE TIMES OUT OF FOUR. That is the point of it. Saying
 * plainly that the ring is not open and that nothing is posted to you is better
 * copy than the promises it replaces, and it is the only version we can stand
 * behind.
 */
import { Check } from 'lucide-react';
import { ACCOUNT } from './copy';

interface LandingMembershipProps {
  /** Signed-in readers get the FAQ only — they do not need the sales half. */
  hasUser: boolean;
}

export function LandingMembership({ hasUser }: LandingMembershipProps) {
  return (
    <section className="border-t border-border">
      <div className="px-6 md:px-10 lg:px-16 py-14 md:py-20">
        <div
          className={
            hasUser
              ? 'max-w-3xl'
              : 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 lg:gap-16'
          }
        >

          {/* ── What it gets you ── */}
          {!hasUser && (
            <div>
              <p
                className="text-[11px] uppercase tracking-[0.16em] font-bold mb-3"
                style={{ color: 'hsl(var(--brand-accent-ink))' }}
              >
                {ACCOUNT.kicker}
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold leading-tight text-foreground text-balance mb-3">
                {ACCOUNT.heading}
              </h2>
              <p className="text-sm md:text-[15px] leading-relaxed text-muted-foreground mb-8">
                {ACCOUNT.standfirst}
              </p>

              <ul className="space-y-5">
                {ACCOUNT.gets.map((item) => (
                  <li key={item.name} className="flex gap-3.5">
                    <span
                      className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'hsl(var(--brand-accent) / 0.14)' }}
                      aria-hidden="true"
                    >
                      <Check size={12} style={{ color: 'hsl(var(--brand-accent-ink))' }} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-foreground leading-snug">
                        {item.name}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground mt-0.5">
                        {item.line}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── The questions ──
              Plain question-and-answer rows, not an accordion. Four one-sentence
              answers do not need to be hidden behind four clicks, and an
              accordion whose panels are shorter than its own headers is
              interaction for its own sake. */}
          <div>
            <h2
              className={
                hasUser
                  ? 'font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold leading-tight text-foreground mb-8'
                  : 'font-[family-name:var(--font-display)] text-xl md:text-2xl font-bold leading-tight text-foreground mb-6 lg:mt-1'
              }
            >
              Questions
            </h2>
            <dl className="space-y-0">
              {ACCOUNT.faq.map((row, idx) => (
                <div
                  key={row.q}
                  className={
                    idx < ACCOUNT.faq.length - 1
                      ? 'border-b border-border/60 pb-5 mb-5'
                      : ''
                  }
                >
                  <dt className="font-[family-name:var(--font-display)] text-[15px] md:text-base font-bold text-foreground leading-snug mb-1.5">
                    {row.q}
                  </dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">
                    {row.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

        </div>
      </div>
    </section>
  );
}
