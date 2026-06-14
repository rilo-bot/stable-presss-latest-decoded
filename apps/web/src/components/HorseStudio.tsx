/**
 * HorseStudio — in-profile horse management rendered in the SAME ornate magazine
 * layout as the public HorseDetail page (left-rail connections / centre crest +
 * portrait + data / right-rail data sections) — only editable. Opened inline as
 * an overlay from PartyStudio / the dashboard (no route change). Click any field
 * or the photo to edit; everything auto-saves. Linking a connection notifies that
 * party. Records (media / racing / sales / reports) are added inline.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Clock, Plus, Loader2, ChevronRight, X, Check, BookOpen, Trophy,
  Binary, FileText, Camera, TrendingUp, ShoppingCart, Heart, Wand, Users, BookMarked,
} from 'lucide-react';
import { toast } from 'sonner';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useAuthStore } from '@/stores/authStore';
import { canManageHorse } from '@/rbac/can';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import type { Horse } from '@/types/horse';
import type { PartyRole } from '@/types/party';
import type { HorsePartyRelationshipType } from '@/types/horsePartyLink';
import { HORSE_PARTY_RELATIONSHIP_LABELS, isCurrentLink } from '@/types/horsePartyLink';
import {
  serifStyle, goldStyle, OrnateCrest, DataCategoryCard,
  type DataCategoryDef, type DataCardImgKey,
} from '@/components/profile/kit';
import {
  MediaSection, RacingSection, SalesSection, ReportsSection,
  PedigreeSection, StudBookSection, BreedingSection,
} from '@/components/profile/sections';
import { InlineEditRow, InlineEditTextArea, HeroImageEdit } from '@/components/profile/editable';
import { DossierMeter } from '@/components/DossierMeter';
import { MediaDataForm } from '@/components/MediaDataForm';
import { RacingDataForm } from '@/components/RacingDataForm';
import { SalesDataForm } from '@/components/SalesDataForm';
import { ReportsDataForm } from '@/components/ReportsDataForm';

/** Party roles that map to a relationship link (excludes those with no relType). */
const LINK_ROLES = Object.values(ROLE_BINDINGS)
  .filter((b) => b.relType)
  .map((b) => ({ role: b.role, rel: b.relType as HorsePartyRelationshipType, label: b.label }));

const DATA_CATEGORIES: DataCategoryDef[] = [
  { key: 'media',    label: 'Media Data',     sublabel: 'Photos, video & press',      icon: <Camera       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'media' },
  { key: 'racing',   label: 'Racing Data',    sublabel: 'Entries, results & form',    icon: <TrendingUp   size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'racing' },
  { key: 'breeding', label: 'Breeding Data',  sublabel: 'Foaling & paddock history',  icon: <Heart        size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'breeding' },
  { key: 'sales',    label: 'Sales Data',     sublabel: 'Auction & transfer history', icon: <ShoppingCart size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'sales' },
  { key: 'pedigree', label: 'Pedigree Data',  sublabel: 'Bloodlines & family tree',   icon: <Wand         size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'pedigree' },
  { key: 'studbook', label: 'Stud Book Data', sublabel: 'Official registry entries',  icon: <Binary       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'studbook' },
];

const ADD_LABELS: Record<string, string> = { media: 'media', racing: 'racing entry', sales: 'sale record', reports: 'document' };

const selectStyle: React.CSSProperties = {
  height: 30, background: 'var(--parchment)', border: '1px solid var(--gold-mid)', borderRadius: 3,
  padding: '0 6px', fontSize: '0.66rem', color: 'var(--forest-deep)', outline: 'none', ...serifStyle,
};

interface HorseStudioProps {
  horseId: string;
  onBack: () => void;
  /** Where "Back" returns to (e.g. the owner's profile name). */
  subjectLabel?: string;
}

export function HorseStudio({ horseId, onBack, subjectLabel }: HorseStudioProps) {
  const horses = useHorseStore((s) => s.horses);
  const updateHorse = useHorseStore((s) => s.updateHorse);
  const parties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const allLinks = useHorsePartyLinkStore((s) => s.links);
  const fetchLinks = useHorsePartyLinkStore((s) => s.fetchHorsePartyLinks);
  const addLink = useHorsePartyLinkStore((s) => s.addLink);
  const currentUser = useAuthStore((s) => s.currentUser);

  useEffect(() => { fetchLinks(); fetchParties(); }, [fetchLinks, fetchParties]);

  const horse = useMemo(() => horses.find((h) => h.id === horseId), [horses, horseId]);
  const editable = canManageHorse(currentUser, horseId, { horses, links: allLinks });

  const horseLinks = useMemo(() => allLinks.filter((l) => l.horse_id === horseId), [allLinks, horseId]);
  const partyName = (pid: string) => parties.find((p) => p.id === pid)?.name ?? 'Unknown party';

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => { setAddOpen(false); }, [activeModule]);

  const [showAddConn, setShowAddConn] = useState(false);
  const [addRole, setAddRole] = useState<PartyRole>('trainer');
  const [addPartyId, setAddPartyId] = useState('');

  if (!horse) {
    return (
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-background">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto animate-spin" />
          <p className="mt-2 text-sm">Loading horse…</p>
          <button onClick={onBack} className="mt-4 text-sm text-primary hover:underline">← Back</button>
        </div>
      </div>
    );
  }

  const horseName = horse.isUnnamed ? 'Un-Named' : (horse.name || 'New Horse');
  const isUnverified = horse.verificationStatus === 'unverified';
  const set = (patch: Partial<Horse>) => updateHorse(horseId, patch);
  const num = (v: string) => (v.trim() ? Number(v) : undefined);

  const sizeStr = horse.handsSize ? `${horse.handsSize}hh${horse.metricSize ? ` · ${horse.metricSize}m` : ''}` : undefined;
  const crestSubtitle = [horse.sex, horse.colour, sizeStr, horse.country, horse.dob ? `${new Date(horse.dob).getFullYear()} foal` : undefined].filter(Boolean).join(' · ');

  const addPartyOptions = parties.filter((p) => p.roles.includes(addRole));

  const submitConnection = async () => {
    if (!addPartyId) { toast.error('Choose a party to link.'); return; }
    const rel = LINK_ROLES.find((r) => r.role === addRole)?.rel;
    if (!rel) return;
    await addLink({
      horse_id: horseId,
      party_id: addPartyId,
      relationship_type: rel,
      start_date: new Date().toISOString().slice(0, 10),
    });
    toast.success(`${partyName(addPartyId)} linked as ${addRole}. They've been notified.`);
    setAddPartyId('');
    setShowAddConn(false);
  };

  const openModule = (key: string) => setActiveModule((p) => (p === key ? null : key));
  const closeModule = () => setActiveModule(null);
  const closeAdd = () => setAddOpen(false);
  const moduleOpen = activeModule !== null;
  const canAdd = !!activeModule && ['media', 'racing', 'sales', 'reports'].includes(activeModule);

  const renderSection = () => {
    switch (activeModule) {
      case 'media':    return <MediaSection horseIds={[horseId]} subjectName={horseName} onClose={closeModule} />;
      case 'racing':   return <RacingSection horseIds={[horseId]} horses={[horse]} subjectName={horseName} onClose={closeModule} />;
      case 'sales':    return <SalesSection horseIds={[horseId]} subjectName={horseName} onClose={closeModule} />;
      case 'reports':  return <ReportsSection horseIds={[horseId]} subjectName={horseName} onClose={closeModule} />;
      case 'pedigree': return <PedigreeSection horses={[horse]} subjectName={horseName} onClose={closeModule} />;
      case 'studbook': return <StudBookSection horses={[horse]} subjectName={horseName} onClose={closeModule} />;
      case 'breeding': return <BreedingSection horses={[horse]} subjectName={horseName} onClose={closeModule} />;
      default: return null;
    }
  };
  const renderAddForm = () => {
    switch (activeModule) {
      case 'media':   return <MediaDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'racing':  return <RacingDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'sales':   return <SalesDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'reports': return <ReportsDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      default: return null;
    }
  };

  const activeLabel = moduleOpen
    ? (activeModule === 'reports' ? 'Reports / Forms' : DATA_CATEGORIES.find((c) => c.key === activeModule)?.label ?? activeModule)
    : null;

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

  return (
    <div className="hs-overlay">
      {/* Breadcrumb */}
      <div style={{ background: 'linear-gradient(90deg, var(--forest-deep) 0%, var(--forest-mid) 100%)', borderBottom: '2px solid var(--gold-dark)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, ...serifStyle }}>
        <button onClick={onBack} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, ...serifStyle }}>
          <ArrowLeft size={11} /> {subjectLabel ? subjectLabel : 'Back'}
        </button>
        <ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} />
        <button onClick={closeModule} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: moduleOpen ? 'var(--gold-mid)' : 'var(--parchment)', background: 'none', border: 'none', cursor: moduleOpen ? 'pointer' : 'default', ...serifStyle }}>{horseName}</button>
        {activeLabel && (<><ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} /><span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-bright)', ...serifStyle }}>{activeLabel}</span></>)}
        <div style={{ flex: 1 }} />
        <button onClick={onBack} aria-label="Close" style={{ width: 26, height: 26, borderRadius: 3, border: '1px solid var(--gold-dark)', background: 'rgba(14,36,22,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={13} style={{ color: 'var(--gold-bright)' }} />
        </button>
      </div>

      <div className="hs-grid">
        {/* LEFT — Connections */}
        <div className="hs-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Connections</span>
            <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
          </div>

          <div className="sku-gold-card" style={{ ...serifStyle }}>
            <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={12} style={{ color: 'var(--gold-bright)' }} />
                <span style={{ ...goldStyle, fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>People · {horseLinks.length}</span>
              </span>
              {editable && (
                <button onClick={() => setShowAddConn((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', color: 'var(--forest-deep)', fontWeight: 700, fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', ...serifStyle }}>
                  <Plus size={10} /> Add
                </button>
              )}
            </div>
            <div className="sku-parchment" style={{ padding: '10px 12px' }}>
              {editable && showAddConn && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--parchment-dark)' }}>
                  <select value={addRole} onChange={(e) => { setAddRole(e.target.value as PartyRole); setAddPartyId(''); }} style={selectStyle}>
                    {LINK_ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                  </select>
                  <select value={addPartyId} onChange={(e) => setAddPartyId(e.target.value)} style={selectStyle}>
                    <option value="">{addPartyOptions.length ? `Select a ${addRole}…` : `No ${addRole}s in the register`}</option>
                    {addPartyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button onClick={submitConnection} className="sku-gold-btn" style={{ padding: '5px 0', fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, ...serifStyle }}>Link &amp; notify</button>
                </div>
              )}

              {horseLinks.length === 0 ? (
                <p style={{ fontSize: '0.66rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', textAlign: 'center', padding: '4px 0' }}>No connections yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {horseLinks.map((l, idx) => (
                    <li key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: idx < horseLinks.length - 1 ? '1px solid var(--parchment-dark)' : undefined, padding: '6px 0' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partyName(l.party_id)}</span>
                      <span style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--parchment-shadow)', flexShrink: 0 }}>
                        {HORSE_PARTY_RELATIONSHIP_LABELS[l.relationship_type]} · {isCurrentLink(l) ? 'cur' : 'past'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <button onClick={() => openModule('reports')} aria-pressed={activeModule === 'reports'} style={{ marginTop: 2, width: '100%', border: `2px solid ${activeModule === 'reports' ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)' }}>Reports / Forms</span></div>
            <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.64rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic' }}>Official documents &amp; reports</span><ChevronRight size={13} style={{ color: 'var(--gold-mid)' }} /></div>
          </button>

          <button onClick={onBack} className="sku-gold-btn" style={{ marginTop: 4, padding: '7px 0', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...serifStyle }}>
            <ChevronRight size={12} style={{ color: 'var(--forest-deep)', transform: 'rotate(180deg)' }} />
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest-deep)', fontWeight: 700 }}>{subjectLabel ? `Back to ${subjectLabel}` : 'Back'}</span>
          </button>
        </div>

        {/* CENTRE */}
        <div className="hs-col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sku-gold-card">
            <OrnateCrest name={horseName} subtitle={crestSubtitle} compact />
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              {isUnverified ? (
                <span title="Hidden from the public until a staff member verifies it" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 3, border: '1px solid var(--gold-dark)', background: 'rgba(14,36,22,0.6)', color: 'var(--gold-bright)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
                  <Clock size={11} /> Unverified · hidden from public
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gold-mid)', fontWeight: 700, fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
                  <Check size={11} /> Verified
                </span>
              )}
              <DossierMeter filled={dossierFilled} total={dossierFlags.length} />
            </div>
          </div>

          {moduleOpen ? (
            <AnimatePresence mode="wait">
              <motion.div key={activeModule} initial={{ opacity: 0, y: 8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                {editable && canAdd && (
                  <div style={{ marginBottom: 10 }}>
                    {addOpen ? (
                      <div className="sku-gold-card" style={{ ...serifStyle }}>
                        <div className="sku-green-header" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ ...goldStyle, fontSize: '0.56rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>Add {ADD_LABELS[activeModule!]}</span>
                          <button onClick={closeAdd} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} style={{ color: 'var(--gold-mid)' }} /></button>
                        </div>
                        <div className="sku-parchment" style={{ padding: '12px' }}>{renderAddForm()}</div>
                      </div>
                    ) : (
                      <button onClick={() => setAddOpen(true)} className="sku-gold-btn" style={{ padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, ...serifStyle }}>
                        <Plus size={13} /> Add {ADD_LABELS[activeModule!]}
                      </button>
                    )}
                  </div>
                )}
                {renderSection()}
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              {/* Hero photo — full-cover, shown right under the crest */}
              <HeroImageEdit
                src={horse.imageUrl}
                alt={horseName}
                editable={editable}
                kind="horse"
                onUpload={(url) => set({ imageUrl: url })}
                containerStyle={{ height: 'clamp(300px, 46vh, 520px)', minHeight: 300 }}
              >
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(26,51,34,0.92) 0%, rgba(26,51,34,0.55) 65%, transparent 100%)', padding: '24px 16px 10px', ...serifStyle }}>
                  <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-bright)', marginBottom: 2 }}>Featured Thoroughbred</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--parchment)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{horseName}</div>
                </div>
              </HeroImageEdit>

              {/* Identity + Pedigree row */}
              <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 14, alignItems: 'stretch' }}>
                <div className="sku-gold-card" style={{ ...serifStyle, display: 'flex', flexDirection: 'column' }}>
                  <div className="sku-green-header" style={{ padding: '7px 12px', textAlign: 'center' }}>
                    <span style={{ ...goldStyle, fontSize: '0.9rem', fontWeight: 700, ...serifStyle }}>Identity</span>
                  </div>
                  <div className="sku-parchment" style={{ padding: '10px 14px', flex: 1 }}>
                    <InlineEditRow label="Name" value={horse.name ?? ''} onSave={(v) => set({ name: v })} editable={editable && !horse.isUnnamed} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', color: 'var(--forest-mid)', padding: '2px 0 8px', ...serifStyle }}>
                      <input type="checkbox" checked={!!horse.isUnnamed} disabled={!editable} onChange={(e) => set({ isUnnamed: e.target.checked })} />
                      Un-named (foal / yearling)
                    </label>
                    <InlineEditRow label="Foaled" type="date" value={horse.dob ?? ''} displayValue={horse.dob ? new Date(horse.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} onSave={(v) => set({ dob: v || undefined })} editable={editable} />
                    <InlineEditRow label="Sex" value={horse.sex ?? ''} onSave={(v) => set({ sex: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label="Colour" value={horse.colour ?? ''} onSave={(v) => set({ colour: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label="Country" value={horse.country ?? ''} onSave={(v) => set({ country: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label="Hands" type="number" value={horse.handsSize != null ? String(horse.handsSize) : ''} onSave={(v) => set({ handsSize: num(v) })} editable={editable} />
                    <InlineEditRow label="Metric (cm)" type="number" value={horse.metricSize != null ? String(horse.metricSize) : ''} onSave={(v) => set({ metricSize: num(v) })} editable={editable} />
                  </div>
                </div>

                <div className="sku-gold-card" style={{ ...serifStyle, display: 'flex', flexDirection: 'column' }}>
                  <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BookMarked size={12} style={{ color: 'var(--gold-bright)' }} />
                    <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>Pedigree</span>
                  </div>
                  <div className="sku-parchment" style={{ padding: '10px 14px', flex: 1 }}>
                    <InlineEditRow label="Sire" value={horse.sire ?? ''} onSave={(v) => set({ sire: v.trim() || undefined })} editable={editable} highlight />
                    <InlineEditRow label="Sire's Sire" value={horse.sireSire ?? ''} onSave={(v) => set({ sireSire: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label="Sire's Dam" value={horse.sireDam ?? ''} onSave={(v) => set({ sireDam: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label="Dam" value={horse.dam ?? ''} onSave={(v) => set({ dam: v.trim() || undefined })} editable={editable} highlight />
                    <InlineEditRow label="Dam YOB" type="number" value={horse.damYob != null ? String(horse.damYob) : ''} onSave={(v) => set({ damYob: num(v) })} editable={editable} />
                    <InlineEditRow label="Dam's Sire" value={horse.damSire ?? ''} onSave={(v) => set({ damSire: v.trim() || undefined })} editable={editable} />
                    <InlineEditRow label="Dam's Dam" value={horse.damDam ?? ''} onSave={(v) => set({ damDam: v.trim() || undefined })} editable={editable} />
                  </div>
                </div>
              </div>

              {/* Racing Summary */}
              <div className="sku-gold-card" style={{ ...serifStyle }}>
                <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trophy size={12} style={{ color: 'var(--gold-bright)' }} />
                  <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Racing Summary</span>
                </div>
                <div className="sku-parchment" style={{ padding: '10px 14px' }}>
                  <InlineEditRow label="Career record" value={horse.careerRecord ?? ''} onSave={(v) => set({ careerRecord: v.trim() || undefined })} editable={editable} />
                  <InlineEditRow label="Winnings" type="number" value={horse.careerWinnings != null ? String(horse.careerWinnings) : ''} displayValue={horse.careerWinnings != null ? '$' + horse.careerWinnings.toLocaleString('en-AU') : ''} onSave={(v) => set({ careerWinnings: num(v) })} editable={editable} highlight />
                  <InlineEditRow label="Last 10 form" value={horse.lastTenForm ?? ''} onSave={(v) => set({ lastTenForm: v.trim() || undefined })} editable={editable} />
                  <InlineEditRow label="Season record" value={horse.seasonRecord ?? ''} onSave={(v) => set({ seasonRecord: v.trim() || undefined })} editable={editable} />
                  <InlineEditRow label="Current rating" type="number" value={horse.currentRating != null ? String(horse.currentRating) : ''} onSave={(v) => set({ currentRating: num(v) })} editable={editable} highlight />
                </div>
              </div>

              {/* Stud Book */}
              <div className="sku-gold-card" style={{ ...serifStyle }}>
                <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Binary size={12} style={{ color: 'var(--gold-bright)' }} />
                  <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Stud Book</span>
                </div>
                <div className="sku-parchment" style={{ padding: '10px 14px' }}>
                  <InlineEditRow label="Stud book" value={horse.studBook ?? ''} onSave={(v) => set({ studBook: v.trim() || undefined })} editable={editable} />
                  <InlineEditRow label="Registration no." value={horse.registrationNumber ?? ''} onSave={(v) => set({ registrationNumber: v.trim() || undefined })} editable={editable} highlight />
                  <InlineEditRow label="Microchip" value={horse.microchip ?? ''} onSave={(v) => set({ microchip: v.trim() || undefined })} editable={editable} />
                  <InlineEditRow label="Brand / freeze" value={horse.brandFreeze ?? ''} onSave={(v) => set({ brandFreeze: v.trim() || undefined })} editable={editable} />
                  <InlineEditRow label="Passport no." value={horse.passportNumber ?? ''} onSave={(v) => set({ passportNumber: v.trim() || undefined })} editable={editable} />
                </div>
              </div>

              {/* Notes */}
              <div className="sku-gold-card" style={{ ...serifStyle }}>
                <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BookOpen size={12} style={{ color: 'var(--gold-bright)' }} />
                  <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Notes</span>
                </div>
                <div className="sku-parchment" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <InlineEditRow label="Pull quote" value={horse.pullQuote ?? ''} onSave={(v) => set({ pullQuote: v.trim() || undefined })} editable={editable} />
                  <InlineEditTextArea label="Pedigree / general notes" value={horse.pedigreeNotes ?? ''} onSave={(v) => set({ pedigreeNotes: v })} editable={editable} rows={3} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT — Data Sections */}
        <div className="hs-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      <style>{`
        .hs-overlay { position: fixed; inset: 0; z-index: 70; overflow-y: auto; background: linear-gradient(180deg, var(--forest-deep) 0%, #111e17 100%); }
        .hs-grid { display: grid; grid-template-columns: minmax(200px, 260px) 1fr minmax(130px, 170px); gap: 16px; padding: 14px 20px 48px; max-width: 1320px; margin: 0 auto; width: 100%; align-items: start; }
        .hs-col { min-width: 0; }
        @media (max-width: 900px) { .hs-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
