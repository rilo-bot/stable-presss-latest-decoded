import type { Horse } from '@/types/horse';

const serif: React.CSSProperties = { fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif" };

function Cell({ name, dim }: { name?: string; dim?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        margin: 2,
        border: '1px solid var(--gold-dark)',
        borderRadius: 2,
        background: name ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.015)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <span
        style={{
          fontSize: dim ? '0.56rem' : '0.66rem',
          fontWeight: dim ? 500 : 700,
          color: name ? 'var(--forest-deep)' : 'var(--parchment-shadow)',
          fontStyle: name ? 'normal' : 'italic',
          lineHeight: 1.15,
          ...serif,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name || '—'}
      </span>
    </div>
  );
}

function Column({ cells, dim }: { cells: (string | undefined)[]; dim?: boolean }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {cells.map((c, i) => (
        <Cell key={i} name={c} dim={dim} />
      ))}
    </div>
  );
}

/**
 * 4-generation pedigree grid (Horse | Parents | Grandparents | Great-grandparents),
 * styled like the FR mock. Reads the flat pedigree fields on the Horse.
 */
export function PedigreeGrid({ horse }: { horse: Horse & { name: string } }) {
  const gen1 = [horse.name];
  const gen2 = [horse.sire, horse.dam];
  const gen3 = [horse.sireSire, horse.sireDam, horse.damSire, horse.damDam];
  const gen4 = [
    horse.sireSireSire, horse.sireSireDam, horse.sireDamSire, horse.sireDamDam,
    horse.damSireSire, horse.damSireDam, horse.damDamSire, horse.damDamDam,
  ];

  return (
    <div style={{ border: '1px solid var(--gold-mid)', borderRadius: 3, overflow: 'hidden', background: 'var(--parchment)' }}>
      <div style={{ display: 'flex', background: 'linear-gradient(180deg, var(--forest-mid), var(--forest-deep))', padding: '4px 8px' }}>
        <span style={{ fontSize: '0.52rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)', ...serif }}>
          Pedigree — Four Generations
        </span>
      </div>
      <div style={{ display: 'flex', height: 224, padding: 3 }}>
        <Column cells={gen1} />
        <Column cells={gen2} />
        <Column cells={gen3} />
        <Column cells={gen4} dim />
      </div>
    </div>
  );
}
