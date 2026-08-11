/**
 * OwnerDataRail — the LEFT rail of the public owner/party dossier. A stack of
 * data-category boxes (Owner's / Breeder's / Trainer's / Jockey's / Bloodstock /
 * Syndicate Manager / SyndT Owners Data), each a title + italic description that
 * is COLLAPSED by default (medallion + one-line summary) and expands to list the
 * connected parties for that role. Mirrors the horse page's RoleConnectionsRail
 * look, but read-only and party-scoped (rollups across the owner's horses).
 *
 * Edit/studio keeps the existing ConnectionsRail; this is the view-only variant.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { serifStyle, goldStyle, Avatar, partyPhoto } from '@/components/profile/kit';
import { ROLE_ICON } from '@/components/profile/modules';
import { PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';
import type { PanelParty } from '@/lib/profile/types';

interface BoxDef {
  /** Backing relationship role, or null for a static descriptive box (SyndT). */
  role: PartyRole | null;
  title: string;
  desc: string;
}

/* Order + copy per the reference mockup's left rail. */
const OWNER_DATA_BOXES: BoxDef[] = [
  { role: 'owner', title: "Owner's Data", desc: 'Summary of the horses the owner holds — currently or as past shares.' },
  { role: 'breeder', title: "Breeder's Data", desc: 'In-depth record of the breeders of all horses owned by the owner.' },
  { role: 'trainer', title: "Trainer's Data", desc: 'Trainer records of all horses currently or previously owned by the owner.' },
  { role: 'jockey', title: "Jockey's Data", desc: 'Jockey records of all horses owned by the owner.' },
  { role: 'bloodstock agent', title: 'Bloodstock Agents Data', desc: 'Agent records of the horses bought by agents and owned by the owner.' },
  { role: 'syndicate manager', title: 'Syndicate Manager Data', desc: 'Summary of the syndicate manager of the horses the owner owns.' },
  { role: null, title: 'SyndT Owners Data', desc: 'In-depth record of all SyndT owners of the horses owned by the syndicate.' },
];

function OwnerDataBox({ def, parties, onOpenParty }: { def: BoxDef; parties: PanelParty[]; onOpenParty: (id: string) => void }) {
  // Collapsed by default — the whole rail stays compact and the dossier fits the
  // viewport; the reader expands a box to drill into its connected parties.
  const [open, setOpen] = useState(false);
  const icon = def.role ? ROLE_ICON[def.role] : <Users size={12} strokeWidth={1.8} />;
  const count = parties.length;

  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden' }}>
      {/* Header — toggles the box */}
      <button onClick={() => setOpen((v) => !v)} className="sku-green-header" style={{ width: '100%', border: 'none', cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ color: 'var(--gold-bright)', display: 'flex' }}>{icon}</span>
          <span style={{ ...goldStyle, fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {count > 0 && <span style={{ fontSize: '0.46rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 2, background: 'rgba(180,140,30,0.25)', color: 'var(--gold-bright)', border: '1px solid var(--gold-dark)' }}>{count} linked</span>}
          <ChevronDown size={13} style={{ color: 'var(--gold-mid)', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        </span>
      </button>

      {open ? (
        <div className="sku-parchment" style={{ padding: '8px 10px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--forest-mid)', lineHeight: 1.35, borderBottom: '1px solid var(--parchment-dark)', paddingBottom: 8 }}>{def.desc}</p>
          {count === 0 ? (
            <p style={{ fontSize: '0.66rem', fontStyle: 'italic', color: 'var(--parchment-label)', textAlign: 'center', padding: '4px 0' }}>Not Recorded</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {parties.map((e, idx) => (
                <li key={e.party.id} style={{ borderBottom: idx < parties.length - 1 ? '1px solid var(--parchment-dark)' : undefined, padding: '6px 0' }}>
                  <button onClick={() => onOpenParty(e.party.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    <Avatar src={partyPhoto(e.party)} alt={e.party.name} size={30} radius={2} icon={icon} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.party.name}</span>
                      <span style={{ display: 'block', fontSize: '0.56rem', color: 'var(--parchment-label)' }}>{e.party.baseLocation || e.party.profession || (def.role ? PARTY_ROLE_LABELS[def.role] : '')}</span>
                    </span>
                    <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: '0.5rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--parchment-label)', fontWeight: 700 }}>
            {count} {count === 1 ? 'record' : 'records'} on file
          </div>
        </div>
      ) : (
        /* Collapsed — medallion + description, click anywhere to expand. */
        <button onClick={() => setOpen(true)} className="sku-parchment" style={{ width: '100%', border: 'none', cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left' }}>
          <div style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)', borderRadius: 3, flexShrink: 0 }}>
            <Avatar src={partyPhoto(parties[0]?.party)} alt={def.title} size={30} radius={3} icon={icon} />
          </div>
          <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: '0.58rem', fontStyle: 'italic', color: 'var(--forest-mid)', lineHeight: 1.25 }}>{def.desc}</p>
          <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        </button>
      )}
    </div>
  );
}

export function OwnerDataRail({ tiles, onOpenParty, footer }: {
  tiles: Record<PartyRole, PanelParty[]>;
  onOpenParty: (id: string) => void;
  /** Bottom button (e.g. All Parties). */
  footer: React.ReactNode;
}) {
  return (
    <>
      <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Connections</span>
        <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
      </div>
      {OWNER_DATA_BOXES.map((def) => (
        <OwnerDataBox key={def.title} def={def} parties={def.role ? (tiles[def.role] ?? []) : []} onOpenParty={onOpenParty} />
      ))}
      {footer}
    </>
  );
}
