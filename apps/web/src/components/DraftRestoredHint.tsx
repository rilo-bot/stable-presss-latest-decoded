import { RotateCcw, X } from 'lucide-react';

const serifStyle: React.CSSProperties = { fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif" };

/**
 * Small inline notice shown at the top of a parchment-themed form when a saved
 * draft has been restored, with a button to discard it and start fresh.
 */
export function DraftRestoredHint({ onDiscard }: { onDiscard: () => void }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        padding: '7px 10px', borderRadius: 3,
        background: 'rgba(26,51,34,0.06)', border: '1px solid var(--parchment-dark)',
        ...serifStyle,
      }}
    >
      <RotateCcw size={12} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.6rem', color: 'var(--parchment-shadow)', lineHeight: 1.4 }}>
        Unsaved draft restored from your last session.
      </span>
      <button
        type="button"
        onClick={onDiscard}
        style={{
          display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 2,
          background: 'transparent', border: '1px solid var(--parchment-dark)', cursor: 'pointer',
          fontSize: '0.52rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--parchment-shadow)', ...serifStyle,
        }}
      >
        <X size={9} /> Discard
      </button>
    </div>
  );
}
