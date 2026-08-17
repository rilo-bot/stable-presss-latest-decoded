/**
 * The closing ask, and the footer.
 *
 * THE BAND IS ONE OF THE PAGE'S TWO JOIN CTAs — the rail's email form is the other,
 * and it should stay at two (the page once had six). Its copy changed: the kicker
 * said "Premium Membership" above a free account, and the heading, "The racing record
 * that serious turf followers trust", was a claim about our readership that we have
 * no measurement of. See JOIN_BAND in copy.ts.
 *
 * THE SPONSOR BAR IS GONE FROM HERE. It listed exactly the same records as the rail's
 * sponsor block — two sponsor surfaces on one page. There is now one, its own band
 * above this one: LandingSponsors.tsx.
 *
 * DUPLICATE LINKS FIXED. "Tipping Ring" and "Leaderboard" both pointed at /tipping,
 * "Print Bulletins" was listed under both Sections and Community, and "Production
 * System" appeared under both Community and Account. Each destination appears once.
 *
 * TWO PUBLIC SECTIONS WERE MISSING ENTIRELY: /blog and /parties. The footer is the
 * page's index of the site, and it did not index two of the six sections — /parties
 * being the same route that, before the last rebuild, was public and in no navigation
 * menu at all.
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
import type { PublicNavKey } from '@/types/siteSettings';
import { FOOTER, JOIN_BAND } from './copy';

interface LandingFooterProps {
  hasUser: boolean;
  isAdmin: boolean;
}

export function LandingFooter({ hasUser, isAdmin }: LandingFooterProps) {
  // Reads the switches itself rather than taking a prop: the section lists live
  // inside this component and Landing.tsx cannot filter them from outside.
  const publicNav = useSiteSettingsStore((s) => s.publicNav);
  const shows = (key: PublicNavKey) => publicNav[key] !== false;

  /** Every public destination, each appearing exactly once. */
  const sectionLinks = [
    { to: '/news', label: 'News & Race Reports', section: 'news' as const },
    { to: '/news?section=analysis', label: 'Analysis & Form', section: 'news' as const },
    { to: '/news?section=interviews', label: 'Interviews', section: 'news' as const },
    { to: '/blog', label: 'The Blog', section: 'blog' as const },
    { to: '/horses', label: 'Horse Profiles', section: 'horses' as const },
    { to: '/parties', label: 'The Directory', section: 'directory' as const },
    { to: '/podcast', label: 'Podcast Hub', section: 'podcast' as const },
    { to: '/bulletins', label: 'Print Bulletins', section: 'bulletins' as const },
  ].filter((item) => shows(item.section));

  /* /tipping is NOT advertised on this page and is not in the nav — the ring is not
     launching with the site — but the route works and this is where it stays linked,
     once. See the note in Landing.tsx. */
  const moreLinks = [
    { to: '/tipping', label: 'Tipping Ring' },
    ...(isAdmin ? [{ to: '/production-system', label: 'Production System' }] : []),
  ];

  const accountLinks = hasUser
    ? [{ to: '/dashboard', label: 'Your Dashboard' }]
    : [
        { to: '/signup', label: 'Create Account' },
        { to: '/login', label: 'Sign In' },
      ];

  return (
    <>
      {/* ── Full-width join band ────────────────────────── */}
      {!hasUser && (
        <section className="bg-primary text-primary-foreground py-14 px-6 md:px-10 lg:px-16">
          <div className="max-w-3xl mx-auto text-center">
            <span
              className="inline-block text-[11px] uppercase tracking-[0.16em] font-bold mb-4 px-3 py-1 rounded-full"
              style={{
                background: 'hsl(var(--brand-accent))',
                color: 'hsl(var(--brand-accent-foreground))',
              }}
            >
              {JOIN_BAND.kicker}
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold text-primary-foreground mb-4 leading-tight text-balance">
              {JOIN_BAND.heading}
            </h2>
            <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-xl mx-auto mb-8">
              {JOIN_BAND.standfirst}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                asChild
                className="text-sm font-semibold px-8"
                style={{
                  background: 'hsl(var(--brand-accent))',
                  color: 'hsl(var(--brand-accent-foreground))',
                }}
              >
                <Link to="/signup">{JOIN_BAND.primaryCta}</Link>
              </Button>
              {shows('news') && (
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="text-sm border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                >
                  <Link to="/news">{JOIN_BAND.secondaryCta}</Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-border/60 bg-card">
        <div className="px-6 md:px-10 lg:px-16 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div>
              <h4 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground mb-1">
                {FOOTER.wordmark}
              </h4>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
                {FOOTER.strapline}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {FOOTER.blurb}
              </p>
            </div>

            {/* Sections — all six public surfaces, filtered by the switches. A link
                to a section an admin has switched off would land on a route that
                redirects straight back here. */}
            <FooterColumn heading="Sections" links={sectionLinks} />

            {/* More */}
            <FooterColumn heading="More" links={moreLinks} />

            {/* Account */}
            <FooterColumn heading="Account" links={accountLinks} />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/40 pt-6">
            {/* Placeholder ABN "00 000 000 000" removed — add the real ABN here
                once registered rather than showing a fabricated identifier. */}
            <p className="text-[12px] text-muted-foreground">
              © {new Date().getFullYear()} {FOOTER.legalName}. All rights reserved.
            </p>
            <p
              className="text-[12px] italic font-[family-name:var(--font-display)]"
              style={{ color: 'hsl(var(--brand-accent-ink))' }}
            >
              {FOOTER.signoff}
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}

/** One footer column. Renders nothing when its list is empty. */
function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: { to: string; label: string }[];
}) {
  if (links.length === 0) return null;
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-3">
        {heading}
      </h4>
      <ul className="space-y-2">
        {links.map((item) => (
          <li key={`${item.to}-${item.label}`}>
            <Link
              to={item.to}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
