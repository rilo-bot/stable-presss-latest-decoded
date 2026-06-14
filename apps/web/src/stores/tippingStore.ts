import { create } from 'zustand';
import type { Race, Tip, TipperProfile, RaceEntrant } from '@/types/tip';
import { authFetch } from '@/lib/api';
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
  getOrCreateProfile: (userId: string, displayName: string) => Promise<TipperProfile>;
  placeTip: (
    userId: string,
    displayName: string,
    raceId: string,
    entrant: RaceEntrant,
    wager: number
  ) => Promise<{ ok: boolean; error?: string }>;
  resolveRace: (raceId: string) => Promise<void>;
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

    // Loads everything the tipping ring needs from the real backend: open races,
    // all placed tips, and the persisted tipper leaderboard.
    fetchRaces: async () => {
      if (get().loading || get().loaded) return;
      set({ loading: true, error: null });
      try {
        const [racesRes, tipsRes, profilesRes] = await Promise.all([
          authFetch('/api/races'),
          authFetch('/api/tips'),
          authFetch('/api/tipperProfiles'),
        ]);
        if (!racesRes.ok) throw new Error(`HTTP ${racesRes.status}`);
        const races = await racesRes.json();
        const tips = tipsRes.ok ? await tipsRes.json() : [];
        const profiles = profilesRes.ok ? await profilesRes.json() : [];
        set({ races, tips, profiles, loading: false, loaded: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load races';
        set({ loading: false, error: message });
        toast.error(message);
      }
    },

    // Returns the user's persisted profile, creating it on the backend if needed.
    getOrCreateProfile: async (userId, displayName) => {
      const existing = get().profiles.find((p) => p.userId === userId);
      if (existing?.id) return existing;
      try {
        const res = await authFetch('/api/tipperProfiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            displayName,
            coinBalance: STARTING_BALANCE,
            totalWon: 0,
            totalWagered: 0,
            tipsPlaced: 0,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const profile: TipperProfile = await res.json();
        set((s) => ({
          profiles: [...s.profiles.filter((p) => p.userId !== userId), profile],
        }));
        return profile;
      } catch {
        // Offline / unauthenticated fallback — local-only profile (no id).
        const fallback: TipperProfile = {
          userId, displayName, coinBalance: STARTING_BALANCE, totalWon: 0, totalWagered: 0, tipsPlaced: 0,
        };
        set((s) => ({ profiles: [...s.profiles.filter((p) => p.userId !== userId), fallback] }));
        return fallback;
      }
    },

    placeTip: async (userId, displayName, raceId, entrant, wager) => {
      if (wager < 1) return { ok: false, error: 'Minimum wager is 1 coin.' };
      if (wager > 9999) return { ok: false, error: 'Maximum wager is 9,999 coins.' };

      const state = get();
      const race = state.races.find((r) => r.id === raceId);
      if (!race) return { ok: false, error: 'Race not found.' };
      if (race.status !== 'open') return { ok: false, error: 'This race is not open for tipping.' };

      if (state.tips.find((t) => t.userId === userId && t.raceId === raceId)) {
        return { ok: false, error: 'You have already placed a tip on this race.' };
      }

      const profile = await get().getOrCreateProfile(userId, displayName);
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
        const res = await authFetch('/api/tips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            raceId,
            horseName: entrant.horseName,
            horseId: entrant.horseId,
            wager,
            odds: entrant.odds,
            payout: null,
            result: 'pending',
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const newTip: Tip = await res.json();

        // Persist the debited balance (best-effort — profile already exists).
        if (updatedProfile.id) {
          await authFetch(`/api/tipperProfiles/${updatedProfile.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              coinBalance: updatedProfile.coinBalance,
              totalWagered: updatedProfile.totalWagered,
              tipsPlaced: updatedProfile.tipsPlaced,
            }),
          });
        }

        set((s) => ({
          tips: [...s.tips, newTip],
          profiles: s.profiles.map((p) => (p.userId === userId ? updatedProfile : p)),
        }));
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to place tip';
        set({ tips: previousTips, profiles: previousProfiles, error: message });
        toast.error(message);
        return { ok: false, error: message };
      }
    },

    // Resolution is performed server-side: the winner is chosen authoritatively
    // and winning tippers' balances are credited on the backend. Clients never
    // write balances (see /api/tipperProfiles owner-only gate) — we just trigger
    // the resolve and refetch the authoritative state.
    resolveRace: async (raceId) => {
      const race = get().races.find((r) => r.id === raceId);
      if (!race || race.status === 'resolved') return;
      try {
        const res = await authFetch('/api/tipping/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raceId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Refetch authoritative state (bypasses the load-once guard in fetchRaces).
        const [racesRes, tipsRes, profilesRes] = await Promise.all([
          authFetch('/api/races'),
          authFetch('/api/tips'),
          authFetch('/api/tipperProfiles'),
        ]);
        const prev = get();
        const races = racesRes.ok ? await racesRes.json() : prev.races;
        const tips = tipsRes.ok ? await tipsRes.json() : prev.tips;
        const profiles = profilesRes.ok ? await profilesRes.json() : prev.profiles;
        set({ races, tips, profiles });
      } catch {
        toast.error('Could not resolve race — please try again');
      }
    },

    simulateResolve: (raceId) => {
      const race = get().races.find((r) => r.id === raceId);
      if (!race || race.status !== 'open') return;
      void get().resolveRace(raceId);
    },
  })
);
