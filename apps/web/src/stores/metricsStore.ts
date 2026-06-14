import { create } from 'zustand';
import { authFetch } from '@/lib/api';

export interface SiteMetrics {
  activeMembers: number;
  articlesPublished: number;
  tipsPlaced: number;
  leaderboardLeaders: number;
}

interface MetricsState {
  metrics: SiteMetrics | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchMetrics: () => Promise<void>;
}

export const useMetricsStore = create<MetricsState>()((set, get) => ({
  metrics: null,
  loading: false,
  loaded: false,
  error: null,

  fetchMetrics: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetch('/api/metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const metrics: SiteMetrics = await res.json();
      set({ metrics, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load metrics';
      // Silent on the landing page — metrics are non-critical chrome.
      set({ loading: false, error: message });
    }
  },
}));
