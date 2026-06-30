/**
 * OnboardingFocus — the centered "focus mode" for onboarding. Instead of pointing
 * an arrow at the box a step needs, we bring that step's editor to the middle of
 * the screen over a dimmed (inert) backdrop with a Skip button. When the step is
 * filled (its done predicate flips) or skipped, the container swaps `stepKey` and
 * the card animates back toward its in-place slot while the next step's card flies
 * out from its own slot — a FLIP using the in-place box's rect as the origin.
 *
 * Dumb/presentational: the container computes the active step's title/tips/content
 * and the in-place box's DOM id (`originId`). Backdrop is intentionally inert
 * (no dismiss) — the only ways forward are completing the field or pressing Skip.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion, useAnimationControls } from 'framer-motion';
import { Sparkles, SkipForward, X } from 'lucide-react';
import { serifStyle, displayStyle, goldStyle } from '@/components/profile/kit';
import { useProfileAgentUi } from '@/stores/profileAgentUiStore';

export interface OnboardingFocusProps {
  /** Show the overlay. False → render nothing (e.g. chat open, or onboarding done). */
  open: boolean;
  /** Active step key — drives the AnimatePresence swap between steps. */
  stepKey: string;
  stepIndex: number;
  total: number;
  title: string;
  tips?: string[];
  /** The centered editor for this step (PortraitFrame / IdentityCard / RoleConnectionBox / CTA). */
  content: React.ReactNode;
  /** Focusable box key for the active step, so the assistant + purple ring track it. */
  boxKey?: string;
  /** DOM id of the in-place box for the FLIP origin (skipped for `module:` / missing ids). */
  originId?: string;
  skippable?: boolean;
  onSkip?: () => void;
  /** Opens the Stablehand chat primed for this step. */
  onAsk?: () => void;
  /** Closes the whole guided journey (anything entered is already saved). */
  onClose?: () => void;
}

/** The centered card; owns the FLIP from the in-place box's rect to screen centre. */
function FocusCard({ stepKey, originId, reduce, children }: {
  stepKey: string;
  originId?: string;
  reduce: boolean | null;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const controls = useAnimationControls();
  // The leaving step animates back to this same origin (captured per instance).
  const originRef = useRef<{ x: number; y: number; scale: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const el = originId && !originId.startsWith('module:') ? document.getElementById(originId) : null;
    const o = el?.getBoundingClientRect();
    const c = card?.getBoundingClientRect();
    if (reduce || !o || !c || !o.width || !c.width) {
      // No usable origin (or reduced motion) → a plain scale/fade at centre.
      originRef.current = null;
      controls.set({ opacity: 0, scale: 0.96, x: 0, y: 0 });
      void controls.start({ opacity: 1, scale: 1, x: 0, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' } });
      return;
    }
    const scale = Math.min(1, o.width / c.width);
    const x = (o.left + o.width / 2) - (c.left + c.width / 2);
    const y = (o.top + o.height / 2) - (c.top + c.height / 2);
    originRef.current = { x, y, scale };
    controls.set({ opacity: 0.5, x, y, scale });
    void controls.start({ opacity: 1, x: 0, y: 0, scale: 1, transition: { type: 'spring', stiffness: 210, damping: 26 } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, originId, reduce]);

  const exit = reduce
    ? { opacity: 0, transition: { duration: 0 } }
    : originRef.current
      ? { opacity: 0, ...originRef.current, transition: { duration: 0.24, ease: 'easeIn' as const } }
      : { opacity: 0, scale: 0.96, transition: { duration: 0.18 } };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, pointerEvents: 'none' }}>
      <motion.div
        ref={cardRef}
        initial={false}
        animate={controls}
        exit={exit}
        className="sku-gold-card"
        style={{ position: 'relative', width: 'min(560px, 92vw)', maxHeight: 'min(82vh, 720px)', overflowY: 'auto', pointerEvents: 'auto', ...serifStyle }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function OnboardingFocus({ open, stepKey, stepIndex, total, title, tips, content, boxKey, originId, skippable, onSkip, onAsk, onClose }: OnboardingFocusProps) {
  const reduce = useReducedMotion();

  // Keep the assistant's focus (and the purple ring on the in-place box) in sync
  // with the step the guide is on — tracked by boxKey (not `open`, which toggles
  // off when the chat opens), so opening the chat mid-step stays scoped. Mounted
  // only during the guided journey; clears the selection when it unmounts.
  useEffect(() => {
    if (boxKey) useProfileAgentUi.getState().select(boxKey);
    return () => useProfileAgentUi.getState().select(null);
  }, [boxKey]);

  return (
    <>
      {/* Dimmed, inert backdrop — persists across step swaps; only fades with `open`. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="onb-focus-backdrop"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, zIndex: 84, background: 'rgba(10,20,14,0.55)', backdropFilter: 'blur(3px)' }}
          />
        )}
      </AnimatePresence>

      {/* Centered step card — swaps per step (old flies back, new flies out). */}
      <AnimatePresence mode="wait">
        {open && (
          <FocusCard key={stepKey} stepKey={stepKey} originId={originId} reduce={reduce}>
            <div className="sku-green-header" style={{ padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} style={{ color: 'var(--gold-bright)' }} />
              <span style={{ ...displayStyle, ...goldStyle, fontSize: '0.92rem', fontWeight: 700, flex: 1, minWidth: 0 }}>{title}</span>
              <span style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--gold-mid)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Step {stepIndex + 1} of {total}</span>
              {onClose && (
                <button type="button" onClick={onClose} title="Close the guide — you can finish the rest anytime" aria-label="Close guided journey" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--gold-mid)', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="sku-parchment" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tips && tips.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {tips.map((t) => (
                    <li key={t} style={{ display: 'flex', gap: 7, fontSize: '0.68rem', color: 'var(--forest-mid)', lineHeight: 1.45 }}>
                      <span style={{ color: 'var(--gold-dark)', fontWeight: 700 }}>·</span><span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div>{content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2, flexWrap: 'wrap' }}>
                {onAsk && (
                  <button type="button" onClick={onAsk} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'rgba(180,140,30,0.12)', color: 'var(--forest-deep)', cursor: 'pointer', ...serifStyle }}>
                    <Sparkles size={12} style={{ color: 'var(--gold-dark)' }} /> Ask Stablehand
                  </button>
                )}
                {skippable && onSkip && (
                  <button type="button" onClick={onSkip} title="Skip this step — you can add it later" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderRadius: 3, border: '1px solid var(--gold-dark)', background: 'none', color: 'var(--parchment-label)', cursor: 'pointer', ...serifStyle }}>
                    <SkipForward size={12} /> Skip
                  </button>
                )}
              </div>
            </div>
          </FocusCard>
        )}
      </AnimatePresence>
    </>
  );
}
