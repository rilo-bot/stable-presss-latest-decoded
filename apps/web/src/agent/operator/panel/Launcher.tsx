// ---------------------------------------------------------------------------
// The Stable Hand launcher — the gold-horse button both modes share.
//
//   placement 'corner'  the floating button bottom-right on every page (the
//                       concierge's original look, unchanged).
//   placement 'studio'  a compact pill at the bottom-centre, used by the
//                       Operator while a full-screen Studio is open (Magazine
//                       Builder, Article/Blog/Story Studios). Those screens own
//                       BOTH side columns — the editor's own AI panel + page rail
//                       on the left, the inspector on the right — so a corner
//                       button would sit on top of real controls. The middle of
//                       the bottom edge is canvas margin, where floating editor
//                       chrome conventionally lives.
//
// `print:hidden` matters: the server PRINTS real routes to make the published
// bulletin PDF; without it the launcher was stamped onto every downloaded issue.
// ---------------------------------------------------------------------------

import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

const FOREST = 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)';

export function StablehandLauncher({
  open,
  onClick,
  placement = 'corner',
  working = false,
  zClass = 'z-50',
  operatorUi = false,
  liftOnPhone = false,
}: {
  open: boolean;
  onClick: () => void;
  placement?: 'corner' | 'studio';
  /** The Operator is mid-run with the panel closed — spin a gold ring. */
  working?: boolean;
  zClass?: string;
  /** Mark as Operator chrome (readScreen skips it; clicks aren't a takeover). */
  operatorUi?: boolean;
  /** Phone only: sit higher, clear of a bottom composer (the magazine editor's
   *  AI Studio sheet keeps its message box at the bottom). */
  liftOnPhone?: boolean;
}) {
  const reduce = useReducedMotion();
  const uiAttr = operatorUi ? { 'data-operator-ui': '' } : {};

  if (placement === 'studio') {
    return (
      // Positioning lives on a wrapper: framer's transform would override the
      // -translate-x-1/2 centring if both sat on the motion element.
      // Phone (<md): bottom-centre is where the Magazine AI Studio sheet keeps its
      // message box, so the pill shrinks to a round gold-horse button on the
      // right edge, above that composer.
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 max-md:bottom-24 max-md:left-auto max-md:right-3 max-md:translate-x-0 ${zClass} print:hidden`}
        {...uiAttr}
      >
        <motion.button
          aria-label={open ? 'Close The Stable Hand' : 'Ask The Stable Hand'}
          onClick={onClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative flex h-10 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-xs font-semibold max-md:w-10 max-md:justify-center max-md:px-0"
          style={{
            background: FOREST,
            border: '1px solid var(--gold-mid)',
            color: 'var(--parchment)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45), 0 0 0 3px rgba(212,168,67,0.14)',
          }}
        >
          <span className="relative flex h-7 w-7 items-center justify-center">
            {working && !reduce && (
              <span
                aria-hidden
                className="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
                style={{ borderTopColor: 'var(--gold-bright)' }}
              />
            )}
            <img src="/images/favicon-gold.png" alt="" className="h-5 w-5 object-contain" />
          </span>
          <span className="max-md:sr-only">{working ? 'The Stable Hand is working…' : 'The Stable Hand'}</span>
        </motion.button>
      </div>
    );
  }

  return (
    <motion.button
      aria-label={open ? 'Close The Stable Hand' : 'Ask The Stable Hand'}
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      className={`fixed bottom-5 right-5 ${liftOnPhone ? "max-md:bottom-24" : ""} ${zClass} flex h-14 w-14 items-center justify-center rounded-full print:hidden`}
      style={{
        background: FOREST,
        border: '1px solid var(--gold-mid)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.45), 0 0 0 4px rgba(212,168,67,0.16)',
      }}
      {...uiAttr}
    >
      {/* Pulsing gold "attention" ring — a gentle nudge while idle/closed */}
      {!open && !reduce && !working && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ border: '2px solid var(--gold-bright)' }}
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: 0, scale: 1.55 }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      {/* Mid-run with the panel closed: a spinning gold arc instead. */}
      {working && (
        <span
          aria-hidden
          className={'absolute -inset-1 rounded-full border-2 border-transparent ' + (reduce ? '' : 'animate-spin')}
          style={{ borderTopColor: 'var(--gold-bright)', borderRightColor: reduce ? 'var(--gold-bright)' : 'transparent' }}
        />
      )}

      {open ? (
        <X className="h-6 w-6" style={{ color: 'var(--gold-bright)' }} />
      ) : (
        <>
          {/* Idle gallop: a soft bob + lean, like the horse is cantering in place */}
          <motion.img
            src="/images/favicon-gold.png"
            alt=""
            className="h-9 w-9 object-contain"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
            animate={reduce ? undefined : { y: [0, -2.5, 0], rotate: [0, -2.5, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          />
          {/* Sparkle badge */}
          <motion.span
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full"
            style={{
              background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))',
              border: '1.5px solid var(--forest-deep)',
            }}
            animate={reduce ? undefined : { scale: [1, 1.18, 1] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          >
            <Sparkles className="h-2 w-2" style={{ color: 'var(--forest-deep)' }} />
          </motion.span>
        </>
      )}
    </motion.button>
  );
}
