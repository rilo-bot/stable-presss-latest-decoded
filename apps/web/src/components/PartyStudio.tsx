/**
 * PartyStudio — the member's OWN profile hub, rendered in the SAME ornate
 * magazine layout as the public party/horse details pages (left-rail connections
 * / centre crest + portrait + data / right-rail data sections) — only editable.
 * Click any field or your photo to edit; everything auto-saves. Register horses
 * at the bottom; clicking one opens the matching editable HorseStudio.
 *
 * Shown to the member-owner of a party (provisional access); the public and staff
 * see the read-only PartyDetail. `?public=1` lets an owner preview that view.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, X, Clock, Plus, Loader2, Trophy, BookOpen, User, Briefcase,
  Flag, Shield, Users, Contact, FileText, Camera, TrendingUp, ShoppingCart,
  Heart, Wand, Binary, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorseStore } from '@/stores/horseStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useMemberOnboardingStore } from '@/stores/memberOnboardingStore';
import { canManageParty } from '@/rbac/can';
import { horsesLinkedToParty } from '@/rbac/scope';
import { useProfileScope } from '@/hooks/useProfileScope';
import { ROLE_BINDINGS, resolveActiveRole } from '@/lib/profile/roleMap';
import {
  PARTY_ROLE_LABELS, PERSONNEL_SUBTYPES, PERSONNEL_SUBTYPE_LABELS, getStartedYearLabel,
} from '@/types/party';
import type { Party, PartyRole, PersonnelSubtype } from '@/types/party';
import {
  serifStyle, goldStyle, partyPhoto, fmtMoney, fmtDate, OrnateCrest,
  DataCategoryCard, EntityTile,
  type DataCategoryDef, type DataCardImgKey,
} from '@/components/profile/kit';
import {
  MediaSection, RacingSection, SalesSection, ReportsSection,
  PedigreeSection, StudBookSection, BreedingSection,
} from '@/components/profile/sections';
import { InlineEditRow, HeroImageEdit } from '@/components/profile/editable';
import { DossierMeter } from '@/components/DossierMeter';
import { HorseStudio } from '@/components/HorseStudio';
import { AskAgentButton } from '@/components/AskAgentButton';

/* Role → fallback-image key used by partyPhoto */
const ROLE_IMG_KEY: Record<PartyRole, string> = {
  owner: 'owner', trainer: 'trainer', jockey: 'jockey', breeder: 'breeder',
  'bloodstock agent': 'personnel', 'syndicate manager': 'syndicate', personnel: 'personnel',
};

const ROLE_ICON: Record<PartyRole, React.ReactNode> = {
  owner: <User size={12} strokeWidth={1.8} />,
  trainer: <Briefcase size={12} strokeWidth={1.8} />,
  jockey: <Flag size={12} strokeWidth={1.8} />,
  breeder: <BookOpen size={12} strokeWidth={1.8} />,
  'bloodstock agent': <Contact size={12} strokeWidth={1.8} />,
  'syndicate manager': <Shield size={12} strokeWidth={1.8} />,
  personnel: <Users size={12} strokeWidth={1.8} />,
};

const REL_ORDER: PartyRole[] = ['owner', 'trainer', 'jockey', 'breeder', 'syndicate manager', 'bloodstock agent', 'personnel'];

const DATA_CATEGORIES: DataCategoryDef[] = [
  { key: 'media',    label: 'Media Data',     sublabel: 'Photos, video & press',      icon: <Camera       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'media' },
  { key: 'racing',   label: 'Racing Data',    sublabel: 'Entries, results & form',    icon: <TrendingUp   size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'racing' },
  { key: 'sales',    label: 'Sales Data',     sublabel: 'Auction & transfer history', icon: <ShoppingCart size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'sales' },
  { key: 'breeding', label: 'Breeding Data',  sublabel: 'Foaling & paddock history',  icon: <Heart        size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'breeding' },
  { key: 'pedigree', label: 'Pedigree Data',  sublabel: 'Bloodlines & family tree',   icon: <Wand         size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'pedigree' },
  { key: 'studbook', label: 'Stud Book Data', sublabel: 'Official registry entries',  icon: <Binary       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'studbook' },
];

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

interface PartyStudioProps {
  partyId: string;
  /** Optional back affordance (e.g. when opened from the dashboard). */
  onBack?: () => void;
}

export function PartyStudio({ partyId, onBack }: PartyStudioProps) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const parties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const updateParty = usePartyStore((s) => s.updateParty);
  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const addHorse = useHorseStore((s) => s.addHorse);
  const links = useHorsePartyLinkStore((s) => s.links);
  const fetchLinks = useHorsePartyLinkStore((s) => s.fetchHorsePartyLinks);
  const dismissedWelcome = useMemberOnboardingStore((s) => !!s.dismissedByUser[currentUser?.id ?? '']);
  const dismissWelcome = useMemberOnboardingStore((s) => s.dismiss);

  // Force a fresh parties pull on entry: a just-signed-up member's party was
  // minted after the store last loaded, so a cached fetch would miss it (the
  // infinite "Loading your profile…" on first visit).
  useEffect(() => { fetchParties(true); fetchHorses(); fetchLinks(); }, [fetchParties, fetchHorses, fetchLinks]);

  const [studioHorseId, setStudioHorseId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [newHorseName, setNewHorseName] = useState('');
  const [adding, setAdding] = useState(false);

  const party = useMemo(() => parties.find((p) => p.id === partyId), [parties, partyId]);
  const editable = canManageParty(currentUser, partyId);
  const activeRole = useMemo(() => resolveActiveRole(party?.roles ?? [], null), [party]);
  const subject = useMemo(
    () => (party ? ({ kind: 'party', party, role: activeRole } as const) : null),
    [party, activeRole],
  );
  const scope = useProfileScope(subject);

  const myHorses = useMemo(() => {
    const linked = new Set(horsesLinkedToParty(partyId, { horses, links }));
    return horses.filter((h) => linked.has(h.id) || h.createdByUserId === currentUser?.id);
  }, [horses, links, partyId, currentUser]);

  if (!party) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <Loader2 className="mx-auto animate-spin" /> <p className="mt-2 text-sm">Loading your profile…</p>
      </div>
    );
  }

  const roles = party.roles ?? [];
  const roleLabel = ROLE_BINDINGS[activeRole]?.label ?? 'Member';
  const partyName = party.name || 'Your name';
  const age = calcAge(party.date_of_birth);
  const isUnverified = party.verificationStatus === 'unverified';
  const subtypes = party.personnel_subtype ?? [];
  const set = (patch: Partial<Party>) => updateParty(partyId, patch);

  const toggleSubtype = (s: PersonnelSubtype) => {
    const next = subtypes.includes(s) ? subtypes.filter((x) => x !== s) : [...subtypes, s];
    void set({ personnel_subtype: next });
  };

  const onAddHorse = async () => {
    const name = newHorseName.trim();
    if (!name) { toast.error('Enter a horse name.'); return; }
    setAdding(true);
    try {
      await addHorse({ name, pedigreeNotes: '', ownerIds: [partyId] });
      toast.success(`${name} registered — open it to add details.`);
      setNewHorseName('');
    } finally {
      setAdding(false);
    }
  };

  const relTiles = REL_ORDER
    .filter((r) => scope.relationshipTiles[r]?.length > 0)
    .map((r) => ({ role: r, parties: scope.relationshipTiles[r] }));

  const dossierFlags = [
    myHorses.length > 0,
    relTiles.length > 0,
    !!party.photo,
    !!party.profession,
    !!party.base_location,
    !!party.date_of_birth,
  ];
  const dossierFilled = dossierFlags.filter(Boolean).length;

  const summaryCells = [
    { label: 'Horses', value: String(myHorses.length) },
    { label: 'Winnings', value: scope.summary.totalWinnings > 0 ? fmtMoney(scope.summary.totalWinnings) : '—' },
    { label: 'Wins', value: String(scope.summary.wins) },
    { label: 'Top Rating', value: scope.summary.topRating !== undefined ? String(scope.summary.topRating) : '—' },
  ];

  const openModule = (key: string) => setActiveModule((p) => (p === key ? null : key));
  const closeModule = () => setActiveModule(null);
  const goHorse = (hid: string) => setStudioHorseId(hid);

  const renderModule = () => {
    if (!activeModule) return null;
    const name = `${partyName} · ${roleLabel}`;
    switch (activeModule) {
      case 'media':    return <MediaSection horseIds={scope.horseIds} subjectName={partyName} onClose={closeModule} onOpenHorse={goHorse} />;
      case 'racing':   return <RacingSection horseIds={scope.horseIds} horses={scope.horses} subjectName={partyName} onClose={closeModule} onOpenHorse={goHorse} />;
      case 'sales':    return <SalesSection horseIds={scope.horseIds} subjectName={partyName} onClose={closeModule} onOpenHorse={goHorse} />;
      case 'reports':  return <ReportsSection horseIds={scope.horseIds} subjectName={partyName} onClose={closeModule} onOpenHorse={goHorse} />;
      case 'pedigree': return <PedigreeSection horses={scope.horses} subjectName={name} onClose={closeModule} onOpenHorse={goHorse} />;
      case 'studbook': return <StudBookSection horses={scope.horses} subjectName={name} onClose={closeModule} onOpenHorse={goHorse} />;
      case 'breeding': return <BreedingSection horses={scope.horses} subjectName={name} onClose={closeModule} onOpenHorse={goHorse} />;
      default: return null;
    }
  };

  const moduleOpen = activeModule !== null;
  const activeLabel = moduleOpen
    ? (activeModule === 'reports' ? 'Reports / Forms' : DATA_CATEGORIES.find((c) => c.key === activeModule)?.label ?? activeModule)
    : null;

  return (
    <div className="party-page">
      {/* Breadcrumb */}
      <div style={{ background: 'linear-gradient(90deg, var(--forest-deep) 0%, var(--forest-mid) 100%)', borderBottom: '2px solid var(--gold-dark)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, ...serifStyle }}>
        {onBack && (
          <button onClick={onBack} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', background: 'none', border: 'none', cursor: 'pointer', ...serifStyle }}>← Back</button>
        )}
        {onBack && <ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} />}
        <button onClick={closeModule} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: moduleOpen ? 'var(--gold-mid)' : 'var(--parchment)', background: 'none', border: 'none', cursor: moduleOpen ? 'pointer' : 'default', ...serifStyle }}>My Profile</button>
        {activeLabel && (<><ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} /><span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-bright)', ...serifStyle }}>{activeLabel}</span></>)}
        <div style={{ flex: 1 }} />
        <AskAgentButton
          variant="ornate"
          prompt="Help me complete my profile — what details should I add and how?"
          label="Ask"
        />
        <span style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-dark)', ...serifStyle }}>Stable Press · {roleLabel}</span>
      </div>

      {/* First-run welcome strip (dismissible per user) */}
      {editable && !dismissedWelcome && (
        <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%', padding: '0 20px' }}>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', border: '1px solid var(--gold-mid)', borderRadius: 4, background: 'linear-gradient(90deg, rgba(180,140,30,0.16) 0%, rgba(26,51,34,0.55) 100%)', ...serifStyle }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--parchment)', margin: 0 }}>Welcome to Stable Press 👋</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--gold-mid)', marginTop: 4, lineHeight: 1.55, margin: '4px 0 0' }}>
                This is your profile — the same view the public sees, only editable. Click any field or your photo
                to update it; changes save as you go. Register your horses below whenever you like — there&rsquo;s no
                rush, and nothing is public until a staff member verifies it.
              </p>
            </div>
            <button onClick={() => currentUser && dismissWelcome(currentUser.id)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--gold-mid)', background: 'none', border: 'none', cursor: 'pointer', ...serifStyle }}>
              Skip <X size={12} />
            </button>
          </div>
        </div>
      )}

      <div className="party-grid">
        {/* LEFT — Connections */}
        <div className="party-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Connections</span>
            <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
          </div>

          {relTiles.length === 0 && (
            <div style={{ padding: '10px 12px', border: '1px solid var(--gold-dark)', borderRadius: 3, background: 'rgba(26,51,34,0.5)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', ...serifStyle }}>No connected parties yet. Link them from a horse&rsquo;s screen.</span>
            </div>
          )}
          {relTiles.map(({ role, parties: rp }) => {
            const primary = rp[0];
            const imgKey = ROLE_IMG_KEY[role];
            const secondary = primary.party.base_location || primary.party.profession || PARTY_ROLE_LABELS[role];
            return (
              <EntityTile
                key={role}
                title={`${PARTY_ROLE_LABELS[role]}s`}
                icon={ROLE_ICON[role]}
                primaryName={rp.length > 1 ? `${primary.party.name} +${rp.length - 1}` : primary.party.name}
                secondaryLine={secondary}
                count={rp.length}
                imgSrc={partyPhoto(primary.party, imgKey)}
                onClick={() => navigate(`/parties/${primary.party.id}`)}
              />
            );
          })}

          <button onClick={() => openModule('reports')} aria-pressed={activeModule === 'reports'} style={{ marginTop: 2, width: '100%', border: `2px solid ${activeModule === 'reports' ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)' }}>Reports / Forms</span></div>
            <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.64rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic' }}>Official documents &amp; reports</span><ChevronRight size={13} style={{ color: 'var(--gold-mid)' }} /></div>
          </button>

          <button onClick={() => navigate(`/parties/${partyId}`)} className="sku-gold-btn" style={{ marginTop: 4, padding: '7px 0', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...serifStyle }}>
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest-deep)', fontWeight: 700 }}>Preview Public Profile</span>
          </button>
        </div>

        {/* CENTRE */}
        <div className="party-col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sku-gold-card">
            <OrnateCrest
              name={partyName}
              subtitle={[roleLabel, party.profession, party.base_location].filter(Boolean).join(' · ')}
            />
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              {isUnverified ? (
                <span title="Visible only to you until a staff member verifies your claim" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 3, border: '1px solid var(--gold-dark)', background: 'rgba(14,36,22,0.6)', color: 'var(--gold-bright)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
                  <Clock size={11} /> Provisional · hidden from public
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gold-mid)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
                  <Check size={11} /> Verified profile
                </span>
              )}
              <DossierMeter filled={dossierFilled} total={dossierFlags.length} />
            </div>
          </div>

          {moduleOpen ? (
            <AnimatePresence mode="wait">
              <motion.div key={activeModule} initial={{ opacity: 0, y: 8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                {renderModule()}
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              {/* Identity card + portrait */}
              <div style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: 14, alignItems: 'stretch' }}>
                <div className="sku-gold-card" style={{ ...serifStyle, display: 'flex', flexDirection: 'column' }}>
                  <div className="sku-green-header" style={{ padding: '7px 12px', textAlign: 'center' }}>
                    <span style={{ ...goldStyle, fontSize: '0.9rem', fontWeight: 700, ...serifStyle }}>Identity</span>
                  </div>
                  <div className="sku-parchment" style={{ padding: '10px 14px', flex: 1 }}>
                    <InlineEditRow label="Full name" value={party.name ?? ''} onSave={(v) => set({ name: v.trim() })} editable={editable} />
                    {/* Role chips (read) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--parchment-shadow)', paddingBottom: 6, marginBottom: 6, gap: 8 }}>
                      <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, flexShrink: 0 }}>Role</dt>
                      <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                        {roles.length === 0 ? <span style={{ fontSize: '0.72rem', color: 'var(--parchment-shadow)' }}>—</span> : roles.map((r) => (
                          <span key={r} style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 2, border: '1px solid var(--gold-mid)', background: 'rgba(180,140,30,0.14)', color: 'var(--forest-deep)' }}>{PARTY_ROLE_LABELS[r]}</span>
                        ))}
                      </dd>
                    </div>
                    <InlineEditRow label="Profession" value={party.profession ?? ''} onSave={(v) => set({ profession: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label="Date of birth" type="date" value={party.date_of_birth ?? ''} displayValue={party.date_of_birth ? `${fmtDate(party.date_of_birth)}${age !== null ? ` · ${age}y` : ''}` : ''} onSave={(v) => set({ date_of_birth: v || undefined })} editable={editable} max={new Date().toISOString().split('T')[0]} />
                    <InlineEditRow label="Country of birth" value={party.country_of_birth ?? ''} onSave={(v) => set({ country_of_birth: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label="Base location" value={party.base_location ?? ''} onSave={(v) => set({ base_location: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label={getStartedYearLabel(roles)} type="number" value={party.started_year ? String(party.started_year) : ''} displayValue={party.started_year ? `${party.started_year} · ${CURRENT_YEAR - party.started_year}y` : ''} onSave={(v) => set({ started_year: v ? parseInt(v, 10) : undefined })} editable={editable} min={1900} max={CURRENT_YEAR} />
                  </div>
                </div>

                <HeroImageEdit
                  src={party.photo}
                  alt={partyName}
                  editable={editable}
                  kind="party"
                  onUpload={(url) => set({ photo: url })}
                  containerStyle={{ minHeight: 200 }}
                >
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(26,51,34,0.92) 0%, transparent 100%)', padding: '24px 14px 10px', ...serifStyle }}>
                    <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-bright)' }}>{roleLabel}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--parchment)' }}>{partyName}</div>
                  </div>
                </HeroImageEdit>
              </div>

              {/* Personnel subtypes (personnel role only) */}
              {roles.includes('personnel') && (
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

              {/* Career summary */}
              <div className="sku-gold-card" style={{ ...serifStyle }}>
                <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trophy size={12} style={{ color: 'var(--gold-bright)' }} />
                  <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>{roleLabel} Summary</span>
                </div>
                <div className="sku-parchment" style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {summaryCells.map((s, i) => (
                    <div key={s.label} style={{ textAlign: 'center', padding: '4px 2px', borderRight: i < summaryCells.length - 1 ? '1px solid var(--parchment-dark)' : undefined }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle, lineHeight: 1.1, wordBreak: 'break-word' }}>{s.value}</div>
                      <div style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* My Horses */}
              <div className="sku-gold-card" style={{ ...serifStyle }}>
                <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BookOpen size={12} style={{ color: 'var(--gold-bright)' }} />
                    <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>My Horses · {myHorses.length}</span>
                  </span>
                </div>
                <div className="sku-parchment" style={{ padding: '10px 12px' }}>
                  {editable && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
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
                  )}

                  {myHorses.length === 0 ? (
                    <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', textAlign: 'center', padding: '8px 0' }}>No horses yet — register one above to start your stable.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {myHorses.map((h, idx) => (
                        <li key={h.id} style={{ borderBottom: idx < myHorses.length - 1 ? '1px solid var(--parchment-dark)' : undefined }}>
                          <button onClick={() => setStudioHorseId(h.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ width: 34, height: 34, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0, background: 'var(--forest-deep)' }}>
                              {h.imageUrl && <img src={h.imageUrl} alt={h.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.isUnnamed ? 'Un-Named' : h.name}</div>
                              <div style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)' }}>
                                {[h.sex, h.colour, h.careerRecord].filter(Boolean).join(' · ') || 'Add details'}
                                {h.verificationStatus === 'unverified' && <span style={{ color: 'var(--gold-dark)' }}> · unverified</span>}
                              </div>
                            </div>
                            <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT — Data Sections */}
        <div className="party-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Data Sections</span>
            <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
          </div>
          {DATA_CATEGORIES.map((cat) => (
            <DataCategoryCard key={cat.key} label={cat.label} sublabel={cat.sublabel} icon={cat.icon} imgKey={cat.imgKey as DataCardImgKey} active={activeModule === cat.key} onClick={() => openModule(cat.key)} />
          ))}
          <div style={{ marginTop: 6, padding: '8px 10px', border: '1px solid var(--gold-dark)', borderRadius: 3, background: 'rgba(26,51,34,0.5)', textAlign: 'center', ...serifStyle }}>
            <span style={{ fontSize: '0.5rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-dark)', display: 'block' }}>✦ Stable Press ✦</span>
            <span style={{ fontSize: '0.52rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', display: 'block', marginTop: 3 }}>Racing Almanac</span>
          </div>
        </div>
      </div>

      {studioHorseId && (
        <HorseStudio horseId={studioHorseId} onBack={() => setStudioHorseId(null)} subjectLabel="My Profile" />
      )}

      <style>{`
        .party-page { background: linear-gradient(180deg, var(--forest-deep) 0%, #111e17 100%); min-height: calc(100vh - var(--navbar-h, 112px)); display: flex; flex-direction: column; }
        .party-grid { display: grid; grid-template-columns: minmax(200px, 260px) 1fr minmax(130px, 170px); gap: 16px; padding: 14px 20px 32px; max-width: 1320px; margin: 0 auto; width: 100%; flex: 1; align-items: start; }
        .party-col { min-width: 0; }
        @media (max-width: 900px) { .party-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
