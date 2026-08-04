import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Newspaper, Star, TrendingUp, Users } from 'lucide-react';
import { ArticleCard } from '@/components/ArticleCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import type { Sponsor } from '@/types/sponsor';
import type { TipperProfile } from '@/types/tip';

interface MyTipping {
  profile: TipperProfile;
  rank: number;
  total: number;
}

interface LandingSidebarProps {
  hasUser: boolean;
  subscribeEmail: string;
  setSubscribeEmail: (value: string) => void;
  handleSubscribe: (e: React.FormEvent) => void;
  sidebarArticles: Article[];
  sponsors: Sponsor[];
  myTipping: MyTipping | null;
  podcastSlot: ReactNode;
}

export function LandingSidebar({
  hasUser,
  subscribeEmail,
  setSubscribeEmail,
  handleSubscribe,
  sidebarArticles,
  sponsors,
  myTipping,
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
              <Star size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
              <span
                className="text-[9px] uppercase tracking-[0.2em] font-bold"
                style={{ color: 'hsl(var(--brand-accent))' }}
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
                  <Check size={11} style={{ color: 'hsl(var(--brand-accent))' }} />
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
            <span className="text-[9px] text-muted-foreground">
              Already a member?
            </span>
            <Link
              to="/login"
              className="text-[9px] font-semibold text-primary hover:underline"
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
            <h3 className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground whitespace-nowrap">
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

      {/* Editorial quick-access.
          Was "This Week's Newsletter", pointing at /newsletter — a page that
          listed stories carrying a `newsletter` distribution channel. That axis is
          gone (a published story is news) and the page with it, so this card now
          sends the reader to the desk it was really describing: every story,
          sorted by category, which is exactly what /news is. */}
      <div
        className="border rounded-sm p-5"
        style={{
          borderColor: 'hsl(var(--chart-1) / 0.35)',
          background: 'hsl(var(--chart-1) / 0.04)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Newspaper
            size={14}
            style={{ color: 'hsl(var(--chart-1))' }}
          />
          <span
            className="text-[9px] uppercase tracking-[0.2em] font-bold"
            style={{ color: 'hsl(var(--chart-1))' }}
          >
            The Editorial Desk
          </span>
        </div>
        <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mb-1.5 leading-snug">
          Every story, sorted by category — read it your way.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          Race Reports, Form Guides, Trainer Profiles, and Bloodstock analysis — all in one beautifully laid out reading experience.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            asChild
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
          >
            <Link to="/news">Browse Editorial</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            asChild
            className="text-xs"
          >
            <Link to="/bulletins">Bulletins</Link>
          </Button>
        </div>
      </div>

      {/* Tipping Ring CTA */}
      <div
        className="border rounded-sm p-5"
        style={{
          borderColor: 'hsl(var(--brand-accent) / 0.35)',
          background: 'hsl(var(--brand-accent) / 0.04)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp
            size={14}
            style={{ color: 'hsl(var(--brand-accent))' }}
          />
          <span
            className="text-[9px] uppercase tracking-[0.2em] font-bold"
            style={{ color: 'hsl(var(--brand-accent))' }}
          >
            Tipping Ring
          </span>
        </div>
        <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mb-1.5 leading-snug">
          Back your selections against the field.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          Track your tipping record, follow the global leaderboard, and
          earn your stripes as a form student.
        </p>
        <Button
          size="sm"
          asChild
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
        >
          <Link to="/tipping">Enter the Ring</Link>
        </Button>
      </div>

      {/* Sponsors */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground whitespace-nowrap">
            Partners &amp; Sponsors
          </h3>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        {sponsors.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/70 italic">
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
                className="flex-shrink-0 w-10 h-10 rounded-sm flex items-center justify-center text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: 'hsl(var(--brand-accent) / 0.12)',
                  color: 'hsl(var(--brand-accent))',
                }}
              >
                {sponsor.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[8px] uppercase tracking-[0.14em] font-bold"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {sponsor.category}
                  </span>
                </div>
                <p className="text-xs font-semibold text-foreground">
                  {sponsor.name}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {sponsor.tagline}
                </p>
              </div>
            </div>
          ))}
        </div>
        )}
        <p className="mt-3 text-[9px] text-muted-foreground uppercase tracking-[0.1em] text-center">
          Sponsor enquiries:{' '}
          <span className="text-foreground">press@stablepress.com.au</span>
        </p>
      </div>

      {/* Member Engagement — real tipping record, shown only once the member has one */}
      {hasUser && myTipping && (
        <div className="border border-primary/20 rounded-sm p-5 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-primary" />
            <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-primary">
              Your Tipping Record
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Coin balance', value: myTipping.profile.coinBalance.toLocaleString() },
              { label: 'Tips placed', value: myTipping.profile.tipsPlaced.toLocaleString() },
              { label: 'Rank', value: `${myTipping.rank} / ${myTipping.total}` },
              { label: 'Total won', value: myTipping.profile.totalWon.toLocaleString() },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center py-2 rounded-sm bg-background"
              >
                <span className="block font-[family-name:var(--font-display)] text-lg font-bold text-primary tabular-nums">
                  {stat.value}
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
          <Link
            to="/tipping"
            className="mt-3 block text-center text-[10px] uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            View your full record <ArrowRight size={10} className="inline" />
          </Link>
        </div>
      )}
    </aside>
  );
}
