/**
 * AddHorseChoice — a small on-brand modal offering the two ways to add a horse:
 *   - Guided studio (photo-first, the Stablehand walks you through it), and
 *   - Quick form (type all the details in one form and save).
 * Presentational: the caller wires what each choice does (onGuided / onQuick).
 */
import { X, Zap, Sparkles, ArrowRight } from 'lucide-react';

const serif: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };

const cardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7,
  textAlign: 'left', padding: '14px', borderRadius: 6, cursor: 'pointer', minHeight: 158,
  border: '1px solid var(--gold-mid)', background: 'rgba(255,255,255,0.42)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)', transition: 'border-color 0.15s, box-shadow 0.15s',
};
const badgeRow: React.CSSProperties = { minHeight: 16, display: 'flex' };
const recTag: React.CSSProperties = {
  fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--forest-deep)', background: 'rgba(212,168,67,0.35)', border: '1px solid var(--gold-dark)',
  borderRadius: 10, padding: '1px 7px',
};
const iconCircle: React.CSSProperties = {
  width: 42, height: 42, borderRadius: '50%', border: '1px solid var(--gold-dark)',
  background: 'rgba(180,140,30,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const cardTitle: React.CSSProperties = { fontSize: '0.92rem', fontWeight: 700, color: 'var(--forest-deep)' };
const cardDesc: React.CSSProperties = { fontSize: '0.66rem', color: 'var(--forest-mid)', lineHeight: 1.45, margin: 0, flex: 1 };
const cta: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gold-dark)',
};

export function AddHorseChoice({ open, onClose, onGuided, onQuick }: {
  open: boolean;
  onClose: () => void;
  onGuided: () => void;
  onQuick: () => void;
}) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Add a horse" style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(10,20,14,0.55)', backdropFilter: 'blur(3px)' }} />
      <div className="sku-gold-card" style={{ position: 'relative', zIndex: 1, width: 'min(94vw, 560px)', overflow: 'hidden', ...serif }}>
        <div className="sku-green-header" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--gold-bright)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.04em' }}>Add a horse</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--gold-mid)', cursor: 'pointer', display: 'flex', padding: 4 }}><X size={14} /></button>
        </div>
        <div className="sku-parchment" style={{ padding: 14 }}>
          <p style={{ margin: '0 0 12px', fontSize: '0.66rem', color: 'var(--forest-mid)', ...serif }}>How would you like to add it?</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {/* Guided */}
            <button type="button" onClick={onGuided} className="onb-choice-card" style={cardStyle}>
              <div style={badgeRow}><span style={recTag}>Recommended</span></div>
              <div style={iconCircle}><Sparkles size={20} style={{ color: 'var(--gold-dark)' }} /></div>
              <div style={cardTitle}>Guided studio</div>
              <p style={cardDesc}>Photo-first — the Stablehand walks you through each step with tips, AI &amp; voice.</p>
              <span style={cta}>Start guided <ArrowRight size={12} /></span>
            </button>
            {/* Quick */}
            <button type="button" onClick={onQuick} className="onb-choice-card" style={cardStyle}>
              <div style={badgeRow} />
              <div style={iconCircle}><Zap size={20} style={{ color: 'var(--gold-dark)' }} /></div>
              <div style={cardTitle}>Quick form</div>
              <p style={cardDesc}>Type all the details in one form and save — fastest for horses you already know.</p>
              <span style={cta}>Open form <ArrowRight size={12} /></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
