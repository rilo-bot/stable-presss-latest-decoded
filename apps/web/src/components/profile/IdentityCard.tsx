/**
 * IdentityCard — a parchment dt/dd identity block built from field descriptors.
 * This is the core "use it as a form AND to show data" piece: each field becomes
 * an InlineEditRow, which renders read-only text when `editable` is false and an
 * auto-saving input when true. Non-field rows (e.g. role chips) use `render`.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  type?: 'text' | 'number' | 'date' | 'select';
  /** Choices for type='select'. */
  options?: string[];
  highlight?: boolean;
  min?: number | string;
  max?: number | string;
  /** Escape hatch: render this node as the row instead of an InlineEditRow. */
  render?: React.ReactNode;
}

const noop = () => {};

export function IdentityCard({ title, fields, editable, icon, className, collapsibleAfter }: { title: string; fields: FieldDescriptor[]; editable: boolean; icon?: React.ReactNode; className?: string; collapsibleAfter?: number }) {
  const [expanded, setExpanded] = useState(false);
  // Collapse only makes sense read-only (in edit mode every field must stay
  // reachable). When set, show the first `collapsibleAfter` rows and tuck the
  // rest behind an arrow toggle that expands in place, pushing siblings down.
  const canCollapse = collapsibleAfter != null && !editable && fields.length > collapsibleAfter;
  const visibleFields = canCollapse && !expanded ? fields.slice(0, collapsibleAfter) : fields;

  return (
    <div className={`sku-gold-card${className ? ` ${className}` : ''}`} style={{ ...serifStyle, display: 'flex', flexDirection: 'column' }}>
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
        {visibleFields.map((f) =>
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
              options={f.options}
              displayValue={f.displayValue}
              highlight={f.highlight}
              min={f.min}
              max={f.max}
            />
          ),
        )}
        {canCollapse && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 0', background: 'none', border: 'none', borderTop: '1px dashed var(--gold-dark)', cursor: 'pointer', fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: 'var(--forest-mid)', ...serifStyle }}
            aria-label={expanded ? 'Show fewer details' : 'Show more details'}
          >
            {expanded ? 'Less' : 'More'}
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}
