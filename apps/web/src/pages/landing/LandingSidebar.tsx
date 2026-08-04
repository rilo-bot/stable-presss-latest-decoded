/**
 * The front page's right-hand rail.
 *
 * THREE blocks, from seven. It carried, in order: a membership CTA with an email
 * form, the podcast card, "Also in this edition", an "Editorial Desk" card, a
 * "Tipping Ring" card, the sponsor list, and "Your Tipping Record" — and three of
 * those were CTAs competing with the membership form directly above them, plus two
 * more CTAs elsewhere on the page. Six ways to be asked to subscribe on one screen
 * is not six chances to convert; it is a page with no primary action.
 *
 * What survives: the membership form (the only one that captures an email), the
 * podcast card (real episodes), "Also today" (real stories), and the sponsors
 * (real, and they are paying to be there).
 *
 * Removed:
 *   · "The Editorial Desk" — static copy whose two buttons went to /news and
 *     /bulletins, both of which are in the nav and the footer already.
 *   · "Tipping Ring" — the ring is not launching with the site.
 *   · "Your Tipping Record" — same.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Star } from 'lucide-react';
import { ArticleCard } from '@/components/ArticleCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import type { Sponsor } from '@/types/sponsor';

interface LandingSidebarProps {
  hasUser: boolean;
  subscribeEmail: string;
  setSubscribeEmail: (value: string) => void;
  handleSubscribe: (e: React.FormEvent) => void;
  sidebarArticles: Article[];
  sponsors: Sponsor[];
  podcastSlot: ReactNode;
}

export function LandingSidebar({
  hasUser,
  subscribeEmail,
  setSubscribeEmail,
  handleSubscribe,
  sidebarArticles,
  sponsors,
  podcastSlot,
}: LandingSidebarProps) {
  return (
    <aside className="lg:col-span-1 space-y-8">

      {/* Subscription CTA */}
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
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Full access to every article, the print bulletin, tipping
              competitions, and the podcast archive.
            </p>
            <ul className="space-y-1.5 mb-4">
              {[
                'Unlimited editorial access',
                'Fortnightly print bulletin',
                'Tipping ring entry',
                'Podcast early access',
                'Horse profile deep dives',
              ].map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-center gap-2 text-xs text-foreground/80"
                >
                  <Check size={11} style={{ color: 'hsl(var(--brand-accent-ink))' }} />
                  {benefit}
                </li>
              ))}
            </ul>

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
                Start Membership
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

      {/* Podcast Promo */}
      {podcastSlot}

      {/* Also in this edition */}
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

      {/* Two CTA cards sat here — "The Editorial Desk" (static copy, buttons to
          /news and /bulletins) and "Tipping Ring" — directly beneath the membership
          form above. Both are gone; see the note at the top of this file. */}

      {/* Sponsors.
          Type floor raised throughout: the sponsor initial was 9px, the category
          8px, the enquiries line 9px. All gold text here now uses
          `--brand-accent-ink` — `--brand-accent` is a FILL, and it is 2.06:1 as
          text on this surface (docs/THEME-DIRECTION.md). The initial keeps the
          plain accent because there it IS a fill, behind ink. */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-[11px] uppercase tracking-[0.1em] font-bold text-muted-foreground whitespace-nowrap">
            Partners &amp; Sponsors
          </h3>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        {sponsors.length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">
            No sponsors listed yet.
          </p>
        ) : (
        <div className="space-y-3">
          {sponsors.map((sponsor, idx) => (
            <div
              key={sponsor.id}
              className={cn(
                'flex items-start gap-3 pb-3',
                idx < sponsors.length - 1 && 'border-b border-border/40'
              )}
            >
              <div
                className="flex-shrink-0 w-10 h-10 rounded-sm flex items-center justify-center text-[13px] font-bold uppercase"
                style={{
                  background: 'hsl(var(--brand-accent) / 0.14)',
                  color: 'hsl(var(--brand-accent-ink))',
                }}
              >
                {sponsor.name.charAt(0)}
              </div>
              <div className="min-w-0">
                {sponsor.category && (
                  <span
                    className="block text-[11px] uppercase tracking-[0.1em] font-bold mb-0.5"
                    style={{ color: 'hsl(var(--brand-accent-ink))' }}
                  >
                    {sponsor.category}
                  </span>
                )}
                <p className="text-sm font-semibold text-foreground">
                  {sponsor.name}
                </p>
                {sponsor.tagline && (
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {sponsor.tagline}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground text-center">
          Sponsor enquiries:{' '}
          <span className="text-foreground font-medium">press@stablepress.com.au</span>
        </p>
      </div>

      {/* "Your Tipping Record" — a four-stat tile of the signed-in member's own
          balance, rank and winnings — was the seventh block. Out with the rest of
          the tipping surface. */}
    </aside>
  );
}
