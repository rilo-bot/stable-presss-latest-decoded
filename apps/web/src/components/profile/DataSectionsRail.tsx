/**
 * DataSectionsRail — the right rail: the six DataCategoryCard module tiles + the
 * "Stable Press · Racing Almanac" footer plaque. Dumb: active key + toggle in.
 */
import { serifStyle, DataCategoryCard, type DataCardImgKey } from '@/components/profile/kit';
import { DATA_CATEGORIES } from '@/components/profile/modules';

export function DataSectionsRail({ activeModule, onToggle, extra }: {
  activeModule: string | null;
  onToggle: (key: string) => void;
  /** Optional node rendered between the cards and the footer plaque. */
  extra?: React.ReactNode;
}) {
  return (
    <>
      <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Data Sections</span>
        <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
      </div>
      {DATA_CATEGORIES.map((cat) => (
        <DataCategoryCard key={cat.key} label={cat.label} sublabel={cat.sublabel} icon={cat.icon} imgKey={cat.imgKey as DataCardImgKey} active={activeModule === cat.key} onClick={() => onToggle(cat.key)} />
      ))}
      {extra}
      <div style={{ marginTop: 6, padding: '8px 10px', border: '1px solid var(--gold-dark)', borderRadius: 3, background: 'rgba(26,51,34,0.5)', textAlign: 'center', ...serifStyle }}>
        <span style={{ fontSize: '0.5rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-dark)', display: 'block' }}>✦ Stable Press ✦</span>
        <span style={{ fontSize: '0.52rem', fontStyle: 'italic', color: 'var(--parchment-label)', display: 'block', marginTop: 3 }}>Racing Almanac</span>
      </div>
    </>
  );
}
