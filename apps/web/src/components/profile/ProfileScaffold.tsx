/**
 * ProfileScaffold — the ONE dumb (presentational) shell for the vintage
 * "Racing Almanac" dossier layout. No store reads, no fetching, no RBAC, no
 * horse/party knowledge: it just arranges the breadcrumb + 3-column grid and
 * owns the canonical grid CSS (retiring the four hand-rolled copies). Drive it
 * with slots; flip view↔edit by what the caller passes into those slots.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { serifStyle } from '@/components/profile/kit';

export interface Crumb {
  label: string;
  /** Clickable when provided (renders gold-mid + pointer); static parchment otherwise. */
  onClick?: () => void;
  /** The current/active crumb — rendered gold-bright. */
  active?: boolean;
}

interface ProfileScaffoldProps {
  crumbs: Crumb[];
  /** Right side of the breadcrumb bar — e.g. AskAgentButton + "Stable Press · {role}". */
  breadcrumbRight?: React.ReactNode;
  /** Full-width strip below the breadcrumb (welcome / provisional notice). */
  banner?: React.ReactNode;
  /** Left rail (Connections). */
  left: React.ReactNode;
  /** Centre crest card + action bar — always shown above the centre body. */
  crest: React.ReactNode;
  /** Centre body shown when no data-module is open. */
  centerDefault: React.ReactNode;
  /** Active data-module; when set, it animates into the centre in place of centerDefault. */
  centerModule?: React.ReactNode | null;
  /** Stable key for the module transition (e.g. the module name). */
  moduleKey?: string | null;
  /** Right rail (Data Sections). */
  right: React.ReactNode;
  /** Optional overlay rendered above the page (e.g. a nested editor). */
  overlay?: React.ReactNode;
}

function crumbColor(c: Crumb): string {
  if (c.active) return 'var(--gold-bright)';
  if (c.onClick) return 'var(--gold-mid)';
  return 'var(--parchment)';
}

export function ProfileScaffold({
  crumbs, breadcrumbRight, banner, left, crest, centerDefault, centerModule, moduleKey, right, overlay,
}: ProfileScaffoldProps) {
  return (
    <div className="profile-page">
      {/* Breadcrumb */}
      <div style={{ background: 'linear-gradient(90deg, var(--forest-deep) 0%, var(--forest-mid) 100%)', borderBottom: '2px solid var(--gold-dark)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, ...serifStyle }}>
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} />}
            {c.onClick ? (
              <button onClick={c.onClick} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: crumbColor(c), background: 'none', border: 'none', cursor: 'pointer', ...serifStyle }}>{c.label}</button>
            ) : (
              <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: crumbColor(c), ...serifStyle }}>{c.label}</span>
            )}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        {breadcrumbRight}
      </div>

      {banner}

      <div className="profile-grid">
        <div className="profile-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{left}</div>

        <div className="profile-col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {crest}
          {centerModule ? (
            <AnimatePresence mode="wait">
              <motion.div key={moduleKey ?? 'module'} initial={{ opacity: 0, y: 8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                {centerModule}
              </motion.div>
            </AnimatePresence>
          ) : (
            centerDefault
          )}
        </div>

        <div className="profile-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{right}</div>
      </div>

      {overlay}

      <style>{`
        .profile-page { background: linear-gradient(180deg, var(--forest-deep) 0%, #111e17 100%); min-height: calc(100vh - var(--navbar-h, 112px)); display: flex; flex-direction: column; }
        .profile-grid { display: grid; grid-template-columns: minmax(200px, 260px) 1fr minmax(130px, 170px); gap: 16px; padding: 14px 20px 32px; max-width: 1320px; margin: 0 auto; width: 100%; flex: 1; align-items: start; }
        .profile-col { min-width: 0; }
        @media (max-width: 900px) { .profile-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
