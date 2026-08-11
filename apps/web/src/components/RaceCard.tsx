import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useTippingStore } from '@/stores/tippingStore';
import { useAuthStore } from '@/stores/authStore';
import type { Race, RaceEntrant, Tip } from '@/types/tip';
import { MapPin, Clock, Trophy, Coins } from 'lucide-react';

interface RaceCardProps {
  race: Race;
  userTip: Tip | undefined;
  onTipped: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  upcoming: { label: 'Upcoming', classes: 'bg-muted text-muted-foreground' },
  open: { label: 'Open for Tips', classes: 'bg-primary/15 text-primary' },
  closed: { label: 'Closed', classes: 'bg-muted text-muted-foreground' },
  resolved: { label: 'Resolved', classes: 'bg-[hsl(var(--brand-accent))]/15 text-[hsl(var(--brand-accent))]' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatOdds(odds: number) {
  // Convert decimal to fractional-style display
  const frac = odds - 1;
  if (frac === Math.floor(frac)) return `${frac}/1`;
  return `${odds.toFixed(1)}`;
}

export function RaceCard({ race, userTip, onTipped }: RaceCardProps) {
  const [selectedEntrant, setSelectedEntrant] = useState<RaceEntrant | null>(null);
  const [wager, setWager] = useState<string>('50');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const currentUser = useAuthStore((s) => s.currentUser);
  const placeTip = useTippingStore((s) => s.placeTip);
  const getOrCreateProfile = useTippingStore((s) => s.getOrCreateProfile);
  const simulateResolve = useTippingStore((s) => s.simulateResolve);
  const profiles = useTippingStore((s) => s.profiles);

  const profile = useMemo(
    () => profiles.find((p) => p.userId === currentUser?.id),
    [profiles, currentUser?.id]
  );

  const statusCfg = STATUS_CONFIG[race.status] ?? STATUS_CONFIG.upcoming;
  const winner = race.winnerHorseId
    ? race.entrants.find((e) => e.horseId === race.winnerHorseId)
    : null;

  const handlePlaceTip = async () => {
    if (!currentUser) {
      toast.error('You must be signed in to place a tip.');
      return;
    }
    if (!selectedEntrant) {
      toast.error('Please select a horse to back.');
      return;
    }
    const wagerNum = parseInt(wager, 10);
    if (isNaN(wagerNum) || wagerNum < 1) {
      toast.error('Please enter a valid wager of at least 1 coin.');
      return;
    }

    setIsSubmitting(true);
    // Ensure profile exists before placing
    await getOrCreateProfile(currentUser.id, currentUser.name);

    const result = await placeTip(
      currentUser.id,
      currentUser.name,
      race.id,
      selectedEntrant,
      wagerNum
    );

    setIsSubmitting(false);

    if (!result.ok) {
      toast.error(result.error ?? 'Unable to place your tip.');
    } else {
      toast.success(
        `Backed ${selectedEntrant.horseName} with ${wagerNum} coins. May fortune favour the bold.`
      );
      onTipped();
    }
  };

  const handleSimulate = () => {
    simulateResolve(race.id);
    toast.success('The race has been run. Results are in.');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="border border-border bg-card rounded-sm overflow-hidden"
    >
      {/* Race header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={cn(
                  'text-[10px] uppercase tracking-[0.08em] font-medium px-2 py-0.5 rounded-sm',
                  statusCfg.classes
                )}
              >
                {statusCfg.label}
              </span>
              {userTip && (
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-[0.08em] font-medium px-2 py-0.5 rounded-sm',
                    userTip.result === 'won'
                      ? 'bg-[hsl(var(--brand-accent))]/20 text-[hsl(var(--brand-accent))]'
                      : userTip.result === 'lost'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {userTip.result === 'won'
                    ? `Won ${userTip.payout} coins`
                    : userTip.result === 'lost'
                    ? 'Tip Lost'
                    : `Backed: ${userTip.horseName}`}
                </span>
              )}
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground leading-snug">
              {race.name}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin size={13} />
                {race.venue}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={13} />
                {formatDate(race.scheduledAt)}
              </span>
              <span className="font-medium text-foreground/70">{race.distance}</span>
            </div>
          </div>

          {/* Simulate button for open races (demo feature) */}
          {race.status === 'open' && currentUser && (
            <button
              onClick={handleSimulate}
              className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-sm transition-colors"
              title="Simulate race result"
            >
              Run Race
            </button>
          )}
        </div>

        {/* Winner announcement */}
        {race.status === 'resolved' && winner && (
          <div
            className="mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-sm"
            style={{ background: 'hsl(var(--brand-accent) / 0.1)' }}
          >
            <Trophy size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
            <span className="font-medium text-foreground">
              Winner:{' '}
              <span
                className="font-[family-name:var(--font-display)] font-bold"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                {winner.horseName}
              </span>{' '}
              (No. {winner.barrierNumber}) — {formatOdds(winner.odds)}
            </span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border/60 mx-5" />

      {/* Entrants toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <span className="uppercase tracking-[0.08em] text-[11px] font-medium">
          {race.entrants.length} Runners
        </span>
        <span className="text-xs">{expanded ? '▲ Hide' : '▼ Show field'}</span>
      </button>

      {/* Entrants table */}
      {expanded && (
        <div className="px-5 pb-5">
          <div className="space-y-1">
            {race.entrants.map((entrant) => {
              const isSelected = selectedEntrant?.horseId === entrant.horseId;
              const isWinner = race.winnerHorseId === entrant.horseId;
              return (
                <motion.button
                  key={entrant.horseId}
                  onClick={() => {
                    if (race.status === 'open' && !userTip) {
                      setSelectedEntrant(isSelected ? null : entrant);
                    }
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-sm text-left transition-colors',
                    race.status === 'open' && !userTip
                      ? 'cursor-pointer hover:bg-primary/5'
                      : 'cursor-default',
                    isSelected && 'bg-primary/10 border border-primary/30',
                    isWinner && 'border border-[hsl(var(--brand-accent))/30]',
                    !isSelected && !isWinner && 'border border-transparent'
                  )}
                  style={isWinner ? { background: 'hsl(var(--brand-accent) / 0.08)' } : undefined}
                  whileHover={race.status === 'open' && !userTip ? { x: 2 } : {}}
                  transition={{ duration: 0.12 }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-[family-name:var(--font-display)] font-bold w-5 text-center tabular-nums"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      {entrant.barrierNumber}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {entrant.horseName}
                      </div>
                      <div className="text-xs text-muted-foreground">{entrant.jockey}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-base font-[family-name:var(--font-display)] font-bold tabular-nums"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      {formatOdds(entrant.odds)}
                    </div>
                    {isSelected && (
                      <div className="text-[10px] text-primary uppercase tracking-[0.08em]">Selected</div>
                    )}
                    {isWinner && (
                      <div
                        className="text-[10px] uppercase tracking-[0.08em]"
                        style={{ color: 'hsl(var(--brand-accent))' }}
                      >
                        Winner
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Tip form — only for open races without existing tip */}
          {race.status === 'open' && !userTip && currentUser && selectedEntrant && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-sm"
            >
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground mb-3">
                Backing{' '}
                <span className="font-[family-name:var(--font-display)] font-bold text-foreground">
                  {selectedEntrant.horseName}
                </span>{' '}
                at {formatOdds(selectedEntrant.odds)}
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Coins
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={profile?.coinBalance ?? 500}
                    value={wager}
                    onChange={(e) => setWager(e.target.value)}
                    className="pl-8 text-sm"
                    placeholder="Coins to wager"
                    aria-label="Wager amount in coins"
                  />
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  Returns{' '}
                  <span
                    className="font-[family-name:var(--font-display)] font-bold"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {isNaN(parseInt(wager)) ? '—' : Math.floor(parseInt(wager) * selectedEntrant.odds)}
                  </span>
                </div>
              </div>
              {profile && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Balance:{' '}
                  <span
                    className="font-[family-name:var(--font-display)] font-bold"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {profile.coinBalance}
                  </span>{' '}
                  coins
                </p>
              )}
              <Button
                size="sm"
                onClick={handlePlaceTip}
                disabled={isSubmitting}
                className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSubmitting ? 'Placing…' : 'Place Tip'}
              </Button>
            </motion.div>
          )}

          {race.status === 'open' && !userTip && !currentUser && (
            <p className="mt-3 text-center text-sm text-muted-foreground italic font-[family-name:var(--font-display)]">
              Sign in to place your selection on this race.
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
