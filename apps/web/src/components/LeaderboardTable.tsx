import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTippingStore } from '@/stores/tippingStore';
import { Trophy, TrendingUp, Coins } from 'lucide-react';

interface LeaderboardTableProps {
  currentUserId?: string;
}

// Medal colours using design-system tokens only
const MEDAL_COLOURS = [
  'hsl(var(--brand-accent))',       // Gold — 1st
  'hsl(var(--muted-foreground))',   // Silver — 2nd
  'hsl(var(--chart-3))',            // Bronze — 3rd (warm chart series token)
];

export function LeaderboardTable({ currentUserId }: LeaderboardTableProps) {
  const profiles = useTippingStore((s) => s.profiles);

  const ranked = useMemo(
    () =>
      [...profiles]
        .sort((a, b) => b.coinBalance - a.coinBalance)
        .slice(0, 20),
    [profiles]
  );

  if (ranked.length === 0) {
    return (
      <div className="border border-border rounded-sm bg-card px-6 py-12 text-center">
        <Coins size={32} className="mx-auto mb-3 text-primary/30" />
        <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground mb-1">
          The ring awaits its first punters.
        </h3>
        <div className="h-px w-12 mx-auto mb-3" style={{ background: 'hsl(var(--brand-accent))' }} />
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Place a tip on any open race to earn your place on the leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-sm bg-card overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[2rem_1fr_5rem_5rem_4rem] gap-3 items-center px-5 py-3 border-b border-border bg-primary text-primary-foreground">
        <span className="text-[10px] uppercase tracking-[0.08em]">#</span>
        <span className="text-[10px] uppercase tracking-[0.08em]">Tipper</span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-right">Balance</span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-right hidden sm:block">Wagered</span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-right hidden sm:block">Tips</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/50">
        {ranked.map((profile, index) => {
          const rank = index + 1;
          const isCurrentUser = profile.userId === currentUserId;
          const medalColor = rank <= 3 ? MEDAL_COLOURS[rank - 1] : undefined;

          return (
            <motion.div
              key={profile.userId}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: index * 0.03, ease: 'easeOut' }}
              className={cn(
                'grid grid-cols-[2rem_1fr_5rem_5rem_4rem] gap-3 items-center px-5 py-3.5 transition-colors',
                isCurrentUser ? 'bg-primary/5' : 'hover:bg-muted/30'
              )}
            >
              {/* Rank */}
              <span
                className="font-[family-name:var(--font-display)] text-base font-bold tabular-nums text-center"
                style={{ color: medalColor ?? 'hsl(var(--muted-foreground))' }}
              >
                {rank <= 3 ? (
                  <Trophy size={16} style={{ color: medalColor, display: 'inline' }} />
                ) : (
                  rank
                )}
              </span>

              {/* Name */}
              <div className="min-w-0">
                <span
                  className={cn(
                    'font-[family-name:var(--font-display)] text-sm font-semibold truncate block',
                    isCurrentUser ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {profile.displayName}
                  {isCurrentUser && (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-primary opacity-70">
                      You
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <TrendingUp size={10} />
                  {profile.tipsPlaced} tips placed
                </span>
              </div>

              {/* Balance */}
              <div className="text-right">
                <span
                  className="font-[family-name:var(--font-display)] text-base font-bold tabular-nums"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  {profile.coinBalance.toLocaleString()}
                </span>
                <div className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">coins</div>
              </div>

              {/* Wagered */}
              <div className="text-right hidden sm:block">
                <span className="font-[family-name:var(--font-display)] text-sm font-bold tabular-nums text-foreground">
                  {profile.totalWagered.toLocaleString()}
                </span>
                <div className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">wagered</div>
              </div>

              {/* Tips count */}
              <div className="text-right hidden sm:block">
                <span
                  className="font-[family-name:var(--font-display)] text-sm font-bold tabular-nums"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  {profile.tipsPlaced}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
