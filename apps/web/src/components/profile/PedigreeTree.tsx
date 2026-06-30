/**
 * PedigreeTree — read-only, left-to-right (depth-first) pedigree chart used on
 * the public horse dossier. The subject sits on the LEFT spanning full height;
 * its sire/dam fan out to the RIGHT, then the four grandparents — mirroring the
 * classic "Pedigree of …" almanac table. Edit mode keeps the inline-editable
 * IdentityCard instead; this is purely presentational.
 */
import { serifStyle, goldStyle } from '@/components/profile/kit';

interface PedigreeTreeProps {
  horseName: string;
  sire?: string;
  sireSire?: string;
  sireDam?: string;
  dam?: string;
  damSire?: string;
  damDam?: string;
}

const EMPTY = '—';

function Cell({
  name,
  caption,
  gridColumn,
  gridRow,
  emphasis,
  big,
}: {
  name?: string;
  caption?: string;
  gridColumn: string;
  gridRow: string;
  emphasis?: boolean;
  big?: boolean;
}) {
  return (
    <div
      style={{
        gridColumn,
        gridRow,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        padding: big ? '8px 10px' : '5px 8px',
        border: '1px solid var(--gold-dark)',
        borderRadius: 3,
        background: emphasis
          ? 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)'
          : 'rgba(255,255,255,0.55)',
        minWidth: 0,
        ...serifStyle,
      }}
    >
      {caption && (
        <span style={{ fontSize: '0.46rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: emphasis ? 'var(--gold-bright)' : 'var(--forest-mid)', opacity: 0.85 }}>
          {caption}
        </span>
      )}
      <span
        style={{
          fontSize: big ? '0.82rem' : '0.62rem',
          fontWeight: 700,
          lineHeight: 1.15,
          color: emphasis ? 'var(--parchment)' : 'var(--forest-deep)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name || EMPTY}
      </span>
    </div>
  );
}

export function PedigreeTree({ horseName, sire, sireSire, sireDam, dam, damSire, damDam }: PedigreeTreeProps) {
  return (
    <div className="sku-gold-card" style={{ ...serifStyle, display: 'flex', flexDirection: 'column' }}>
      <div className="sku-green-header" style={{ padding: '7px 12px', textAlign: 'center' }}>
        <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>
          Pedigree of {horseName}
        </span>
      </div>
      <div
        className="sku-parchment"
        style={{
          flex: 1,
          padding: 8,
          display: 'grid',
          gridTemplateColumns: '1.15fr 1fr 1fr',
          gridTemplateRows: 'repeat(4, minmax(34px, 1fr))',
          gap: 5,
        }}
      >
        {/* Subject — full-height, left column */}
        <Cell name={horseName} gridColumn="1" gridRow="1 / 5" emphasis big />

        {/* Generation 1 — sire (top half) / dam (bottom half) */}
        <Cell caption="Sire" name={sire} gridColumn="2" gridRow="1 / 3" />
        <Cell caption="Dam" name={dam} gridColumn="2" gridRow="3 / 5" />

        {/* Generation 2 — four grandparents, right column */}
        <Cell caption="Sire's Sire" name={sireSire} gridColumn="3" gridRow="1" />
        <Cell caption="Sire's Dam" name={sireDam} gridColumn="3" gridRow="2" />
        <Cell caption="Dam's Sire" name={damSire} gridColumn="3" gridRow="3" />
        <Cell caption="Dam's Dam" name={damDam} gridColumn="3" gridRow="4" />
      </div>
    </div>
  );
}
