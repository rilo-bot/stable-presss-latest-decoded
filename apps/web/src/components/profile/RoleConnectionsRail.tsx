/**
 * RoleConnectionsRail — the horse left rail. ALWAYS renders every role box
 * (Owners, Breeders, Trainers, Personnel, Jockeys, Syndicate Manager, Bloodstock
 * Agents) even when empty ("Not Recorded"), each box listing ALL linked parties
 * for that role with their start/end years + current flag. In edit mode each box
 * can add a connection — linking an EXISTING party or creating a NEW provisional
 * one (universal mechanism: writes to the same parties + horsePartyLinks
 * collections). Reports/Forms launcher + a footer button sit below.
 */
import { useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Plus, X, Check, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { usePartyStore } from '@/stores/partyStore';
import { serifStyle, goldStyle, Avatar, partyPhoto } from '@/components/profile/kit';
import { ROLE_ICON } from '@/components/profile/modules';
import { PARTY_ROLE_LABELS } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import type { HorsePartyLink, HorsePartyRelationshipType } from '@/types/horsePartyLink';
import { isCurrentLink } from '@/types/horsePartyLink';

interface RoleDef { role: PartyRole; rel?: HorsePartyRelationshipType; label: string }

/* Always-shown boxes, in the order of the reference layout. Syndicate Manager has
   no relationship_type — it's derived from a linked party's roles (read-only). */
const ROLE_BOXES: RoleDef[] = [
  { role: 'owner',             rel: 'ownership', label: 'Owners Data' },
  { role: 'breeder',           rel: 'bred-by',   label: 'Breeders Data' },
  { role: 'trainer',           rel: 'training',  label: 'Trainers Data' },
  { role: 'personnel',         rel: 'personnel', label: 'Personnel Data' },
  { role: 'jockey',            rel: 'riding',    label: 'Jockey(s) Data' },
  { role: 'syndicate manager', rel: undefined,   label: 'Syndicate Manager' },
  { role: 'bloodstock agent',  rel: 'agent',     label: 'Bloodstock Agents' },
];

const yearOf = (d?: string | null): number | null => {
  if (!d) return null;
  const y = new Date(d).getFullYear();
  return isNaN(y) ? null : y;
};

function dateLine(l: HorsePartyLink): string {
  const s = yearOf(l.start_date);
  const e = yearOf(l.end_date);
  if (s && e) return `${s}–${e}`;
  if (s && isCurrentLink(l)) return `${s}–Present`;
  if (isCurrentLink(l)) return 'Present';
  return e ? `Until ${e}` : '';
}

interface Entry { link: HorsePartyLink; party: Party | undefined }

export interface AddPayload { name: string; startYear: string; endYear: string; present: boolean }

const CURRENT_YEAR = new Date().getFullYear();

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--parchment)', border: '1px solid var(--gold-mid)', borderRadius: 3,
  padding: '4px 7px', fontSize: '0.66rem', color: 'var(--forest-deep)', outline: 'none', ...serifStyle,
};

/* ─── Inline start/end/present editor (shared by Add and Edit) ─── */
function DateFields({ startYear, endYear, present, set }: {
  startYear: string; endYear: string; present: boolean;
  set: (patch: Partial<{ startYear: string; endYear: string; present: boolean }>) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="number" min={1900} max={CURRENT_YEAR} placeholder="From" value={startYear} onChange={(e) => set({ startYear: e.target.value })} style={{ ...inputStyle, width: 64 }} />
      <span style={{ fontSize: '0.6rem', color: 'var(--parchment-label)' }}>→</span>
      <input type="number" min={1900} max={CURRENT_YEAR} placeholder="To" value={endYear} disabled={present} onChange={(e) => set({ endYear: e.target.value })} style={{ ...inputStyle, width: 64, opacity: present ? 0.5 : 1 }} />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', ...serifStyle }}>
        <input type="checkbox" checked={present} onChange={(e) => set({ present: e.target.checked, endYear: e.target.checked ? '' : endYear })} />
        Present
      </label>
    </div>
  );
}

/* ─── One role box ─── */
function RoleBox({ def, entries, editable, parties, onOpenParty, onAdd, onSaveDates, onRemove }: {
  def: RoleDef;
  entries: Entry[];
  editable: boolean;
  parties: Party[];
  onOpenParty: (id: string) => void;
  onAdd: (def: RoleDef, payload: AddPayload) => Promise<void>;
  onSaveDates: (linkId: string, payload: Omit<AddPayload, 'name'>) => Promise<void>;
  onRemove: (linkId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddPayload>({ name: '', startYear: '', endYear: '', present: true });
  const [busy, setBusy] = useState(false);
  const canAdd = editable && !!def.rel;

  const submitAdd = async () => {
    setBusy(true);
    try { await onAdd(def, form); setForm({ name: '', startYear: '', endYear: '', present: true }); setAdding(false); }
    finally { setBusy(false); }
  };
  const submitEdit = async (linkId: string) => {
    setBusy(true);
    try { await onSaveDates(linkId, { startYear: form.startYear, endYear: form.endYear, present: form.present }); setEditingId(null); }
    finally { setBusy(false); }
  };
  const startEdit = (e: Entry) => {
    setEditingId(e.link.id);
    setForm({ name: '', startYear: String(yearOf(e.link.start_date) ?? ''), endYear: String(yearOf(e.link.end_date) ?? ''), present: isCurrentLink(e.link) });
  };

  const badge = entries.length > 0 ? `${entries.length} linked` : null;

  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden' }}>
      {/* Header */}
      <button onClick={() => setOpen((v) => !v)} className="sku-green-header" style={{ width: '100%', border: 'none', cursor: 'pointer', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ color: 'var(--gold-bright)', display: 'flex' }}>{ROLE_ICON[def.role]}</span>
          <span style={{ ...goldStyle, fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.label}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {badge && <span style={{ fontSize: '0.46rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 2, background: 'rgba(180,140,30,0.25)', color: 'var(--gold-bright)', border: '1px solid var(--gold-dark)' }}>{badge}</span>}
          <ChevronDown size={13} style={{ color: 'var(--gold-mid)', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        </span>
      </button>

      {open && (
        <div className="sku-parchment" style={{ padding: '8px 10px' }}>
          {/* Entries */}
          {entries.length === 0 ? (
            <p style={{ fontSize: '0.66rem', fontStyle: 'italic', color: 'var(--parchment-label)', textAlign: 'center', padding: '6px 0' }}>Not Recorded</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {entries.map((e, idx) => (
                <li key={e.link.id} style={{ borderBottom: idx < entries.length - 1 ? '1px solid var(--parchment-dark)' : undefined, padding: '6px 0' }}>
                  {editingId === e.link.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--forest-deep)' }}>{e.party?.name ?? 'Unknown'}</span>
                      <DateFields startYear={form.startYear} endYear={form.endYear} present={form.present} set={(p) => setForm((f) => ({ ...f, ...p }))} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => submitEdit(e.link.id)} disabled={busy} className="sku-gold-btn" style={{ padding: '4px 10px', fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', ...serifStyle }}><Check size={11} /> Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '4px 8px', fontSize: '0.56rem', background: 'none', border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--forest-mid)', cursor: 'pointer', ...serifStyle }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar src={partyPhoto(e.party)} alt={e.party?.name ?? ''} size={30} radius={2} icon={ROLE_ICON[def.role]} />
                      <button onClick={() => e.party && onOpenParty(e.party.id)} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: e.party ? 'pointer' : 'default', padding: 0 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.party?.name ?? 'Unknown'}
                          {e.party?.verificationStatus === 'unverified' && <span style={{ color: 'var(--gold-dark)', fontWeight: 600 }}> · pending</span>}
                        </div>
                        <div style={{ fontSize: '0.56rem', color: 'var(--parchment-label)' }}>{dateLine(e.link) || PARTY_ROLE_LABELS[def.role]}</div>
                      </button>
                      {editable && def.rel ? (
                        <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => startEdit(e)} title="Edit dates" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-mid)', padding: 2 }}><Pencil size={12} /></button>
                          <button onClick={() => onRemove(e.link.id)} title="Remove link" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a85', padding: 2 }}><Trash2 size={12} /></button>
                        </span>
                      ) : (
                        e.party && <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add */}
          {canAdd && (adding ? (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--parchment-dark)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input list={`parties-all`} placeholder={`${PARTY_ROLE_LABELS[def.role]} name…`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
              <DateFields startYear={form.startYear} endYear={form.endYear} present={form.present} set={(p) => setForm((f) => ({ ...f, ...p }))} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={submitAdd} disabled={busy || !form.name.trim()} className="sku-gold-btn" style={{ padding: '4px 10px', fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: busy || !form.name.trim() ? 0.55 : 1, ...serifStyle }}>Link</button>
                <button onClick={() => { setAdding(false); setForm({ name: '', startYear: '', endYear: '', present: true }); }} style={{ padding: '4px 8px', fontSize: '0.56rem', background: 'none', border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--forest-mid)', cursor: 'pointer', ...serifStyle }}>Cancel</button>
              </div>
              <span style={{ fontSize: '0.52rem', fontStyle: 'italic', color: 'var(--parchment-label)' }}>Pick an existing name or type a new one — new parties are added pending verification.</span>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 0', borderRadius: 3, border: '1px dashed var(--gold-mid)', background: 'rgba(180,140,30,0.08)', color: 'var(--forest-deep)', cursor: 'pointer', fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', ...serifStyle }}>
              <Plus size={11} /> Add {PARTY_ROLE_LABELS[def.role]}
            </button>
          ))}
          {editable && !def.rel && entries.length === 0 && (
            <p style={{ marginTop: 6, fontSize: '0.52rem', fontStyle: 'italic', color: 'var(--parchment-label)', textAlign: 'center' }}>Linked automatically when a connected party holds this role.</p>
          )}

          {/* Footer */}
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: '0.5rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--parchment-label)', fontWeight: 700 }}>
            {entries.length} {entries.length === 1 ? 'record' : 'records'} on file
          </div>
        </div>
      )}
    </div>
  );
}

export function RoleConnectionsRail({ horseId, editable, onOpenParty, reportsActive, onOpenReports, footer }: {
  horseId: string;
  editable: boolean;
  onOpenParty: (id: string) => void;
  reportsActive: boolean;
  onOpenReports: () => void;
  footer: React.ReactNode;
}) {
  const allLinks = useHorsePartyLinkStore((s) => s.links);
  const addLink = useHorsePartyLinkStore((s) => s.addLink);
  const updateLink = useHorsePartyLinkStore((s) => s.updateLink);
  const removeLink = useHorsePartyLinkStore((s) => s.removeLink);
  const parties = usePartyStore((s) => s.parties);
  const addParty = usePartyStore((s) => s.addParty);

  const horseLinks = allLinks.filter((l) => l.horse_id === horseId);
  const partyById = (id: string) => parties.find((p) => p.id === id);

  const entriesForRole = (def: RoleDef): Entry[] => {
    if (def.rel) {
      return horseLinks
        .filter((l) => l.relationship_type === def.rel)
        .map((l) => ({ link: l, party: partyById(l.party_id) }));
    }
    // Syndicate manager: linked parties whose roles include the role (derived).
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const l of horseLinks) {
      const p = partyById(l.party_id);
      if (p && p.roles.includes('syndicate manager') && !seen.has(p.id)) { seen.add(p.id); out.push({ link: l, party: p }); }
    }
    return out;
  };

  const datesToFields = ({ startYear, endYear, present }: Omit<AddPayload, 'name'>) => ({
    start_date: startYear ? `${startYear}-01-01` : new Date().toISOString().slice(0, 10),
    end_date: present ? null : (endYear ? `${endYear}-12-31` : null),
  });

  const onAdd = async (def: RoleDef, payload: AddPayload) => {
    if (!def.rel) return;
    const name = payload.name.trim();
    if (!name) { toast.error('Enter a name.'); return; }
    const existing = parties.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    let partyId = existing?.id;
    if (!partyId) {
      partyId = await addParty({ name, roles: [def.role] });
      if (!partyId) return;
    }
    const { start_date, end_date } = datesToFields(payload);
    await addLink({ horse_id: horseId, party_id: partyId, relationship_type: def.rel, start_date, end_date });
    toast.success(existing ? `${name} linked.` : `${name} added (pending verification) and linked.`);
  };

  const onSaveDates = async (linkId: string, payload: Omit<AddPayload, 'name'>) => {
    await updateLink(linkId, datesToFields(payload));
  };

  return (
    <>
      <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Connections</span>
        <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
      </div>

      {ROLE_BOXES.map((def) => (
        <RoleBox key={def.role} def={def} entries={entriesForRole(def)} editable={editable} parties={parties} onOpenParty={onOpenParty} onAdd={onAdd} onSaveDates={onSaveDates} onRemove={removeLink} />
      ))}

      {/* Shared datalist of existing parties for the add inputs */}
      <datalist id="parties-all">
        {parties.map((p) => <option key={p.id} value={p.name} />)}
      </datalist>

      <button onClick={onOpenReports} aria-pressed={reportsActive} style={{ marginTop: 2, width: '100%', border: `2px solid ${reportsActive ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
        <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)' }}>Reports / Forms</span></div>
        <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.64rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic' }}>Official documents &amp; reports</span>{reportsActive ? <X size={13} style={{ color: 'var(--gold-mid)' }} /> : <ChevronRight size={13} style={{ color: 'var(--gold-mid)' }} />}</div>
      </button>

      {footer}
    </>
  );
}
