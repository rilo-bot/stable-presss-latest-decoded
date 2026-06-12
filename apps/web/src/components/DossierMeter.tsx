const serif: React.CSSProperties = { fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif" };

/**
 * Gamified "dossier completeness" ring — how many of the horse's data modules
 * have records on file. Pure-derived from booleans the caller passes in.
 */
export function DossierMeter({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, ...serif }}>
      <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
        <svg width="46" height="46" viewBox="0 0 46 46" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="23" cy="23" r={r} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="4" />
          <circle
            cx="23" cy="23" r={r} fill="none"
            stroke="var(--gold-bright)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.6rem', fontWeight: 700, color: 'var(--gold-bright)',
        }}>
          {pct}%
        </span>
      </div>
      <div>
        <div style={{ fontSize: '0.52rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-mid)' }}>
          Dossier
        </div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--parchment)' }}>
          {filled} / {total} on file
        </div>
      </div>
    </div>
  );
}
