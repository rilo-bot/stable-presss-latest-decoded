import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronRight, Camera, Plus, Trophy, FileText,
  Camera as MediaIcon, TrendingUp, ShoppingCart, Heart, Wand, Binary,
} from 'lucide-react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useAuthStore } from '@/stores/authStore';
import { canManageHorse } from '@/rbac/can';
import { connectionResolver } from '@/lib/horseConnections';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import type { PartyRole } from '@/types/party';
import type { HorsePartyRelationshipType } from '@/types/horsePartyLink';
import { HORSE_PARTY_RELATIONSHIP_LABELS, isCurrentLink } from '@/types/horsePartyLink';
import {
  serifStyle, goldStyle, fmtMoney, fmtDate, OrnateCrest, DataCategoryCard,
  FALLBACK_IMAGES, type DataCategoryDef, type DataCardImgKey,
} from '@/components/profile/kit';
import {
  MediaSection, RacingSection, SalesSection, ReportsSection,
  PedigreeSection, StudBookSection, BreedingSection,
} from '@/components/profile/sections';
import { HorseForm } from '@/components/HorseForm';
import { toast } from 'sonner';

const HERO_FALLBACK =
  'https://images.pexels.com/photos/11341116/pexels-photo-11341116.jpeg?auto=compress&cs=tinysrgb&h=900';

const DATA_CATEGORIES: DataCategoryDef[] = [
  { key: 'media', label: 'Media Data', sublabel: 'Photos, video & press', icon: <MediaIcon size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'media' },
  { key: 'racing', label: 'Racing Data', sublabel: 'Entries, results & form', icon: <TrendingUp size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'racing' },
  { key: 'sales', label: 'Sales Data', sublabel: 'Auction & transfer history', icon: <ShoppingCart size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'sales' },
  { key: 'breeding', label: 'Breeding Data', sublabel: 'Foaling & paddock history', icon: <Heart size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'breeding' },
  { key: 'pedigree', label: 'Pedigree Data', sublabel: 'Bloodlines & family tree', icon: <Wand size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'pedigree' },
  { key: 'studbook', label: 'Stud Book Data', sublabel: 'Official registry entries', icon: <Binary size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'studbook' },
];

/** Party roles that map to a relationship link (excludes syndicate manager — no relType). */
const LINK_ROLES = Object.values(ROLE_BINDINGS)
  .filter((b) => b.relType)
  .map((b) => ({ role: b.role, rel: b.relType as HorsePartyRelationshipType, label: b.label }));

interface HorseStudioProps {
  horseId: string;
  onBack: () => void;
  /** Where "Back" returns to (e.g. the owner's profile name). */
  subjectLabel?: string;
}

/**
 * In-profile horse management — the horse-detail layout rendered inline (no route
 * change). Owners upload the centre image, edit details, view every data module,
 * and add party connections (which notify the linked party via the server).
 */
export function HorseStudio({ horseId, onBack, subjectLabel }: HorseStudioProps) {
  const horses = useHorseStore((s) => s.horses);
  const parties = usePartyStore((s) => s.parties);
  const allLinks = useHorsePartyLinkStore((s) => s.links);
  const fetchLinks = useHorsePartyLinkStore((s) => s.fetchHorsePartyLinks);
  const addLink = useHorsePartyLinkStore((s) => s.addLink);
  const currentUser = useAuthStore((s) => s.currentUser);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const horse = useMemo(() => horses.find((h) => h.id === horseId), [horses, horseId]);
  const editable = canManageHorse(currentUser, horseId, { horses, links: allLinks });
  const conn = useMemo(() => connectionResolver(parties)(horse ?? ({} as never)), [parties, horse]);

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addRole, setAddRole] = useState<PartyRole>('trainer');
  const [addPartyId, setAddPartyId] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  // Current links for this horse (the connection list).
  const horseLinks = useMemo(
    () => allLinks.filter((l) => l.horse_id === horseId),
    [allLinks, horseId],
  );
  const partyName = (pid: string) => parties.find((p) => p.id === pid)?.name ?? 'Unknown party';

  if (!horse) {
    return (
      <div style={overlay}>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--parchment)' }}>
          <p style={serifStyle}>Loading horse…</p>
          <button onClick={onBack} style={backBtn}>← Back</button>
        </div>
      </div>
    );
  }

  const horseName = horse.isUnnamed ? 'Un-Named' : horse.name;
  const heroImg = horse.imageUrl?.trim() ? horse.imageUrl : HERO_FALLBACK;
  const isUnverified = horse.verificationStatus === 'unverified';
  const close = () => setActiveModule(null);

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
    setShowAdd(false);
  };

  const renderModule = () => {
    switch (activeModule) {
      case 'media': return <MediaSection horseIds={[horseId]} subjectName={horseName} onClose={close} />;
      case 'racing': return <RacingSection horseIds={[horseId]} horses={[horse]} subjectName={horseName} onClose={close} />;
      case 'sales': return <SalesSection horseIds={[horseId]} subjectName={horseName} onClose={close} />;
      case 'reports': return <ReportsSection horseIds={[horseId]} subjectName={horseName} onClose={close} />;
      case 'pedigree': return <PedigreeSection horses={[horse]} subjectName={horseName} onClose={close} />;
      case 'studbook': return <StudBookSection horses={[horse]} subjectName={horseName} onClose={close} />;
      case 'breeding': return <BreedingSection horses={[horse]} subjectName={horseName} onClose={close} />;
      default: return null;
    }
  };

  const identityRows = [
    { label: 'Sex', value: horse.sex },
    { label: 'Colour', value: horse.colour },
    { label: 'Country', value: horse.country },
    { label: 'Foaled', value: horse.dob ? fmtDate(horse.dob) : undefined },
    { label: 'Sire', value: horse.sire },
    { label: 'Dam', value: horse.dam },
    { label: 'Rating', value: horse.currentRating ? String(horse.currentRating) : undefined },
    { label: 'Career', value: horse.careerRecord },
    { label: 'Winnings', value: horse.careerWinnings ? fmtMoney(horse.careerWinnings) : undefined },
    { label: 'Owner', value: conn.owner || undefined },
    { label: 'Trainer', value: conn.trainer || undefined },
  ].filter((r) => r.value) as { label: string; value: string }[];

  return (
    <div style={overlay}>
      <div className="party-grid" style={{ paddingTop: 8 }}>
        {/* Top bar spanning the grid via the left column header pattern */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '2px solid var(--gold-dark)', paddingBottom: 8, marginBottom: 2 }}>
          <button onClick={onBack} style={backBtn}>
            <ArrowLeft size={12} /> {subjectLabel ? `Back to ${subjectLabel}` : 'Back'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isUnverified && (
              <span style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--forest-deep)', background: 'var(--gold-mid)', padding: '3px 8px', borderRadius: 3, ...serifStyle }}>
                Unverified · pending review
              </span>
            )}
            {editable && (
              <button onClick={() => setEditOpen(true)} className="sku-gold-btn" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', ...serifStyle, fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                <Camera size={12} /> Edit Horse &amp; Photo
              </button>
            )}
          </div>
        </div>

        {/* LEFT — connections */}
        <div className="party-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Connections</span>
            {editable && (
              <button onClick={() => setShowAdd((v) => !v)} title="Add connection" style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--gold-bright)', cursor: 'pointer', padding: '2px 6px', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em', ...serifStyle }}>
                <Plus size={10} /> Add
              </button>
            )}
          </div>

          {editable && showAdd && (
            <div style={{ border: '1px solid var(--gold-mid)', borderRadius: 3, background: 'rgba(26,51,34,0.6)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <select value={addRole} onChange={(e) => { setAddRole(e.target.value as PartyRole); setAddPartyId(''); }} style={selectStyle}>
                {LINK_ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
              </select>
              <select value={addPartyId} onChange={(e) => setAddPartyId(e.target.value)} style={selectStyle}>
                <option value="">{addPartyOptions.length ? `Select a ${addRole}…` : `No ${addRole}s in database`}</option>
                {addPartyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={submitConnection} className="sku-gold-btn" style={{ padding: '5px 0', ...serifStyle, fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                Link &amp; notify
              </button>
            </div>
          )}

          {horseLinks.length === 0 ? (
            <div style={{ padding: '10px 12px', border: '1px solid var(--gold-dark)', borderRadius: 3, background: 'rgba(26,51,34,0.5)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', ...serifStyle }}>No connections yet.</span>
            </div>
          ) : (
            horseLinks.map((l) => (
              <div key={l.id} style={{ border: '1px solid var(--gold-dark)', borderRadius: 3, background: 'var(--parchment)', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{partyName(l.party_id)}</span>
                <span style={{ fontSize: '0.54rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700 }}>
                  {HORSE_PARTY_RELATIONSHIP_LABELS[l.relationship_type]} {isCurrentLink(l) ? '· current' : '· past'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* CENTRE — image + identity / open module */}
        <div className="party-col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sku-gold-card">
            <OrnateCrest name={horseName} subtitle={[horse.sex, horse.colour, horse.country].filter(Boolean).join(' · ')} />
          </div>

          {activeModule ? (
            renderModule()
          ) : (
            <>
              <div style={{ position: 'relative', minHeight: 240, border: '3px solid var(--gold-mid)', boxShadow: '0 0 0 1px var(--gold-dark), 0 6px 24px rgba(0,0,0,0.7)', borderRadius: 4, overflow: 'hidden', background: 'var(--forest-deep)' }}>
                <img src={heroImg} alt={horseName} crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.5) 100%)' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(26,51,34,0.92) 0%, transparent 100%)', padding: '28px 14px 12px', ...serifStyle }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--parchment)' }}>{horseName}</div>
                </div>
                {editable && (
                  <button onClick={() => setEditOpen(true)} title="Upload horse photo" style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'rgba(14,36,22,0.85)', color: 'var(--gold-bright)', cursor: 'pointer', fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', ...serifStyle }}>
                    <Camera size={11} /> Photo
                  </button>
                )}
              </div>

              <div className="sku-gold-card" style={{ ...serifStyle }}>
                <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trophy size={12} style={{ color: 'var(--gold-bright)' }} />
                  <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Horse Record</span>
                </div>
                <div className="sku-parchment" style={{ padding: '10px 14px' }}>
                  {identityRows.length === 0 ? (
                    <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', textAlign: 'center' }}>No details recorded yet{editable ? ' — use Edit Horse to add them.' : '.'}</p>
                  ) : identityRows.map(({ label, value }, i) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: i < identityRows.length - 1 ? '1px solid var(--parchment-shadow)' : undefined, paddingBottom: 5, marginBottom: 5, gap: 8 }}>
                      <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700 }}>{label}</dt>
                      <dd style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', fontWeight: 700, textAlign: 'right', margin: 0 }}>{value}</dd>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT — data modules */}
        <div className="party-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Data Sections</span>
            <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
          </div>
          {DATA_CATEGORIES.map((cat) => (
            <DataCategoryCard key={cat.key} label={cat.label} sublabel={cat.sublabel} icon={cat.icon} imgKey={cat.imgKey as DataCardImgKey} active={activeModule === cat.key} onClick={() => setActiveModule((p) => (p === cat.key ? null : cat.key))} />
          ))}
          <button onClick={() => setActiveModule((p) => (p === 'reports' ? null : 'reports'))} aria-pressed={activeModule === 'reports'} style={{ width: '100%', border: `2px solid ${activeModule === 'reports' ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)' }}>Reports / Forms</span></div>
            <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.62rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic' }}>Official documents &amp; reports</span><ChevronRight size={13} style={{ color: 'var(--gold-mid)' }} /></div>
          </button>
        </div>
      </div>

      {editable && <HorseForm open={editOpen} onClose={() => setEditOpen(false)} editHorse={horse} memberMode />}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 70, overflowY: 'auto',
  background: 'linear-gradient(180deg, var(--forest-deep) 0%, #111e17 100%)',
  padding: '14px 20px 40px',
};
const backBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none',
  border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--gold-bright)',
  cursor: 'pointer', padding: '5px 10px', fontSize: '0.58rem', textTransform: 'uppercase',
  letterSpacing: '0.1em', fontWeight: 700, fontFamily: "'IM Fell English', Georgia, serif",
};
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '5px 7px', borderRadius: 3, border: '1px solid var(--gold-dark)',
  background: 'var(--parchment)', color: 'var(--forest-deep)', fontSize: '0.64rem',
  fontFamily: "'IM Fell English', Georgia, serif",
};
