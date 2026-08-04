import { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTippingStore } from '@/stores/tippingStore';
import { useAuthStore } from '@/stores/authStore';
import { RaceCard } from '@/components/RaceCard';
import { RaceMap } from '@/components/RaceMap';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { EmptyState } from '@/components/EmptyState';
import { RaceSkeletonCard, LeaderboardSkeletonRow } from '@/components/SkeletonCard';
import { Coins, BarChart2, TrendingUp, Trophy, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

function CoinBadge({ balance }: { balance: number }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border"
      style={{
        borderColor: 'hsl(var(--brand-accent) / 0.4)',
        background: 'hsl(var(--brand-accent) / 0.08)',
      }}
    >
      <Coins size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
      <span
        className="font-[family-name:var(--font-display)] font-bold text-sm tabular-nums"
        style={{ color: 'hsl(var(--brand-accent))' }}
      >
        {balance.toLocaleString()}
      </span>
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        coins
      </span>
    </div>
  );
}

function SectionHeader({
  children,
  count,
  countLabel,
}: {
  children: React.ReactNode;
  count?: number;
  countLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground whitespace-nowrap">
        {children}
      </h2>
      {count !== undefined && (
        <span
          className="text-xs uppercase tracking-[0.08em] px-2 py-0.5 rounded-sm font-semibold flex-shrink-0"
          style={{
            background: 'hsl(var(--brand-accent) / 0.15)',
            color: 'hsl(var(--brand-accent))',
          }}
        >
          {count} {countLabel ?? (count === 1 ? 'race' : 'races')}
        </span>
      )}
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

export default function TippingRing() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchRaces = useTippingStore((s) => s.fetchRaces);
  useEffect(() => {
    fetchRaces();
  }, [fetchRaces]);
  // === end auto fetch-on-mount ===

  const currentUser = useAuthStore((s) => s.currentUser);
  const races = useTippingStore((s) => s.races);
  const tips = useTippingStore((s) => s.tips);
  const profiles = useTippingStore((s) => s.profiles);
  const getOrCreateProfile = useTippingStore((s) => s.getOrCreateProfile);

  // Real fetch state, not a 500ms timer — same fix as /horses and /news. The
  // timer showed "The bookmakers are preparing the card" on a full race card
  // whenever the request took longer than half a second.
  const loading = useTippingStore((s) => !s.loaded && !s.error);

  // Ensure profile exists for logged-in user
  useEffect(() => {
    if (currentUser) {
      getOrCreateProfile(currentUser.id, currentUser.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const profile = useMemo(
    () =>
      currentUser ? profiles.find((p) => p.userId === currentUser.id) : undefined,
    [profiles, currentUser?.id]
  );

  const userTipsMap = useMemo(() => {
    if (!currentUser) return {} as Record<string, (typeof tips)[number]>;
    const map: Record<string, (typeof tips)[number]> = {};
    tips.forEach((t) => {
      if (t.userId === currentUser.id) map[t.raceId] = t;
    });
    return map;
  }, [tips, currentUser?.id]);

  const openRaces = useMemo(
    () => (races ?? []).filter((r) => r.status === 'open'),
    [races]
  );
  const upcomingRaces = useMemo(
    () => (races ?? []).filter((r) => r.status === 'upcoming'),
    [races]
  );
  const resolvedRaces = useMemo(
    () => (races ?? []).filter((r) => r.status === 'resolved'),
    [races]
  );

  const handleTipped = () => {};

  const totalRaces = (races ?? []).length;

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* Page hero band */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-primary-foreground/60 mb-2">
                Virtual Tipping
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-bold leading-tight">
                The Tipping Ring
              </h1>
              <div
                className="h-px w-20 mt-3 mb-4 opacity-40"
                style={{ background: 'hsl(var(--brand-accent))' }}
              />
              <p className="text-primary-foreground/80 text-sm md:text-base max-w-xl leading-relaxed">
                Study the field, read the form, and back your selection with
                virtual coins. The ring rewards those who know their horses.
              </p>
            </div>

            {currentUser && profile ? (
              <CoinBadge balance={profile.coinBalance} />
            ) : !currentUser ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <p className="text-sm text-primary-foreground/70 italic font-[family-name:var(--font-display)]">
                  Sign in to receive 500 starting coins.
                </p>
                <Link
                  to="/login"
                  className="text-sm font-semibold px-4 py-2 border border-primary-foreground/30 rounded-sm hover:bg-primary-foreground/10 transition-colors"
                >
                  Sign In
                </Link>
              </div>
            ) : null}
          </div>

          {/* Stats strip for logged-in user */}
          {currentUser && profile && (
            <div className="mt-8 pt-6 border-t border-primary-foreground/10 grid grid-cols-3 gap-6 max-w-xs">
              {[
                {
                  label: 'Tips Placed',
                  value: profile.tipsPlaced,
                  icon: <TrendingUp size={12} />,
                },
                {
                  // `totalWon` is COINS, credited as `+= payout` by
                  // /api/tipping/resolve — not a count of races. Labelled "Races
                  // Won" it read as "Races Won: 6000" for one winning tip at
                  // 12/1. The landing page had this right; only this page didn't.
                  label: 'Coins Won',
                  value: profile.totalWon,
                  icon: <Trophy size={12} />,
                },
                {
                  label: 'Balance',
                  value: profile.coinBalance,
                  icon: <Coins size={12} />,
                },
              ].map((s) => (
                <div key={s.label}>
                  <div
                    className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {s.value.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-primary-foreground/50 mt-0.5 uppercase tracking-[0.08em]">
                    {s.icon}
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Race Venues Map — full width band */}
      {!loading && totalRaces > 0 && (
        <section className="bg-muted/30 border-b border-border/60">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
                Venues on the Card
              </h2>
              <div className="flex-1 h-px bg-border/60" />
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {totalRaces} {totalRaces === 1 ? 'meeting' : 'meetings'}
              </span>
            </div>
            <RaceMap races={races ?? []} />
          </div>
        </section>
      )}

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Race listings — left 2/3 */}
          <div className="lg:col-span-2 space-y-10">
            {loading ? (
              /* Skeleton phase */
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-7 w-40 animate-pulse rounded-sm bg-muted/60" />
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="space-y-4">
                  {[0, 1, 2].map((i) => (
                    <RaceSkeletonCard key={i} />
                  ))}
                </div>
              </section>
            ) : totalRaces === 0 ? (
              /* No races at all */
              <EmptyState
                icon={Coins}
                heading="The bookmakers are preparing the card."
                description="No races have been chalked up yet. Check back shortly — the field will be announced in due course."
                size="lg"
              />
            ) : (
              <AnimatePresence mode="wait">
                {/* Open races */}
                {openRaces.length > 0 && (
                  <section key="open">
                    <SectionHeader count={openRaces.length}>
                      Open for Tips
                    </SectionHeader>
                    <div className="space-y-4">
                      {openRaces.map((race, i) => (
                        <motion.div
                          key={race.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: i * 0.03,
                            duration: 0.18,
                            ease: 'easeOut',
                          }}
                        >
                          <RaceCard
                            race={race}
                            userTip={userTipsMap[race.id]}
                            onTipped={handleTipped}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Upcoming races */}
                {upcomingRaces.length > 0 && (
                  <section key="upcoming">
                    <SectionHeader count={upcomingRaces.length} countLabel="upcoming">
                      <Clock size={18} className="inline mr-2 opacity-60" />
                      Coming Soon
                    </SectionHeader>
                    <div className="space-y-4">
                      {upcomingRaces.map((race, i) => (
                        <motion.div
                          key={race.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: i * 0.03,
                            duration: 0.18,
                            ease: 'easeOut',
                          }}
                        >
                          <RaceCard
                            race={race}
                            userTip={userTipsMap[race.id]}
                            onTipped={handleTipped}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Resolved races */}
                {resolvedRaces.length > 0 && (
                  <section key="resolved">
                    <SectionHeader count={resolvedRaces.length} countLabel="settled">
                      Results
                    </SectionHeader>
                    <div className="space-y-4">
                      {resolvedRaces.map((race, i) => (
                        <motion.div
                          key={race.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: i * 0.03,
                            duration: 0.18,
                            ease: 'easeOut',
                          }}
                        >
                          <RaceCard
                            race={race}
                            userTip={userTipsMap[race.id]}
                            onTipped={handleTipped}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* All races are open but none tipped yet — nudge */}
                {!currentUser && totalRaces > 0 && (
                  <div
                    className="border border-dashed rounded-sm p-6 text-center"
                    style={{ borderColor: 'hsl(var(--brand-accent) / 0.4)' }}
                  >
                    <p
                      className="font-[family-name:var(--font-display)] text-sm italic mb-3"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      Back your selections to compete on the global leaderboard.
                    </p>
                    <Link
                      to="/login"
                      className="text-xs uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      Sign in to place tips
                    </Link>
                  </div>
                )}
              </AnimatePresence>
            )}
          </div>

          {/* Leaderboard — right 1/3 */}
          <aside className="space-y-6">
            <div className="sticky top-24">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={16} className="text-primary" />
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
                  Leaderboard
                </h2>
              </div>
              <div className="h-px bg-border/60 mb-5" />

              {loading ? (
                <div className="border border-border/50 rounded-sm overflow-hidden">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <LeaderboardSkeletonRow key={i} />
                  ))}
                </div>
              ) : (
                <LeaderboardTable currentUserId={currentUser?.id} />
              )}

              {/* My record */}
              {!loading && currentUser && profile && (
                <div className="mt-6 border border-border rounded-sm bg-card p-4">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
                    Your Record
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div
                        className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums"
                        style={{ color: 'hsl(var(--brand-accent))' }}
                      >
                        {profile.coinBalance.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
                        Balance
                      </div>
                    </div>
                    <div>
                      <div className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-foreground">
                        {profile.tipsPlaced}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
                        Tips
                      </div>
                    </div>
                    <div>
                      <div className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-foreground">
                        {profile.totalWon.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
                        Coins won
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Signed-out nudge for leaderboard */}
              {!loading && !currentUser && (
                <div
                  className={cn(
                    'mt-6 p-4 rounded-sm border',
                    'border-primary/20 bg-primary/5'
                  )}
                >
                  <p className="text-xs font-semibold text-foreground mb-1">
                    Your rank awaits.
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                    Sign in to start tipping and appear on the global leaderboard.
                  </p>
                  <Link
                    to="/signup"
                    className="text-[10px] uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    Create a free account
                  </Link>
                </div>
              )}

              <div className="mt-4 p-3 border border-border/40 rounded-sm bg-primary/5">
                <p className="text-[11px] text-muted-foreground italic leading-relaxed font-[family-name:var(--font-display)]">
                  All coins are virtual and carry no monetary value. This is a
                  game of knowledge, not chance.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}