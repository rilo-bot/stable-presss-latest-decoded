import { create } from 'zustand';
import type { Race, Tip, TipperProfile, RaceEntrant } from '@/types/tip';
import { apiUrl } from '@/lib/api';
import { toast } from 'sonner';

const STARTING_BALANCE = 500;

interface TippingState {
  races: Race[];
  tips: Tip[];
  profiles: TipperProfile[];
  loading: boolean;
  error: string | null;
  loaded: boolean;

  // Actions
  fetchRaces: () => Promise<void>;
  getOrCreateProfile: (userId: string, displayName: string) => TipperProfile;
  placeTip: (
    userId: string,
    displayName: string,
    raceId: string,
    entrant: RaceEntrant,
    wager: number
  ) => Promise<{ ok: boolean; error?: string }>;
  resolveRace: (raceId: string, winnerHorseId: string) => Promise<void>;
  simulateResolve: (raceId: string) => void;
}

export const useTippingStore = create<TippingState>()(
  (set, get) => ({
    races: [],
    tips: [],
    profiles: [],
    loading: false,
    error: null,
    loaded: false,

    fetchRaces: async () => {
      if (get().loading || get().loaded) return;
      set({ loading: true, error: null });
      try {
        const res = await fetch(apiUrl('/api/races'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const races = await res.json();
        set({ races, loading: false, loaded: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load races';
        set({ loading: false, error: message });
        toast.error(message);
      }
    },

    getOrCreateProfile: (userId, displayName) => {
      const existing = get().profiles.find((p) => p.userId === userId);
      if (existing) return existing;
      const newProfile: TipperProfile = {
        userId,
        displayName,
        coinBalance: STARTING_BALANCE,
        totalWon: 0,
        totalWagered: 0,
        tipsPlaced: 0,
      };
      set((state) => ({ profiles: [...state.profiles, newProfile] }));
      return newProfile;
    },

    placeTip: async (userId, displayName, raceId, entrant, wager) => {
      if (wager < 1) return { ok: false, error: 'Minimum wager is 1 coin.' };
      if (wager > 9999) return { ok: false, error: 'Maximum wager is 9,999 coins.' };

      const state = get();
      const race = state.races.find((r) => r.id === raceId);
      if (!race) return { ok: false, error: 'Race not found.' };
      if (race.status !== 'open') return { ok: false, error: 'This race is not open for tipping.' };

      const existing = state.tips.find(
        (t) => t.userId === userId && t.raceId === raceId
      );
      if (existing) return { ok: false, error: 'You have already placed a tip on this race.' };

      let profile = state.profiles.find((p) => p.userId === userId);
      const isNewProfile = !profile;
      if (!profile) {
        profile = {
          userId,
          displayName,
          coinBalance: STARTING_BALANCE,
          totalWon: 0,
          totalWagered: 0,
          tipsPlaced: 0,
        };
      }

      if (profile.coinBalance < wager) {
        return { ok: false, error: 'Insufficient coins in your balance.' };
      }

      const previousTips = get().tips;
      const previousProfiles = get().profiles;

      const updatedProfile: TipperProfile = {
        ...profile,
        coinBalance: profile.coinBalance - wager,
        totalWagered: profile.totalWagered + wager,
        tipsPlaced: profile.tipsPlaced + 1,
      };

      try {
        const res = await fetch(apiUrl('/api/tips'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            raceId,
            horseName: entrant.horseName,
            horseId: entrant.horseId,
            wager,
            odds: entrant.odds,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const newTip: Tip = await res.json();

        set((state) => ({
          tips: [...state.tips, newTip],
          profiles: isNewProfile
            ? [...state.profiles, updatedProfile]
            : state.profiles.map((p) => (p.userId === userId ? updatedProfile : p)),
        }));

        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to place tip';
        set({ tips: previousTips, profiles: previousProfiles, error: message });
        toast.error(message);
        return { ok: false, error: message };
      }
    },

    resolveRace: async (raceId, winnerHorseId) => {
      const state = get();
      const race = state.races.find((r) => r.id === raceId);
      if (!race || race.status === 'resolved') return;

      const previousRaces = state.races;
      const previousTips = state.tips;
      const previousProfiles = state.profiles;

      // Optimistically update
      const raceTips = state.tips.filter((t) => t.raceId === raceId);
      const updatedTipsMap = new Map<string, Tip>();
      raceTips.forEach((tip) => {
        const won = tip.horseId === winnerHorseId;
        const payout = won ? Math.floor(tip.wager * tip.odds) : 0;
        updatedTipsMap.set(tip.id, {
          ...tip,
          result: won ? 'won' : 'lost',
          payout,
        });
      });

      const profileCredits: Record<string, number> = {};
      updatedTipsMap.forEach((tip) => {
        if (tip.result === 'won' && tip.payout) {
          profileCredits[tip.userId] = (profileCredits[tip.userId] ?? 0) + tip.payout;
        }
      });

      set((state) => ({
        races: state.races.map((r) =>
          r.id === raceId ? { ...r, status: 'resolved' as const, winnerHorseId } : r
        ),
        tips: state.tips.map((t) => updatedTipsMap.get(t.id) ?? t),
        profiles: state.profiles.map((p) => {
          const credit = profileCredits[p.userId] ?? 0;
          if (credit <= 0) return p;
          return {
            ...p,
            coinBalance: p.coinBalance + credit,
            totalWon: p.totalWon + credit,
          };
        }),
      }));

      try {
        const res = await fetch(apiUrl(`/api/races/${raceId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winnerHorseId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updatedRace: Race = await res.json();
        set((state) => ({
          races: state.races.map((r) => (r.id === raceId ? updatedRace : r)),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to resolve race';
        set({ races: previousRaces, tips: previousTips, profiles: previousProfiles, error: message });
        toast.error(`Could not resolve race — rolling back changes`);
      }
    },

    simulateResolve: (raceId) => {
      const race = get().races.find((r) => r.id === raceId);
      if (!race || race.status !== 'open') return;
      const entrants = race.entrants;
      const weights = entrants.map((e) => 1 / e.odds);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let rand = Math.random() * totalWeight;
      let winner: RaceEntrant | null = null;
      for (let i = 0; i < entrants.length; i++) {
        rand -= weights[i];
        if (rand <= 0) {
          winner = entrants[i];
          break;
        }
      }
      if (!winner) winner = entrants[0];
      get().resolveRace(raceId, winner.horseId);
    },
  })
);