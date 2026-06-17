import { create } from 'zustand';
import { toast } from 'sonner';
import { authFetch } from '@/lib/api';
import type { PodcastEpisode, EpisodeStatus, EpisodeGuest, DistributionChannel } from '@/types/podcast';

interface PodcastState {
  episodes: PodcastEpisode[];
  activeEpisodeId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;

  // Fetch
  fetchPodcastEpisodes: () => Promise<void>;

  // Playback
  setActiveEpisode: (id: string | null) => void;

  // Workflow
  createEpisode: (data: Omit<PodcastEpisode, 'id' | 'createdAt' | 'status' | 'guests' | 'distributionChannels'>) => Promise<string | undefined>;
  updateEpisode: (id: string, data: Partial<PodcastEpisode>) => Promise<void>;
  advanceStatus: (id: string, nextStatus: EpisodeStatus) => Promise<void>;
  addGuest: (episodeId: string, guest: Omit<EpisodeGuest, 'id'>) => Promise<void>;
  removeGuest: (episodeId: string, guestId: string) => Promise<void>;
  setDistributionChannels: (episodeId: string, channels: DistributionChannel[]) => Promise<void>;
  addReviewNote: (episodeId: string, note: string) => Promise<void>;
  deleteEpisode: (id: string) => Promise<void>;
}

function guestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePodcastStore = create<PodcastState>()(
  (set, get) => ({
    episodes: [],
    activeEpisodeId: null,
    loading: false,
    loaded: false,
    error: null,

    fetchPodcastEpisodes: async () => {
      // Refresh in the background on each visit so cross-session changes show up.
      // We don't clear `episodes` first, so the current list stays visible (no
      // empty flash) until the new data lands. Guard only against overlapping
      // in-flight fetches.
      if (get().loading) return;
      set({ loading: true, error: null });
      try {
        const res = await authFetch('/api/podcastEpisodes');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const episodes = await res.json();
        set({ episodes, loading: false, loaded: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load episodes';
        set({ loading: false, error: message });
        toast.error(message);
      }
    },

    setActiveEpisode: (id) => set({ activeEpisodeId: id }),

    createEpisode: async (data) => {
      try {
        const res = await authFetch('/api/podcastEpisodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            createdAt: new Date().toISOString(),
            status: 'draft',
            guests: [],
            distributionChannels: [],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const episode: PodcastEpisode = await res.json();
        set((s) => ({ episodes: [episode, ...s.episodes] }));
        return episode.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create episode';
        set({ error: message });
        toast.error(message);
        return undefined;
      }
    },

    // Optimistic PUT — also the single persistence path for every field edit
    // below (guests, channels, schedule, notes all route through here).
    updateEpisode: async (id, data) => {
      const previous = get().episodes;
      set((s) => ({
        episodes: s.episodes.map((ep) => (ep.id === id ? { ...ep, ...data } : ep)),
      }));
      try {
        const res = await authFetch(`/api/podcastEpisodes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated: PodcastEpisode = await res.json();
        set((s) => ({
          episodes: s.episodes.map((ep) => (ep.id === id ? updated : ep)),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update episode';
        set({ episodes: previous, error: message });
        toast.error(message);
      }
    },

    advanceStatus: async (id, nextStatus) => {
      const previous = get().episodes;
      set((s) => ({
        episodes: s.episodes.map((ep) => (ep.id === id ? { ...ep, status: nextStatus } : ep)),
      }));
      try {
        const res = await authFetch(`/api/podcastEpisodes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated: PodcastEpisode = await res.json();
        set((s) => ({
          episodes: s.episodes.map((ep) => (ep.id === id ? updated : ep)),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to advance episode status';
        set({ episodes: previous, error: message });
        toast.error(message);
      }
    },

    addGuest: async (episodeId, guest) => {
      const ep = get().episodes.find((e) => e.id === episodeId);
      if (!ep) return;
      const newGuest: EpisodeGuest = { ...guest, id: guestId() };
      await get().updateEpisode(episodeId, { guests: [...(ep.guests ?? []), newGuest] });
    },

    removeGuest: async (episodeId, targetId) => {
      const ep = get().episodes.find((e) => e.id === episodeId);
      if (!ep) return;
      await get().updateEpisode(episodeId, {
        guests: (ep.guests ?? []).filter((g) => g.id !== targetId),
      });
    },

    setDistributionChannels: async (episodeId, channels) => {
      await get().updateEpisode(episodeId, { distributionChannels: channels });
    },

    addReviewNote: async (episodeId, note) => {
      await get().updateEpisode(episodeId, { reviewNotes: note });
    },

    deleteEpisode: async (id) => {
      const previous = get().episodes;
      const { activeEpisodeId } = get();
      set((s) => ({ episodes: s.episodes.filter((ep) => ep.id !== id) }));
      if (activeEpisodeId === id) set({ activeEpisodeId: null });
      try {
        const res = await authFetch(`/api/podcastEpisodes/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete episode';
        set({ episodes: previous, error: message });
        if (activeEpisodeId === id) set({ activeEpisodeId });
        toast.error(`Could not delete the episode — restoring it`);
      }
    },
  })
);
