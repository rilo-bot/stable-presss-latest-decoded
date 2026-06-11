import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, Check, Star, Newspaper, Users, Trophy, Mic,
  Share, ArrowRight, User, Briefcase, Shield, Plus, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useAuthStore } from '@/stores/authStore';
import { useArticleStore } from '@/stores/articleStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { PartyForm } from '@/components/PartyForm';
import { toast } from 'sonner';
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
   CRUD task icons
───────────────────────────────────────────── */
const CRUD_ICONS: Record<string, React.ElementType> = {
  horse: Share,
  article: Newspaper,
  party: Users,
  race: Trophy,
};

/* ─────────────────────────────────────────────
   Party roles required in step 2
───────────────────────────────────────────── */
const REQUIRED_PARTY_ROLES: {
  role: PartyRole;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    role: 'owner',
    label: 'Owner',
    icon: Shield,
    description: 'The person or organisation that owns a horse.',
  },
  {
    role: 'trainer',
    label: 'Trainer',
    icon: Briefcase,
    description: 'The licensed trainer responsible for conditioning the horse.',
  },
  {
    role: 'jockey',
    label: 'Jockey',
    icon: User,
    description: 'The rider who races the horse on the track.',
  },
];

/* ─────────────────────────────────────────────
   Step progress indicator
───────────────────────────────────────────── */
const STEPS = ['overview', 'parties', 'cruds', 'done'] as const;
type StepKey = (typeof STEPS)[number];

const STEP_LABELS: Record<StepKey, string> = {
  overview: 'Welcome',
  parties: 'Parties',
  cruds: 'Explore',
  done: 'Ready',
};

function StepProgress({ current }: { current: string }) {
  const currentIdx = STEPS.indexOf(current as StepKey);
  return (
    <div className="flex items-center gap-1 sm:gap-1.5" aria-label="Onboarding progress">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex items-center gap-1 sm:gap-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  'w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold transition-all',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : active
                    ? 'bg-primary/20 text-primary border-2 border-primary'
                    : 'bg-muted text-muted-foreground border border-border'
                )}
              >
                {done ? <Check size={10} strokeWidth={3} /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-[8px] sm:text-[9px] uppercase tracking-[0.08em] font-semibold hidden sm:block',
                  active ? 'text-primary' : done ? 'text-primary/70' : 'text-muted-foreground'
                )}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-px w-4 sm:w-6 -mt-0 sm:-mt-3.5 transition-colors',
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
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-5 sm:py-8">
        <div className="text-center mb-6 sm:mb-10">
          <div
            className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full mb-4 sm:mb-5"
            style={{ background: 'hsl(var(--brand-accent)/0.15)' }}
          >
            <Share size={22} style={{ color: 'hsl(var(--brand-accent))' }} />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-2 sm:mb-3">
            Welcome to Stable Press
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
            The editorial platform for thoroughbred racing. Here is everything you can do — we will
            walk you through each section so nothing catches you by surprise.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.35, ease: 'easeOut' }}
                className="rounded-lg border border-border/60 bg-card p-3 sm:p-5 flex flex-col gap-2 sm:gap-3"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Icon size={15} className="text-primary" />
                  </div>
                  <h3 className="font-semibold text-xs sm:text-sm text-foreground leading-tight">{f.title}</h3>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="flex-shrink-0 px-4 sm:px-6 md:px-8 py-3 sm:py-5 border-t border-border/60 flex items-center justify-between">
        <p className="text-xs text-muted-foreground hidden sm:block">Step 1 of 4 — Platform overview</p>
        <Button onClick={onNext} size="sm" className="gap-2 ml-auto sm:size-default">
          Next: Add Parties
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Step 2 — Party entries
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
    setTimeout(() => setActiveRole(null), 300);
  }, [activeRole, onPartyAdded]);

  const handleFormOpenChange = useCallback((o: boolean) => {
    if (!o) {
      setFormOpen(false);
      setTimeout(() => setActiveRole(null), 300);
    }
  }, []);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-5 sm:py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-5 sm:mb-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-[family-name:var(--font-display)] text-lg sm:text-xl md:text-2xl font-bold text-foreground leading-tight">
                Add your first racing parties
              </h2>
              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full flex-shrink-0 ml-2">
                {doneCount}/3 added
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1.5 sm:mt-2">
              Parties are the people and organisations in your racing ecosystem — owners, trainers,
              jockeys, breeders and more. Add one entry for each of the three core roles below to
              get started.
            </p>
            <div className="mt-3 sm:mt-4 h-1.5 rounded-full bg-border overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'hsl(var(--brand-accent))' }}
                initial={{ width: 0 }}
                animate={{ width: `${(doneCount / 3) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
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
                    'rounded-lg border-2 p-3 sm:p-5 transition-all',
                    done ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                  )}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div
                      className={cn(
                        'flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors',
                        done
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {done ? <Check size={16} strokeWidth={2.5} /> : <Icon size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                        <h3
                          className={cn(
                            'text-sm font-bold',
                            done ? 'text-primary' : 'text-foreground'
                          )}
                        >
                          {item.label}
                        </h3>
                        {done && (
                          <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">
                            Added ✓
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                    {!done && (
                      <Button
                        size="sm"
                        className="flex-shrink-0 gap-1 sm:gap-1.5 text-xs px-2 sm:px-3"
                        onClick={() => handleAddClick(item.role)}
                      >
                        <Plus size={12} />
                        <span className="hidden xs:inline">Add </span>{item.label}
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
              className="mt-4 sm:mt-6 rounded-lg bg-primary/8 border border-primary/30 px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                <Check size={16} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary">All three parties added!</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                  Your owner, trainer, and jockey are ready to be linked to horse profiles.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 px-4 sm:px-6 md:px-8 py-3 sm:py-5 border-t border-border/60 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground hidden sm:block">
          {allDone
            ? 'All three added — ready to explore the rest.'
            : 'Add all 3 parties to unlock the next step.'}
        </p>
        <Button onClick={onNext} disabled={!allDone} size="sm" className="gap-2 ml-auto sm:size-default">
          {allDone ? 'Next: Explore' : `${doneCount}/3 — Keep Adding`}
          <ChevronRight size={14} />
        </Button>
      </div>

      {activeRole !== null && (
        <PartyForm
          open={formOpen}
          onOpenChange={handleFormOpenChange}
          defaultRole={activeRole}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Inline forms for Step 3
   These render their own fixed backdrop + panel within the onboarding's
   stacking context so they always appear above the overlay panel.
─────────────────────────────────────────────────────────────────────── */

/* ── Horse (quick create) ── */
const SEX_OPTIONS = ['Colt', 'Filly', 'Mare', 'Stallion', 'Gelding', 'Rig'];
const COLOUR_OPTIONS = ['Bay', 'Dark Bay / Brown', 'Chestnut', 'Grey', 'Roan', 'Black', 'Brown', 'Palomino'];
const COUNTRY_OPTIONS = ['Australia', 'New Zealand', 'Ireland', 'United Kingdom', 'France', 'United States', 'Japan', 'Hong Kong'];

function InlineHorseForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const addHorse = useHorseStore((s) => s.addHorse);
  const allParties = usePartyStore((s) => s.parties);

  const ownerOptions = allParties.filter((p) => p.roles.includes('owner'));
  const trainerOptions = allParties.filter((p) => p.roles.includes('trainer'));

  const [name, setName] = useState('');
  const [isUnnamed, setIsUnnamed] = useState(false);
  const [sex, setSex] = useState('');
  const [colour, setColour] = useState('');
  const [country, setCountry] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUnnamed && !name.trim()) {
      toast.error('Horse name is required, or tick "Un-Named".');
      return;
    }
    if (!ownerId) {
      toast.error('Select at least one owner. Add owners in Parties first.');
      return;
    }
    if (!trainerId) {
      toast.error('Select at least one trainer. Add trainers in Parties first.');
      return;
    }
    setSaving(true);
    try {
      await addHorse({
        name: isUnnamed ? '' : name.trim(),
        isUnnamed,
        sex,
        colour,
        country,
        dob: '',
        ownerIds: [ownerId],
        trainerIds: [trainerId],
        jockeyIds: [],
        breederIds: [],
        bloodstockAgentIds: [],
        syndicateManagerIds: [],
        personnelIds: [],
        owner: '',
        ownerSince: '',
        breeder: '',
        trainer: '',
        trainerSince: '',
        jockey: '',
        syndicateManager: '',
        bloodstockAgent: '',
        horseBreaker: '',
        associatedPersonnel: '',
        careerRecord: '',
        lastTenForm: '',
        seasonRecord: '',
        pedigreeNotes: '',
        pullQuote: '',
        imageUrl: '',
        sire: '',
        sireSire: '',
        sireDam: '',
        dam: '',
        damSire: '',
        damDam: '',
      });
      toast.success(`${isUnnamed ? 'Un-Named' : name.trim()} has been added to the stables.`);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        className="relative w-full sm:max-w-lg bg-card border border-border/60 rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100% - 2rem)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Add horse profile"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/40 bg-primary/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
              <Share size={14} className="text-primary" />
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
                Add Thoroughbred Profile
              </p>
              <p className="text-[10px] text-muted-foreground">Core details — expand the full profile later</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="ib-horse-name" className="text-xs font-semibold">
                  Horse Name <span className="text-destructive">*</span>
                </Label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={isUnnamed} onChange={(e) => setIsUnnamed(e.target.checked)} className="w-3.5 h-3.5 accent-primary rounded" id="ib-horse-unnamed" />
                  <span className="text-[10px] text-muted-foreground font-medium">Un-Named</span>
                </label>
              </div>
              <Input id="ib-horse-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sovereign Streak" className="text-sm" disabled={isUnnamed} autoFocus />
            </div>

            {/* Sex + Colour */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ib-horse-sex" className="text-xs font-semibold">Sex</Label>
                <select id="ib-horse-sex" value={sex} onChange={(e) => setSex(e.target.value)} className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select…</option>
                  {SEX_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ib-horse-colour" className="text-xs font-semibold">Colour</Label>
                <select id="ib-horse-colour" value={colour} onChange={(e) => setColour(e.target.value)} className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select…</option>
                  {COLOUR_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Country */}
            <div className="space-y-1.5">
              <Label htmlFor="ib-horse-country" className="text-xs font-semibold">Country of Birth</Label>
              <select id="ib-horse-country" value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">Select…</option>
                {COUNTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {/* Owner */}
            <div className="space-y-1.5">
              <Label htmlFor="ib-horse-owner" className="text-xs font-semibold">
                Owner <span className="text-destructive">*</span>
              </Label>
              {ownerOptions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No owners yet — add one in the Parties step first.</p>
              ) : (
                <select id="ib-horse-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select owner…</option>
                  {ownerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            {/* Trainer */}
            <div className="space-y-1.5">
              <Label htmlFor="ib-horse-trainer" className="text-xs font-semibold">
                Trainer <span className="text-destructive">*</span>
              </Label>
              {trainerOptions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No trainers yet — add one in the Parties step first.</p>
              ) : (
                <select id="ib-horse-trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select trainer…</option>
                  {trainerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            <div className="rounded-md bg-primary/5 border border-primary/15 px-3 py-2.5 flex items-start gap-2.5">
              <Share size={12} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                A full profile — pedigree, race record, media, all connections — can be filled out
                from <strong className="text-foreground">Horse Profiles</strong> after setup.
              </p>
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-border/40 px-5 py-4 bg-card flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="outline" className="text-xs" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? (
                <><span className="inline-block w-3 h-3 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />Saving…</>
              ) : 'Add to Stables'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Article (quick create) ── */
function InlineArticleForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const addArticle = useArticleStore((s) => s.addArticle);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [author, setAuthor] = useState(currentUser?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('A headline is required before going to press.'); return; }
    if (!author.trim()) { toast.error('Every story needs a byline. Please add an author.'); return; }
    setSaving(true);
    try {
      await addArticle({
        title: title.trim(),
        summary: summary.trim(),
        author: author.trim(),
        status: 'draft',
        linkedHorseIds: [],
        publishedAt: null,
      });
      toast.success('Story filed — it sits in your draft queue.');
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-lg bg-card border border-border/60 rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100% - 2rem)' }}
        role="dialog"
        aria-modal="true"
        aria-label="File a new story"
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/40 bg-primary/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
              <Newspaper size={14} className="text-primary" />
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">File a New Story</p>
              <p className="text-[10px] text-muted-foreground">Draft your first editorial piece</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ib-article-title" className="text-xs font-semibold">
                Headline <span className="text-destructive">*</span>
              </Label>
              <Input id="ib-article-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The headline that stops readers in their tracks" className="font-[family-name:var(--font-display)] text-sm" autoFocus />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ib-article-summary" className="text-xs font-semibold">Summary / Lead Paragraph</Label>
              <Textarea id="ib-article-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="The opening paragraph — the paragraph that earns the read." rows={4} className="resize-none leading-relaxed text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ib-article-author" className="text-xs font-semibold">
                Byline / Author <span className="text-destructive">*</span>
              </Label>
              <Input id="ib-article-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Correspondent name" className="text-sm" />
            </div>

            <div className="rounded-md bg-primary/5 border border-primary/15 px-3 py-2.5 flex items-start gap-2.5">
              <Newspaper size={12} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Saved as a <strong className="text-foreground">Draft</strong>. Add category, workflow stage, and linked horses in the Newsroom.
              </p>
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-border/40 px-5 py-4 bg-card flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="outline" className="text-xs" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <><span className="inline-block w-3 h-3 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />Filing…</> : 'Save Draft'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Racing Entry (quick create) ── */
function InlineRaceForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const addEntry = useRacingEntryStore((s) => s.addEntry);
  const allParties = usePartyStore((s) => s.parties);
  const allHorses = useHorseStore((s) => s.horses);

  const jockeys = allParties.filter((p) => p.roles.includes('jockey'));
  const trainers = allParties.filter((p) => p.roles.includes('trainer'));

  const [horseId, setHorseId] = useState('');
  const [subject, setSubject] = useState('');
  const [raceName, setRaceName] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [venue, setVenue] = useState('');
  const [jockeyId, setJockeyId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!horseId) { toast.error('Please select a horse for this race entry.'); return; }
    if (!subject.trim()) { toast.error('Subject is required.'); return; }
    if (!raceName.trim()) { toast.error('Race name is required.'); return; }
    if (!raceDate) { toast.error('Race date is required.'); return; }
    if (!venue.trim()) { toast.error('Venue is required.'); return; }
    setSaving(true);
    try {
      await addEntry({
        horse_id: horseId,
        subject: subject.trim(),
        race_name: raceName.trim(),
        race_date: raceDate,
        venue: venue.trim(),
        status: 'Entered',
        jockey_id: jockeyId || undefined,
        trainer_id: trainerId || undefined,
      });
      toast.success('Racing record saved.');
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-lg bg-card border border-border/60 rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100% - 2rem)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Log a race entry"
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/40 bg-primary/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
              <Trophy size={14} className="text-primary" />
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">Log a Race Entry</p>
              <p className="text-[10px] text-muted-foreground">Record a race performance</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {/* Horse */}
            <div className="space-y-1.5">
              <Label htmlFor="ib-race-horse" className="text-xs font-semibold">
                Horse <span className="text-destructive">*</span>
              </Label>
              {allHorses.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No horses yet — add one first using the horse task above.</p>
              ) : (
                <select id="ib-race-horse" value={horseId} onChange={(e) => setHorseId(e.target.value)} className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select horse…</option>
                  {allHorses.map((h) => <option key={h.id} value={h.id}>{h.isUnnamed ? 'Un-Named' : h.name}</option>)}
                </select>
              )}
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="ib-race-subject" className="text-xs font-semibold">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Input id="ib-race-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief description of this race entry" className="text-sm" />
            </div>

            {/* Race Name + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ib-race-name" className="text-xs font-semibold">
                  Race Name <span className="text-destructive">*</span>
                </Label>
                <Input id="ib-race-name" value={raceName} onChange={(e) => setRaceName(e.target.value)} placeholder="Cox Plate…" className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ib-race-date" className="text-xs font-semibold">
                  Race Date <span className="text-destructive">*</span>
                </Label>
                <Input id="ib-race-date" type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} className="text-sm" />
              </div>
            </div>

            {/* Venue */}
            <div className="space-y-1.5">
              <Label htmlFor="ib-race-venue" className="text-xs font-semibold">
                Venue <span className="text-destructive">*</span>
              </Label>
              <Input id="ib-race-venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Flemington, Royal Randwick…" className="text-sm" />
            </div>

            {/* Jockey + Trainer */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ib-race-jockey" className="text-xs font-semibold">Jockey</Label>
                <select id="ib-race-jockey" value={jockeyId} onChange={(e) => setJockeyId(e.target.value)} className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select…</option>
                  {jockeys.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ib-race-trainer" className="text-xs font-semibold">Trainer</Label>
                <select id="ib-race-trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Select…</option>
                  {trainers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-md bg-primary/5 border border-primary/15 px-3 py-2.5 flex items-start gap-2.5">
              <Trophy size={12} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Full race details — distance, result, prize money, and form — can be added in the Racing Data section.
              </p>
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-border/40 px-5 py-4 bg-card flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="outline" className="text-xs" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <><span className="inline-block w-3 h-3 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />Saving…</> : 'Save Race Entry'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Step 3 — CRUD tasks
───────────────────────────────────────────── */
interface CrudTask {
  id: string;
  label: string;
  description: string;
  completed: boolean;
}

type ActiveForm = 'horse' | 'article' | 'party' | 'race' | null;

function CrudsStep({
  tasks,
  onComplete,
  onNext,
}: {
  tasks: CrudTask[];
  onComplete: (id: string) => void;
  onNext: () => void;
}) {
  const doneCount = tasks.filter((t) => t.completed).length;
  const allDone = doneCount === tasks.length;

  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [partyFormOpen, setPartyFormOpen] = useState(false);

  const handleGo = (taskId: string) => {
    setActiveForm(taskId as ActiveForm);
    if (taskId === 'party') setPartyFormOpen(true);
  };

  const handleFormDone = useCallback((taskId: string) => {
    onComplete(taskId);
    setActiveForm(null);
    setPartyFormOpen(false);
  }, [onComplete]);

  const handleFormCancel = useCallback(() => {
    setActiveForm(null);
    setPartyFormOpen(false);
  }, []);

  return (
    /* position:relative so inline form overlays (absolute inset-0) attach to this container */
    <div className="flex flex-col min-h-0 flex-1 relative">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-5 sm:py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-5 sm:mb-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-[family-name:var(--font-display)] text-lg sm:text-2xl font-bold text-foreground">
                Explore each section
              </h2>
              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full flex-shrink-0 ml-2">
                {doneCount}/{tasks.length} done
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1.5 sm:mt-2">
              Click <strong className="text-foreground">Go</strong> on any task below to open
              the entry form right here — no navigation needed. Fill in the details and the task
              ticks off automatically.
            </p>
            {/* Progress bar */}
            <div className="mt-3 sm:mt-4 h-1.5 rounded-full bg-border overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(doneCount / tasks.length) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {tasks.map((task, i) => {
              const Icon = CRUD_ICONS[task.id] ?? Star;
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={cn(
                    'rounded-lg border p-3 sm:p-4 flex items-start gap-3 sm:gap-4 transition-all',
                    task.completed
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-card hover:border-primary/30'
                  )}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      'flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-md flex items-center justify-center transition-colors',
                      task.completed
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {task.completed ? <Check size={15} strokeWidth={2.5} /> : <Icon size={15} />}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs sm:text-sm font-semibold', task.completed ? 'text-primary line-through decoration-primary/40' : 'text-foreground')}>
                      {task.label}
                    </p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {task.description}
                    </p>
                  </div>

                  {/* Action */}
                  {!task.completed && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0 gap-1 sm:gap-1.5 text-xs px-2 sm:px-3"
                      onClick={() => handleGo(task.id)}
                    >
                      Go
                      <ArrowRight size={11} />
                    </Button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex-shrink-0 px-4 sm:px-6 md:px-8 py-3 sm:py-5 border-t border-border/60 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground hidden sm:block">
          {allDone ? 'All sections explored — almost done!' : 'Complete at least one task, or skip ahead.'}
        </p>
        <Button onClick={onNext} size="sm" className="gap-2 ml-auto sm:size-default">
          Finish Setup
          <ChevronRight size={14} />
        </Button>
      </div>

      {/* ── Inline form overlays — absolute inset-0 within this relative container ── */}
      <AnimatePresence>
        {activeForm === 'horse' && (
          <motion.div key="form-horse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10">
            <InlineHorseForm onDone={() => handleFormDone('horse')} onCancel={handleFormCancel} />
          </motion.div>
        )}
        {activeForm === 'article' && (
          <motion.div key="form-article" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10">
            <InlineArticleForm onDone={() => handleFormDone('article')} onCancel={handleFormCancel} />
          </motion.div>
        )}
        {activeForm === 'race' && (
          <motion.div key="form-race" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10">
            <InlineRaceForm onDone={() => handleFormDone('race')} onCancel={handleFormCancel} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Party form uses shadcn Dialog which portals itself — renders above everything */}
      {activeForm === 'party' && (
        <PartyForm
          open={partyFormOpen}
          onOpenChange={(o) => { if (!o) handleFormCancel(); }}
          onSaved={() => handleFormDone('party')}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Step 4 — Done
───────────────────────────────────────────── */
function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 sm:px-8 py-8 sm:py-12 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary flex items-center justify-center mb-5 sm:mb-6 shadow-lg"
        >
          <Check size={26} className="text-primary-foreground" strokeWidth={2.5} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-foreground mb-3">
            You are all set
          </h2>
          <div className="h-px w-16 mx-auto mb-4 sm:mb-5" style={{ background: 'hsl(var(--brand-accent))' }} />
          <p className="text-muted-foreground text-xs sm:text-sm max-w-md mx-auto leading-relaxed mb-6 sm:mb-8">
            Welcome to the Stable Press newsroom. Your parties are registered and ready to link.
            Head to the Newsroom to start your first story, or explore horse profiles to build out
            your roster.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Button onClick={onFinish} className="gap-2 px-6 sm:px-8">
            Enter the Newsroom
            <ArrowRight size={15} />
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Skip Confirmation
───────────────────────────────────────────── */
function SkipConfirmModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="skip-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-[200] bg-foreground/50" onClick={onCancel} />
          <motion.div
            key="skip-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-title"
            aria-describedby="skip-desc"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-[201] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-sm bg-background rounded-xl shadow-2xl border border-border p-5 sm:p-6"
          >
            <div className="flex items-center gap-3 mb-3 sm:mb-4">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'hsl(var(--brand-accent)/0.15)' }}>
                <AlertTriangle size={16} style={{ color: 'hsl(var(--brand-accent))' }} />
              </div>
              <h2 id="skip-title" className="font-[family-name:var(--font-display)] text-base sm:text-lg font-bold text-foreground">
                Skip onboarding?
              </h2>
            </div>
            <p id="skip-desc" className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4 sm:mb-6">
              You can always add parties and explore the platform at your own pace, but skipping
              means you will not be guided through the setup steps. Are you sure?
            </p>
            <div className="flex gap-2 sm:gap-3">
              <Button variant="outline" onClick={onCancel} className="flex-1" autoFocus>Keep going</Button>
              <Button variant="destructive" onClick={onConfirm} className="flex-1">Yes, skip it</Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────
   Main export
───────────────────────────────────────────── */
export function OnboardingOverlay() {
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
            className="fixed inset-0 z-[100] bg-foreground/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
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
              className="bg-background rounded-xl shadow-2xl border border-border/60 w-full max-w-4xl flex flex-col my-auto"
              style={{ maxHeight: 'calc(100dvh - 1rem)', minHeight: 0 }}
            >
              {/* ── Header bar ── */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 sm:py-4 border-b border-border/60 bg-card/50 rounded-t-xl">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-px w-4 sm:w-5 bg-primary/40" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold hidden sm:block">
                    Stable Press — Setup Guide
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold sm:hidden">
                    Setup Guide
                  </span>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                  <StepProgress current={step} />
                  <button
                    type="button"
                    aria-label="Skip onboarding"
                    onClick={() => setSkipConfirmOpen(true)}
                    className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1.5 sm:px-2 py-1"
                  >
                    Skip
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* ── Step content ── */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <AnimatePresence mode="wait">
                  {step === 'overview' && (
                    <motion.div key="step-overview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }} className="flex-1 flex flex-col min-h-0">
                      <OverviewStep onNext={() => goToStep('parties')} />
                    </motion.div>
                  )}

                  {step === 'parties' && (
                    <motion.div key="step-parties" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }} className="flex-1 flex flex-col min-h-0">
                      <PartiesStep
                        partyEntriesAdded={partyEntriesAdded}
                        onPartyAdded={recordPartyEntry}
                        onNext={() => goToStep('cruds')}
                      />
                    </motion.div>
                  )}

                  {step === 'cruds' && (
                    <motion.div key="step-cruds" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }} className="flex-1 flex flex-col min-h-0">
                      <CrudsStep
                        tasks={crudTasks}
                        onComplete={completeCrudTask}
                        onNext={() => goToStep('done')}
                      />
                    </motion.div>
                  )}

                  {step === 'done' && (
                    <motion.div key="step-done" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }} className="flex-1 flex flex-col min-h-0">
                      <DoneStep onFinish={handleFinish} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SkipConfirmModal
        open={skipConfirmOpen}
        onCancel={() => setSkipConfirmOpen(false)}
        onConfirm={handleSkipConfirm}
      />
    </>
  );
}
