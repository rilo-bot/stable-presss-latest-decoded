/**
 * ConnectionsRail — the left rail: related-party EntityTiles (grouped by role),
 * a Reports/Forms launcher, and a footer button (All Parties / View All Horses /
 * Preview Public Profile). Dumb: tiles + callbacks in, navigation out.
 */
import { ChevronRight, FileText } from 'lucide-react';
import { serifStyle, EntityTile, partyPhoto } from '@/components/profile/kit';
import { ROLE_ICON, ROLE_IMG_KEY } from '@/components/profile/modules';
import { PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';
import type { PanelParty } from '@/lib/profile/types';

export interface RelTile { role: PartyRole; parties: PanelParty[] }

export function ConnectionsRail({ tiles, emptyText, onOpenParty, reportsActive, onOpenReports, footer }: {
  tiles: RelTile[];
  emptyText: string;
  onOpenParty: (id: string) => void;
  reportsActive: boolean;
  onOpenReports: () => void;
  /** Bottom button (e.g. All Parties / View All Horses / Preview Public Profile). */
  footer: React.ReactNode;
}) {
  return (
    <>
      <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Connections</span>
        <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
      </div>

      {tiles.length === 0 && (
        <div style={{ padding: '10px 12px', border: '1px solid var(--gold-dark)', borderRadius: 3, background: 'rgba(26,51,34,0.5)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--parchment-label)', ...serifStyle }}>{emptyText}</span>
        </div>
      )}

      {tiles.map(({ role, parties: rp }) => {
        const primary = rp[0];
        const secondary = primary.party.baseLocation || primary.party.profession || PARTY_ROLE_LABELS[role];
        return (
          <EntityTile
            key={role}
            title={`${PARTY_ROLE_LABELS[role]}s`}
            icon={ROLE_ICON[role]}
            primaryName={rp.length > 1 ? `${primary.party.name} +${rp.length - 1}` : primary.party.name}
            secondaryLine={secondary}
            count={rp.length}
            imgSrc={partyPhoto(primary.party, ROLE_IMG_KEY[role])}
            onClick={() => onOpenParty(primary.party.id)}
          />
        );
      })}

      <button onClick={onOpenReports} aria-pressed={reportsActive} style={{ marginTop: 2, width: '100%', border: `2px solid ${reportsActive ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
        <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)' }}>Reports / Forms</span></div>
        <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.64rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic' }}>Official documents &amp; reports</span><ChevronRight size={13} style={{ color: 'var(--gold-mid)' }} /></div>
      </button>

      {footer}
    </>
  );
}
