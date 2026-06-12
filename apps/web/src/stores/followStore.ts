import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Local "Follow" gamification store. No backend — follows persist in
 * localStorage. Follower counts are deterministic per horse id (a stable
 * pseudo-base) plus 1 when the current user follows, so the number reads as
 * real and never jumps around between renders.
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

/** Stable pseudo-random base follower count derived from the horse id (FNV-1a). */
export function baseFollowerCount(horseId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < horseId.length; i++) {
    h ^= horseId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 200 + ((h >>> 0) % 2800); // 200–2999
}

/** Total followers shown in the UI = stable base + 1 when the user follows. */
export function followerCount(horseId: string, following: boolean): number {
  return baseFollowerCount(horseId) + (following ? 1 : 0);
}
