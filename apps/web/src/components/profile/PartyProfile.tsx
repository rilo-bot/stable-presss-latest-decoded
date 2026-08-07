/**
 * PartyProfile — the single container behind BOTH the public party page
 * (`/parties/:id`, mode="view") and the member's editable studio (`/studio/:id`,
 * mode="edit"). It resolves the party + profile scope, builds the field
 * descriptors (wired to updateParty in edit mode), and composes the dumb
 * ProfileScaffold + building blocks. One layout, two modes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Check, Plus, Loader2, Users, Camera, ClipboardList, Warehouse, Coins, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { usePartyStore } from '@/stores/partyStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { useRegister, useLoadRegister } from '@/lib/register';
import { useHorseStore } from '@/stores/horseStore';

import { useMemberOnboardingStore } from '@/stores/memberOnboardingStore';
import { canManagePerson } from '@/rbac/can';
import { horsesForPerson } from '@/rbac/scope';
import { useProfileScope } from '@/hooks/useProfileScope';
import { ROLE_BINDINGS, PROFILE_ROLES, resolveActiveRole } from '@/lib/profile/roleMap';
import {
  PARTY_ROLE_LABELS, PERSONNEL_SUBTYPES, PERSONNEL_SUBTYPE_LABELS, getStartedYearLabel,
} from '@/types/party';
import type { PersonnelSubtype, Person } from '@/types/party';
import type { RegisterPerson } from '@/lib/register';
import type { Horse } from '@/types/horse';
import { COUNTRY_OPTIONS } from '@/components/horse-form/constants';
import { loadSkippedSteps, persistSkippedSteps, loadGuideDismissed, persistGuideDismissed } from '@/lib/profile/onboardingSkips';
import { serifStyle, goldStyle, fmtMoney, fmtDate, OrnateCrest, RacingSummaryBar, SectionPanel, DataCategoryCard, type RacingStat } from '@/components/profile/kit';
import { ProfileScaffold, type Crumb } from '@/components/profile/ProfileScaffold';
import { IdentityCard, type FieldDescriptor } from '@/components/profile/IdentityCard';
import { PortraitFrame } from '@/components/profile/PortraitFrame';
import { SummaryGrid } from '@/components/profile/SummaryGrid';
import { EntityList, type EntityRow } from '@/components/profile/EntityList';
import { ConnectionsRail, type RelTile } from '@/components/profile/ConnectionsRail';
import { OwnerDataRail } from '@/components/profile/OwnerDataRail';
import { DataSectionsRail } from '@/components/profile/DataSectionsRail';
import { REL_ORDER, renderProfileModule, activeModuleLabel } from '@/components/profile/modules';
import { OnboardingSteps, type OnbStep } from '@/components/profile/OnboardingSteps';
import { OnboardingGuide, type GuideStep } from '@/components/profile/OnboardingGuide';
import { OnboardingComplete } from '@/components/profile/OnboardingComplete';
import { OnboardingFocus } from '@/components/profile/OnboardingFocus';
import { ProfileAgentPanel, StudioLauncher } from '@/agent/profile/ProfileAgentPanel';
import { useProfileAgentUi, type ProfileContext } from '@/stores/profileAgentUiStore';
import { DossierMeter } from '@/components/DossierMeter';
import { AskAgentButton } from '@/components/AskAgentButton';
import { HorseForm, type ConnectFields } from '@/components/HorseForm';
import { ensureConnection } from '@/lib/horseConnections';
import { AddHorseChoice } from '@/components/AddHorseChoice';

type Mode = 'view' | 'edit';

/** Snapshot the person's editable fields for the AI assistant. */
function buildPartyContext(party: RegisterPerson, horseCount: number): ProfileContext {
  const f: Record<string, string> = {
    name: party.name ?? '', profession: party.profession ?? '', baseLocation: party.baseLocation ?? '',
    dateOfBirth: party.dateOfBirth ?? '', countryOfBirth: party.countryOfBirth ?? '',
    startedYear: party.startedYear != null ? String(party.startedYear) : '',
  };
  const emptyFields = Object.entries(f).filter(([, v]) => !v.trim()).map(([k]) => k);
  return { entityKind: 'party', entityId: party.id, name: party.name || 'Your profile', fields: f, emptyFields, roleBoxes: [{ role: 'horses', count: horseCount }] };
}

/** Whole-years age from a YYYY-MM-DD string, or null. */
function calcAge(dob?: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

const CURRENT_YEAR = new Date().getFullYear();

/* Milestone icons for the onboarding strip (match the gamified horse strip). */
const STEP_ICONS: Record<string, React.ReactNode> = {
  photo: <Camera size={14} strokeWidth={1.8} />,
  details: <ClipboardList size={14} strokeWidth={1.8} />,
  horses: <Warehouse size={14} strokeWidth={1.8} />,
};

interface PartyProfileProps {
  partyId: string;
  mode: Mode;
  /** Back affordance for edit mode (e.g. → /dashboard). */
  onBack?: () => void;
}

export function PartyProfile({ partyId, mode, onBack }: PartyProfileProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((s) => s.currentUser);

  // The page is PERSON-central: who they are comes from `people`, and the roles
  // and horses they are attached to come from their party edges. `useRegister`
  // is the join, so this screen reads one object rather than stitching two.
  const register = useRegister();
  useLoadRegister();
  const parties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const addParty = usePartyStore((s) => s.addParty);
  const updatePerson = usePeopleStore((s) => s.updatePerson);
  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const addHorse = useHorseStore((s) => s.addHorse);
  const partiesLoaded = usePartyStore((s) => s.loaded);
  const horsesLoaded = useHorseStore((s) => s.loaded);
  const dismissedWelcome = useMemberOnboardingStore((s) => !!s.dismissedByUser[currentUser?.id ?? '']);
  const dismissWelcome = useMemberOnboardingStore((s) => s.dismiss);

  // Edit mode forces a fresh parties pull: a just-signed-up member's party was
  // minted after the store last loaded (the infinite "Loading…" on first visit).
  useEffect(() => { fetchParties(mode === 'edit'); fetchHorses(); }, [fetchParties, fetchHorses, mode]);

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addChooser, setAddChooser] = useState(false); // pick guided vs quick form
  const [quickForm, setQuickForm] = useState(false);   // the quick HorseForm modal

  // Reset any open module when the subject / role changes.
  useEffect(() => { setActiveModule(null); }, [partyId, searchParams.get('role')]);

  const party = useMemo(() => register.find((p) => p.id === partyId), [register, partyId]);
  const editable = canManagePerson(currentUser, partyId);

  const activeRole = useMemo(
    () => resolveActiveRole(party?.roles ?? [], mode === 'view' ? searchParams.get('role') : null),
    [party, searchParams, mode],
  );

  const subject = useMemo(
    () => (party ? ({ kind: 'party', party, role: activeRole } as const) : null),
    [party, activeRole],
  );
  const scope = useProfileScope(subject);

  const myHorses = useMemo(() => {
    const linked = new Set(horsesForPerson(partyId, { parties, horses }));
    return horses.filter((h) => linked.has(h.id) || h.createdByUserId === currentUser?.id);
  }, [horses, parties, partyId, currentUser]);

  // Keep the AI assistant's context in sync with the open party (edit mode only).
  const setAgentContext = useProfileAgentUi((s) => s.setContext);
  const askAgent = useProfileAgentUi((s) => s.ask);
  const chatOpen = useProfileAgentUi((s) => s.open);
  useEffect(() => {
    if (mode === 'edit' && party) setAgentContext(buildPartyContext(party, myHorses.length));
    return () => setAgentContext(null);
  }, [mode, party, myHorses, setAgentContext]);

  // Steps the user explicitly skipped (persisted per party). A skipped step
  // counts as resolved so onboarding can finish without it.
  const [skipped, setSkipped] = useState<Set<string>>(() => loadSkippedSteps(`party:${partyId}`));
  useEffect(() => { setSkipped(loadSkippedSteps(`party:${partyId}`)); }, [partyId]);

  // Whether the member closed the guided journey (persisted per party). Closing
  // hides the focus overlay + mascot so they needn't skip every step; data
  // already entered is saved (fields commit immediately) and the in-place
  // editors + checklist remain to finish later.
  const [guideDismissed, setGuideDismissed] = useState<boolean>(() => loadGuideDismissed(`party:${partyId}`));
  useEffect(() => { setGuideDismissed(loadGuideDismissed(`party:${partyId}`)); }, [partyId]);

  // Onboarding completion (edit mode). Mirrors the `onbSteps` done predicates
  // below — keep in sync. Hook (before guards) so the one-time celebration toast
  // fires without breaking the Rules-of-Hooks order.
  const onbAllDone = useMemo(() => {
    if (!party || mode !== 'edit' || !editable) return false;
    const ok = (done: boolean, key: string) => done || skipped.has(key);
    return ok(!!party.imageUrl, 'photo')
      && ok(!!(party.profession && party.baseLocation), 'details')
      && ok(myHorses.length > 0, 'horses');
  }, [party, mode, editable, myHorses, skipped]);
  // Celebrate only a genuine in-session completion (see HorseProfile): require a
  // loaded-but-incomplete state first, else the toast pops on merely opening an
  // already-complete / previously-skipped profile (skips load from localStorage).
  const celebratedRef = useRef(false);
  const sawIncompleteRef = useRef(false);
  useEffect(() => {
    if (!onbAllDone) {
      if (partiesLoaded && horsesLoaded && mode === 'edit' && editable) sawIncompleteRef.current = true;
      celebratedRef.current = false; // re-arm if data is later removed
      return;
    }
    if (sawIncompleteRef.current && !celebratedRef.current) {
      celebratedRef.current = true;
      toast.success('🏇 Profile complete — it’s ready to view.');
    }
  }, [onbAllDone, partiesLoaded, horsesLoaded, mode, editable]);

  // ── Guards AFTER all hooks (stable hook order) ──
  if (!party) {
    if (mode === 'view' && parties.length > 0) { navigate('/parties', { replace: true }); return null; }
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <Loader2 className="mx-auto animate-spin" /> <p className="mt-2 text-sm">Loading {mode === 'edit' ? 'your profile' : 'profile'}…</p>
      </div>
    );
  }

  const roles = party.roles ?? [];
  const roleLabel = ROLE_BINDINGS[activeRole]?.label ?? (mode === 'edit' ? 'Member' : 'Profile');
  const partyName = party.name || (mode === 'edit' ? 'Your name' : 'Profile');
  // A person with no role edge yet is "not in the register" rather than
  // "unverified" — verification is gone, so the only question left is whether
  // anything actually connects them to the sport.
  const isUnverified = roles.length === 0;
  const isEdit = mode === 'edit';
  const subtypes = party.personnelSubtype ?? [];
  const set = (patch: Partial<Person>) => updatePerson(partyId, patch);

  const toggleSubtype = (s: PersonnelSubtype) => {
    const next = subtypes.includes(s) ? subtypes.filter((x) => x !== s) : [...subtypes, s];
    void set({ personnelSubtype: next });
  };

  // Link the new horse to THIS person under the role the studio is centred on, so
  // the creator shows in the matching connection box (a trainer in Trainers, not
  // Owners).
  //
  // This used to be a `Partial<Horse>` setting the matching `*Ids` array, saved
  // with the horse in one request. Those fields are gone — the link is a party
  // EDGE, so it is written separately, after the horse has an id.
  const selfConnect = (): ConnectFields => ({ [activeRole]: [partyId] });

  // Photo-first path: create an un-named draft (foal / yearling) with no name and
  // jump into its studio — naming is never a hard gate.
  const onAddUnnamedFoal = async () => {
    setAdding(true);
    try {
      const created = await addHorse({ name: '', isUnnamed: true, pedigreeNotes: '' });
      if (!created) return;
      // Re-read first: POST /api/horses links the creator itself when a member
      // registers a horse, and adding the same edge again would list them twice.
      await fetchParties(true);
      await ensureConnection(
        usePartyStore.getState().parties,
        created.id,
        partyId,
        activeRole,
        addParty,
      );
      navigate(`/studio/horse/${created.id}`);
    } finally {
      setAdding(false);
    }
  };

  const horseList = isEdit ? myHorses : scope.horses;
  const horseCount = horseList.length;

  const switchableRoles = roles.filter((r) => PROFILE_ROLES.includes(r));

  const relTiles: RelTile[] = REL_ORDER
    .filter((r) => (isEdit || r !== activeRole) && scope.relationshipTiles[r]?.length > 0)
    .map((r) => ({ role: r, parties: scope.relationshipTiles[r] }));

  const dossierFlags = [
    horseCount > 0,
    relTiles.length > 0,
    !!party.imageUrl,
    !!party.profession,
    !!party.baseLocation,
    !!party.dateOfBirth,
  ];
  const dossierFilled = dossierFlags.filter(Boolean).length;

  // ── Onboarding step guide (edit mode; self-hides once complete) ──
  const onbSteps: OnbStep[] = [
    { key: 'photo', label: 'Photo', hint: 'Upload a profile photo.', done: !!party.imageUrl, skipped: skipped.has('photo'), anchorId: 'onb-identity', icon: STEP_ICONS.photo },
    { key: 'details', label: 'Details', hint: 'Add your profession and base location.', done: !!(party.profession && party.baseLocation), skipped: skipped.has('details'), anchorId: 'onb-identity', icon: STEP_ICONS.details },
    { key: 'horses', label: 'Horses', hint: 'Register the horses in your stable.', done: horseCount > 0, skipped: skipped.has('horses'), anchorId: 'onb-horses', icon: STEP_ICONS.horses },
  ];
  const scrollToAnchor = (id?: string) => { if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  // Mark a step skipped (persisted) so the guide moves on and onboarding can finish.
  const skipStep = (key: string) => setSkipped((prev) => {
    const next = new Set(prev); next.add(key); persistSkippedSteps(`party:${partyId}`, next); return next;
  });

  // Per-step prompt that opens the Stable Studio assistant ready to help.
  const PARTY_STEP_PROMPTS: Record<string, string> = {
    photo: 'What should I add to complete my profile? Give me a short checklist.',
    details: `Help me write my profession and base location as a ${roleLabel.toLowerCase()}.`,
    horses: 'Help me add my first horse.',
  };
  const askAiForStep = (step: OnbStep) => askAgent(PARTY_STEP_PROMPTS[step.key] ?? `Help me with my ${step.label.toLowerCase()}.`);

  // ── Onboarding guide content: the floating mascot's per-step title + tips. ──
  const PARTY_COACH: Record<string, { title: string; tips: string[] }> = {
    photo: { title: 'Add your photo', tips: ['A friendly headshot, silks or a logo'] },
    details: { title: 'Add your details', tips: ['Your profession & base location'] },
    horses: { title: 'Add your horses', tips: ['Register the horses in your stable'] },
  };
  const activeStep = onbSteps.find((s) => !s.done && !s.skipped);
  const activeKey = activeStep?.key;
  const activeIdx = onbSteps.findIndex((s) => s.key === activeKey);
  const showGuide = isEdit && editable && !onbAllDone && !guideDismissed;
  // Close the whole guided journey (data already saved); persisted per party.
  const dismissGuide = () => { setGuideDismissed(true); persistGuideDismissed(`party:${partyId}`, true); };
  const isActive = (key: string) => showGuide && activeKey === key;
  const guideSteps: GuideStep[] = onbSteps.map((s) => ({
    key: s.key,
    label: s.label,
    title: PARTY_COACH[s.key]?.title ?? s.label,
    tips: PARTY_COACH[s.key]?.tips,
    anchorId: s.anchorId,
    pointerId: s.anchorId && !s.anchorId.startsWith('module:') ? s.anchorId : undefined,
    done: s.done || !!s.skipped,
  }));

  const summaryCells = [
    { label: 'Horses', value: String(horseCount) },
    { label: 'Winnings', value: scope.summary.totalWinnings > 0 ? fmtMoney(scope.summary.totalWinnings) : '—' },
    { label: 'Wins', value: String(scope.summary.wins) },
    { label: 'Top Rating', value: scope.summary.topRating !== undefined ? String(scope.summary.topRating) : '—' },
  ];

  // Public dossier "details box below the photo" — the banded racing summary
  // (reference layout). Owner-level aggregates rolled up across their horses;
  // per-horse-only figures (career/last-10/season/ranking) have no party
  // aggregate, so we surface the four real rollups Stable Press computes.
  const partyRacingStats: RacingStat[] = [
    { label: 'Horses', value: String(scope.summary.horseCount) },
    { label: 'Winnings', value: scope.summary.totalWinnings > 0 ? fmtMoney(scope.summary.totalWinnings) : '—', highlight: true },
    { label: 'Wins', value: String(scope.summary.wins) },
    { label: 'Top Rating', value: scope.summary.topRating !== undefined ? String(scope.summary.topRating) : '—', highlight: true },
  ];

  const openModule = (key: string) => setActiveModule((p) => (p === key ? null : key));
  const closeModule = () => setActiveModule(null);
  const moduleOpen = activeModule !== null;

  // Horse open: owners go to the editable horse route, viewers to the public page.
  // Public view → public horse page (read-only, even for owners); studio → editable horse.
  const openHorse = (hid: string) => navigate(isEdit ? `/studio/horse/${hid}` : `/horses/${hid}`);

  // ── Identity fields (read-only in view, editable in edit) ──
  const age = calcAge(party.dateOfBirth);
  const today = new Date().toISOString().split('T')[0];
  const roleChipsRow = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--parchment-shadow)', paddingBottom: 6, marginBottom: 6, gap: 8 }}>
      <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-label)', fontWeight: 700, flexShrink: 0 }}>Role</dt>
      <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
        {roles.length === 0 ? <span style={{ fontSize: '0.72rem', color: 'var(--parchment-label)' }}>—</span> : roles.map((r) => (
          <span key={r} style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 2, border: '1px solid var(--gold-mid)', background: 'rgba(180,140,30,0.14)', color: 'var(--forest-deep)' }}>{PARTY_ROLE_LABELS[r]}</span>
        ))}
      </dd>
    </div>
  );

  const identityTitle = isEdit ? 'Identity' : partyName;
  const identityFields: FieldDescriptor[] = isEdit
    ? [
        { label: 'Full name', value: party.name ?? '', onSave: (v) => set({ name: v.trim() }) },
        { label: 'Role', value: '', render: roleChipsRow },
        { label: 'Profession', value: party.profession ?? '', onSave: (v) => set({ profession: v.trim() || undefined }) },
        { label: 'Date of birth', type: 'date', value: party.dateOfBirth ?? '', displayValue: party.dateOfBirth ? `${fmtDate(party.dateOfBirth)}${age !== null ? ` · ${age}y` : ''}` : '', onSave: (v) => set({ dateOfBirth: v || undefined }), max: today },
        { label: 'Country of birth', type: 'select', options: COUNTRY_OPTIONS, value: party.countryOfBirth ?? '', onSave: (v) => set({ countryOfBirth: v.trim() || undefined }) },
        { label: 'Base location', value: party.baseLocation ?? '', onSave: (v) => set({ baseLocation: v.trim() || undefined }) },
        { label: getStartedYearLabel(roles), type: 'number', value: party.startedYear ? String(party.startedYear) : '', displayValue: party.startedYear ? `${party.startedYear} · ${CURRENT_YEAR - party.startedYear}y` : '', onSave: (v) => set({ startedYear: v ? parseInt(v, 10) : undefined }), min: 1900, max: CURRENT_YEAR },
      ]
    : [
        // Reference order — DOB · Age · Country · Profession show by default
        // (collapsibleAfter={4}); Base · Started · Role expand on demand. Each is
        // spread-guarded so missing data is omitted, never faked.
        ...(party.dateOfBirth ? [{ label: 'Date of Birth', value: fmtDate(party.dateOfBirth) }] : []),
        ...(age !== null ? [{ label: 'Age', value: `${age} yrs old` }] : []),
        ...(party.countryOfBirth ? [{ label: 'Country of Birth', value: party.countryOfBirth }] : []),
        ...(party.profession ? [{ label: 'Profession', value: party.profession }] : []),
        ...(party.baseLocation ? [{ label: 'Base', value: party.baseLocation }] : []),
        ...(party.startedYear ? [{ label: getStartedYearLabel(roles), value: String(party.startedYear) }] : []),
        { label: 'Role', value: roleLabel },
      ];

  // Centered editor for the active onboarding step (focus mode). `horses` is an
  // action, not a fillable box → a CTA that opens the existing add-horse chooser.
  const focusContent = (key: string): React.ReactNode => {
    if (key === 'photo') {
      return <PortraitFrame src={party.imageUrl} alt={partyName} editable kind="party" onUpload={(url) => set({ imageUrl: url })} containerStyle={{ height: 'clamp(200px, 36vh, 340px)', minHeight: 200 }} label={!party.imageUrl ? 'Add a photo' : undefined} />;
    }
    if (key === 'details') return <IdentityCard title="Identity" fields={identityFields} editable />;
    if (key === 'horses') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--forest-mid)', lineHeight: 1.5, margin: 0 }}>Register the horses in your stable. Start with a photo — you can name and finish the details later.</p>
          <button onClick={() => setAddChooser(true)} className="sku-gold-btn" style={{ padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, ...serifStyle }}>
            <Plus size={12} /> Add a horse
          </button>
        </div>
      );
    }
    return null;
  };

  const portraitCaption = (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(26,51,34,0.92) 0%, transparent 100%)', padding: '24px 14px 10px', ...serifStyle }}>
      <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-bright)' }}>{roleLabel}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--parchment)' }}>{partyName}</div>
    </div>
  );

  // ── Breadcrumb ──
  const crumbs: Crumb[] = isEdit
    ? [
        ...(onBack ? [{ label: '← Back', onClick: onBack }] : []),
        { label: 'My Profile', onClick: moduleOpen ? closeModule : undefined },
        ...(activeModuleLabel(activeModule) ? [{ label: activeModuleLabel(activeModule)!, active: true }] : []),
      ]
    : [
        { label: 'Parties', onClick: () => navigate('/parties') },
        { label: partyName, onClick: moduleOpen ? closeModule : undefined },
        ...(activeModuleLabel(activeModule) ? [{ label: activeModuleLabel(activeModule)!, active: true }] : []),
      ];

  const breadcrumbRight = (
    <>
      {isEdit && editable ? (
        <StudioLauncher />
      ) : (
        <AskAgentButton
          variant="ornate"
          prompt="Tell me about this party — who they are and the horses they're connected to."
          label="Ask"
        />
      )}
      <span style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-dark)', ...serifStyle }}>Stable Press · {roleLabel}</span>
    </>
  );

  // ── Banner (edit welcome strip) ──
  const banner = isEdit && editable && !dismissedWelcome ? (
    <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%', padding: '0 20px' }}>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', border: '1px solid var(--gold-mid)', borderRadius: 4, background: 'linear-gradient(90deg, rgba(180,140,30,0.16) 0%, rgba(26,51,34,0.55) 100%)', ...serifStyle }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--parchment)', margin: 0 }}>Welcome to Stable Press 👋</p>
          <p style={{ fontSize: '0.68rem', color: 'var(--gold-mid)', lineHeight: 1.55, margin: '4px 0 0' }}>
            This is your profile — the same view the public sees, only editable. Click any field or your photo
            to update it; changes save as you go. Register your horses below whenever you like — there&rsquo;s no
            rush, and nothing is public until a staff member verifies it.
          </p>
        </div>
        <button onClick={() => currentUser && dismissWelcome(currentUser.id)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--gold-mid)', background: 'none', border: 'none', cursor: 'pointer', ...serifStyle }}>
          Skip
        </button>
      </div>
    </div>
  ) : null;

  // ── Crest card (crest + optional role switcher + action bar) ──
  const provisionalBadge = (
    <span title="Visible only to you until a staff member verifies your claim" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 3, border: '1px solid var(--gold-dark)', background: 'rgba(14,36,22,0.6)', color: 'var(--gold-bright)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
      <Clock size={11} /> Provisional · hidden from public
    </span>
  );
  const crest = (
    <div className="sku-gold-card">
      <OrnateCrest name={partyName} subtitle={[roleLabel, party.profession, party.baseLocation].filter(Boolean).join(' · ')} />
      {!isEdit && switchableRoles.length > 1 && (
        <div style={{ background: 'rgba(26,51,34,0.6)', borderTop: '1px solid var(--gold-dark)', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', ...serifStyle }}>View as:</span>
          {switchableRoles.map((r) => (
            <button key={r} onClick={() => setSearchParams({ role: r })} style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '3px 9px', borderRadius: 3, cursor: 'pointer', ...serifStyle, border: `1px solid ${r === activeRole ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, background: r === activeRole ? 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))' : 'transparent', color: r === activeRole ? 'var(--forest-deep)' : 'var(--gold-mid)' }}>
              {PARTY_ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      )}
      {/* Action bar — studio only (verification badge + dossier completion).
          The public dossier hides it by request: no "Follow This Owner" CTA and
          no profile-complete meter. */}
      {isEdit && (
        <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {isUnverified ? provisionalBadge : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gold-mid)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
              <Check size={11} /> Verified profile
            </span>
          )}
          <DossierMeter filled={dossierFilled} total={dossierFlags.length} />
        </div>
      )}
    </div>
  );

  // ── Centre default body ──
  const addHorsePrepend = isEdit && editable ? (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => setAddChooser(true)} disabled={adding} className="sku-gold-btn" style={{ padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, ...serifStyle, opacity: adding ? 0.6 : 1 }}>
        {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add a horse
      </button>
    </div>
  ) : undefined;

  const horseRows: EntityRow[] = horseList.map((h) => ({
    id: h.id,
    name: h.isUnnamed ? 'Un-Named' : h.name,
    imageUrl: h.imageUrl,
    meta: [h.sex, h.colour, h.careerRecord].filter(Boolean).join(' · ') || (isEdit ? 'Add details' : ''),
    badge: isEdit && h.verificationStatus === 'unverified' ? <span style={{ color: 'var(--gold-dark)' }}> · unverified</span> : undefined,
  }));

  const centerDefault = (
    <>
      {isEdit && editable && (onbAllDone
        ? <OnboardingComplete title="Profile complete!" subtitle="Your profile is ready to view." onViewPublic={() => navigate(`/parties/${partyId}`)} />
        : <OnboardingSteps title="Finish your profile" steps={onbSteps} onStepClick={scrollToAnchor} />
      )}

      {isEdit ? (
        <div id="onb-identity" style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: 14, alignItems: 'stretch' }}>
          <IdentityCard title={identityTitle} fields={identityFields} editable={editable} className={isActive('details') ? 'onb-spotlight' : undefined} />
          <PortraitFrame
            src={party.imageUrl}
            alt={partyName}
            editable={editable}
            kind="party"
            onUpload={(url) => set({ imageUrl: url })}
            containerStyle={{ minHeight: 200 }}
            caption={portraitCaption}
            className={isActive('photo') ? 'onb-spotlight' : undefined}
          />
        </div>
      ) : (
        /* Public dossier: image only, centred in the middle column. No identity
            box — the crest already carries the name + role. */
        <div id="onb-identity">
          <PortraitFrame
            src={party.imageUrl}
            alt={partyName}
            editable={false}
            kind="party"
            containerStyle={{ height: 'clamp(240px, 42vh, 460px)', minHeight: 240 }}
            caption={portraitCaption}
          />
        </div>
      )}

      {/* Public dossier: banded racing summary directly below the portrait
          (reference's "details box below"). Studio keeps the SummaryGrid +
          editable My Horses list instead. */}
      {!isEdit && <RacingSummaryBar stats={partyRacingStats} />}

      {isEdit && roles.includes('personnel') && (
        <div className="sku-gold-card" style={{ ...serifStyle }}>
          <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={12} style={{ color: 'var(--gold-bright)' }} />
            <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Personnel Type</span>
          </div>
          <div className="sku-parchment" style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PERSONNEL_SUBTYPES.map((s) => {
              const active = subtypes.includes(s);
              return (
                <button key={s} type="button" disabled={!editable} onClick={() => toggleSubtype(s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', fontWeight: 700, padding: '4px 9px', borderRadius: 3, cursor: editable ? 'pointer' : 'default', border: `1px solid ${active ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, background: active ? 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))' : 'rgba(0,0,0,0.03)', color: active ? 'var(--forest-deep)' : 'var(--forest-mid)', ...serifStyle }}>
                  {active && <Check size={10} strokeWidth={3} />} {PERSONNEL_SUBTYPE_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Studio-only: the 4-cell roll-up + editable My Horses list. The public
          dossier surfaces these via the racing-summary band + the left "Owner's
          Data" box + the right-rail data modules, keeping the page viewport-fit. */}
      {isEdit && <SummaryGrid title={`${roleLabel} Summary`} cells={summaryCells} columns={4} />}

      {isEdit && (
        <div id="onb-horses" className={isActive('horses') ? 'onb-spotlight' : undefined}>
          <EntityList
            title="My Horses"
            count={horseCount}
            prepend={addHorsePrepend}
            rows={horseRows}
            emptyText="No horses yet — register one above to start your stable."
            onSelect={openHorse}
          />
        </div>
      )}
    </>
  );

  // ── Footer button for the connections rail ──
  const railFooter = isEdit ? (
    <button onClick={() => navigate(`/parties/${partyId}`)} className="sku-gold-btn" style={{ marginTop: 4, padding: '7px 0', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...serifStyle }}>
      <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest-deep)', fontWeight: 700 }}>Preview Public Profile</span>
    </button>
  ) : (
    <button onClick={() => navigate('/parties')} className="sku-gold-btn" style={{ marginTop: 4, padding: '7px 0', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...serifStyle }}>
      <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest-deep)', fontWeight: 700 }}>All Parties</span>
    </button>
  );

  // Public dossier right rail also carries Token + Reports/Forms tiles (reference
  // layout). Token has no module yet → opens a placeholder; Reports reuses the
  // existing reports module (moved here from the left rail).
  const rightExtra = !isEdit ? (
    <>
      <DataCategoryCard compact label="Token Data" sublabel="Ownership tokens" icon={<Coins size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="racing" active={activeModule === 'token'} onClick={() => openModule('token')} />
      <DataCategoryCard compact label="Reports / Forms" sublabel="Documents & forms" icon={<FileText size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="media" active={activeModule === 'reports'} onClick={() => openModule('reports')} />
    </>
  ) : undefined;

  // Resolve the open module; `token` has no section yet so fall back to a
  // placeholder panel rather than blanking the centre.
  const moduleNode = activeModule ? renderProfileModule(activeModule, { scope, subjectName: partyName, roleLabel, onClose: closeModule, onOpenHorse: openHorse }) : null;
  const centerModule = activeModule
    ? (moduleNode ?? (activeModule === 'token'
      ? <SectionPanel title="Token Data" icon={<Coins size={16} style={{ color: 'var(--gold-bright)' }} />} onClose={closeModule}>
          <p style={{ fontSize: '0.72rem', color: 'var(--forest-mid)', lineHeight: 1.5, margin: 0, ...serifStyle }}>SyndT ownership tokens for {partyName}&rsquo;s horses will appear here once token records are available.</p>
        </SectionPanel>
      : null))
    : null;

  return (
    <>
      <ProfileScaffold
        crumbs={crumbs}
        breadcrumbRight={breadcrumbRight}
        banner={banner}
        left={
          isEdit ? (
            <ConnectionsRail
              tiles={relTiles}
              emptyText="No connected parties yet. Link them from a horse’s screen."
              onOpenParty={(pid) => navigate(`/parties/${pid}`)}
              reportsActive={activeModule === 'reports'}
              onOpenReports={() => openModule('reports')}
              footer={railFooter}
            />
          ) : (
            <OwnerDataRail
              tiles={scope.relationshipTiles}
              onOpenParty={(pid) => navigate(`/parties/${pid}`)}
              footer={railFooter}
            />
          )
        }
        crest={crest}
        centerDefault={centerDefault}
        centerModule={centerModule}
        moduleKey={activeModule}
        right={<DataSectionsRail activeModule={activeModule} onToggle={openModule} extra={rightExtra} compact={!isEdit} />}
        overlay={isEdit && editable
          ? (showGuide
            ? <>
                <OnboardingGuide steps={guideSteps} name="Stablehand" showStepBubble={false} onShowMe={scrollToAnchor} onAskStep={(s) => askAiForStep(onbSteps.find((o) => o.key === s.key) ?? onbSteps[0])} onSkipStep={(s) => skipStep(s.key)} />
                <OnboardingFocus
                  open={showGuide && !chatOpen}
                  stepKey={activeKey ?? 'none'}
                  stepIndex={activeIdx < 0 ? 0 : activeIdx}
                  total={onbSteps.length}
                  title={(activeKey && PARTY_COACH[activeKey]?.title) || activeStep?.label || ''}
                  tips={activeKey ? PARTY_COACH[activeKey]?.tips : undefined}
                  content={activeKey ? focusContent(activeKey) : null}
                  originId={activeStep?.anchorId}
                  skippable
                  onSkip={() => { if (activeKey) skipStep(activeKey); }}
                  onAsk={() => { if (activeStep) askAiForStep(activeStep); }}
                  onClose={dismissGuide}
                />
              </>
            : <ProfileAgentPanel />)
          : undefined}
      />
      <AddHorseChoice
        open={addChooser}
        onClose={() => setAddChooser(false)}
        onGuided={() => { setAddChooser(false); void onAddUnnamedFoal(); }}
        onQuick={() => { setAddChooser(false); setQuickForm(true); }}
      />
      <HorseForm open={quickForm} onClose={() => setQuickForm(false)} memberMode defaultConnect={selfConnect()} />
    </>
  );
}
