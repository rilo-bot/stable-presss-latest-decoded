/**
 * The front page's right-hand rail.
 *
 * TWO blocks, from seven — and from the four it had after the last cut. It once
 * carried, in order: a membership CTA with an email form, the podcast card, "Also in
 * this edition", an "Editorial Desk" card, a "Tipping Ring" card, the sponsor list,
 * and "Your Tipping Record". Six ways to be asked to subscribe on one screen is not
 * six chances to convert; it is a page with no primary action.
 *
 * What survives here: the membership form (the only thing on the page that captures
 * an email) and "Also today" (real stories, everything the page has not already
 * shown).
 *
 * Removed earlier: "The Editorial Desk" (static copy whose two buttons went to
 * /news and /bulletins, both already in the nav and the footer), "Tipping Ring" and
 * "Your Tipping Record" (the ring is not launching with the site).
 *
 * Removed now: the podcast card and the sponsor list, which did not belong in a
 * 19rem column — they are full-width bands of their own further down the page. See
 * LandingPodcast.tsx and LandingSponsors.tsx.
 *
 * THE BENEFIT LIST IS GONE FROM HERE, and that is not a trim. It listed "Tipping
 * ring entry" for a ring that is not open, a "Fortnightly print bulletin" for a
 * cadence that exists nowhere in the code or the data, and "Full access to every
 * article" on a site with no paywall. What an account actually does is now set out,
 * honestly and at length, in LandingMembership.tsx. This card only has to take an
 * email address.
 */
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { ArticleCard } from '@/components/ArticleCard';
import { Button } from '@/components/ui/button';
import type { Article } from '@/types/article';

interface LandingSidebarProps {
  hasUser: boolean;
  subscribeEmail: string;
  setSubscribeEmail: (value: string) => void;
  handleSubscribe: (e: React.FormEvent) => void;
  sidebarArticles: Article[];
}

export function LandingSidebar({
  hasUser,
  subscribeEmail,
  setSubscribeEmail,
  handleSubscribe,
  sidebarArticles,
}: LandingSidebarProps) {
  return (
    <aside className="lg:col-span-1 space-y-8">

      {/* ── Membership ──
          One of the page's two join CTAs; the full-width band above the footer is
          the other. Keep it at two. */}
      {!hasUser && (
        <div
          className="rounded-sm overflow-hidden border"
          style={{ borderColor: 'hsl(var(--brand-accent) / 0.3)' }}
        >
          <div
            className="px-5 py-4"
            style={{ background: 'hsl(var(--brand-accent) / 0.07)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Star size={14} style={{ color: 'hsl(var(--brand-accent-ink))' }} />
              <span
                className="text-[11px] uppercase tracking-[0.12em] font-bold"
                style={{ color: 'hsl(var(--brand-accent-ink))' }}
              >
                Membership
              </span>
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground leading-snug mb-1">
              Join Stable Press
            </h3>
            {/* Says what signing up actually costs and actually does. The detail —
                reactions, comments, claiming your register entry, the dashboard —
                is in the membership block further down; repeating it here is how
                this card grew a list of things that were not true. */}
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Free. A name, an email and a six-digit code — then you can react,
              comment, and claim your own entry in the register.
            </p>

            <form onSubmit={handleSubscribe} className="space-y-2">
              <input
                type="email"
                placeholder="your@email.com"
                value={subscribeEmail}
                onChange={(e) => setSubscribeEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-input rounded-sm bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Email address for membership"
              />
              <Button
                type="submit"
                size="sm"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
              >
                Create an account
              </Button>
            </form>
          </div>
          <div className="px-5 py-2 border-t border-border/40 flex items-center justify-center gap-1">
            <span className="text-[12px] text-muted-foreground">
              Already a member?
            </span>
            <Link
              to="/login"
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      {/* ── Also today ──
          Everything published that the rest of the page has not already used —
          computed from what was actually shown, not a fixed slice. */}
      {sidebarArticles.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground whitespace-nowrap">
              Also in this edition
            </h3>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div>
            {sidebarArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                variant="compact"
              />
            ))}
          </div>
        </div>
      )}

    </aside>
  );
}
