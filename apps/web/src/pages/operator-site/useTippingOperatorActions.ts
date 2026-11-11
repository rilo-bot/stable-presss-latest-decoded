// ---------------------------------------------------------------------------
// The Stable Hand — the TIPPING RING (/tipping): virtual-coin tipping.
//
//   tipping.read         races (open / upcoming / settled) with their fields and
//                        your tip on each, plus your coin balance.
//   tipping.leaderboard  the leaderboard the page shows (top 20 by balance).
//   tipping.placeTip     CONFIRMS first (it stakes coins), then works the race
//                        card like a person: Show field → pick the runner →
//                        type the coins → Place Tip. RaceCard calls the same
//                        tippingStore.placeTip → POST /api/tips; the server
//                        debits the balance and enforces one tip per race.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { useTippingStore } from '@/stores/tippingStore';
import { useAuthStore } from '@/stores/authStore';
import type { Race, RaceEntrant } from '@/types/tip';
import { anchor, firstError, resolveOne, sleep, typeField, waitUntil, watchToasts } from './siteUtils';

export const raceIds = (raceId: string) => ({
  card: `site.race-${raceId}`,
  field: `site.race-${raceId}-field`,
  runner: (horseId: string) => `site.race-${raceId}-runner-${horseId}`,
  wager: `site.race-${raceId}-wager`,
  place: `site.race-${raceId}-place`,
});

function me() {
  const u = useAuthStore.getState().currentUser;
  const s = useTippingStore.getState();
  return { user: u, profile: u ? s.profiles.find((p) => p.userId === u.id) : undefined };
}

function myTip(raceId: string) {
  const { user } = me();
  return user ? useTippingStore.getState().tips.find((t) => t.userId === user.id && t.raceId === raceId) : undefined;
}

const raceRow = (r: Race) => {
  const tip = myTip(r.id);
  return {
    id: r.id,
    name: r.name,
    venue: r.venue,
    distance: r.distance,
    when: r.scheduledAt,
    status: r.status,
    field: r.entrants.map((e) => ({ horse: e.horseName, barrier: e.barrierNumber, jockey: e.jockey, odds: e.odds })),
    winner: r.winnerHorseId ? r.entrants.find((e) => e.horseId === r.winnerHorseId)?.horseName ?? null : null,
    myTip: tip ? { horse: tip.horseName, coins: tip.wager, result: tip.result, payout: tip.payout } : null,
  };
};

function resolveRace(q: string): Race {
  const races = useTippingStore.getState().races ?? [];
  return resolveOne(q, races, (r) => [r.id, r.name, `${r.name} ${r.venue}`], 'race', (r) => `${r.name} at ${r.venue} (${r.status})`);
}

function resolveRunner(race: Race, q: string): RaceEntrant {
  const byBarrier = /^\d+$/.test(q.trim()) ? race.entrants.find((e) => e.barrierNumber === Number(q.trim())) : undefined;
  return byBarrier ?? resolveOne(q, race.entrants, (e) => [e.horseId, e.horseName], `runner in ${race.name}`, (e) => `${e.barrierNumber}. ${e.horseName}`);
}

const tipArgs = z.object({
  race: z.string().min(1).max(160),
  horse: z.string().min(1).max(120),
  coins: z.number().int().min(1).max(9999),
});
type TipArgs = z.infer<typeof tipArgs>;

export function useTippingOperatorActions(): void {
  useAgentAction({
    name: 'tipping.read',
    description: 'Read the Tipping Ring: races and their fields, your tip on each, your coin balance.',
    args: z.object({}),
    run: async () => {
      const s = useTippingStore.getState();
      const { user, profile } = me();
      return {
        signedIn: !!user,
        me: profile ? { balance: profile.coinBalance, tipsPlaced: profile.tipsPlaced, coinsWon: profile.totalWon, wagered: profile.totalWagered } : null,
        races: (s.races ?? []).map(raceRow),
        note: 'Coins are virtual — no real money.',
      };
    },
  });

  useAgentAction({
    name: 'tipping.leaderboard',
    description: 'Show the leaderboard (top 20 tippers by coin balance).',
    args: z.object({}),
    run: async (_a, ui) => {
      if (anchor('site.leaderboard')) await ui.point('site.leaderboard', 'Leaderboard');
      const { user } = me();
      const ranked = [...useTippingStore.getState().profiles].sort((a, b) => b.coinBalance - a.coinBalance).slice(0, 20);
      return {
        leaders: ranked.map((p, i) => ({
          rank: i + 1,
          name: p.displayName,
          balance: p.coinBalance,
          wagered: p.totalWagered,
          tips: p.tipsPlaced,
          ...(user && p.userId === user.id ? { you: true } : {}),
        })),
      };
    },
  });

  useAgentAction<TipArgs>({
    name: 'tipping.placeTip',
    description: 'Back a runner in an open race with virtual coins (asks to confirm).',
    args: tipArgs,
    confirm: (a) => {
      let label = `${a.horse} in ${a.race}`;
      try {
        const r = resolveRace(a.race);
        label = `${resolveRunner(r, a.horse).horseName} in ${r.name}`;
      } catch {
        /* run() reports the bad name */
      }
      const bal = me().profile?.coinBalance;
      return `Back ${label} with ${a.coins} coins?${bal != null ? ` This stakes ${a.coins} of your ${bal} virtual coins.` : ''} One tip per race — it can't be changed.`;
    },
    run: async (a, ui) => {
      const { user, profile } = me();
      if (!user) throw new Error('Sign in to place tips.');
      const race = resolveRace(a.race);
      if (race.status !== 'open') throw new Error(`${race.name} is ${race.status}, not open for tips.`);
      const entrant = resolveRunner(race, a.horse);
      const existing = myTip(race.id);
      if (existing) throw new Error(`You already backed ${existing.horseName} in ${race.name} (${existing.wager} coins).`);
      if (profile && profile.coinBalance < a.coins) throw new Error(`Not enough coins: balance ${profile.coinBalance}.`);

      const ids = raceIds(race.id);
      ui.step(`Backing ${entrant.horseName} in ${race.name}`);
      if (anchor(ids.field)?.getAttribute('aria-expanded') !== 'true') {
        await ui.click(ids.field, 'Show field');
        await waitUntil(() => !!anchor(ids.runner(entrant.horseId)), { timeoutMs: 2000, signal: ui.signal });
      }
      await ui.click(ids.runner(entrant.horseId), entrant.horseName);
      await ui.waitFor(ids.wager, 3000);
      await typeField(ui, ids.wager, String(a.coins));
      await sleep(120, ui.signal);
      const toasts = watchToasts();
      await ui.click(ids.place, 'Place Tip');
      const settled = await waitUntil(() => !!myTip(race.id) || !!firstError(toasts.collect()), { timeoutMs: 15_000, signal: ui.signal });
      await sleep(250, ui.signal);
      const err = firstError(toasts.collect());
      const tip = myTip(race.id);
      if (!tip) throw new Error(err ?? (settled ? 'The tip was not recorded.' : 'The tip is taking too long — check the race card.'));
      if (anchor(ids.card)) ui.flash(ids.card);
      const after = me().profile;
      return {
        ok: true,
        race: race.name,
        horse: tip.horseName,
        coins: tip.wager,
        odds: tip.odds,
        potentialReturn: Math.floor(tip.wager * tip.odds),
        balance: after?.coinBalance ?? null,
      };
    },
  });
}
