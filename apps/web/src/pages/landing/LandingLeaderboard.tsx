import { Link } from 'react-router-dom';
import { ChevronRight, Coins, Crown, TrendingUp } from 'lucide-react';
import type { TipperProfile } from '@/types/tip';

interface LandingLeaderboardProps {
  leaders: TipperProfile[];
}

const RANK_COLOR = ['hsl(43 74% 49%)', 'hsl(0 0% 62%)', 'hsl(28 47% 45%)'];

/**
 * "Top of the Ring" — the live tipping leaderboard, drawn from real persisted
 * tipper profiles. Hidden entirely when nobody has placed a tip yet.
 */
export function LandingLeaderboard({ leaders }: LandingLeaderboardProps) {
  if (leaders.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-4 mb-6">
        <div
          className="flex-shrink-0 w-1 h-5 rounded-full"
          style={{ background: 'hsl(var(--brand-accent))' }}
        />
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground whitespace-nowrap">
          Top of the Ring
        </h2>
        <div className="flex-1 h-px bg-border/50" />
        <Link
          to="/tipping"
          className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          Full leaderboard <ChevronRight size={11} />
        </Link>
      </div>

      <div className="border border-border/60 rounded-sm overflow-hidden">
        {leaders.map((tipper, idx) => (
          <div
            key={tipper.id ?? tipper.userId}
            className="flex items-center gap-4 px-4 py-3 bg-card border-b border-border/40 last:border-b-0"
          >
            <span className="flex-shrink-0 w-7 flex items-center justify-center">
              {idx < 3 ? (
                <Crown size={16} style={{ color: RANK_COLOR[idx] }} fill={RANK_COLOR[idx]} />
              ) : (
                <span className="font-[family-name:var(--font-display)] text-sm font-bold tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
              )}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {tipper.displayName}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {tipper.tipsPlaced} {tipper.tipsPlaced === 1 ? 'tip' : 'tips'} placed
              </p>
            </div>

            <div className="flex-shrink-0 text-right">
              <span className="flex items-center justify-end gap-1 font-[family-name:var(--font-display)] text-sm font-bold tabular-nums text-foreground">
                <Coins size={12} style={{ color: 'hsl(var(--brand-accent))' }} />
                {tipper.coinBalance.toLocaleString()}
              </span>
              {tipper.totalWon > 0 && (
                <span className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  <TrendingUp size={9} /> {tipper.totalWon.toLocaleString()} won
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
