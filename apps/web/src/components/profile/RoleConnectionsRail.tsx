/**
 * RoleConnectionsRail — the horse left rail. ALWAYS renders every role box
 * (Owners, Breeders, Trainers, Personnel, Jockeys, Syndicate Manager, Bloodstock
 * Agents) even when empty ("Not Recorded"), each box listing everyone connected
 * to this horse in that role. In edit mode each box can add a connection —
 * pointing at an EXISTING person or creating a new one in the register.
 * Reports/Forms launcher + a footer button sit below.
 *
 * The per-box UI lives in RoleConnectionBox and the store-backed data/handlers in
 * useRoleConnections — this rail just lays them out (so the same box can also be
 * rendered standalone in the onboarding focus overlay).
 */
import { ChevronRight, X, FileText } from 'lucide-react';
import { serifStyle } from '@/components/profile/kit';
import { RoleConnectionBox, ROLE_BOXES } from '@/components/profile/RoleConnectionBox';
import { useRoleConnections } from '@/components/profile/useRoleConnections';
import { StudioField } from '@/components/profile/StudioField';

export function RoleConnectionsRail({ horseId, editable, onOpenParty, reportsActive, onOpenReports, footer, spotlightRole }: {
  horseId: string;
  editable: boolean;
  onOpenParty: (id: string) => void;
  reportsActive: boolean;
  onOpenReports: () => void;
  footer: React.ReactNode;
  /** ROLE of the active onboarding step → glow that box (or null). Was keyed by
   *  relationship_type, which no longer exists — the edge carries the role. */
  spotlightRole?: string | null;
}) {
  const conn = useRoleConnections(horseId);

  return (
    <>
      <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Connections</span>
        <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
      </div>

      {/* Every box is now addable and AI-focusable. Syndicate Manager used to be
          read-only because it had no relationship_type; the edge carries the
          role directly, so that exception is gone. */}
      {ROLE_BOXES.map((def) => (
        <StudioField key={def.role} fieldId={`conn:${def.role}`} label={def.label.replace(/\s*Data$/i, '')} enabled={editable}>
          <RoleConnectionBox
            def={def}
            entries={conn.entriesFor(def)}
            editable={editable}
            onOpenParty={onOpenParty}
            onAdd={conn.onAdd}
            onRemove={conn.onRemove}
            id={`onb-conn-${def.role}`}
            spotlight={def.role === spotlightRole}
          />
        </StudioField>
      ))}

      {/* Shared datalist of people already in the register, for the add inputs */}
      <datalist id="parties-all">
        {conn.people.map((p) => <option key={p.id} value={p.name} />)}
      </datalist>

      <button onClick={onOpenReports} aria-pressed={reportsActive} style={{ marginTop: 2, width: '100%', border: `2px solid ${reportsActive ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
        <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)' }}>Reports / Forms</span></div>
        <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.64rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic' }}>Official documents &amp; reports</span>{reportsActive ? <X size={13} style={{ color: 'var(--gold-mid)' }} /> : <ChevronRight size={13} style={{ color: 'var(--gold-mid)' }} />}</div>
      </button>

      {footer}
    </>
  );
}
