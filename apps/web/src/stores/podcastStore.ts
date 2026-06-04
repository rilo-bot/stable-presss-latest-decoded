import { create } from 'zustand';
import { toast } from 'sonner';
import { apiUrl } from '@/lib/api';
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
  addGuest: (episodeId: string, guest: Omit<EpisodeGuest, 'id'>) => void;
  removeGuest: (episodeId: string, guestId: string) => void;
  setDistributionChannels: (episodeId: string, channels: DistributionChannel[]) => void;
  setSchedule: (episodeId: string, isoDate: string) => void;
  addReviewNote: (episodeId: string, note: string) => void;
  deleteEpisode: (id: string) => Promise<void>;
}

export const usePodcastStore = create<PodcastState>()(
  (set, get) => ({
    episodes: [],
    activeEpisodeId: null,
    loading: false,
    loaded: false,
    error: null,

    fetchPodcastEpisodes: async () => {
      if (get().loading || get().loaded) return;
      set({ loading: true, error: null });
      try {
        const res = await fetch(apiUrl('/api/podcastEpisodes'));
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
        const res = await fetch(apiUrl('/api/podcastEpisodes'), {
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

    updateEpisode: async (id, data) => {
      const previous = get().episodes;
      set((s) => ({
        episodes: s.episodes.map((ep) => (ep.id === id ? { ...ep, ...data } : ep)),
      }));
      try {
        const res = await fetch(apiUrl(`/api/podcastEpisodes/${id}`), {
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
        const res = await fetch(apiUrl(`/api/podcastEpisodes/${id}`), {
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

    addGuest: (episodeId, guest) => {
      set((s) => ({
        episodes: s.episodes.map((ep) =>
          ep.id === episodeId ? { ...ep, guests: [...(ep.guests ?? []), guest as EpisodeGuest] } : ep
        ),
      }));
    },

    removeGuest: (episodeId, guestId) => {
      set((s) => ({
        episodes: s.episodes.map((ep) =>
          ep.id === episodeId
            ? { ...ep, guests: (ep.guests ?? []).filter((g) => g.id !== guestId) }
            : ep
        ),
      }));
    },

    setDistributionChannels: (episodeId, channels) => {
      set((s) => ({
        episodes: s.episodes.map((ep) =>
          ep.id === episodeId ? { ...ep, distributionChannels: channels } : ep
        ),
      }));
    },

    setSchedule: (episodeId, isoDate) => {
      set((s) => ({
        episodes: s.episodes.map((ep) =>
          ep.id === episodeId ? { ...ep, scheduledFor: isoDate } : ep
        ),
      }));
    },

    addReviewNote: (episodeId, note) => {
      set((s) => ({
        episodes: s.episodes.map((ep) =>
          ep.id === episodeId ? { ...ep, reviewNotes: note } : ep
        ),
      }));
    },

    deleteEpisode: async (id) => {
      const previous = get().episodes;
      const { activeEpisodeId } = get();
      set((s) => ({ episodes: s.episodes.filter((ep) => ep.id !== id) }));
      if (activeEpisodeId === id) set({ activeEpisodeId: null });
      try {
        const res = await fetch(apiUrl(`/api/podcastEpisodes/${id}`), { method: 'DELETE' });
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