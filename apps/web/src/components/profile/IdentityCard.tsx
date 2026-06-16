/**
 * IdentityCard — a parchment dt/dd identity block built from field descriptors.
 * This is the core "use it as a form AND to show data" piece: each field becomes
 * an InlineEditRow, which renders read-only text when `editable` is false and an
 * auto-saving input when true. Non-field rows (e.g. role chips) use `render`.
 */
import { InlineEditRow } from '@/components/profile/editable';
import { serifStyle, goldStyle } from '@/components/profile/kit';

export interface FieldDescriptor {
  label: string;
  /** Raw editable value (date as YYYY-MM-DD, number as its string form). */
  value: string;
  /** Wire to a store update in edit mode; omit for purely-derived/read-only fields. */
  onSave?: (next: string) => void | Promise<void>;
  /** Pre-formatted display string when not editing (e.g. formatted date / money). */
  displayValue?: string;
  type?: 'text' | 'number' | 'date';
  highlight?: boolean;
  min?: number | string;
  max?: number | string;
  /** Escape hatch: render this node as the row instead of an InlineEditRow. */
  render?: React.ReactNode;
}

const noop = () => {};

export function IdentityCard({ title, fields, editable, icon }: { title: string; fields: FieldDescriptor[]; editable: boolean; icon?: React.ReactNode }) {
  return (
    <div className="sku-gold-card" style={{ ...serifStyle, display: 'flex', flexDirection: 'column' }}>
      {icon ? (
        <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon}
          <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>{title}</span>
        </div>
      ) : (
        <div className="sku-green-header" style={{ padding: '7px 12px', textAlign: 'center' }}>
          <span style={{ ...goldStyle, fontSize: '0.9rem', fontWeight: 700, ...serifStyle }}>{title}</span>
        </div>
      )}
      <div className="sku-parchment" style={{ padding: '10px 14px', flex: 1 }}>
        {fields.map((f) =>
          f.render !== undefined ? (
            <div key={f.label}>{f.render}</div>
          ) : (
            <InlineEditRow
              key={f.label}
              label={f.label}
              value={f.value}
              onSave={f.onSave ?? noop}
              editable={editable && !!f.onSave}
              type={f.type}
              displayValue={f.displayValue}
              highlight={f.highlight}
              min={f.min}
              max={f.max}
            />
          ),
        )}
      </div>
    </div>
  );
}
