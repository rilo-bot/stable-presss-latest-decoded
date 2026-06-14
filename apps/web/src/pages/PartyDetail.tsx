import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, ChevronRight, X, User, Briefcase, Flag, BookOpen, Shield, Users,
  Camera, TrendingUp, ShoppingCart, Heart, Wand, Binary, FileText, Trophy, Contact, Plus, Pencil,
} from 'lucide-react';
import { usePartyStore } from '@/stores/partyStore';
import { useHorseStore } from '@/stores/horseStore';
import { useArticleStore } from '@/stores/articleStore';
import { useAuthStore } from '@/stores/authStore';
import { canManageParty } from '@/rbac/can';
import { PartyForm } from '@/components/PartyForm';
import { HorseForm } from '@/components/HorseForm';
import { HorseStudio } from '@/components/HorseStudio';
import type { Party, PartyRole } from '@/types/party';
import { PARTY_ROLE_LABELS } from '@/types/party';
import { useProfileScope } from '@/hooks/useProfileScope';
import { ROLE_BINDINGS, PROFILE_ROLES, resolveActiveRole } from '@/lib/profile/roleMap';
import type { PanelParty } from '@/lib/profile/types';
import { FollowButton } from '@/components/FollowButton';
import { DossierMeter } from '@/components/DossierMeter';
import {
  serifStyle, goldStyle, partyPhoto, fmtMoney, fmtDate, OrnateCrest,
  DataCategoryCard, EntityTile, FALLBACK_IMAGES,
  type DataCategoryDef, type DataCardImgKey,
} from '@/components/profile/kit';
import {
  MediaSection, RacingSection, SalesSection, ReportsSection,
  PedigreeSection, StudBookSection, BreedingSection,
} from '@/components/profile/sections';

/* Role → fallback-image key used by partyPhoto */
const ROLE_IMG_KEY: Record<PartyRole, string> = {
  owner: 'owner', trainer: 'trainer', jockey: 'jockey', breeder: 'breeder',
  'bloodstock agent': 'personnel', 'syndicate manager': 'syndicate', personnel: 'personnel',
};

/* Icon per role for the left-rail tiles */
const ROLE_ICON: Record<PartyRole, React.ReactNode> = {
  owner: <User size={12} strokeWidth={1.8} />,
  trainer: <Briefcase size={12} strokeWidth={1.8} />,
  jockey: <Flag size={12} strokeWidth={1.8} />,
  breeder: <BookOpen size={12} strokeWidth={1.8} />,
  'bloodstock agent': <Contact size={12} strokeWidth={1.8} />,
  'syndicate manager': <Shield size={12} strokeWidth={1.8} />,
  personnel: <Users size={12} strokeWidth={1.8} />,
};

/* Order related-role tiles appear in the left rail */
const REL_ORDER: PartyRole[] = ['owner', 'trainer', 'jockey', 'breeder', 'syndicate manager', 'bloodstock agent', 'personnel'];

const DATA_CATEGORIES: DataCategoryDef[] = [
  { key: 'media',    label: 'Media Data',     sublabel: 'Photos, video & press',      icon: <Camera       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'media' },
  { key: 'racing',   label: 'Racing Data',    sublabel: 'Entries, results & form',    icon: <TrendingUp   size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'racing' },
  { key: 'sales',    label: 'Sales Data',     sublabel: 'Auction & transfer history', icon: <ShoppingCart size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'sales' },
  { key: 'breeding', label: 'Breeding Data',  sublabel: 'Foaling & paddock history',  icon: <Heart        size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'breeding' },
  { key: 'pedigree', label: 'Pedigree Data',  sublabel: 'Bloodlines & family tree',   icon: <Wand         size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'pedigree' },
  { key: 'studbook', label: 'Stud Book Data', sublabel: 'Official registry entries',  icon: <Binary       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'studbook' },
];

export default function PartyDetail() {
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  useEffect(() => { fetchParties(); fetchHorses(); fetchArticles(); }, [fetchParties, fetchHorses, fetchArticles]);

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [registerHorseOpen, setRegisterHorseOpen] = useState(false);
  const [studioHorseId, setStudioHorseId] = useState<string | null>(null);
  const currentUser = useAuthStore((s) => s.currentUser);

  // Reset any open module when the subject changes (recursive re-pointing).
  useEffect(() => { setActiveModule(null); }, [id, searchParams.get('role')]);

  const parties = usePartyStore((s) => s.parties);

  if (!id) return <Navigate to="/parties" replace />;

  const party: Party | undefined = useMemo(() => parties.find((p) => p.id === id), [parties, id]);

  const activeRole = useMemo(
    () => resolveActiveRole(party?.roles ?? [], searchParams.get('role')),
    [party, searchParams],
  );

  const subject = useMemo(
    () => (party ? ({ kind: 'party', party, role: activeRole } as const) : null),
    [party, activeRole],
  );

  const scope = useProfileScope(subject);

  // Loading / not-found: parties may still be fetching.
  if (parties.length > 0 && !party) return <Navigate to="/parties" replace />;

  const roleLabel = ROLE_BINDINGS[activeRole]?.label ?? 'Profile';
  const isOwner = canManageParty(currentUser, id);
  const partyName = party?.name ?? 'Loading…';
  const heroImg = party ? partyPhoto(party, ROLE_IMG_KEY[activeRole]) : FALLBACK_IMAGES.owner;

  const switchableRoles = (party?.roles ?? []).filter((r) => PROFILE_ROLES.includes(r));

  // Related-role tiles (exclude the central role itself).
  const relTiles = REL_ORDER
    .filter((r) => r !== activeRole && scope.relationshipTiles[r]?.length > 0)
    .map((r) => ({ role: r, parties: scope.relationshipTiles[r] }));

  // Dossier completeness across the modules.
  const dossierFlags = [
    scope.summary.horseCount > 0,
    relTiles.length > 0,
    scope.horseIds.length > 0, // media/racing/sales/reports are scoped to horses
    scope.summary.wins > 0,
    !!party?.profession,
    !!party?.base_location,
  ];
  const dossierFilled = dossierFlags.filter(Boolean).length;

  const openModule = (key: string) => setActiveModule((p) => (p === key ? null : key));
  const closeModule = () => setActiveModule(null);
  const goParty = (pid: string) => { setSearchParams({}); navigate(`/parties/${pid}`); };
  const goHorse = (hid: string) => navigate(`/horses/${hid}`);

  const identityRows = party ? [
    { label: 'Role', value: roleLabel },
    ...(party.profession ? [{ label: 'Profession', value: party.profession }] : []),
    ...(party.date_of_birth ? [{ label: 'Date of Birth', value: fmtDate(party.date_of_birth) }] : []),
    ...(party.country_of_birth ? [{ label: 'Country', value: party.country_of_birth }] : []),
    ...(party.base_location ? [{ label: 'Base', value: party.base_location }] : []),
    ...(party.started_year ? [{ label: `${roleLabel} Since`, value: String(party.started_year) }] : []),
  ] : [];

  const summaryCells = [
    { label: 'Horses', value: String(scope.summary.horseCount) },
    { label: 'Winnings', value: scope.summary.totalWinnings > 0 ? fmtMoney(scope.summary.totalWinnings) : '—' },
    { label: 'Wins', value: String(scope.summary.wins) },
    { label: 'Top Rating', value: scope.summary.topRating !== undefined ? String(scope.summary.topRating) : '—' },
  ];

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
        <button onClick={() => navigate('/parties')} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', background: 'none', border: 'none', cursor: 'pointer', ...serifStyle }}>Parties</button>
        <ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} />
        <button onClick={closeModule} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: moduleOpen ? 'var(--gold-mid)' : 'var(--parchment)', background: 'none', border: 'none', cursor: moduleOpen ? 'pointer' : 'default', ...serifStyle }}>{partyName}</button>
        {activeLabel && (<><ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} /><span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-bright)', ...serifStyle }}>{activeLabel}</span></>)}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-dark)', ...serifStyle }}>Stable Press · {roleLabel}</span>
      </div>

      <div className="party-grid">
        {/* LEFT — Connections */}
        <div className="party-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Connections</span>
            <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
          </div>

          {relTiles.length === 0 && (
            <div style={{ padding: '10px 12px', border: '1px solid var(--gold-dark)', borderRadius: 3, background: 'rgba(26,51,34,0.5)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', ...serifStyle }}>No connected parties yet.</span>
            </div>
          )}
          {relTiles.map(({ role, parties: rp }) => {
            const primary: PanelParty = rp[0];
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
                onClick={() => goParty(primary.party.id)}
              />
            );
          })}

          <button onClick={() => openModule('reports')} aria-pressed={activeModule === 'reports'} style={{ marginTop: 2, width: '100%', border: `2px solid ${activeModule === 'reports' ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)' }}>Reports / Forms</span></div>
            <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.64rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic' }}>Official documents &amp; reports</span><ChevronRight size={13} style={{ color: 'var(--gold-mid)' }} /></div>
          </button>

          <button onClick={() => navigate('/parties')} className="sku-gold-btn" style={{ marginTop: 4, padding: '7px 0', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...serifStyle }}>
            <ChevronRight size={12} style={{ color: 'var(--forest-deep)', transform: 'rotate(180deg)' }} />
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest-deep)', fontWeight: 700 }}>All Parties</span>
          </button>
        </div>

        {/* CENTRE */}
        <div className="party-col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sku-gold-card">
            <OrnateCrest
              name={partyName}
              subtitle={[roleLabel, party?.profession, party?.base_location].filter(Boolean).join(' · ')}
            />
            {/* Role switcher */}
            {switchableRoles.length > 1 && (
              <div style={{ background: 'rgba(26,51,34,0.6)', borderTop: '1px solid var(--gold-dark)', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', ...serifStyle }}>View as:</span>
                {switchableRoles.map((r) => (
                  <button key={r} onClick={() => setSearchParams(r === party?.roles[0] ? {} : { role: r })} style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '3px 9px', borderRadius: 3, cursor: 'pointer', ...serifStyle, border: `1px solid ${r === activeRole ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, background: r === activeRole ? 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))' : 'transparent', color: r === activeRole ? 'var(--forest-deep)' : 'var(--gold-mid)' }}>
                    {PARTY_ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            )}
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <FollowButton horseId={`party:${id}`} label={`Follow This ${roleLabel}`} />
              {isOwner && (
                <button onClick={() => setEditProfileOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', color: 'var(--forest-deep)', fontWeight: 700, fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', ...serifStyle }}>
                  <Pencil size={11} /> Edit Profile
                </button>
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
                    <span style={{ ...goldStyle, fontSize: '0.9rem', fontWeight: 700, ...serifStyle }}>{partyName}</span>
                  </div>
                  <div className="sku-parchment" style={{ padding: '10px 14px', flex: 1 }}>
                    {identityRows.map(({ label, value }, i) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: i < identityRows.length - 1 ? '1px solid var(--parchment-shadow)' : undefined, paddingBottom: 5, marginBottom: 5, gap: 8 }}>
                        <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700 }}>{label}</dt>
                        <dd style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', fontWeight: 700, textAlign: 'right', margin: 0 }}>{value}</dd>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ position: 'relative', minHeight: 180, border: '3px solid var(--gold-mid)', boxShadow: '0 0 0 1px var(--gold-dark), 0 6px 24px rgba(0,0,0,0.7)', borderRadius: 4, overflow: 'hidden', background: 'var(--forest-deep)' }}>
                  <img src={heroImg} alt={partyName} crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.5) 100%)' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(26,51,34,0.92) 0%, transparent 100%)', padding: '24px 14px 10px', ...serifStyle }}>
                    <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-bright)' }}>{roleLabel}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--parchment)' }}>{partyName}</div>
                  </div>
                  {isOwner && (
                    <button onClick={() => setEditProfileOpen(true)} title="Upload your photo" style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'rgba(14,36,22,0.85)', color: 'var(--gold-bright)', cursor: 'pointer', fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
                      <Camera size={11} /> Photo
                    </button>
                  )}
                </div>
              </div>

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

              {/* Horses connected to this party */}
              <div className="sku-gold-card" style={{ ...serifStyle }}>
                <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BookOpen size={12} style={{ color: 'var(--gold-bright)' }} />
                    <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Horses · {scope.horses.length}</span>
                  </span>
                  {isOwner && (
                    <button onClick={() => setRegisterHorseOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', color: 'var(--forest-deep)', fontWeight: 700, fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', ...serifStyle }}>
                      <Plus size={11} /> Register Horse
                    </button>
                  )}
                </div>
                <div className="sku-parchment" style={{ padding: '8px 10px' }}>
                  {scope.horses.length === 0 ? (
                    <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', textAlign: 'center', padding: '8px 0' }}>No horses connected to this {roleLabel.toLowerCase()} yet.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {scope.horses.map((h, idx) => (
                        <li key={h.id} style={{ borderBottom: idx < scope.horses.length - 1 ? '1px solid var(--parchment-dark)' : undefined }}>
                          <button onClick={() => (isOwner ? setStudioHorseId(h.id) : goHorse(h.id))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ width: 34, height: 34, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0, background: 'var(--forest-deep)' }}>
                              {h.imageUrl && <img src={h.imageUrl} alt={h.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.isUnnamed ? 'Un-Named' : h.name}</div>
                              <div style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)' }}>{[h.sex, h.colour, h.careerRecord].filter(Boolean).join(' · ')}</div>
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

      {party && isOwner && (
        <>
          <PartyForm open={editProfileOpen} onOpenChange={setEditProfileOpen} party={party} />
          <HorseForm open={registerHorseOpen} onClose={() => setRegisterHorseOpen(false)} defaultOwnerId={id} memberMode />
        </>
      )}

      {studioHorseId && (
        <HorseStudio horseId={studioHorseId} onBack={() => setStudioHorseId(null)} subjectLabel={partyName} />
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
