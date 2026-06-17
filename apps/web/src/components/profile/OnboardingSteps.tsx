/**
 * OnboardingSteps — a numbered, gamified "finish your profile" guide shown at the
 * top-centre of an entity's edit view while the profile is incomplete. Renders a
 * progress bar + a numbered stepper (✓ done · gold-ring current · muted upcoming)
 * and a callout for the next step with a "Jump to it" button that scrolls to the
 * relevant section. Disappears once every step is done (the reward is completion).
 *
 * Dumb/presentational: the container computes `steps` from the entity's data and
 * wires `onStepClick` to scroll to an anchor id.
 */
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { serifStyle, displayStyle, goldStyle } from '@/components/profile/kit';

export interface OnbStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  /** DOM id to scroll to when the step is actioned. */
  anchorId?: string;
}

export function OnboardingSteps({ title, steps, onStepClick, onAskAI }: {
  title: string;
  steps: OnbStep[];
  onStepClick?: (anchorId?: string) => void;
  /** When provided, shows an "Ask AI" button on the current step that opens the
   * Stable Studio assistant pre-seeded with a prompt for that step. */
  onAskAI?: (step: OnbStep) => void;
}) {
  const total = steps.length;
  const doneCount = steps.filter((s) => s.done).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const currentIdx = steps.findIndex((s) => !s.done);
  if (currentIdx === -1) return null; // all done → hide

  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden' }}>
      <div className="sku-green-header" style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Sparkles size={14} style={{ color: 'var(--gold-bright)' }} />
          <span style={{ ...goldStyle, ...displayStyle, fontSize: '0.92rem', fontWeight: 700 }}>{title}</span>
        </span>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--gold-bright)' }}>{doneCount} / {total} done</span>
      </div>

      <div className="sku-parchment" style={{ padding: '12px 14px 14px' }}>
        {/* Progress bar */}
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(26,51,34,0.18)', overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)', marginBottom: 14 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--gold-mid), var(--gold-bright))', borderRadius: 4, transition: 'width 0.4s ease' }} />
        </div>

        {/* Numbered stepper */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          {steps.map((s, i) => {
            const isDone = s.done;
            const isCurrent = i === currentIdx;
            const ring = isDone ? 'var(--gold-bright)' : isCurrent ? 'var(--gold-bright)' : 'var(--gold-dark)';
            const fill = isDone ? 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))' : isCurrent ? 'rgba(180,140,30,0.18)' : 'rgba(26,51,34,0.06)';
            return (
              <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, position: 'relative' }}>
                {/* connector to previous */}
                {i > 0 && (
                  <div style={{ position: 'absolute', top: 13, right: '50%', width: '100%', height: 2, background: steps[i - 1].done ? 'var(--gold-mid)' : 'var(--gold-dark)', opacity: steps[i - 1].done ? 1 : 0.4, zIndex: 0 }} />
                )}
                <button
                  type="button"
                  onClick={() => onStepClick?.(s.anchorId)}
                  title={s.label}
                  style={{ position: 'relative', zIndex: 1, width: 28, height: 28, borderRadius: '50%', border: `2px solid ${ring}`, background: fill, color: isDone ? 'var(--forest-deep)' : isCurrent ? 'var(--gold-bright)' : 'var(--parchment-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', boxShadow: isCurrent ? '0 0 0 3px rgba(212,168,67,0.25)' : 'none', ...serifStyle }}
                >
                  {isDone ? <Check size={14} strokeWidth={3} /> : i + 1}
                </button>
                <span style={{ marginTop: 5, fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, textAlign: 'center', color: isCurrent ? 'var(--forest-deep)' : 'var(--parchment-shadow)', lineHeight: 1.2, maxWidth: 64, overflow: 'hidden' }}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Current-step callout */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 4, border: '1px solid var(--gold-mid)', background: 'linear-gradient(90deg, rgba(180,140,30,0.12), rgba(26,51,34,0.06))' }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', color: 'var(--forest-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.64rem' }}>{currentIdx + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)' }}>{steps[currentIdx].label}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--forest-mid)', fontStyle: 'italic' }}>{steps[currentIdx].hint}</div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            {onAskAI && (
              <button type="button" onClick={() => onAskAI(steps[currentIdx])} title="Let the Stable Studio assistant help with this step" style={{ flexShrink: 0, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'rgba(180,140,30,0.12)', color: 'var(--forest-deep)', cursor: 'pointer', ...serifStyle }}>
                <Sparkles size={12} style={{ color: 'var(--gold-dark)' }} /> Ask AI
              </button>
            )}
            {steps[currentIdx].anchorId && (
              <button type="button" onClick={() => onStepClick?.(steps[currentIdx].anchorId)} className="sku-gold-btn" style={{ flexShrink: 0, padding: '5px 11px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', ...serifStyle }}>
                Do it <ArrowRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
