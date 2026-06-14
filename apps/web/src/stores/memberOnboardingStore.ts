import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Member onboarding — tracks whether an individual has dismissed the one-time
 * "welcome" strip shown atop their profile hub (PartyStudio). Per-user so each
 * account is greeted once; persisted to localStorage. Separate from the staff
 * CMS tour (onboardingStore).
 */
interface MemberOnboardingState {
  dismissedByUser: Record<string, boolean>;
  dismiss: (userId: string) => void;
}

export const useMemberOnboardingStore = create<MemberOnboardingState>()(
  persist(
    (set) => ({
      dismissedByUser: {},
      dismiss: (userId) =>
        set((s) => ({ dismissedByUser: { ...s.dismissedByUser, [userId]: true } })),
    }),
    { name: 'stablepress-member-onboarding' },
  ),
);
