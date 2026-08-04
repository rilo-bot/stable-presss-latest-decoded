import { create } from 'zustand';
import type { Race, Tip, TipperProfile, RaceEntrant } from '@/types/tip';
import { authFetch } from '@/lib/api';
import { toast } from 'sonner';

/**
 * Coins a new tipper starts with — for the OPTIMISTIC first render only.
 *
 * The authoritative grant is `STARTING_BALANCE` in
 * apps/server/src/routes/tipperProfiles.ts, which is what actually reaches the
 * database. This copy exists so a brand-new tipper's badge shows a number before
 * the POST returns, and for the offline fallback below. Keep the two in step.
 */
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

    // Loads everything the tipping ring needs: the races, THIS CALLER'S tips, and
    // the tipper leaderboard.
    //
    // `/api/tips` used to return every tip on the platform to anyone; it is now
    // scoped to the caller server-side, so an anonymous visitor gets `[]` here
    // instead of the whole collection. The landing page calls this for the
    // leaderboard and therefore makes a request it has no use for — a wasted
    // round trip now rather than a leak. Split when the landing page's 11
    // on-mount requests are dealt with.
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
        // Only the name is ours to send. The opening balance and the three
        // counters are the server's — it ignores them in the body now, so
        // sending them would only be a second, disagreeing copy of the number.
        const res = await authFetch('/api/tipperProfiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, displayName }),
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

      // Shown while the request is in flight. The SERVER performs the real debit
      // in the same handler that writes the tip — this is a prediction of it, and
      // it is replaced by the authoritative figures below.
      const predictedProfile: TipperProfile = {
        ...profile,
        coinBalance: profile.coinBalance - wager,
        totalWagered: profile.totalWagered + wager,
        tipsPlaced: profile.tipsPlaced + 1,
      };
      set((s) => ({
        profiles: s.profiles.map((p) => (p.userId === userId ? predictedProfile : p)),
      }));

      try {
        // Which race, which horse, how much. `userId` comes from the token,
        // `odds` from the entrant on the race, and `payout`/`result` are the
        // resolver's — the server ignores all four if sent. Sending `odds` used
        // to set the payout multiplier, since resolution pays `wager * tip.odds`.
        const res = await authFetch('/api/tips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raceId, horseId: entrant.horseId, wager }),
        });
        if (!res.ok) {
          // The server explains refusals in prose (race closed, already tipped,
          // insufficient coins). Show that rather than an HTTP status.
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? `HTTP ${res.status}`);
        }
        const newTip: Tip = await res.json();

        // Re-read the profile the server actually wrote, so the badge shows the
        // real balance rather than our prediction of it.
        const profilesRes = await authFetch('/api/tipperProfiles');
        const freshProfiles: TipperProfile[] = profilesRes.ok ? await profilesRes.json() : [];

        set((s) => ({
          tips: [...s.tips, newTip],
          profiles: freshProfiles.length ? freshProfiles : s.profiles,
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
