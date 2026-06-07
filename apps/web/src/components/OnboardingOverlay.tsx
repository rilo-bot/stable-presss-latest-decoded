import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {X, ChevronRight, Check, Star, Newspaper, Users, Trophy, Mic, Share, ArrowRight, User, Briefcase, Shield, Plus, AlertTriangle} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useAuthStore } from '@/stores/authStore';
import { PartyForm } from '@/components/PartyForm';
import type { PartyRole } from '@/types/party';

/* ─────────────────────────────────────────────
   Feature overview data
───────────────────────────────────────────── */
const FEATURES = [
  {
    icon: Newspaper,
    title: 'Editorial Newsroom',
    description:
      'A full Kanban CMS — draft, review, approve, and schedule stories through every stage before they hit the front page.',
  },
  {
    icon: Share,
    title: 'Thoroughbred Profiles',
    description:
      'Comprehensive horse hubs with pedigree, connections, media, and race history all in one place.',
  },
  {
    icon: Users,
    title: 'Racing Parties',
    description:
      'A register of every owner, trainer, jockey, breeder, and industry connection linked to your horses.',
  },
  {
    icon: Trophy,
    title: 'Tipping Ring',
    description:
      'A gamified community tipping competition with virtual coins, live race cards, and a global leaderboard.',
  },
  {
    icon: Mic,
    title: 'Podcast Hub',
    description:
      'Manage episodes of The Gallop Podcast — upload, publish, and pair episodes with related articles.',
  },
  {
    icon: Star,
    title: 'Bulletins & Newsletters',
    description:
      'Design and dispatch templated bulletins to your subscriber list with the drag-and-drop builder.',
  },
];

/* ─────────────────────────────────────────────
   CRUD tasks
───────────────────────────────────────────── */
const CRUD_ROUTES: Record<string, string> = {
  horse: '/horses',
  article: '/newsroom',
  party: '/parties',
  race: '/newsroom',
};

const CRUD_ICONS: Record<string, React.ElementType> = {
  horse: Share,
  article: Newspaper,
  party: Users,
  race: Trophy,
};

/* ─────────────────────────────────────────────
   Party roles required in step 3
───────────────────────────────────────────── */
const REQUIRED_PARTY_ROLES: {
  role: PartyRole;
  label: string;
  icon: React.ElementType;
  description: string;
  hint: string;
}[] = [
  {
    role: 'owner',
    label: 'Owner',
    icon: Shield,
    description: 'The person or organisation that owns a horse.',
    hint: 'Select "Owner" in the Roles field of the form.',
  },
  {
    role: 'trainer',
    label: 'Trainer',
    icon: Briefcase,
    description: 'The licensed trainer responsible for conditioning the horse.',
    hint: 'Select "Trainer" in the Roles field of the form.',
  },
  {
    role: 'jockey',
    label: 'Jockey',
    icon: User,
    description: 'The rider who races the horse on the track.',
    hint: 'Select "Jockey" in the Roles field of the form.',
  },
];

/* ─────────────────────────────────────────────
   Step progress indicator
───────────────────────────────────────────── */
const STEPS = ['overview', 'cruds', 'parties', 'done'] as const;
type StepKey = (typeof STEPS)[number];

const STEP_LABELS: Record<StepKey, string> = {
  overview: 'Welcome',
  cruds: 'Explore',
  parties: 'Add Parties',
  done: 'Ready',
};

function StepProgress({ current }: { current: string }) {
  const currentIdx = STEPS.indexOf(current as StepKey);
  return (
    <div className="flex items-center gap-1.5" aria-label="Onboarding progress">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : active
                    ? 'bg-primary/20 text-primary border-2 border-primary'
                    : 'bg-muted text-muted-foreground border border-border'
                )}
              >
                {done ? <Check size={11} strokeWidth={3} /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-[9px] uppercase tracking-[0.08em] font-semibold hidden sm:block',
                  active ? 'text-primary' : done ? 'text-primary/70' : 'text-muted-foreground'
                )}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-px w-6 -mt-3 sm:-mt-3.5 transition-colors',
                  i < currentIdx ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Step 1 — Overview
───────────────────────────────────────────── */
function OverviewStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
            style={{ background: 'hsl(var(--brand-accent)/0.15)' }}
          >
            <Share size={28} style={{ color: 'hsl(var(--brand-accent))' }} />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-foreground mb-3">
            Welcome to Stable Press
          </h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
            The editorial platform for thoroughbred racing. Here is everything you can do — we will
            walk you through each section so nothing catches you by surprise.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.35, ease: 'easeOut' }}
                className="rounded-lg border border-border/60 bg-card p-5 flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Icon size={17} className="text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm text-foreground leading-tight">{f.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-6 sm:px-8 py-5 border-t border-border/60 flex items-center justify-between">
        <p className="text-xs text-muted-foreground hidden sm:block">Step 1 of 4 — Platform overview</p>
        <Button onClick={onNext} className="gap-2 ml-auto">
          Next: Explore the CRM
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Step 2 — CRUD tasks
───────────────────────────────────────────── */
interface CrudTask {
  id: string;
  label: string;
  description: string;
  completed: boolean;
}

function CrudsStep({
  tasks,
  onComplete,
  onNext,
  navigate,
}: {
  tasks: CrudTask[];
  onComplete: (id: string) => void;
  onNext: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const doneCount = tasks.filter((t) => t.completed).length;
  const allDone = doneCount === tasks.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
                Explore each section
              </h2>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                {doneCount}/{tasks.length} done
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Each area of Stable Press has its own workspace. Click any task below to visit that
              section and add at least one entry — this is the fastest way to learn the layout.
            </p>
            {/* Progress bar */}
            <div className="mt-4 h-1.5 rounded-full bg-border overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(doneCount / tasks.length) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {tasks.map((task, i) => {
              const Icon = CRUD_ICONS[task.id] ?? Star;
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={cn(
                    'rounded-lg border p-4 flex items-start gap-4 transition-all',
                    task.completed
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-card hover:border-primary/30'
                  )}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      'flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center transition-colors',
                      task.completed
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {task.completed ? (
                      <Check size={17} strokeWidth={2.5} />
                    ) : (
                      <Icon size={17} />
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        task.completed
                          ? 'text-primary line-through decoration-primary/40'
                          : 'text-foreground'
                      )}
                    >
                      {task.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {task.description}
                    </p>
                  </div>

                  {/* Action */}
                  {!task.completed && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0 gap-1.5 text-xs"
                      onClick={() => {
                        onComplete(task.id);
                        navigate(CRUD_ROUTES[task.id] ?? '/');
                      }}
                    >
                      Go there
                      <ArrowRight size={12} />
                    </Button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-6 sm:px-8 py-5 border-t border-border/60 flex items-center justify-between">
        <p className="text-xs text-muted-foreground hidden sm:block">
          {allDone
            ? 'All sections explored — ready for the next step.'
            : 'Complete at least one task, or skip ahead.'}
        </p>
        <Button onClick={onNext} className="gap-2 ml-auto">
          Next: Add Parties
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Step 3 — Party entries
───────────────────────────────────────────── */
function PartiesStep({
  partyEntriesAdded,
  onPartyAdded,
  onNext,
}: {
  partyEntriesAdded: string[];
  onPartyAdded: (role: string) => void;
  onNext: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<PartyRole | null>(null);

  const doneCount = REQUIRED_PARTY_ROLES.filter((r) =>
    partyEntriesAdded.includes(r.role)
  ).length;
  const allDone = doneCount === REQUIRED_PARTY_ROLES.length;

  const handleAddClick = (role: PartyRole) => {
    setActiveRole(role);
    setFormOpen(true);
  };

  const handleSaved = useCallback(() => {
    if (activeRole) {
      onPartyAdded(activeRole);
    }
    setFormOpen(false);
    setActiveRole(null);
  }, [activeRole, onPartyAdded]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-bold text-foreground">
                Add your first racing parties
              </h2>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full flex-shrink-0 ml-3">
                {doneCount}/3 added
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              Parties are the people and organisations in your racing ecosystem — owners, trainers,
              jockeys, breeders and more. Add one entry for each of the three core roles below to
              get started. Each can be linked to horse profiles later.
            </p>
            {/* Progress bar */}
            <div className="mt-4 h-1.5 rounded-full bg-border overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'hsl(var(--brand-accent))' }}
                initial={{ width: 0 }}
                animate={{ width: `${(doneCount / 3) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="space-y-4">
            {REQUIRED_PARTY_ROLES.map((item, i) => {
              const Icon = item.icon;
              const done = partyEntriesAdded.includes(item.role);
              return (
                <motion.div
                  key={item.role}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={cn(
                    'rounded-lg border-2 p-5 transition-all',
                    done ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors',
                        done
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {done ? <Check size={18} strokeWidth={2.5} /> : <Icon size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3
                          className={cn(
                            'text-sm font-bold',
                            done ? 'text-primary' : 'text-foreground'
                          )}
                        >
                          {item.label}
                        </h3>
                        {done && (
                          <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary bg-primary/15 px-2 py-0.5 rounded-full">
                            Added ✓
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        {item.description}
                      </p>
                      {!done && (
                        <div className="rounded-md bg-muted/60 border border-border/50 px-3 py-2 mb-3">
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <span className="text-primary font-semibold">Tip:</span>
                            {item.hint}
                          </p>
                        </div>
                      )}
                    </div>
                    {!done && (
                      <Button
                        size="sm"
                        className="flex-shrink-0 gap-1.5"
                        onClick={() => handleAddClick(item.role)}
                      >
                        <Plus size={13} />
                        Add {item.label}
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {allDone && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 rounded-lg bg-primary/8 border border-primary/30 px-5 py-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                <Check size={18} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary">All three parties added!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your owner, trainer, and jockey are ready to be linked to horse profiles.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-6 sm:px-8 py-5 border-t border-border/60 flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground hidden sm:block">
          {allDone
            ? 'All three added — finish setup to continue.'
            : 'Add all 3 parties to unlock the next step.'}
        </p>
        <Button onClick={onNext} disabled={!allDone} className="gap-2 ml-auto">
          {allDone ? 'Finish Setup' : `${doneCount}/3 — Keep Adding`}
          <ChevronRight size={15} />
        </Button>
      </div>

      {/* Party form — opened for the selected role */}
      <PartyForm
        open={formOpen}
        onOpenChange={(o) => {
          if (!o) {
            setFormOpen(false);
            setActiveRole(null);
          }
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Step 4 — Done
───────────────────────────────────────────── */
function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-20 h-20 rounded-full bg-primary flex items-center justify-center mb-6 shadow-lg"
        >
          <Check size={32} className="text-primary-foreground" strokeWidth={2.5} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold text-foreground mb-3">
            You are all set
          </h2>
          <div
            className="h-px w-16 mx-auto mb-5"
            style={{ background: 'hsl(var(--brand-accent))' }}
          />
          <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed mb-8">
            Welcome to the Stable Press newsroom. Your parties are registered and ready to link.
            Head to the Newsroom to start your first story, or explore horse profiles to build out
            your roster.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button onClick={onFinish} className="gap-2 px-8">
            Enter the Newsroom
            <ArrowRight size={15} />
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Skip Confirmation Dialog
───────────────────────────────────────────── */
function SkipConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-sm" aria-describedby="skip-confirm-desc">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'hsl(var(--brand-accent)/0.15)' }}
            >
              <AlertTriangle size={17} style={{ color: 'hsl(var(--brand-accent))' }} />
            </div>
            <DialogTitle className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
              Skip onboarding?
            </DialogTitle>
          </div>
        </DialogHeader>
        <p id="skip-confirm-desc" className="text-sm text-muted-foreground leading-relaxed">
          You can always add parties and explore the platform at your own pace, but skipping means
          you will not be guided through the setup steps. Are you sure you want to skip?
        </p>
        <DialogFooter className="flex gap-2 mt-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Keep going
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="flex-1">
            Yes, skip it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────
   Main export — mounts as a portal over the whole app
───────────────────────────────────────────── */
export function OnboardingOverlay() {
  // Atomic Zustand selectors — one per value, no allocating selectors
  const active = useOnboardingStore((s) => s.active);
  const step = useOnboardingStore((s) => s.step);
  const crudTasks = useOnboardingStore((s) => s.crudTasks);
  const partyEntriesAdded = useOnboardingStore((s) => s.partyEntriesAdded);
  const skipConfirmOpen = useOnboardingStore((s) => s.skipConfirmOpen);
  const goToStep = useOnboardingStore((s) => s.goToStep);
  const completeCrudTask = useOnboardingStore((s) => s.completeCrudTask);
  const recordPartyEntry = useOnboardingStore((s) => s.recordPartyEntry);
  const setSkipConfirmOpen = useOnboardingStore((s) => s.setSkipConfirmOpen);
  const confirmSkip = useOnboardingStore((s) => s.confirmSkip);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  const currentUser = useAuthStore((s) => s.currentUser);
  const navigate = useNavigate();

  const userId = currentUser?.id ?? '';

  const handleFinish = useCallback(() => {
    completeOnboarding(userId);
    navigate('/newsroom');
  }, [completeOnboarding, userId, navigate]);

  const handleSkipConfirm = useCallback(() => {
    confirmSkip(userId);
    navigate('/newsroom');
  }, [confirmSkip, userId, navigate]);

  if (!active) return null;

  return (
    <>
      <AnimatePresence>
        {active && (
          <motion.div
            key="onboarding-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-foreground/60 backdrop-blur-sm flex items-center justify-center p-4"
            aria-modal="true"
            role="dialog"
            aria-label="Onboarding tour"
          >
            <motion.div
              key="onboarding-panel"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="bg-background rounded-xl shadow-2xl border border-border/60 w-full max-w-4xl flex flex-col overflow-hidden"
              style={{ maxHeight: '90vh' }}
            >
              {/* ── Header bar ── */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 sm:px-8 py-4 border-b border-border/60 bg-card/50">
                <div className="flex items-center gap-3">
                  <div className="h-px w-5 bg-primary/40" />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold hidden sm:block">
                    Stable Press — Setup Guide
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <StepProgress current={step} />
                  <button
                    type="button"
                    aria-label="Skip onboarding"
                    onClick={() => setSkipConfirmOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1 ml-2"
                  >
                    Skip
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* ── Step content ── */}
              <div className="flex-1 overflow-hidden min-h-0">
                <AnimatePresence mode="wait">
                  {step === 'overview' && (
                    <motion.div
                      key="step-overview"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.22 }}
                      className="h-full flex flex-col"
                    >
                      <OverviewStep onNext={() => goToStep('cruds')} />
                    </motion.div>
                  )}

                  {step === 'cruds' && (
                    <motion.div
                      key="step-cruds"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.22 }}
                      className="h-full flex flex-col"
                    >
                      <CrudsStep
                        tasks={crudTasks}
                        onComplete={completeCrudTask}
                        onNext={() => goToStep('parties')}
                        navigate={navigate}
                      />
                    </motion.div>
                  )}

                  {step === 'parties' && (
                    <motion.div
                      key="step-parties"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.22 }}
                      className="h-full flex flex-col"
                    >
                      <PartiesStep
                        partyEntriesAdded={partyEntriesAdded}
                        onPartyAdded={recordPartyEntry}
                        onNext={() => goToStep('done')}
                      />
                    </motion.div>
                  )}

                  {step === 'done' && (
                    <motion.div
                      key="step-done"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.22 }}
                      className="h-full flex flex-col"
                    >
                      <DoneStep onFinish={handleFinish} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip confirmation dialog — rendered outside the backdrop so z-index stacks correctly */}
      <SkipConfirmDialog
        open={skipConfirmOpen}
        onCancel={() => setSkipConfirmOpen(false)}
        onConfirm={handleSkipConfirm}
      />
    </>
  );
}
