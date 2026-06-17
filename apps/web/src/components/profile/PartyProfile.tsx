/**
 * PartyProfile — the single container behind BOTH the public party page
 * (`/parties/:id`, mode="view") and the member's editable studio (`/studio/:id`,
 * mode="edit"). It resolves the party + profile scope, builds the field
 * descriptors (wired to updateParty in edit mode), and composes the dumb
 * ProfileScaffold + building blocks. One layout, two modes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Check, Plus, Loader2, Users, Camera, ClipboardList, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorseStore } from '@/stores/horseStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useMemberOnboardingStore } from '@/stores/memberOnboardingStore';
import { canManageParty } from '@/rbac/can';
import { horsesLinkedToParty } from '@/rbac/scope';
import { useProfileScope } from '@/hooks/useProfileScope';
import { ROLE_BINDINGS, PROFILE_ROLES, resolveActiveRole } from '@/lib/profile/roleMap';
import {
  PARTY_ROLE_LABELS, PERSONNEL_SUBTYPES, PERSONNEL_SUBTYPE_LABELS, getStartedYearLabel,
} from '@/types/party';
import type { Party, PartyRole, PersonnelSubtype } from '@/types/party';
import type { Horse } from '@/types/horse';
import { COUNTRY_OPTIONS } from '@/components/horse-form/constants';
import { loadSkippedSteps, persistSkippedSteps } from '@/lib/profile/onboardingSkips';
import { serifStyle, goldStyle, fmtMoney, fmtDate, OrnateCrest } from '@/components/profile/kit';
import { ProfileScaffold, type Crumb } from '@/components/profile/ProfileScaffold';
import { IdentityCard, type FieldDescriptor } from '@/components/profile/IdentityCard';
import { PortraitFrame } from '@/components/profile/PortraitFrame';
import { SummaryGrid } from '@/components/profile/SummaryGrid';
import { EntityList, type EntityRow } from '@/components/profile/EntityList';
import { ConnectionsRail, type RelTile } from '@/components/profile/ConnectionsRail';
import { DataSectionsRail } from '@/components/profile/DataSectionsRail';
import { REL_ORDER, renderProfileModule, activeModuleLabel } from '@/components/profile/modules';
import { OnboardingSteps, type OnbStep } from '@/components/profile/OnboardingSteps';
import { OnboardingGuide, type GuideStep } from '@/components/profile/OnboardingGuide';
import { OnboardingComplete } from '@/components/profile/OnboardingComplete';
import { ProfileAgentPanel, StudioLauncher } from '@/agent/profile/ProfileAgentPanel';
import { useProfileAgentUi, type ProfileContext } from '@/stores/profileAgentUiStore';
import { DossierMeter } from '@/components/DossierMeter';
import { FollowButton } from '@/components/FollowButton';
import { AskAgentButton } from '@/components/AskAgentButton';

type Mode = 'view' | 'edit';

/** Snapshot the party's editable fields for the AI assistant. */
function buildPartyContext(party: Party, horseCount: number): ProfileContext {
  const f: Record<string, string> = {
    name: party.name ?? '', profession: party.profession ?? '', base_location: party.base_location ?? '',
    date_of_birth: party.date_of_birth ?? '', country_of_birth: party.country_of_birth ?? '',
    started_year: party.started_year != null ? String(party.started_year) : '',
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

  const parties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const updateParty = usePartyStore((s) => s.updateParty);
  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const addHorse = useHorseStore((s) => s.addHorse);
  const links = useHorsePartyLinkStore((s) => s.links);
  const partiesLoaded = usePartyStore((s) => s.loaded);
  const horsesLoaded = useHorseStore((s) => s.loaded);
  const dismissedWelcome = useMemberOnboardingStore((s) => !!s.dismissedByUser[currentUser?.id ?? '']);
  const dismissWelcome = useMemberOnboardingStore((s) => s.dismiss);

  // Edit mode forces a fresh parties pull: a just-signed-up member's party was
  // minted after the store last loaded (the infinite "Loading…" on first visit).
  useEffect(() => { fetchParties(mode === 'edit'); fetchHorses(); }, [fetchParties, fetchHorses, mode]);

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [newHorseName, setNewHorseName] = useState('');
  const [adding, setAdding] = useState(false);

  // Reset any open module when the subject / role changes.
  useEffect(() => { setActiveModule(null); }, [partyId, searchParams.get('role')]);

  const party = useMemo(() => parties.find((p) => p.id === partyId), [parties, partyId]);
  const editable = canManageParty(currentUser, partyId);

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
    const linked = new Set(horsesLinkedToParty(partyId, { horses, links }));
    return horses.filter((h) => linked.has(h.id) || h.createdByUserId === currentUser?.id);
  }, [horses, links, partyId, currentUser]);

  // Keep the AI assistant's context in sync with the open party (edit mode only).
  const setAgentContext = useProfileAgentUi((s) => s.setContext);
  const askAgent = useProfileAgentUi((s) => s.ask);
  useEffect(() => {
    if (mode === 'edit' && party) setAgentContext(buildPartyContext(party, myHorses.length));
    return () => setAgentContext(null);
  }, [mode, party, myHorses, setAgentContext]);

  // Steps the user explicitly skipped (persisted per party). A skipped step
  // counts as resolved so onboarding can finish without it.
  const [skipped, setSkipped] = useState<Set<string>>(() => loadSkippedSteps(`party:${partyId}`));
  useEffect(() => { setSkipped(loadSkippedSteps(`party:${partyId}`)); }, [partyId]);

  // Onboarding completion (edit mode). Mirrors the `onbSteps` done predicates
  // below — keep in sync. Hook (before guards) so the one-time celebration toast
  // fires without breaking the Rules-of-Hooks order.
  const onbAllDone = useMemo(() => {
    if (!party || mode !== 'edit' || !editable) return false;
    const ok = (done: boolean, key: string) => done || skipped.has(key);
    return ok(!!party.photo, 'photo')
      && ok(!!(party.profession && party.base_location), 'details')
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
  const isUnverified = party.verificationStatus === 'unverified';
  const isEdit = mode === 'edit';
  const subtypes = party.personnel_subtype ?? [];
  const set = (patch: Partial<Party>) => updateParty(partyId, patch);

  const toggleSubtype = (s: PersonnelSubtype) => {
    const next = subtypes.includes(s) ? subtypes.filter((x) => x !== s) : [...subtypes, s];
    void set({ personnel_subtype: next });
  };

  // Link the new horse to THIS party under the role the studio is centred on, so
  // the creator shows in the matching connection box (a trainer in Trainers, not
  // Owners). The server reads this *Ids field to pick the link's relationship.
  const selfConnect = (): Partial<Horse> => {
    const c: Partial<Horse> = {};
    (c as Record<string, string[]>)[ROLE_BINDINGS[activeRole].horseField] = [partyId];
    return c;
  };

  // Register a (named) horse and drop straight into its studio to finish it.
  const onAddHorse = async () => {
    const name = newHorseName.trim();
    if (!name) { toast.error('Enter a horse name.'); return; }
    setAdding(true);
    try {
      const created = await addHorse({ ...selfConnect(), name, pedigreeNotes: '' });
      if (created) { setNewHorseName(''); navigate(`/studio/horse/${created.id}`); }
    } finally {
      setAdding(false);
    }
  };

  // Photo-first path: create an un-named draft (foal / yearling) with no name and
  // jump into its studio — naming is never a hard gate.
  const onAddUnnamedFoal = async () => {
    setAdding(true);
    try {
      const created = await addHorse({ ...selfConnect(), name: '', isUnnamed: true, pedigreeNotes: '' });
      if (created) navigate(`/studio/horse/${created.id}`);
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
    !!party.photo,
    !!party.profession,
    !!party.base_location,
    !!party.date_of_birth,
  ];
  const dossierFilled = dossierFlags.filter(Boolean).length;

  // ── Onboarding step guide (edit mode; self-hides once complete) ──
  const onbSteps: OnbStep[] = [
    { key: 'photo', label: 'Photo', hint: 'Upload a profile photo.', done: !!party.photo, skipped: skipped.has('photo'), anchorId: 'onb-identity', icon: STEP_ICONS.photo },
    { key: 'details', label: 'Details', hint: 'Add your profession and base location.', done: !!(party.profession && party.base_location), skipped: skipped.has('details'), anchorId: 'onb-identity', icon: STEP_ICONS.details },
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
  const showGuide = isEdit && editable && !onbAllDone;
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

  const openModule = (key: string) => setActiveModule((p) => (p === key ? null : key));
  const closeModule = () => setActiveModule(null);
  const moduleOpen = activeModule !== null;

  // Horse open: owners go to the editable horse route, viewers to the public page.
  // Public view → public horse page (read-only, even for owners); studio → editable horse.
  const openHorse = (hid: string) => navigate(isEdit ? `/studio/horse/${hid}` : `/horses/${hid}`);

  // ── Identity fields (read-only in view, editable in edit) ──
  const age = calcAge(party.date_of_birth);
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
        { label: 'Date of birth', type: 'date', value: party.date_of_birth ?? '', displayValue: party.date_of_birth ? `${fmtDate(party.date_of_birth)}${age !== null ? ` · ${age}y` : ''}` : '', onSave: (v) => set({ date_of_birth: v || undefined }), max: today },
        { label: 'Country of birth', type: 'select', options: COUNTRY_OPTIONS, value: party.country_of_birth ?? '', onSave: (v) => set({ country_of_birth: v.trim() || undefined }) },
        { label: 'Base location', value: party.base_location ?? '', onSave: (v) => set({ base_location: v.trim() || undefined }) },
        { label: getStartedYearLabel(roles), type: 'number', value: party.started_year ? String(party.started_year) : '', displayValue: party.started_year ? `${party.started_year} · ${CURRENT_YEAR - party.started_year}y` : '', onSave: (v) => set({ started_year: v ? parseInt(v, 10) : undefined }), min: 1900, max: CURRENT_YEAR },
      ]
    : [
        { label: 'Role', value: roleLabel },
        ...(party.profession ? [{ label: 'Profession', value: party.profession }] : []),
        ...(party.date_of_birth ? [{ label: 'Date of Birth', value: fmtDate(party.date_of_birth) }] : []),
        ...(party.country_of_birth ? [{ label: 'Country', value: party.country_of_birth }] : []),
        ...(party.base_location ? [{ label: 'Base', value: party.base_location }] : []),
        ...(party.started_year ? [{ label: `${roleLabel} Since`, value: String(party.started_year) }] : []),
      ];

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
      <OrnateCrest name={partyName} subtitle={[roleLabel, party.profession, party.base_location].filter(Boolean).join(' · ')} />
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
      <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {isEdit ? (
          isUnverified ? provisionalBadge : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gold-mid)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
              <Check size={11} /> Verified profile
            </span>
          )
        ) : (
          /* Public page = read-only preview: no owner edit chrome. Editing is
             reached only from the private studio (Dashboard → My Profile). */
          <FollowButton horseId={`party:${partyId}`} label={`Follow This ${roleLabel}`} />
        )}
        <DossierMeter filled={dossierFilled} total={dossierFlags.length} />
      </div>
    </div>
  );

  // ── Centre default body ──
  const addHorsePrepend = isEdit && editable ? (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newHorseName}
          onChange={(e) => setNewHorseName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void onAddHorse(); }}
          placeholder="New horse name…"
          style={{ flex: 1, background: 'var(--parchment)', border: '1px solid var(--gold-mid)', borderRadius: 3, padding: '5px 9px', fontSize: '0.72rem', color: 'var(--forest-deep)', outline: 'none', ...serifStyle }}
        />
        <button onClick={onAddHorse} disabled={adding || !newHorseName.trim()} className="sku-gold-btn" style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, ...serifStyle, opacity: adding || !newHorseName.trim() ? 0.55 : 1 }}>
          {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Register
        </button>
      </div>
      <button onClick={onAddUnnamedFoal} disabled={adding} style={{ marginTop: 5, background: 'none', border: 'none', padding: 0, cursor: adding ? 'wait' : 'pointer', fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--gold-dark)', ...serifStyle }}>
        + Add an un-named foal (name it later)
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

      <div id="onb-identity" style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: 14, alignItems: 'stretch' }}>
        <IdentityCard title={identityTitle} fields={identityFields} editable={isEdit && editable} className={isActive('details') ? 'onb-spotlight' : undefined} />
        <PortraitFrame
          src={party.photo}
          alt={partyName}
          editable={isEdit && editable}
          kind="party"
          onUpload={(url) => set({ photo: url })}
          containerStyle={{ minHeight: isEdit ? 200 : 180 }}
          caption={portraitCaption}
          className={isActive('photo') ? 'onb-spotlight' : undefined}
        />
      </div>

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

      <SummaryGrid title={`${roleLabel} Summary`} cells={summaryCells} columns={4} />

      <div id="onb-horses" className={isActive('horses') ? 'onb-spotlight' : undefined}>
        <EntityList
          title={isEdit ? 'My Horses' : 'Horses'}
          count={horseCount}
          prepend={addHorsePrepend}
          rows={horseRows}
          emptyText={isEdit ? 'No horses yet — register one above to start your stable.' : `No horses connected to this ${roleLabel.toLowerCase()} yet.`}
          onSelect={openHorse}
        />
      </div>
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

  return (
    <>
      <ProfileScaffold
        crumbs={crumbs}
        breadcrumbRight={breadcrumbRight}
        banner={banner}
        left={
          <ConnectionsRail
            tiles={relTiles}
            emptyText={isEdit ? 'No connected parties yet. Link them from a horse’s screen.' : 'No connected parties yet.'}
            onOpenParty={(pid) => navigate(`/parties/${pid}`)}
            reportsActive={activeModule === 'reports'}
            onOpenReports={() => openModule('reports')}
            footer={railFooter}
          />
        }
        crest={crest}
        centerDefault={centerDefault}
        centerModule={activeModule ? renderProfileModule(activeModule, { scope, subjectName: partyName, roleLabel, onClose: closeModule, onOpenHorse: openHorse }) : null}
        moduleKey={activeModule}
        right={<DataSectionsRail activeModule={activeModule} onToggle={openModule} />}
        overlay={isEdit && editable
          ? (showGuide
            ? <OnboardingGuide steps={guideSteps} name="Stablehand" onShowMe={scrollToAnchor} onAskStep={(s) => askAiForStep(onbSteps.find((o) => o.key === s.key) ?? onbSteps[0])} onSkipStep={(s) => skipStep(s.key)} />
            : <ProfileAgentPanel />)
          : undefined}
      />
    </>
  );
}
