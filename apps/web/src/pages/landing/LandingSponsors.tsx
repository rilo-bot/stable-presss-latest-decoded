/**
 * The sponsor band — real sponsors, out of the rail and across the page.
 *
 * WHY IT MOVED. Sponsors were the fourth block in a narrow right-hand rail, under
 * a membership form and a podcast card, rendered as 40px-wide initials. They are
 * the one group on this page paying to be on it. A full-width band above the
 * footer is both a better placement and better rhythm — the rail is now two
 * blocks instead of four.
 *
 * ONE SPONSOR SURFACE, NOT TWO. The footer carried its own "Proudly Supported By"
 * bar listing exactly the same records. That bar is gone; this is the only place
 * sponsors appear on the front page, and the enquiries address appears once, here.
 *
 * NO LOGOS, BECAUSE THERE IS NO LOGO FIELD. `Sponsor` carries a name, a category,
 * a tagline and an optional URL — so the band is typographic. An <img> would need
 * a src we do not have, and a grey placeholder box in a sponsor's slot is worse
 * than their name set properly.
 *
 * The initial chip is the one place `--brand-accent` is used as a FILL on a light
 * surface, and it works because the letter on top of it is `--brand-accent-ink`.
 * Gold as text elsewhere in this file would be 2.06:1 (THEME-DIRECTION C2).
 */
import type { Sponsor } from '@/types/sponsor';
import { SPONSORS_BAND } from './copy';

interface LandingSponsorsProps {
  sponsors: Sponsor[];
}

export function LandingSponsors({ sponsors }: LandingSponsorsProps) {
  // Nothing to support us with yet. The band says nothing rather than announcing
  // an empty partnership programme on the front page — the same rule LandingBlog
  // and LandingDirectory follow.
  if (sponsors.length === 0) return null;

  return (
    <section className="border-t border-border">
      <div className="px-6 md:px-10 lg:px-16 py-12 md:py-14">

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-8">
          <p
            className="text-[11px] uppercase tracking-[0.16em] font-bold"
            style={{ color: 'hsl(var(--brand-accent-ink))' }}
          >
            {SPONSORS_BAND.kicker}
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-xl md:text-2xl font-bold text-foreground leading-tight">
            {SPONSORS_BAND.heading}
          </h2>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {sponsors.map((sponsor) => {
            const body = (
              <>
                <span
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-sm text-base font-bold uppercase"
                  style={{
                    background: 'hsl(var(--brand-accent) / 0.14)',
                    color: 'hsl(var(--brand-accent-ink))',
                  }}
                  aria-hidden="true"
                >
                  {sponsor.name.charAt(0)}
                </span>
                <span className="min-w-0">
                  {sponsor.category && (
                    <span
                      className="block text-[11px] uppercase tracking-[0.1em] font-bold mb-0.5"
                      style={{ color: 'hsl(var(--brand-accent-ink))' }}
                    >
                      {sponsor.category}
                    </span>
                  )}
                  <span className="block font-[family-name:var(--font-display)] text-[15px] font-bold text-foreground leading-tight">
                    {sponsor.name}
                  </span>
                  {sponsor.tagline && (
                    <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
                      {sponsor.tagline}
                    </span>
                  )}
                </span>
              </>
            );

            return (
              <li key={sponsor.id}>
                {sponsor.websiteUrl ? (
                  <a
                    href={sponsor.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-full items-start gap-3.5 rounded-sm border border-border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="flex h-full items-start gap-3.5 rounded-sm border border-border bg-card p-4">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-[13px] text-muted-foreground">
          {SPONSORS_BAND.enquiriesLabel}:{' '}
          <a
            href={`mailto:${SPONSORS_BAND.enquiries}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {SPONSORS_BAND.enquiries}
          </a>
        </p>

      </div>
    </section>
  );
}
