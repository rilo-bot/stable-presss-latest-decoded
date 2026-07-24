import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Local "Follow" store — a personal, per-browser bookmark list ("your stable").
 * Follows persist in localStorage; there is NO follow backend, so we do NOT
 * display a public follower count. Showing a fabricated tally would misrepresent
 * real engagement. If a real followers feature is added later, expose the count
 * from the backend and render that instead. Until then the UI shows only the
 * Follow / Following toggle with no number.
 */

interface FollowState {
  followedHorseIds: string[];
  toggleFollow: (horseId: string) => void;
  isFollowing: (horseId: string) => boolean;
}

export const useFollowStore = create<FollowState>()(
  persist(
    (set, get) => ({
      followedHorseIds: [],
      toggleFollow: (horseId) =>
        set((s) => ({
          followedHorseIds: s.followedHorseIds.includes(horseId)
            ? s.followedHorseIds.filter((id) => id !== horseId)
            : [...s.followedHorseIds, horseId],
        })),
      isFollowing: (horseId) => get().followedHorseIds.includes(horseId),
    }),
    { name: 'stablepress-follows' }
  )
);
