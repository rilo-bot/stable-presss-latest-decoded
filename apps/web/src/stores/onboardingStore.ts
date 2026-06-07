import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OnboardingStepId =
  | 'overview'
  | 'cruds'
  | 'parties'
  | 'done';

export interface OnboardingCrudTask {
  id: string;
  label: string;
  description: string;
  completed: boolean;
}

interface OnboardingState {
  /** Whether to show the onboarding overlay */
  active: boolean;
  /** Current step */
  step: OnboardingStepId;
  /** Per-user key so each account tracks its own state */
  completedByUser: Record<string, boolean>;
  /** Tracks which CRUD tasks have been completed */
  crudTasks: OnboardingCrudTask[];
  /** Tracks how many party entries have been added (owner, trainer, jockey) */
  partyEntriesAdded: string[]; // stores role names added e.g. ['owner', 'trainer']
  /** Whether the skip confirmation dialog is open */
  skipConfirmOpen: boolean;

  /** Called after successful signup to start onboarding */
  startOnboarding: (userId: string) => void;
  /** Navigate to a step */
  goToStep: (step: OnboardingStepId) => void;
  /** Mark a CRUD task as done */
  completeCrudTask: (taskId: string) => void;
  /** Record a party role entry during onboarding */
  recordPartyEntry: (role: string) => void;
  /** Open/close the skip confirmation */
  setSkipConfirmOpen: (open: boolean) => void;
  /** Confirm skip — dismiss onboarding for this user */
  confirmSkip: (userId: string) => void;
  /** Mark onboarding as complete */
  completeOnboarding: (userId: string) => void;
}

const DEFAULT_CRUD_TASKS: OnboardingCrudTask[] = [
  {
    id: 'horse',
    label: 'Add a horse profile',
    description: 'Register a thoroughbred with their basic details, pedigree, and connections.',
    completed: false,
  },
  {
    id: 'article',
    label: 'Create an article',
    description: 'Draft your first editorial piece in the Newsroom.',
    completed: false,
  },
  {
    id: 'party',
    label: 'Add a racing party',
    description: 'Register an owner, trainer, jockey, or other industry member.',
    completed: false,
  },
  {
    id: 'race',
    label: 'Log a race entry',
    description: 'Record a horse\'s race performance — track, placing, prize money.',
    completed: false,
  },
];

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      active: false,
      step: 'overview',
      completedByUser: {},
      crudTasks: DEFAULT_CRUD_TASKS,
      partyEntriesAdded: [],
      skipConfirmOpen: false,

      startOnboarding: (userId) => {
        const already = get().completedByUser[userId];
        if (already) return;
        set({
          active: true,
          step: 'overview',
          crudTasks: DEFAULT_CRUD_TASKS,
          partyEntriesAdded: [],
          skipConfirmOpen: false,
        });
      },

      goToStep: (step) => set({ step }),

      completeCrudTask: (taskId) => {
        set((state) => ({
          crudTasks: state.crudTasks.map((t) =>
            t.id === taskId ? { ...t, completed: true } : t
          ),
        }));
      },

      recordPartyEntry: (role) => {
        set((state) => {
          if (state.partyEntriesAdded.includes(role)) return state;
          return { partyEntriesAdded: [...state.partyEntriesAdded, role] };
        });
      },

      setSkipConfirmOpen: (open) => set({ skipConfirmOpen: open }),

      confirmSkip: (userId) => {
        set((state) => ({
          active: false,
          skipConfirmOpen: false,
          completedByUser: { ...state.completedByUser, [userId]: true },
        }));
      },

      completeOnboarding: (userId) => {
        set((state) => ({
          active: false,
          step: 'overview',
          skipConfirmOpen: false,
          completedByUser: { ...state.completedByUser, [userId]: true },
        }));
      },
    }),
    { name: 'stablepress-onboarding' }
  )
);
