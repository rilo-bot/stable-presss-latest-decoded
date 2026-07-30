import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { Sponsor } from '@/types/sponsor';

interface LandingFooterProps {
  hasUser: boolean;
  isStaff: boolean;
  sponsors: Sponsor[];
}

export function LandingFooter({ hasUser, isStaff, sponsors }: LandingFooterProps) {
  return (
    <>
      {/* ── Full-width Subscription Band ────────────────── */}
      {!hasUser && (
        <section className="bg-primary text-primary-foreground py-14 px-4 md:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <span
              className="inline-block text-[9px] uppercase tracking-[0.22em] font-bold mb-4 px-3 py-1 rounded-full"
              style={{
                background: 'hsl(var(--brand-accent))',
                color: 'hsl(var(--brand-accent-foreground))',
              }}
            >
              Premium Membership
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold text-primary-foreground mb-4 leading-tight">
              The racing record that serious turf followers trust.
            </h2>
            <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-xl mx-auto mb-8">
              Rely on Stable Press for premium editorial, paddock intelligence,
              and the deepest horse profiles in Australian thoroughbred racing.
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
                <Link to="/signup">Start Your Membership</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="text-sm border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
              >
                <Link to="/newsletter">Browse the Newsletter</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-border/60 bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div>
              <h4 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground mb-1">
                Stable Press
              </h4>
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
                Thoroughbred Racing Record
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Prestige racing journalism, horse profiles, tipping competitions,
                and expert analysis — curated for the serious turf follower.
              </p>
            </div>
            {/* Sections */}
            <div>
              <h4 className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                Sections
              </h4>
              <ul className="space-y-2">
                {[
                  { to: '/news', label: 'News & Race Reports' },
                  { to: '/news?section=analysis', label: 'Analysis & Form' },
                  { to: '/news?section=interviews', label: 'Interviews' },
                  { to: '/horses', label: 'Horse Profiles' },
                  { to: '/podcast', label: 'Podcast Hub' },
                  { to: '/newsletter', label: 'Newsletter' },
                  { to: '/bulletins', label: 'Print Bulletins' },
                ].map((item) => (
                  <li key={item.label}>
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
            {/* Community */}
            <div>
              <h4 className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                Community
              </h4>
              <ul className="space-y-2">
                {[
                  { to: '/tipping', label: 'Tipping Ring' },
                  { to: '/tipping', label: 'Leaderboard' },
                  { to: '/newsletter', label: 'Newsletter' },
                  { to: '/bulletins', label: 'Print Bulletins' },
                  ...(isStaff ? [{ to: '/production-system', label: 'Production System' }] : []),
                ].map((item) => (
                  <li key={item.label}>
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
            {/* Account */}
            <div>
              <h4 className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                Account
              </h4>
              <ul className="space-y-2">
                {[
                  ...(hasUser
                    ? [{ to: '/dashboard', label: 'Dashboard' }]
                    : [
                        { to: '/login', label: 'Sign In' },
                        { to: '/signup', label: 'Create Account' },
                        { to: '/signup', label: 'Membership Plans' },
                      ]),
                  ...(isStaff ? [{ to: '/production-system', label: 'Production System' }] : []),
                ].map((item) => (
                  <li key={item.label}>
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
          </div>

          {/* Sponsor bar */}
          {sponsors.length > 0 && (
            <div className="py-4 border-t border-b border-border/40 mb-6">
              <div className="flex flex-wrap items-center justify-center gap-6">
                <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                  Proudly Supported By
                </span>
                {sponsors.map((s) =>
                  s.websiteUrl ? (
                    <a
                      key={s.id}
                      href={s.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s.name}
                    </a>
                  ) : (
                    <span
                      key={s.id}
                      className="text-[10px] font-semibold text-muted-foreground"
                    >
                      {s.name}
                    </span>
                  )
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Placeholder ABN "00 000 000 000" removed — add the real ABN here
                once registered rather than showing a fabricated identifier. */}
            <p className="text-[10px] text-muted-foreground">
              © {new Date().getFullYear()} Stable Press Pty Ltd. All rights
              reserved.
            </p>
            <p
              className="text-[10px] italic font-[family-name:var(--font-display)]"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              The form is everything. The rest is conversation.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
