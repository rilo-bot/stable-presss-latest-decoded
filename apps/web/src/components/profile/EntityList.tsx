/**
 * EntityList — the connected-horses register (thumbnail + name + meta rows under
 * a green header). `prepend` carries the edit-mode "register a horse" input;
 * `action` carries a header button (e.g. Register Horse). Each row navigates via
 * onSelect.
 */
import { ChevronRight, BookOpen } from 'lucide-react';
import { serifStyle, goldStyle } from '@/components/profile/kit';

export interface EntityRow {
  id: string;
  name: string;
  imageUrl?: string;
  /** Secondary line (e.g. "Mare · Bay · 3:1-0-1"). */
  meta?: string;
  /** Optional inline badge after the meta (e.g. "· unverified"). */
  badge?: React.ReactNode;
}

export function EntityList({ title, count, icon, action, prepend, rows, emptyText, onSelect }: {
  title: string;
  count: number;
  icon?: React.ReactNode;
  /** Header-right action (e.g. a Register Horse button). */
  action?: React.ReactNode;
  /** Rendered inside the parchment body above the list (e.g. an add-row input). */
  prepend?: React.ReactNode;
  rows: EntityRow[];
  emptyText: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="sku-gold-card" style={{ ...serifStyle }}>
      <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon ?? <BookOpen size={12} style={{ color: 'var(--gold-bright)' }} />}
          <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>{title} · {count}</span>
        </span>
        {action}
      </div>
      <div className="sku-parchment" style={{ padding: '8px 10px' }}>
        {prepend}
        {rows.length === 0 ? (
          <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-label)', textAlign: 'center', padding: '8px 0' }}>{emptyText}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((h, idx) => (
              <li key={h.id} style={{ borderBottom: idx < rows.length - 1 ? '1px solid var(--parchment-dark)' : undefined }}>
                <button onClick={() => onSelect(h.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0, background: 'var(--forest-deep)' }}>
                    {h.imageUrl && <img src={h.imageUrl} alt={h.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--parchment-label)' }}>{h.meta}{h.badge}</div>
                  </div>
                  <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
