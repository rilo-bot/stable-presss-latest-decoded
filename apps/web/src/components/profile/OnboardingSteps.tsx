/**
 * OnboardingSteps — a gamified "race to the finish" progress strip pinned at the
 * top of an entity's edit view while the profile is incomplete. A racing-themed
 * level map: a galloping-horse marker rides a filling track toward a finish flag,
 * milestone nodes sit along the way (✓ done · glowing+pulsing current · dashed
 * skipped · muted upcoming), and a motivational racing caption tracks progress.
 * Nodes are clickable to jump to a step. Disappears once every step is resolved.
 *
 * Dumb/presentational: the container computes `steps` (+ optional per-step icons)
 * and wires `onStepClick`.
 */
import { Check, Minus, Trophy, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { serifStyle, displayStyle, goldStyle } from '@/components/profile/kit';

export interface OnbStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  /** User chose to skip this step — counts as resolved but shown distinctly. */
  skipped?: boolean;
  /** DOM id to scroll to when the step is actioned (`module:<key>` opens a module). */
  anchorId?: string;
  /** Short guideline bullets shown in the inline coach bubble. */
  tips?: string[];
  /** Optional milestone icon (falls back to the step number). */
  icon?: React.ReactNode;
}

/** Racing-flavoured encouragement that tracks progress. */
function raceCaption(pct: number, doneCount: number): string {
  if (doneCount === 0) return 'And they’re off — add your first detail!';
  if (pct >= 80) return 'Into the final furlong — nearly there!';
  if (pct >= 55) return 'Making the running — keep it up!';
  if (pct >= 30) return 'Settling into a good rhythm.';
  return 'Out of the gates — great start!';
}

export function OnboardingSteps({ title, steps, onStepClick }: {
  title: string;
  steps: OnbStep[];
  onStepClick?: (anchorId?: string) => void;
}) {
  const reduce = useReducedMotion();
  const resolved = (s: OnbStep) => s.done || !!s.skipped;
  const total = steps.length;
  const doneCount = steps.filter(resolved).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const currentIdx = steps.findIndex((s) => !resolved(s));
  if (currentIdx === -1) return null; // all resolved → hide

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 60, damping: 18 };

  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden' }}>
      <div className="sku-green-header" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Sparkles size={13} style={{ color: 'var(--gold-bright)' }} />
          <span style={{ ...goldStyle, ...displayStyle, fontSize: '0.84rem', fontWeight: 700 }}>{title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Trophy size={12} style={{ color: 'var(--gold-bright)' }} />
          <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--gold-bright)' }}>{doneCount} / {total}</span>
        </span>
      </div>

      <div className="sku-parchment" style={{ padding: '11px 16px 14px' }}>
        {/* Caption + percent */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: '0.62rem', fontStyle: 'italic', color: 'var(--forest-mid)' }}>{raceCaption(pct, doneCount)}</span>
          <span style={{ ...displayStyle, fontSize: '0.72rem', fontWeight: 800, color: 'var(--gold-dark)' }}>{pct}%</span>
        </div>

        {/* Race track: a filling bar, a galloping marker that rides it, finish flag */}
        <div style={{ position: 'relative', height: 20, marginBottom: 14 }}>
          <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 6, borderRadius: 4, background: 'rgba(26,51,34,0.16)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)', backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 13px, rgba(0,0,0,0.06) 13px 15px)' }} />
          <motion.div initial={false} animate={{ width: `${pct}%` }} transition={spring} style={{ position: 'absolute', top: 7, left: 0, height: 6, borderRadius: 4, background: 'linear-gradient(90deg, var(--gold-mid), var(--gold-bright))', boxShadow: '0 0 8px rgba(212,168,67,0.55)' }} />
          <motion.div initial={false} animate={{ left: `${pct}%` }} transition={spring} style={{ position: 'absolute', top: 0 }}>
            <motion.span aria-hidden animate={reduce ? {} : { y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 0.65, ease: 'easeInOut' }} style={{ display: 'inline-block', marginLeft: -10, fontSize: 17, lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>🏇</motion.span>
          </motion.div>
          <div aria-hidden style={{ position: 'absolute', right: -3, top: 1, fontSize: 15, lineHeight: 1, opacity: pct >= 70 ? 1 : 0.55, filter: pct >= 70 ? 'drop-shadow(0 0 5px rgba(212,168,67,0.85))' : 'grayscale(0.4)', transition: 'opacity 0.3s, filter 0.3s' }}>🏁</div>
        </div>

        {/* Milestone nodes */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          {steps.map((s, i) => {
            const isDone = s.done;
            const isSkipped = !s.done && !!s.skipped;
            const isCurrent = i === currentIdx;
            const prevResolved = i > 0 && resolved(steps[i - 1]);
            const ring = isDone || isCurrent ? 'var(--gold-bright)' : 'var(--gold-dark)';
            const fill = isDone ? 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))' : isCurrent ? 'rgba(180,140,30,0.2)' : 'rgba(26,51,34,0.06)';
            const fg = isDone ? 'var(--forest-deep)' : isCurrent ? 'var(--gold-dark)' : 'var(--parchment-label)';
            return (
              <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, position: 'relative' }}>
                {/* connector to previous (fills as the race is run) */}
                {i > 0 && (
                  <div style={{ position: 'absolute', top: 15, right: '50%', width: '100%', height: 3, borderRadius: 2, background: prevResolved ? 'linear-gradient(90deg, var(--gold-mid), var(--gold-bright))' : 'var(--gold-dark)', opacity: prevResolved ? 1 : 0.35, zIndex: 0 }} />
                )}
                <motion.button
                  type="button"
                  onClick={() => onStepClick?.(s.anchorId)}
                  title={isSkipped ? `Skipped — ${s.hint || s.label}` : (s.hint || s.label)}
                  initial={false}
                  animate={isCurrent && !reduce ? { scale: [1, 1.09, 1] } : { scale: 1 }}
                  transition={isCurrent && !reduce ? { repeat: Infinity, duration: 1.8, ease: 'easeInOut' } : { duration: 0.2 }}
                  whileHover={{ scale: 1.13 }}
                  style={{ position: 'relative', zIndex: 1, width: 32, height: 32, borderRadius: '50%', border: `2px ${isSkipped ? 'dashed' : 'solid'} ${ring}`, background: fill, color: fg, opacity: isSkipped ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem', boxShadow: isCurrent ? '0 0 0 4px rgba(212,168,67,0.22), 0 0 10px rgba(212,168,67,0.4)' : isDone ? '0 1px 4px rgba(0,0,0,0.25)' : 'none', ...serifStyle }}
                >
                  {isDone
                    ? <motion.span initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }} style={{ display: 'flex' }}><Check size={15} strokeWidth={3} /></motion.span>
                    : isSkipped ? <Minus size={14} strokeWidth={3} />
                    : (s.icon ?? i + 1)}
                </motion.button>
                <span style={{ marginTop: 6, fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, textAlign: 'center', color: isCurrent ? 'var(--forest-deep)' : 'var(--parchment-label)', opacity: isSkipped ? 0.6 : 1, lineHeight: 1.2, maxWidth: 66, overflow: 'hidden' }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
