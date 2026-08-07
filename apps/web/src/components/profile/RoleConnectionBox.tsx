/**
 * RoleConnectionBox — one connection box for the horse left rail (Owners,
 * Breeders, Trainers, Personnel, Jockeys, Syndicate Manager, Bloodstock Agents).
 *
 * A connection IS a party edge: one row saying "this person fills this role on
 * this horse". There is no relationship_type any more — the edge carries `role`
 * directly — and no start/end dates, because the edge has none. A connection
 * either exists or it does not, so the box lists, adds and removes; it no longer
 * edits a date range that nothing stores.
 *
 * Presentational + local form state only — the store-backed data and handlers
 * come from useRoleConnections, keeping a single source of truth.
 */
import { useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadImage } from '@/lib/upload';
import { serifStyle, goldStyle, Avatar, partyPhoto } from '@/components/profile/kit';
import { ROLE_ICON } from '@/components/profile/modules';
import { PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';
import type { RegisterPerson } from '@/lib/register';

export interface RoleDef { role: PartyRole; label: string; desc: string }

/* Always-shown boxes, in the order of the reference layout. `desc` is the
   reference card's summary line, shown beneath the title. */
export const ROLE_BOXES: RoleDef[] = [
  { role: 'owner',             label: 'Owners Data',       desc: 'Summary of the current and past owners' },
  { role: 'breeder',           label: 'Breeders Data',     desc: 'Summary of the breeders of the subject horse' },
  { role: 'trainer',           label: 'Trainers Data',     desc: 'Summary of current and past trainers' },
  { role: 'personnel',         label: 'Personnel Data',    desc: 'Summary of the personnel who have worked with the subject horse' },
  { role: 'jockey',            label: 'Jockey(s) Data',    desc: 'Summary of all jockeys who have ridden the subject horse' },
  { role: 'syndicate manager', label: 'Syndicate Manager', desc: 'Summary of the syndicate manager of the subject horse' },
  { role: 'bloodstock agent',  label: 'Bloodstock Agents', desc: 'Summary of the bloodstock agents for the subject horse' },
];

/** Lookup a role box definition by the role it covers. */
export const roleDefByRole: Record<string, RoleDef> = Object.fromEntries(
  ROLE_BOXES.map((d) => [d.role, d]),
);

/**
 * One connection. `id` is the party edge's id, EXCEPT for a legacy connection
 * that lives only in the horse's own `ownerIds`/`trainerIds` array — those have
 * no edge row, so they are read-only here.
 */
export interface Entry {
  id: string;
  party: RegisterPerson | undefined;
  legacy: boolean;
}

export interface AddPayload { name: string; photo?: string }

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--parchment)', border: '1px solid var(--gold-mid)', borderRadius: 3,
  padding: '4px 7px', fontSize: '0.66rem', color: 'var(--forest-deep)', outline: 'none', ...serifStyle,
};

/* ─── One role box ─── */
export function RoleConnectionBox({ def, entries, editable, onOpenParty, onAdd, onRemove, id, spotlight, defaultAdding }: {
  def: RoleDef;
  entries: Entry[];
  editable: boolean;
  onOpenParty: (personId: string) => void;
  onAdd: (def: RoleDef, payload: AddPayload) => Promise<void>;
  onRemove: (edgeId: string) => void;
  /** DOM id (onboarding pointer/scroll target) + glow when this is the active step. */
  id?: string;
  spotlight?: boolean;
  /** Open the add-form on mount (used by the centered onboarding instance). */
  defaultAdding?: boolean;
}) {
  // Public dossier: collapse to the compact medallion + summary by default so the
  // left rail stays tidy and the page fits the viewport. Edit/studio (and the
  // onboarding add-form instance) start open so connections are ready to fill in.
  const [open, setOpen] = useState(editable || !!defaultAdding);
  const [adding, setAdding] = useState(!!defaultAdding);
  const [form, setForm] = useState<AddPayload>({ name: '' });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Reference cards lead with a thumbnail — use the first connected person's
  // photo, else fall back to the role medallion (no stock imagery).
  const thumb = partyPhoto(entries[0]?.party);

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file, { kind: 'party', maxDim: 512, quality: 0.8 });
      setForm((f) => ({ ...f, photo: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const submitAdd = async () => {
    setBusy(true);
    try { await onAdd(def, form); setForm({ name: '' }); setAdding(false); }
    finally { setBusy(false); }
  };

  const badge = entries.length > 0 ? `${entries.length} linked` : null;

  return (
    <div id={id} className={`sku-gold-card${spotlight ? ' onb-spotlight' : ''}`} style={{ ...serifStyle, overflow: 'hidden' }}>
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
          {/* Reference-style summary: medallion thumbnail + description line */}
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--parchment-dark)' }}>
            <div style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)', borderRadius: 3, flexShrink: 0 }}>
              <Avatar src={thumb} alt={def.label} size={40} radius={3} icon={ROLE_ICON[def.role]} />
            </div>
            <p style={{ margin: 0, fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--forest-mid)', lineHeight: 1.35 }}>{def.desc}</p>
          </div>

          {/* Entries */}
          {entries.length === 0 ? (
            <p style={{ fontSize: '0.66rem', fontStyle: 'italic', color: 'var(--parchment-label)', textAlign: 'center', padding: '6px 0' }}>Not Recorded</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {entries.map((e, idx) => (
                <li key={e.id} style={{ borderBottom: idx < entries.length - 1 ? '1px solid var(--parchment-dark)' : undefined, padding: '6px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar src={partyPhoto(e.party)} alt={e.party?.name ?? ''} size={30} radius={2} icon={ROLE_ICON[def.role]} />
                    <button onClick={() => e.party && onOpenParty(e.party.id)} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: e.party ? 'pointer' : 'default', padding: 0 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.party?.name ?? 'Unknown'}
                      </div>
                      <div style={{ fontSize: '0.56rem', color: 'var(--parchment-label)' }}>
                        {e.party?.profession || PARTY_ROLE_LABELS[def.role]}
                      </div>
                    </button>
                    {editable && !e.legacy ? (
                      <button onClick={() => onRemove(e.id)} title="Remove connection" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a85', padding: 2, flexShrink: 0 }}><Trash2 size={12} /></button>
                    ) : (
                      e.party && <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Add */}
          {editable && (adding ? (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--parchment-dark)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar src={form.photo} alt={form.name || PARTY_ROLE_LABELS[def.role]} size={38} radius={3} icon={ROLE_ICON[def.role]} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'rgba(180,140,30,0.1)', color: 'var(--forest-deep)', cursor: uploading ? 'wait' : 'pointer', fontSize: '0.54rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', ...serifStyle }}>
                  {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                  {form.photo ? 'Change photo' : 'Add photo'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onPickPhoto} />
              </div>
              <input list="parties-all" placeholder={`${PARTY_ROLE_LABELS[def.role]} name…`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={submitAdd} disabled={busy || !form.name.trim()} className="sku-gold-btn" style={{ padding: '4px 10px', fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: busy || !form.name.trim() ? 0.55 : 1, ...serifStyle }}>Link</button>
                <button onClick={() => { setAdding(false); setForm({ name: '' }); }} style={{ padding: '4px 8px', fontSize: '0.56rem', background: 'none', border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--forest-mid)', cursor: 'pointer', ...serifStyle }}>Cancel</button>
              </div>
              <span style={{ fontSize: '0.52rem', fontStyle: 'italic', color: 'var(--parchment-label)' }}>Pick an existing name or type a new one — a new name is added to the register.</span>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 0', borderRadius: 3, border: '1px dashed var(--gold-mid)', background: 'rgba(180,140,30,0.08)', color: 'var(--forest-deep)', cursor: 'pointer', fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', ...serifStyle }}>
              <Plus size={11} /> Add {PARTY_ROLE_LABELS[def.role]}
            </button>
          ))}

          {/* Footer */}
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: '0.5rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--parchment-label)', fontWeight: 700 }}>
            {entries.length} {entries.length === 1 ? 'record' : 'records'} on file
          </div>
        </div>
      )}

      {/* Collapsed: keep the reference summary look (medallion + description). */}
      {!open && (
        <button onClick={() => setOpen(true)} className="sku-parchment" style={{ width: '100%', border: 'none', cursor: 'pointer', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left' }}>
          <div style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)', borderRadius: 3, flexShrink: 0 }}>
            <Avatar src={thumb} alt={def.label} size={36} radius={3} icon={ROLE_ICON[def.role]} />
          </div>
          <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--forest-mid)', lineHeight: 1.3 }}>{def.desc}</p>
          <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        </button>
      )}
    </div>
  );
}
