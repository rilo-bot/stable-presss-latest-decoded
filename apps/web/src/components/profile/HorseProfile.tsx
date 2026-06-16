/**
 * HorseProfile — the single container behind BOTH the public horse page
 * (`/horses/:id`, mode="view") and the editable horse studio
 * (`/horses/:id/edit`, mode="edit"). Built on the shared kit + useProfileScope
 * (which fetches links + entries), so a cold direct load resolves correctly —
 * unlike the old HorseDetail, which never fetched horses/links. One layout, two
 * modes; all hooks run before any conditional return (no Rules-of-Hooks bug).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Clock, Check, Plus, Loader2, ChevronRight, X, Users, BookMarked, Trophy, Binary, FileText, Pencil,
} from 'lucide-react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useAuthStore } from '@/stores/authStore';
import { canManageHorse } from '@/rbac/can';
import { useProfileScope } from '@/hooks/useProfileScope';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import type { Horse } from '@/types/horse';
import type { PartyRole } from '@/types/party';
import type { HorsePartyRelationshipType } from '@/types/horsePartyLink';
import { HORSE_PARTY_RELATIONSHIP_LABELS, isCurrentLink } from '@/types/horsePartyLink';
import { serifStyle, goldStyle, OrnateCrest } from '@/components/profile/kit';
import { ProfileScaffold, type Crumb } from '@/components/profile/ProfileScaffold';
import { IdentityCard, type FieldDescriptor } from '@/components/profile/IdentityCard';
import { PortraitFrame } from '@/components/profile/PortraitFrame';
import { ConnectionsRail, type RelTile } from '@/components/profile/ConnectionsRail';
import { DataSectionsRail } from '@/components/profile/DataSectionsRail';
import { REL_ORDER, renderProfileModule, activeModuleLabel } from '@/components/profile/modules';
import { InlineEditRow, InlineEditTextArea } from '@/components/profile/editable';
import { DossierMeter } from '@/components/DossierMeter';
import { FollowButton } from '@/components/FollowButton';
import { AskAgentButton } from '@/components/AskAgentButton';
import { MediaDataForm } from '@/components/MediaDataForm';
import { RacingDataForm } from '@/components/RacingDataForm';
import { SalesDataForm } from '@/components/SalesDataForm';
import { ReportsDataForm } from '@/components/ReportsDataForm';

type Mode = 'view' | 'edit';

/** Party roles that map to a relationship link (excludes those with no relType). */
const LINK_ROLES = Object.values(ROLE_BINDINGS)
  .filter((b) => b.relType)
  .map((b) => ({ role: b.role, rel: b.relType as HorsePartyRelationshipType, label: b.label }));

const ADD_LABELS: Record<string, string> = { media: 'media', racing: 'racing entry', sales: 'sale record', reports: 'document' };

const selectStyle: React.CSSProperties = {
  height: 30, background: 'var(--parchment)', border: '1px solid var(--gold-mid)', borderRadius: 3,
  padding: '0 6px', fontSize: '0.66rem', color: 'var(--forest-deep)', outline: 'none', ...serifStyle,
};

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
  const parties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const allLinks = useHorsePartyLinkStore((s) => s.links);
  const linksLoaded = useHorsePartyLinkStore((s) => s.loaded);
  const addLink = useHorsePartyLinkStore((s) => s.addLink);
  const currentUser = useAuthStore((s) => s.currentUser);

  // Fetch horses + parties on mount; useProfileScope fetches links + entries.
  // (The old HorseDetail fetched neither horses nor links → empty on cold load.)
  useEffect(() => { fetchHorses(); fetchParties(); }, [fetchHorses, fetchParties]);

  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [showAddConn, setShowAddConn] = useState(false);
  const [addRole, setAddRole] = useState<PartyRole>('trainer');
  const [addPartyId, setAddPartyId] = useState('');
  useEffect(() => { setAddOpen(false); }, [activeModule]);

  const horse = useMemo(() => horses.find((h) => h.id === horseId), [horses, horseId]);
  const editable = canManageHorse(currentUser, horseId, { horses, links: allLinks });

  const subject = useMemo(
    () => (horse ? ({ kind: 'horse', horse } as const) : null),
    [horse],
  );
  const scope = useProfileScope(subject);

  const horseLinks = useMemo(() => allLinks.filter((l) => l.horse_id === horseId), [allLinks, horseId]);

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

  const partyName = (pid: string) => parties.find((p) => p.id === pid)?.name ?? 'Unknown party';
  const addPartyOptions = parties.filter((p) => p.roles.includes(addRole));

  const submitConnection = async () => {
    if (!addPartyId) { toast.error('Choose a party to link.'); return; }
    const rel = LINK_ROLES.find((r) => r.role === addRole)?.rel;
    if (!rel) return;
    await addLink({ horse_id: horseId, party_id: addPartyId, relationship_type: rel, start_date: new Date().toISOString().slice(0, 10) });
    toast.success(`${partyName(addPartyId)} linked as ${addRole}. They've been notified.`);
    setAddPartyId('');
    setShowAddConn(false);
  };

  const openModule = (key: string) => setActiveModule((p) => (p === key ? null : key));
  const closeModule = () => setActiveModule(null);
  const closeAdd = () => setAddOpen(false);
  const moduleOpen = activeModule !== null;
  const canAdd = !!activeModule && ['media', 'racing', 'sales', 'reports'].includes(activeModule);

  const goHorse = (hid: string) => navigate(isEdit ? `/horses/${hid}/edit` : `/horses/${hid}`);

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
    { label: 'Sex', value: horse.sex ?? '', onSave: (v) => set({ sex: v.trim() || undefined }) },
    { label: 'Colour', value: horse.colour ?? '', onSave: (v) => set({ colour: v.trim() || undefined }) },
    { label: 'Country', value: horse.country ?? '', onSave: (v) => set({ country: v.trim() || undefined }) },
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

  const centerDefault = (
    <>
      <PortraitFrame src={horse.imageUrl} alt={horseName} editable={editableHorse} kind="horse" onUpload={(url) => set({ imageUrl: url })} containerStyle={{ height: 'clamp(300px, 46vh, 520px)', minHeight: 300 }} caption={featuredCaption} />

      <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 14, alignItems: 'stretch' }}>
        <IdentityCard title="Identity" fields={idFields} editable={editableHorse} />
        <IdentityCard title="Pedigree" icon={<BookMarked size={12} style={{ color: 'var(--gold-bright)' }} />} fields={pedFields} editable={editableHorse} />
      </div>

      <IdentityCard title="Racing Summary" icon={<Trophy size={12} style={{ color: 'var(--gold-bright)' }} />} fields={racingFields} editable={editableHorse} />
      <IdentityCard title="Stud Book" icon={<Binary size={12} style={{ color: 'var(--gold-bright)' }} />} fields={studbookFields} editable={editableHorse} />

      <div className="sku-gold-card" style={{ ...serifStyle }}>
        <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Pencil size={12} style={{ color: 'var(--gold-bright)' }} />
          <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Notes</span>
        </div>
        <div className="sku-parchment" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InlineEditRow label="Pull quote" value={horse.pullQuote ?? ''} onSave={(v) => set({ pullQuote: v.trim() || undefined })} editable={editableHorse} />
          <InlineEditTextArea label="Pedigree / general notes" value={horse.pedigreeNotes ?? ''} onSave={(v) => set({ pedigreeNotes: v })} editable={editableHorse} rows={3} />
        </div>
      </div>
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
  const centerModule = activeModule ? (
    <>
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

  // ── Left rail ──
  const reportsButton = (
    <button onClick={() => openModule('reports')} aria-pressed={activeModule === 'reports'} style={{ marginTop: 2, width: '100%', border: `2px solid ${activeModule === 'reports' ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
      <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)' }}>Reports / Forms</span></div>
      <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.64rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic' }}>Official documents &amp; reports</span><ChevronRight size={13} style={{ color: 'var(--gold-mid)' }} /></div>
    </button>
  );
  const allHorsesButton = (
    <button onClick={() => navigate('/horses')} className="sku-gold-btn" style={{ marginTop: 4, padding: '7px 0', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...serifStyle }}>
      <ChevronRight size={12} style={{ color: 'var(--forest-deep)', transform: 'rotate(180deg)' }} />
      <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest-deep)', fontWeight: 700 }}>View All Horses</span>
    </button>
  );

  const relTiles: RelTile[] = REL_ORDER
    .filter((r) => scope.relationshipTiles[r]?.length > 0)
    .map((r) => ({ role: r, parties: scope.relationshipTiles[r] }));

  const left = isEdit ? (
    <>
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
      {reportsButton}
      {allHorsesButton}
    </>
  ) : (
    <ConnectionsRail
      tiles={relTiles}
      emptyText="No connected parties yet."
      onOpenParty={(pid) => navigate(`/parties/${pid}`)}
      reportsActive={activeModule === 'reports'}
      onOpenReports={() => openModule('reports')}
      footer={allHorsesButton}
    />
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
          <>
            <FollowButton horseId={horse.id} />
            {editable && isUnverified && provisionalBadge}
            {editable && (
              <button onClick={() => navigate(`/horses/${horseId}/edit`)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', color: 'var(--forest-deep)', fontWeight: 700, fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', ...serifStyle }}>
                <Pencil size={11} /> Edit
              </button>
            )}
          </>
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
      <AskAgentButton
        variant="ornate"
        prompt={isEdit ? "Help me complete this horse's profile — what details should I add?" : 'Tell me about this horse — its connections, recent form, and anything notable.'}
        label="Ask"
      />
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
    />
  );
}
