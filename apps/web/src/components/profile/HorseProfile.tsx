/**
 * HorseProfile — the single container behind BOTH the public horse page
 * (`/horses/:id`, mode="view") and the editable horse studio
 * (`/horses/:id/edit`, mode="edit"). Built on the shared kit + useProfileScope
 * (which fetches links + entries), so a cold direct load resolves correctly —
 * unlike the old HorseDetail, which never fetched horses/links. One layout, two
 * modes; all hooks run before any conditional return (no Rules-of-Hooks bug).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Clock, Check, Plus, Loader2, X, ChevronRight, BookMarked, Trophy, Binary, Pencil, ArrowRight,
  Camera, ClipboardList, Dna,
} from 'lucide-react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useAuthStore } from '@/stores/authStore';
import { canManageHorse } from '@/rbac/can';
import { useProfileScope } from '@/hooks/useProfileScope';
import { SEX_OPTIONS, COLOUR_OPTIONS, COUNTRY_OPTIONS } from '@/components/horse-form/constants';
import { loadSkippedSteps, persistSkippedSteps } from '@/lib/profile/onboardingSkips';
import type { Horse } from '@/types/horse';
import { serifStyle, goldStyle, OrnateCrest } from '@/components/profile/kit';
import { ProfileScaffold, type Crumb } from '@/components/profile/ProfileScaffold';
import { IdentityCard, type FieldDescriptor } from '@/components/profile/IdentityCard';
import { PortraitFrame } from '@/components/profile/PortraitFrame';
import { RoleConnectionsRail } from '@/components/profile/RoleConnectionsRail';
import { DataSectionsRail } from '@/components/profile/DataSectionsRail';
import { renderProfileModule, activeModuleLabel, ROLE_ICON } from '@/components/profile/modules';
import { InlineEditRow, InlineEditTextArea } from '@/components/profile/editable';
import { OnboardingSteps, type OnbStep } from '@/components/profile/OnboardingSteps';
import { OnboardingGuide, type GuideStep } from '@/components/profile/OnboardingGuide';
import { OnboardingComplete } from '@/components/profile/OnboardingComplete';
import { ProfileAgentPanel, StudioLauncher } from '@/agent/profile/ProfileAgentPanel';
import { useProfileAgentUi, type ProfileContext } from '@/stores/profileAgentUiStore';
import { DossierMeter } from '@/components/DossierMeter';
import { FollowButton } from '@/components/FollowButton';
import { AskAgentButton } from '@/components/AskAgentButton';
import { MediaDataForm } from '@/components/MediaDataForm';
import { RacingDataForm } from '@/components/RacingDataForm';
import { SalesDataForm } from '@/components/SalesDataForm';
import { ReportsDataForm } from '@/components/ReportsDataForm';

type Mode = 'view' | 'edit';

const ADD_LABELS: Record<string, string> = { media: 'media', racing: 'racing entry', sales: 'sale record', reports: 'document' };

/* Onboarding connection steps — one per left-rail party box, walked one by one
   (Syndicate Manager is auto-derived from a linked party, so it isn't a step).
   `rel` matches the box's relationship_type; `noun` drives prompts/tips. */
const CONNECTION_STEPS = [
  { key: 'owners',    rel: 'ownership', role: 'owner',            label: 'Owners',    noun: 'owner',            title: 'Add the owners' },
  { key: 'breeders',  rel: 'bred-by',   role: 'breeder',          label: 'Breeders',  noun: 'breeder',          title: 'Add the breeder' },
  { key: 'trainers',  rel: 'training',  role: 'trainer',          label: 'Trainers',  noun: 'trainer',          title: 'Add the trainer' },
  { key: 'personnel', rel: 'personnel', role: 'personnel',        label: 'Personnel', noun: 'personnel member', title: 'Add the personnel' },
  { key: 'jockeys',   rel: 'riding',    role: 'jockey',           label: 'Jockeys',   noun: 'jockey',           title: 'Add the jockey' },
  { key: 'agents',    rel: 'agent',     role: 'bloodstock agent', label: 'Agents',    noun: 'bloodstock agent', title: 'Add the bloodstock agent' },
] as const;

/* Milestone icons for the onboarding strip — photo/basics/pedigree get their own;
   connection steps reuse ROLE_ICON so each node matches its left-rail box. */
const STEP_ICONS: Record<string, React.ReactNode> = {
  photo: <Camera size={14} strokeWidth={1.8} />,
  basics: <ClipboardList size={14} strokeWidth={1.8} />,
  pedigree: <Dna size={14} strokeWidth={1.8} />,
};

/** Snapshot the horse's editable fields + connection counts for the AI assistant. */
function buildHorseContext(horse: Horse, links: { relationship_type: string }[]): ProfileContext {
  // Mirrors the editable field set advertised in the server profile prompt
  // (lib/agent/profilePrompt.ts HORSE_FIELDS) so the agent never proposes a field
  // it cannot see as empty, and can fill every field it is told it may edit.
  const f: Record<string, string> = {
    name: horse.name ?? '', sex: horse.sex ?? '', colour: horse.colour ?? '', dob: horse.dob ?? '',
    country: horse.country ?? '',
    sire: horse.sire ?? '', sireSire: horse.sireSire ?? '', sireDam: horse.sireDam ?? '',
    dam: horse.dam ?? '', damSire: horse.damSire ?? '', damDam: horse.damDam ?? '',
    careerRecord: horse.careerRecord ?? '',
    careerWinnings: horse.careerWinnings != null ? String(horse.careerWinnings) : '',
    lastTenForm: horse.lastTenForm ?? '', seasonRecord: horse.seasonRecord ?? '',
    currentRating: horse.currentRating != null ? String(horse.currentRating) : '',
    studBook: horse.studBook ?? '', registrationNumber: horse.registrationNumber ?? '',
    microchip: horse.microchip ?? '', brandFreeze: horse.brandFreeze ?? '', passportNumber: horse.passportNumber ?? '',
    pullQuote: horse.pullQuote ?? '', pedigreeNotes: horse.pedigreeNotes ?? '',
  };
  const emptyFields = Object.entries(f).filter(([, v]) => !v.trim()).map(([k]) => k);
  const counts: Record<string, number> = {};
  links.forEach((l) => { counts[l.relationship_type] = (counts[l.relationship_type] ?? 0) + 1; });
  const roleBoxes = Object.entries(counts).map(([role, count]) => ({ role, count }));
  return { entityKind: 'horse', entityId: horse.id, name: horse.isUnnamed ? 'Un-Named' : (horse.name || 'New Horse'), fields: f, emptyFields, roleBoxes };
}

interface HorseProfileProps {
  horseId: string;
  mode: Mode;
  /** Back affordance for edit mode (e.g. → browser back). */
  onBack?: () => void;
}

export function HorseProfile({ horseId, mode, onBack }: HorseProfileProps) {
  const navigate = useNavigate();
  const horses = useHorseStore((s) => s.horses);
  const horsesLoaded = useHorseStore((s) => s.loaded);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const updateHorse = useHorseStore((s) => s.updateHorse);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const allLinks = useHorsePartyLinkStore((s) => s.links);
  const linksLoaded = useHorsePartyLinkStore((s) => s.loaded);
  const currentUser = useAuthStore((s) => s.currentUser);

  // Fetch horses + parties on mount; useProfileScope fetches links + entries.
  // (The old HorseDetail fetched neither horses nor links → empty on cold load.)
  useEffect(() => { fetchHorses(); fetchParties(); }, [fetchHorses, fetchParties]);

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => { setAddOpen(false); }, [activeModule]);

  const horse = useMemo(() => horses.find((h) => h.id === horseId), [horses, horseId]);
  const editable = canManageHorse(currentUser, horseId, { horses, links: allLinks });

  const subject = useMemo(
    () => (horse ? ({ kind: 'horse', horse } as const) : null),
    [horse],
  );
  const scope = useProfileScope(subject);

  const horseLinks = useMemo(() => allLinks.filter((l) => l.horse_id === horseId), [allLinks, horseId]);

  // Keep the AI assistant's context in sync with the open horse (edit mode only).
  const setAgentContext = useProfileAgentUi((s) => s.setContext);
  const askAgent = useProfileAgentUi((s) => s.ask);
  useEffect(() => {
    if (mode === 'edit' && horse) setAgentContext(buildHorseContext(horse, horseLinks));
    return () => setAgentContext(null);
  }, [mode, horse, horseLinks, setAgentContext]);

  // Steps the user explicitly skipped (persisted per horse). A skipped step
  // counts as resolved so onboarding can finish without it.
  const [skipped, setSkipped] = useState<Set<string>>(() => loadSkippedSteps(horseId));
  useEffect(() => { setSkipped(loadSkippedSteps(horseId)); }, [horseId]);

  // Onboarding completion (edit mode). Mirrors the `onbSteps` done predicates
  // below — keep in sync. Computed as a hook (before the guards) so the one-time
  // celebration toast can fire without breaking the Rules-of-Hooks order.
  const onbAllDone = useMemo(() => {
    if (!horse || mode !== 'edit' || !editable) return false;
    const ok = (done: boolean, key: string) => done || skipped.has(key);
    const linked = (rel: string) => horseLinks.some((l) => l.relationship_type === rel);
    return ok(!!horse.imageUrl, 'photo')
      && ok(!!(horse.sex && horse.colour && horse.dob), 'basics')
      && ok(!!(horse.sire || horse.dam), 'pedigree')
      && CONNECTION_STEPS.every((c) => ok(linked(c.rel), c.key));
  }, [horse, horseLinks, mode, editable, skipped]);
  // Celebrate only a GENUINE completion during this session — i.e. a
  // loaded-but-incomplete profile that then becomes complete. Without the
  // "saw incomplete first" gate the toast would pop on merely opening an
  // already-complete (or previously fully-skipped, loaded from localStorage)
  // horse, since onbAllDone is true on the first committed render.
  const celebratedRef = useRef(false);
  const sawIncompleteRef = useRef(false);
  useEffect(() => {
    if (!onbAllDone) {
      if (horsesLoaded && linksLoaded && mode === 'edit' && editable) sawIncompleteRef.current = true;
      celebratedRef.current = false; // re-arm if data is later removed
      return;
    }
    if (sawIncompleteRef.current && !celebratedRef.current) {
      celebratedRef.current = true;
      toast.success('🏇 Profile complete — it’s ready to view.');
    }
  }, [onbAllDone, horsesLoaded, linksLoaded, mode, editable]);

  // ── Guards AFTER all hooks (stable hook order) ──
  if (!horse) {
    if (horsesLoaded) { navigate('/horses', { replace: true }); return null; }
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <Loader2 className="mx-auto animate-spin" /> <p className="mt-2 text-sm">Loading horse…</p>
      </div>
    );
  }
  // A signed-in non-owner who lands on the edit URL is sent to the public page
  // (only once links have loaded, so the owner is never bounced mid-load).
  if (mode === 'edit' && linksLoaded && !editable) {
    navigate(`/horses/${horseId}`, { replace: true });
    return null;
  }

  const isEdit = mode === 'edit';
  const editableHorse = isEdit && editable;
  const horseName = horse.isUnnamed ? 'Un-Named' : (horse.name || 'New Horse');
  const isUnverified = horse.verificationStatus === 'unverified';
  const set = (patch: Partial<Horse>) => updateHorse(horseId, patch);
  const num = (v: string) => (v.trim() ? Number(v) : undefined);

  const sizeStr = horse.handsSize ? `${horse.handsSize}hh${horse.metricSize ? ` · ${horse.metricSize}m` : ''}` : undefined;
  const crestSubtitle = [horse.sex, horse.colour, sizeStr, horse.country, horse.dob ? `${new Date(horse.dob).getFullYear()} foal` : undefined].filter(Boolean).join(' · ');

  const openModule = (key: string) => setActiveModule((p) => (p === key ? null : key));
  const closeModule = () => setActiveModule(null);
  const closeAdd = () => setAddOpen(false);
  const moduleOpen = activeModule !== null;
  const canAdd = !!activeModule && ['media', 'racing', 'sales', 'reports'].includes(activeModule);

  const goHorse = (hid: string) => navigate(isEdit ? `/studio/horse/${hid}` : `/horses/${hid}`);

  const dossierFlags = [
    horseLinks.length > 0 || (horse.ownerIds?.length ?? 0) > 0,
    !!horse.dob,
    !!(horse.sex || horse.colour),
    !!(horse.sire || horse.dam),
    !!horse.careerRecord,
    !!(horse.registrationNumber || horse.microchip || horse.passportNumber || horse.brandFreeze),
    !!horse.imageUrl,
    !!(horse.pedigreeNotes || horse.pullQuote),
  ];
  const dossierFilled = dossierFlags.filter(Boolean).length;

  // ── Onboarding step guide (edit mode; self-hides once complete) ──
  // Photo → basics → pedigree, then ONE step per left-rail party (owners,
  // breeders, trainers… walked one by one). Any step can be Skipped (persisted
  // per horse); skipped counts as resolved. Racing is no longer a step.
  const hasRel = (rel: string) => horseLinks.some((l) => l.relationship_type === rel);
  const onbSteps: OnbStep[] = [
    { key: 'photo', label: 'Photo', hint: 'Upload a clear photo of the horse.', done: !!horse.imageUrl, skipped: skipped.has('photo'), anchorId: 'onb-photo', icon: STEP_ICONS.photo },
    { key: 'basics', label: 'Basics', hint: 'Add sex, colour and the foaling date.', done: !!(horse.sex && horse.colour && horse.dob), skipped: skipped.has('basics'), anchorId: 'onb-identity', icon: STEP_ICONS.basics },
    { key: 'pedigree', label: 'Pedigree', hint: 'Record the sire and dam.', done: !!(horse.sire || horse.dam), skipped: skipped.has('pedigree'), anchorId: 'onb-identity', icon: STEP_ICONS.pedigree },
    ...CONNECTION_STEPS.map((c) => ({
      key: c.key,
      label: c.label,
      hint: `Link the ${c.noun} — optional, skip if it doesn’t apply.`,
      done: hasRel(c.rel),
      skipped: skipped.has(c.key),
      anchorId: `onb-conn-${c.rel}`,
      icon: ROLE_ICON[c.role],
    })),
  ];
  // Step action: `module:<key>` opens that data section in the centre; anything
  // else scrolls to the DOM anchor of that name.
  const scrollToAnchor = (id?: string) => {
    if (!id) return;
    if (id.startsWith('module:')) { openModule(id.slice(7)); return; }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  // Mark a step skipped (persisted) so the guide moves on and onboarding can finish.
  const skipStep = (key: string) => setSkipped((prev) => {
    const next = new Set(prev); next.add(key); persistSkippedSteps(horseId, next); return next;
  });

  // Per-step prompt that opens the Stable Studio assistant ready to help.
  const HORSE_STEP_PROMPTS: Record<string, string> = {
    photo: `What information should I gather to complete ${horseName}'s profile? Give me a short checklist.`,
    basics: `Help me fill in ${horseName}'s sex, colour and foaling date.`,
    pedigree: `Help me record ${horseName}'s sire and dam.`,
    ...Object.fromEntries(CONNECTION_STEPS.map((c) => [c.key, `Help me add the ${c.noun} for ${horseName}.`])),
  };
  const askAiForStep = (step: OnbStep) => askAgent(HORSE_STEP_PROMPTS[step.key] ?? `Help me with ${horseName}'s ${step.label.toLowerCase()}.`);

  // ── Onboarding guide content: the floating mascot's per-step title + tips. ──
  const HORSE_COACH: Record<string, { title: string; tips: string[] }> = {
    photo: { title: 'Add a clear photo', tips: ['A side-on, well-lit shot works best', 'JPG or PNG'] },
    basics: { title: 'Add the basics', tips: ['Sex, colour & foaling date', 'The foaling date sets the age'] },
    pedigree: { title: 'Record the pedigree', tips: ['Sire & dam — names alone already help'] },
    ...Object.fromEntries(CONNECTION_STEPS.map((c) => [c.key, {
      title: c.title,
      tips: [`Type a name to link or create the ${c.noun}`, 'Optional — tap Skip if it doesn’t apply'],
    }])),
  };
  const activeStep = onbSteps.find((s) => !s.done && !s.skipped);
  const activeKey = activeStep?.key;
  const showGuide = editableHorse && !onbAllDone;
  const isActive = (key: string) => showGuide && activeKey === key;
  // When the active step is a connection, glow + point at that left-rail box.
  const activeConnRel = CONNECTION_STEPS.find((c) => c.key === activeKey)?.rel ?? null;
  const guideSteps: GuideStep[] = onbSteps.map((s) => ({
    key: s.key,
    label: s.label,
    title: HORSE_COACH[s.key]?.title ?? s.label,
    tips: HORSE_COACH[s.key]?.tips,
    anchorId: s.anchorId,
    pointerId: s.anchorId && !s.anchorId.startsWith('module:') ? s.anchorId : undefined,
    done: s.done || !!s.skipped,
  }));

  // ── Field descriptors (read-only in view, editable in edit) ──
  const unnamedCheckbox = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', color: 'var(--forest-mid)', padding: '2px 0 8px', ...serifStyle }}>
      <input type="checkbox" checked={!!horse.isUnnamed} disabled={!editableHorse} onChange={(e) => set({ isUnnamed: e.target.checked })} />
      Un-named (foal / yearling)
    </label>
  );

  const idFields: FieldDescriptor[] = [
    { label: 'Name', value: horse.name ?? '', displayValue: horse.isUnnamed ? 'Un-Named' : undefined, onSave: horse.isUnnamed ? undefined : (v) => set({ name: v }) },
    ...(isEdit ? [{ label: '__unnamed', value: '', render: unnamedCheckbox }] : []),
    { label: 'Foaled', type: 'date', value: horse.dob ?? '', displayValue: horse.dob ? new Date(horse.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined, onSave: (v) => set({ dob: v || undefined }) },
    { label: 'Sex', type: 'select', options: SEX_OPTIONS, value: horse.sex ?? '', onSave: (v) => set({ sex: v.trim() || undefined }) },
    { label: 'Colour', type: 'select', options: COLOUR_OPTIONS, value: horse.colour ?? '', onSave: (v) => set({ colour: v.trim() || undefined }) },
    { label: 'Country', type: 'select', options: COUNTRY_OPTIONS, value: horse.country ?? '', onSave: (v) => set({ country: v.trim() || undefined }) },
    { label: 'Hands', type: 'number', value: horse.handsSize != null ? String(horse.handsSize) : '', onSave: (v) => set({ handsSize: num(v) }) },
    { label: 'Metric (cm)', type: 'number', value: horse.metricSize != null ? String(horse.metricSize) : '', onSave: (v) => set({ metricSize: num(v) }) },
  ];

  const pedFields: FieldDescriptor[] = [
    { label: 'Sire', value: horse.sire ?? '', onSave: (v) => set({ sire: v.trim() || undefined }), highlight: true },
    { label: "Sire's Sire", value: horse.sireSire ?? '', onSave: (v) => set({ sireSire: v.trim() || undefined }) },
    { label: "Sire's Dam", value: horse.sireDam ?? '', onSave: (v) => set({ sireDam: v.trim() || undefined }) },
    { label: 'Dam', value: horse.dam ?? '', onSave: (v) => set({ dam: v.trim() || undefined }), highlight: true },
    { label: 'Dam YOB', type: 'number', value: horse.damYob != null ? String(horse.damYob) : '', onSave: (v) => set({ damYob: num(v) }) },
    { label: "Dam's Sire", value: horse.damSire ?? '', onSave: (v) => set({ damSire: v.trim() || undefined }) },
    { label: "Dam's Dam", value: horse.damDam ?? '', onSave: (v) => set({ damDam: v.trim() || undefined }) },
  ];

  const racingFields: FieldDescriptor[] = [
    { label: 'Career record', value: horse.careerRecord ?? '', onSave: (v) => set({ careerRecord: v.trim() || undefined }) },
    { label: 'Winnings', type: 'number', value: horse.careerWinnings != null ? String(horse.careerWinnings) : '', displayValue: horse.careerWinnings != null ? '$' + horse.careerWinnings.toLocaleString('en-AU') : undefined, onSave: (v) => set({ careerWinnings: num(v) }), highlight: true },
    { label: 'Last 10 form', value: horse.lastTenForm ?? '', onSave: (v) => set({ lastTenForm: v.trim() || undefined }) },
    { label: 'Season record', value: horse.seasonRecord ?? '', onSave: (v) => set({ seasonRecord: v.trim() || undefined }) },
    { label: 'Current rating', type: 'number', value: horse.currentRating != null ? String(horse.currentRating) : '', onSave: (v) => set({ currentRating: num(v) }), highlight: true },
  ];

  const studbookFields: FieldDescriptor[] = [
    { label: 'Stud book', value: horse.studBook ?? '', onSave: (v) => set({ studBook: v.trim() || undefined }) },
    { label: 'Registration no.', value: horse.registrationNumber ?? '', onSave: (v) => set({ registrationNumber: v.trim() || undefined }), highlight: true },
    { label: 'Microchip', value: horse.microchip ?? '', onSave: (v) => set({ microchip: v.trim() || undefined }) },
    { label: 'Brand / freeze', value: horse.brandFreeze ?? '', onSave: (v) => set({ brandFreeze: v.trim() || undefined }) },
    { label: 'Passport no.', value: horse.passportNumber ?? '', onSave: (v) => set({ passportNumber: v.trim() || undefined }) },
  ];

  const featuredCaption = (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(26,51,34,0.92) 0%, rgba(26,51,34,0.55) 65%, transparent 100%)', padding: '24px 16px 10px', ...serifStyle }}>
      <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-bright)', marginBottom: 2 }}>Featured Thoroughbred</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--parchment)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{horseName}</div>
    </div>
  );

  // These editable cards are NOT stacked in the default body anymore — they open
  // in the centre when their matching right-rail tile is clicked (keeps the page
  // lean: default = photo + Identity + Pedigree). See `moduleEditCard` below.
  const racingCard = <IdentityCard title="Racing Summary" icon={<Trophy size={12} style={{ color: 'var(--gold-bright)' }} />} fields={racingFields} editable={editableHorse} />;
  const studbookCard = <IdentityCard title="Stud Book" icon={<Binary size={12} style={{ color: 'var(--gold-bright)' }} />} fields={studbookFields} editable={editableHorse} />;
  const notesCard = (
    <div className="sku-gold-card" style={{ ...serifStyle }}>
      <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Pencil size={12} style={{ color: 'var(--gold-bright)' }} />
        <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Notes</span>
      </div>
      <div className="sku-parchment" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <InlineEditRow label="Pull quote" value={horse.pullQuote ?? ''} onSave={(v) => set({ pullQuote: v.trim() || undefined })} editable={editableHorse} />
        <InlineEditTextArea
          label="Pedigree / general notes"
          value={horse.pedigreeNotes ?? ''}
          onSave={(v) => set({ pedigreeNotes: v })}
          editable={editableHorse}
          rows={3}
          aiLabel="Pedigree / general notes"
          aiKey="pedigreeNotes"
          entityKind="horse"
          getContext={() => ({
            name: horseName, sex: horse.sex, colour: horse.colour, country: horse.country,
            sire: horse.sire, sireSire: horse.sireSire, sireDam: horse.sireDam,
            dam: horse.dam, damSire: horse.damSire, damDam: horse.damDam,
            careerRecord: horse.careerRecord,
          })}
        />
      </div>
    </div>
  );

  const centerDefault = (
    <>
      {editableHorse && (onbAllDone
        ? <OnboardingComplete title="Profile complete!" subtitle={`${horseName} is ready to view.`} onViewPublic={() => navigate(`/horses/${horseId}`)} />
        : <OnboardingSteps title={`Finish ${horseName}'s profile`} steps={onbSteps} onStepClick={scrollToAnchor} />
      )}

      <div id="onb-photo">
        <PortraitFrame src={horse.imageUrl} alt={horseName} editable={editableHorse} kind="horse" onUpload={(url) => set({ imageUrl: url })} containerStyle={{ height: 'clamp(300px, 46vh, 520px)', minHeight: 300 }} caption={featuredCaption} label={!horse.imageUrl ? 'Add a photo to begin' : undefined} className={isActive('photo') ? 'onb-spotlight' : undefined} />
      </div>

      <div id="onb-identity" style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 14, alignItems: 'stretch' }}>
        <IdentityCard title="Identity" fields={idFields} editable={editableHorse} className={isActive('basics') ? 'onb-spotlight' : undefined} />
        <IdentityCard title="Pedigree" icon={<BookMarked size={12} style={{ color: 'var(--gold-bright)' }} />} fields={pedFields} editable={editableHorse} className={isActive('pedigree') ? 'onb-spotlight' : undefined} />
      </div>

      {editableHorse && !isActive('racing') && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 0', fontSize: '0.58rem', fontStyle: 'italic', color: 'var(--gold-dark)', ...serifStyle }}>
          <ArrowRight size={11} /> Racing, Stud Book, Notes &amp; more open here — pick a Data Section on the right.
        </div>
      )}
    </>
  );

  // ── Active module (edit adds an inline "Add record" affordance) ──
  const renderAddForm = () => {
    switch (activeModule) {
      case 'media':   return <MediaDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'racing':  return <RacingDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'sales':   return <SalesDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'reports': return <ReportsDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      default: return null;
    }
  };
  // In edit mode, the heavy editable cards live with their matching data tile so
  // they open in the centre on click (instead of stacking down the default body).
  const moduleEditCard = editableHorse
    ? (activeModule === 'racing' ? racingCard
      : activeModule === 'studbook' ? studbookCard
      : activeModule === 'pedigree' ? notesCard
      : null)
    : null;

  const centerModule = activeModule ? (
    <>
      {moduleEditCard && <div style={{ marginBottom: 10 }}>{moduleEditCard}</div>}
      {editableHorse && canAdd && (
        <div style={{ marginBottom: 10 }}>
          {addOpen ? (
            <div className="sku-gold-card" style={{ ...serifStyle }}>
              <div className="sku-green-header" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ ...goldStyle, fontSize: '0.56rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>Add {ADD_LABELS[activeModule]}</span>
                <button onClick={closeAdd} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} style={{ color: 'var(--gold-mid)' }} /></button>
              </div>
              <div className="sku-parchment" style={{ padding: '12px' }}>{renderAddForm()}</div>
            </div>
          ) : (
            <button onClick={() => setAddOpen(true)} className="sku-gold-btn" style={{ padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, ...serifStyle }}>
              <Plus size={13} /> Add {ADD_LABELS[activeModule]}
            </button>
          )}
        </div>
      )}
      {renderProfileModule(activeModule, { scope, subjectName: horseName, onClose: closeModule, onOpenHorse: goHorse })}
    </>
  ) : null;

  // ── Left rail — always-on, multi-party, dated role boxes (view + edit) ──
  const allHorsesButton = (
    <button onClick={() => navigate('/horses')} className="sku-gold-btn" style={{ marginTop: 4, padding: '7px 0', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...serifStyle }}>
      <ChevronRight size={12} style={{ color: 'var(--forest-deep)', transform: 'rotate(180deg)' }} />
      <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest-deep)', fontWeight: 700 }}>View All Horses</span>
    </button>
  );

  const left = (
    <div id="onb-connections" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <RoleConnectionsRail
        horseId={horseId}
        editable={editableHorse}
        onOpenParty={(pid) => navigate(`/parties/${pid}`)}
        reportsActive={activeModule === 'reports'}
        onOpenReports={() => openModule('reports')}
        footer={allHorsesButton}
        spotlightRel={showGuide ? activeConnRel : null}
      />
    </div>
  );

  // ── Crest card ──
  const provisionalBadge = (
    <span title="Hidden from the public until a staff member verifies it" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 3, border: '1px solid var(--gold-dark)', background: 'rgba(14,36,22,0.6)', color: 'var(--gold-bright)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
      <Clock size={11} /> Unverified · hidden from public
    </span>
  );
  const crest = (
    <div className="sku-gold-card">
      <OrnateCrest name={horseName} subtitle={crestSubtitle} compact />
      <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {isEdit ? (
          isUnverified ? provisionalBadge : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gold-mid)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
              <Check size={11} /> Verified
            </span>
          )
        ) : (
          /* Public page = read-only preview: no owner edit chrome. Editing is
             reached only from the private studio (Dashboard → your horses). */
          <FollowButton horseId={horse.id} />
        )}
        <DossierMeter filled={dossierFilled} total={dossierFlags.length} />
      </div>
    </div>
  );

  // ── Breadcrumb ──
  const crumbs: Crumb[] = isEdit
    ? [
        ...(onBack ? [{ label: '← Back', onClick: onBack }] : []),
        { label: horseName, onClick: moduleOpen ? closeModule : undefined },
        ...(activeModuleLabel(activeModule) ? [{ label: activeModuleLabel(activeModule)!, active: true }] : []),
      ]
    : [
        { label: 'Thoroughbreds', onClick: () => navigate('/horses') },
        { label: horseName, onClick: moduleOpen ? closeModule : undefined },
        ...(activeModuleLabel(activeModule) ? [{ label: activeModuleLabel(activeModule)!, active: true }] : []),
      ];

  const breadcrumbRight = (
    <>
      {editableHorse ? (
        <StudioLauncher />
      ) : (
        <AskAgentButton
          variant="ornate"
          prompt="Tell me about this horse — its connections, recent form, and anything notable."
          label="Ask"
        />
      )}
      <span style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-dark)', ...serifStyle }}>Stable Press · Racing Almanac</span>
    </>
  );

  return (
    <ProfileScaffold
      crumbs={crumbs}
      breadcrumbRight={breadcrumbRight}
      left={left}
      crest={crest}
      centerDefault={centerDefault}
      centerModule={centerModule}
      moduleKey={activeModule}
      right={<DataSectionsRail activeModule={activeModule} onToggle={openModule} />}
      overlay={editableHorse
        ? (showGuide
          ? <OnboardingGuide steps={guideSteps} name="Stablehand" onShowMe={scrollToAnchor} onAskStep={(s) => askAiForStep(onbSteps.find((o) => o.key === s.key) ?? onbSteps[0])} onSkipStep={(s) => skipStep(s.key)} />
          : <ProfileAgentPanel />)
        : undefined}
    />
  );
}
