// ---------------------------------------------------------------------------
// The Operator's two "your turn" cards, pinned under the conversation:
//
//   ConfirmCard   an action that publishes / shares / sends / deletes asked for
//                 the user's OK (useOperator.requestConfirm). Nothing happens
//                 until they press Confirm — this card IS the safety rail, so it
//                 is deliberately the loudest thing in the panel.
//   PausedBanner  the user clicked or typed in the page mid-run (takeover
//                 guard) and The Stable Hand stepped back. Resume or Stop.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Hand, Pause, Play, ShieldCheck, Square } from 'lucide-react';

import { useOperator } from '@/agent/operator/operatorStore';

export function ConfirmCard() {
  const pending = useOperator((s) => s.pendingConfirm);
  const resolveConfirm = useOperator((s) => s.resolveConfirm);
  const reduce = useReducedMotion();
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Bring it into view and onto the keyboard — it is blocking the run. Focus
  // goes to CANCEL, never Confirm: the card pops up while the user may be
  // typing in the chat box, and a Space / Enter landing on a focused Confirm
  // approved a publish or delete they never read. Nor is focus taken from a
  // field they are typing in.
  useEffect(() => {
    if (!pending) return;
    okRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    const a = document.activeElement;
    const typing = a instanceof HTMLElement && (a.isContentEditable || a.matches('input, textarea, select'));
    if (!typing) cancelRef.current?.focus({ preventScroll: true });
  }, [pending, reduce]);

  if (!pending) return null;
  return (
    <motion.div
      key={pending.id}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      role="alertdialog"
      aria-label="The Stable Hand needs your OK"
      className="rounded-xl border-2 p-3 shadow-md"
      style={{ borderColor: 'var(--gold-bright)', background: 'linear-gradient(180deg, rgba(212,168,67,0.12), rgba(212,168,67,0.04))' }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--gold-dark)' }}>
        <ShieldCheck className="h-3.5 w-3.5" /> Needs your OK
      </div>
      <p className="whitespace-pre-wrap text-sm leading-snug text-foreground">{pending.summary}</p>
      <div className="mt-3 flex gap-2">
        <button
          ref={okRef}
          type="button"
          onClick={() => resolveConfirm(true)}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ background: 'var(--gold-bright)', color: 'var(--forest-deep)', ['--tw-ring-color' as string]: 'var(--gold-dark)' }}
        >
          Confirm
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={() => resolveConfirm(false)}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

export function PausedBanner({ onStop }: { onStop: () => void }) {
  const status = useOperator((s) => s.status);
  const reason = useOperator((s) => s.pauseReason);
  const resume = useOperator((s) => s.resume);
  if (status !== 'paused') return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
      style={{ borderColor: 'rgba(212,168,67,0.5)', background: 'rgba(212,168,67,0.08)' }}
    >
      {reason === 'takeover' ? (
        <Hand className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--gold-dark)' }} />
      ) : (
        <Pause className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--gold-dark)' }} />
      )}
      <span className="min-w-0 flex-1 leading-snug text-foreground">
        {reason === 'takeover' ? 'You took over — The Stable Hand paused.' : 'The Stable Hand is paused.'}
      </span>
      <button
        type="button"
        onClick={resume}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
        style={{ background: 'var(--gold-bright)', color: 'var(--forest-deep)' }}
      >
        <Play className="h-3 w-3" /> Resume
      </button>
      <button
        type="button"
        onClick={onStop}
        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
      >
        <Square className="h-3 w-3" /> Stop
      </button>
    </div>
  );
}
