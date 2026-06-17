/**
 * SummaryGrid — the career/racing summary stat strip (parchment cells under a
 * green header). Party uses 4 cells, Horse uses 5.
 */
import { Trophy } from 'lucide-react';
import { serifStyle, goldStyle } from '@/components/profile/kit';

export interface SummaryCell { label: string; value: string }

export function SummaryGrid({ title, icon, cells, columns }: {
  title: string;
  icon?: React.ReactNode;
  cells: SummaryCell[];
  columns?: number;
}) {
  const cols = columns ?? cells.length;
  return (
    <div className="sku-gold-card" style={{ ...serifStyle }}>
      <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon ?? <Trophy size={12} style={{ color: 'var(--gold-bright)' }} />}
        <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>{title}</span>
      </div>
      <div className="sku-parchment" style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
        {cells.map((s, i) => (
          <div key={s.label} style={{ textAlign: 'center', padding: '4px 2px', borderRight: i < cells.length - 1 ? '1px solid var(--parchment-dark)' : undefined }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle, lineHeight: 1.1, wordBreak: 'break-word' }}>{s.value}</div>
            <div style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-label)', fontWeight: 700, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
