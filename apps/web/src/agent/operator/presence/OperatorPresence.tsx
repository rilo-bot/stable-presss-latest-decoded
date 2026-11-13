// ---------------------------------------------------------------------------
// <OperatorPresence/> — The Stable Hand Operator's on-screen presence.
//
// While a run is live the whole app is visibly "being driven", in the site's
// forest/gold brand (the same palette as The Stable Hand panel in
// components/AgentWidget.tsx):
//
//   GoldenFrame    a gold border around the site (the viewport, less The Stable
//                  Hand dock on desktop — index.css) with a slow moving sheen
//                  and a soft breathing inner glow (dim + static when paused)
//   WorkingPill    top-centre "The Stable Hand is working here" + current step +
//                  optional progress bar + Stop / Resume — the ONLY part that
//                  takes pointer events. Below lg it hides while the bottom
//                  sheet is open (the sheet shows the same status + Stop), and
//                  it fades aside when the cursor works on something beneath it
//   GhostCursor    gold arrow + tiny gold-horse badge + label bubble + click
//                  ripple, drawn from the MotionValues presenceApi glides
//   Highlight /    gold ring tracking the target element, and brief glow
//   Flash          pulses on elements that just changed
//
// Everything is portalled to <body>, marked data-operator-ui (readScreen skips
// it; clicks in it are not a "takeover") and print:hidden (the server prints
// real routes to PDF — Operator chrome must never land in a published issue).
// Overlays are fixed boxes only — nothing here touches app elements' styles,
// and nothing but the pill intercepts the pointer.
//
// Mounted once in App.tsx by the panel layer.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Pause, Play, Sparkles, Square } from 'lucide-react';

import { useAgentUi } from '@/stores/agentUiStore';
import { stablehandReserve } from '@/lib/stablehandDock';
import { OPERATOR_UI_ATTR } from '../contracts';
import { useOperator } from '../operatorStore';
import { presence } from './presenceApi';
import { cursorX, cursorY, elementKey, glide, usePresenceOverlay } from './presenceStore';

const FOREST = 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)';
const GOLD_FILL = 'linear-gradient(135deg, var(--gold-light) 0%, var(--gold-bright) 45%, var(--gold-mid) 100%)';

/** Spread onto every overlay root. */
const UI = { [OPERATOR_UI_ATTR]: '' } as Record<string, string>;

const Z = { frame: 9997, highlight: 9998, pill: 9999, cursor: 10000 } as const;

// Keyframes + the ring mask live in one injected sheet (this folder owns no
// global CSS). Transform/opacity-only animations, so they run on the
// compositor; all of them stop under prefers-reduced-motion.
const PRESENCE_CSS = `
@keyframes sp-op-spin { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
@keyframes sp-op-breathe { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
@keyframes sp-op-shimmer { from { transform: translateX(-120%); } to { transform: translateX(320%); } }
.sp-op-ring-mask {
  padding: 3px;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
@media (prefers-reduced-motion: reduce) {
  [data-sp-op-anim] { animation: none !important; }
}
`;

// ── Root ────────────────────────────────────────────────────────────────────

/** Below lg The Stable Hand panel is a bottom sheet (OperatorPanel's breakpoint). */
const SHEET_QUERY = '(max-width: 1023.98px)';

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function OperatorPresence() {
  const status = useOperator((s) => s.status);
  const pauseReason = useOperator((s) => s.pauseReason);
  const stepLabel = useOperator((s) => s.stepLabel);
  const progress = useOperator((s) => s.progress);
  const panelYield = useOperator((s) => s.panelYield);
  // The full panel (the sheet, below lg) — not the desktop rail / closed.
  const panelOpen = useAgentUi((s) => s.open && !s.collapsed);
  const sheetLayout = useMediaQuery(SHEET_QUERY);
  // On a phone / tablet the open bottom sheet already shows "Working" + Stop,
  // and the pill would only sit on the page's top toolbar (Back, Review,
  // Publish…). So the pill shows there only while the sheet is closed or has
  // stepped aside (panelYield) — exactly one Stop is reachable at any time.
  const pillHiddenBySheet = sheetLayout && panelOpen && !panelYield;

  // A run that ends (done / stopped / errored) takes its cursor + ring with it.
  useEffect(() => {
    if (status === 'idle') presence.hideCursor();
  }, [status]);

  if (typeof document === 'undefined') return null;

  const live = status !== 'idle';
  const paused = status === 'paused';
  const announcement = !live
    ? ''
    : paused
      ? pauseReason === 'takeover'
        ? 'The Stable Hand paused — you took over.'
        : 'The Stable Hand paused.'
      : stepLabel
        ? `The Stable Hand: ${stepLabel}`
        : 'The Stable Hand is working.';

  return createPortal(
    // `contents` = no box of its own: zero layout impact on <body>, and no
    // stacking context, so each layer's own z-index competes with app modals.
    <div {...UI} className="contents print:hidden">
      <style {...UI}>{PRESENCE_CSS}</style>

      <AnimatePresence>{live && <GoldenFrame key="frame" paused={paused} />}</AnimatePresence>

      <HighlightLayer />
      <FlashLayer />

      <AnimatePresence>
        {live && !pillHiddenBySheet && (
          <WorkingPill
            key="pill"
            paused={paused}
            pauseReason={pauseReason}
            stepLabel={stepLabel}
            progress={progress}
          />
        )}
      </AnimatePresence>

      <GhostCursor />

      <div {...UI} aria-live="polite" aria-atomic="true" className="sr-only print:hidden">
        {announcement}
      </div>
    </div>,
    document.body,
  );
}

// ── Golden frame ────────────────────────────────────────────────────────────

function GoldenFrame({ paused }: { paused: boolean }) {
  const playState = paused ? 'paused' : 'running';
  return (
    <motion.div
      {...UI}
      aria-hidden
      // Frames the SITE: on desktop it stops at The Stable Hand dock (index.css).
      className="pointer-events-none fixed inset-stablehand print:hidden"
      style={{ zIndex: Z.frame }}
      initial={{ opacity: 0 }}
      animate={{ opacity: paused ? 0.5 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {/* 3px ring: a static gold base + a bright sheen sweeping round it. The
          sheen is a big conic square rotated by transform (compositor-only),
          masked down to the border. */}
      <div className="sp-op-ring-mask absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, var(--gold-mid), var(--gold-dark) 50%, var(--gold-mid))' }}
        />
        <div
          data-sp-op-anim
          className="absolute left-1/2 top-1/2"
          style={{
            width: '142vmax',
            height: '142vmax',
            transform: 'translate(-50%,-50%)',
            background:
              'conic-gradient(from 0deg, transparent 0deg, transparent 150deg, rgba(240,201,110,0.55) 205deg, var(--gold-shine) 240deg, rgba(240,201,110,0.55) 275deg, transparent 330deg, transparent 360deg)',
            animation: 'sp-op-spin 7s linear infinite',
            animationPlayState: playState,
            willChange: 'transform',
          }}
        />
      </div>

      {/* Soft inner glow, breathing while working. */}
      <div
        data-sp-op-anim
        className="absolute inset-0"
        style={{
          boxShadow:
            'inset 0 0 18px 1px rgba(212,168,67,0.42), inset 0 0 64px 4px rgba(212,168,67,0.12)',
          animation: 'sp-op-breathe 3.4s ease-in-out infinite',
          animationPlayState: playState,
        }}
      />
    </motion.div>
  );
}

// ── Working pill ────────────────────────────────────────────────────────────

interface PillProps {
  paused: boolean;
  pauseReason: 'takeover' | 'user' | null;
  stepLabel: string;
  progress: { label: string; done: number; total: number } | null;
}

function WorkingPill({ paused, pauseReason, stepLabel, progress }: PillProps) {
  const reduce = useReducedMotion();
  // Steps aside while the cursor works on something underneath it (never while
  // paused: then the user needs Resume / Stop, and nothing is being clicked).
  const pillYield = usePresenceOverlay((s) => s.pillYield) && !paused;
  const stop = () => useOperator.getState().stop();
  const resume = () => useOperator.getState().resume();

  const pct = progress && progress.total > 0 ? Math.min(1, Math.max(0, progress.done / progress.total)) : 0;

  return (
    <motion.div
      {...UI}
      data-operator-pill=""
      // Centred over the site, not the window (the dock takes the right edge).
      className="fixed left-mid-stablehand top-2.5 print:hidden sm:top-3"
      style={{ zIndex: Z.pill, x: '-50%', pointerEvents: pillYield ? 'none' : 'auto' }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.96 }}
      animate={{ opacity: pillYield ? 0.12 : 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.96 }}
      transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 380, damping: 30 }}
    >
      <div
        className={
          'flex w-max max-w-[calc(100vw-20px)] flex-col overflow-hidden transition-[border-radius] duration-200 ' +
          (progress ? 'rounded-2xl' : 'rounded-full')
        }
        style={{
          background: FOREST,
          border: '1px solid var(--gold-mid)',
          boxShadow:
            '0 10px 28px rgba(0,0,0,0.38), 0 0 0 3px rgba(212,168,67,0.14), inset 0 1px 0 rgba(255,224,154,0.18)',
          opacity: paused ? 0.96 : 1,
        }}
      >
        <div className="flex min-w-0 items-center gap-2 py-1.5 pl-1.5 pr-1.5 sm:gap-2.5">
          {/* Gold badge: sparkle while working, pause glyph when paused. */}
          <span
            className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: GOLD_FILL, boxShadow: '0 0 0 1.5px var(--forest-deep), 0 0 12px rgba(212,168,67,0.55)' }}
          >
            {paused ? (
              <Pause className="h-3.5 w-3.5" style={{ color: 'var(--forest-deep)' }} fill="currentColor" />
            ) : (
              <motion.span
                className="flex"
                animate={reduce ? undefined : { rotate: [0, 18, -12, 0], scale: [1, 1.14, 1] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
              >
                <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--forest-deep)' }} />
              </motion.span>
            )}
          </span>

          <div className="flex min-w-0 items-baseline gap-1.5">
            <span
              className="whitespace-nowrap font-[family-name:var(--font-display)] text-[12.5px] font-bold sm:text-[13px]"
              style={{ color: 'var(--parchment)' }}
            >
              {paused ? (
                pauseReason === 'takeover' ? (
                  <>
                    Paused<span className="hidden sm:inline"> — you took over</span>
                  </>
                ) : (
                  'Paused'
                )
              ) : (
                <>
                  <span className="sm:hidden">The Stable Hand</span>
                  <span className="hidden sm:inline">The Stable Hand is working here</span>
                </>
              )}
            </span>
            {!paused && stepLabel && (
              <motion.span
                key={stepLabel}
                initial={reduce ? false : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                title={stepLabel}
                className="min-w-0 max-w-[42vw] truncate text-[11.5px] sm:max-w-[280px] sm:text-[12px]"
                style={{ color: 'var(--gold-light)' }}
              >
                <span aria-hidden style={{ color: 'var(--gold-dark)' }}>
                  ·{' '}
                </span>
                {stepLabel}
              </motion.span>
            )}
          </div>

          <div className="ml-1 flex flex-shrink-0 items-center gap-1">
            {paused && (
              <PillButton onClick={resume} label="Resume" ariaLabel="Resume The Stable Hand" primary>
                <Play className="h-3 w-3" fill="currentColor" />
              </PillButton>
            )}
            <PillButton onClick={stop} label="Stop" ariaLabel="Stop The Stable Hand">
              <Square className="h-2.5 w-2.5" fill="currentColor" />
            </PillButton>
          </div>
        </div>

        {progress && (
          <div className="px-3 pb-2 pt-0.5">
            <div className="mb-1 flex items-center justify-between gap-3 text-[10.5px] leading-none">
              <span className="truncate" style={{ color: 'var(--parchment)', opacity: 0.85 }}>
                {progress.label}
              </span>
              <span className="whitespace-nowrap tabular-nums" style={{ color: 'var(--gold-light)' }}>
                {progress.done} of {progress.total}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={progress.label}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="relative h-1.5 overflow-hidden rounded-full"
              style={{ background: 'rgba(212,168,67,0.16)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.35)' }}
            >
              <motion.div
                className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
                style={{ background: GOLD_FILL }}
                initial={false}
                animate={{ width: `${pct * 100}%` }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
              >
                {!paused && (
                  <span
                    data-sp-op-anim
                    className="absolute inset-y-0 left-0 w-1/3"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,240,200,0.75), transparent)',
                      animation: 'sp-op-shimmer 1.6s ease-in-out infinite',
                    }}
                  />
                )}
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PillButton({
  onClick,
  label,
  ariaLabel,
  primary,
  children,
}: {
  onClick: () => void;
  label: string;
  ariaLabel: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...UI}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold transition-[filter,background-color] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold-bright)] active:brightness-95"
      style={
        primary
          ? { background: GOLD_FILL, color: 'var(--forest-deep)', border: '1px solid var(--gold-dark)' }
          : { background: 'rgba(0,0,0,0.28)', color: 'var(--parchment)', border: '1px solid var(--gold-dark)' }
      }
    >
      {children}
      {/* Icon-only Stop on phones; Resume keeps its word (it's the main CTA). */}
      <span className={primary ? '' : 'hidden sm:inline'}>{label}</span>
    </button>
  );
}

// ── Highlight ring + flashes ────────────────────────────────────────────────

/** Keep a fixed overlay box glued to `el`'s rect every frame (handles scroll in
 *  any container, resize, layout shifts, transforms). Writes the box's style
 *  directly — no React render per frame. */
function useTrackRect(
  el: Element,
  boxRef: RefObject<HTMLDivElement>,
  pad: number,
  onGone?: () => void,
) {
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  useLayoutEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const box = boxRef.current;
      if (!box) return;
      if (!el.isConnected) {
        box.style.visibility = 'hidden';
        goneRef.current?.();
        return;
      }
      const r = el.getBoundingClientRect();
      const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
      if (key !== last) {
        last = key;
        if (r.width === 0 && r.height === 0) {
          box.style.visibility = 'hidden';
        } else {
          box.style.visibility = 'visible';
          box.style.transform = `translate3d(${r.left - pad}px, ${r.top - pad}px, 0)`;
          box.style.width = `${r.width + pad * 2}px`;
          box.style.height = `${r.height + pad * 2}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [el, boxRef, pad]);
}

/** The element's own corner radius (read-only), grown by the ring's padding so
 *  the ring hugs pills, cards and avatars alike. */
function ringRadius(el: Element, pad: number): string {
  try {
    const raw = getComputedStyle(el).borderTopLeftRadius;
    if (raw.endsWith('%')) return '9999px';
    const px = parseFloat(raw) || 0;
    return `${Math.max(6, px + pad)}px`;
  } catch {
    return '8px';
  }
}

function HighlightLayer() {
  const el = usePresenceOverlay((s) => s.highlight);
  return <AnimatePresence>{el && <HighlightRing key={elementKey(el)} el={el} />}</AnimatePresence>;
}

const RING_PAD = 4;

function HighlightRing({ el }: { el: Element }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [radius] = useState(() => ringRadius(el, RING_PAD));
  useTrackRect(el, boxRef, RING_PAD, () => {
    // Element re-rendered away: drop the ring (only if it's still this one).
    const s = usePresenceOverlay.getState();
    if (s.highlight === el) s.setHighlight(null);
  });

  return (
    <div
      {...UI}
      ref={boxRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 print:hidden"
      style={{ zIndex: Z.highlight, visibility: 'hidden', willChange: 'transform' }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ borderRadius: radius }}
        initial={{ opacity: 0, scale: reduce ? 1 : 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reduce ? 1 : 1.04 }}
        transition={{ duration: reduce ? 0.12 : 0.22, ease: 'easeOut' }}
      >
        <div
          className="absolute inset-0"
          style={{
            borderRadius: radius,
            border: '2px solid var(--gold-bright)',
            background: 'rgba(212,168,67,0.06)',
            boxShadow: '0 0 0 3px rgba(212,168,67,0.2)',
          }}
        />
        {/* Breathing outer glow (opacity-only animation). */}
        <div
          data-sp-op-anim
          className="absolute inset-0"
          style={{
            borderRadius: radius,
            boxShadow: '0 0 18px 3px rgba(212,168,67,0.5), inset 0 0 10px rgba(212,168,67,0.18)',
            animation: 'sp-op-breathe 1.8s ease-in-out infinite',
          }}
        />
      </motion.div>
    </div>
  );
}

function FlashLayer() {
  const flashes = usePresenceOverlay((s) => s.flashes);
  return (
    <>
      {flashes.map((f) => (
        <FlashBox key={f.id} el={f.el} />
      ))}
    </>
  );
}

const FLASH_PAD = 3;

function FlashBox({ el }: { el: Element }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [radius] = useState(() => ringRadius(el, FLASH_PAD));
  useTrackRect(el, boxRef, FLASH_PAD);

  return (
    <div
      {...UI}
      ref={boxRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 print:hidden"
      style={{ zIndex: Z.highlight, visibility: 'hidden', willChange: 'transform' }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          borderRadius: radius,
          border: '2px solid var(--gold-light)',
          background: 'rgba(240,201,110,0.2)',
          boxShadow: '0 0 26px 6px rgba(212,168,67,0.55)',
        }}
        initial={{ opacity: 0, scale: reduce ? 1 : 0.985 }}
        animate={reduce ? { opacity: [0, 0.8, 0] } : { opacity: [0, 1, 0], scale: [0.985, 1.015, 1] }}
        transition={{ duration: 0.9, times: [0, 0.25, 1], ease: 'easeOut' }}
      />
    </div>
  );
}

// ── Ghost cursor ────────────────────────────────────────────────────────────

/** Arrow path in a 22×26 box; the tip sits at (2,2). */
const ARROW_PATH = 'M2 2 L2 20.5 L7 15.8 L10.6 23.6 L14 22.1 L10.5 14.4 L17.4 14.4 Z';
const TIP = { x: 2, y: 2 };

function GhostCursor() {
  const visible = useOperator((s) => s.cursor.visible);
  const label = useOperator((s) => s.cursor.label);
  const x = useOperator((s) => s.cursor.x);
  const y = useOperator((s) => s.cursor.y);
  const clickSeq = useOperator((s) => s.cursor.clickSeq);
  const reduce = useReducedMotion();

  // presenceApi drives cursorX/Y directly and commits the result to the store.
  // If anything else sets the store's x/y (runtime, a future feature), follow
  // it with a short glide so the cursor never teleports.
  useEffect(() => {
    if (glide.active) return;
    if (Math.abs(cursorX.get() - x) < 0.5 && Math.abs(cursorY.get() - y) < 0.5) return;
    if (reduce || !visible) {
      cursorX.set(x);
      cursorY.set(y);
      return;
    }
    const ax = animate(cursorX, x, { duration: 0.35, ease: [0.22, 1, 0.36, 1] });
    const ay = animate(cursorY, y, { duration: 0.35, ease: [0.22, 1, 0.36, 1] });
    return () => {
      ax.stop();
      ay.stop();
    };
  }, [x, y, visible, reduce]);

  // Click ripples, keyed off clickSeq (overlapping clicks each get a ring),
  // plus a quick press-dip of the arrow itself.
  const press = useAnimationControls();
  const lastSeq = useRef(clickSeq);
  const [ripples, setRipples] = useState<number[]>([]);
  useEffect(() => {
    if (clickSeq === lastSeq.current) return;
    lastSeq.current = clickSeq;
    setRipples((r) => [...r, clickSeq].slice(-4));
    // Only while the arrow is mounted (controls throw on an unmounted target).
    if (visible && !reduce) {
      void press.start({ scale: [1, 0.8, 1], transition: { duration: 0.22, ease: 'easeOut' } });
    }
  }, [clickSeq, visible, reduce, press]);
  const dropRipple = (k: number) => setRipples((r) => r.filter((v) => v !== k));

  // Keep the bubble on screen near the right / bottom edges — the site's right
  // edge, which is The Stable Hand dock's left edge while it is docked.
  const vw = typeof window !== 'undefined' ? window.innerWidth - stablehandReserve() : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const flipX = x > vw - 260;
  const flipY = y > vh - 64;
  // Width the bubble may take on its side of the arrow — on a 390px phone a
  // flipped 240px bubble would otherwise run off the left edge.
  const bubbleMax = Math.max(72, Math.min(240, flipX ? x - 18 : vw - x - 38));

  return (
    <motion.div
      {...UI}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 print:hidden"
      style={{ x: cursorX, y: cursorY, zIndex: Z.cursor, width: 0, height: 0 }}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="cursor"
            className="absolute left-0 top-0"
            style={{ transformOrigin: '0 0' }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: reduce ? 0.1 : 0.22, ease: 'easeOut' }}
          >
            {/* Click ripples, centred on the tip. */}
            {ripples.map((k) => (
              <motion.span
                key={k}
                className="absolute rounded-full"
                style={{
                  left: -18,
                  top: -18,
                  width: 36,
                  height: 36,
                  border: '2px solid var(--gold-bright)',
                  background: 'rgba(212,168,67,0.18)',
                  boxShadow: '0 0 14px rgba(212,168,67,0.6)',
                }}
                initial={{ scale: reduce ? 1 : 0.3, opacity: 0.95 }}
                animate={{ scale: reduce ? 1 : 1.9, opacity: 0 }}
                transition={{ duration: reduce ? 0.3 : 0.55, ease: 'easeOut' }}
                onAnimationComplete={() => dropRipple(k)}
              />
            ))}

            {/* Arrow (+ press dip on each click). */}
            <motion.div
              className="absolute"
              style={{ left: -TIP.x, top: -TIP.y, transformOrigin: `${TIP.x}px ${TIP.y}px` }}
              animate={press}
            >
              <svg
                width="22"
                height="26"
                viewBox="0 0 22 26"
                style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}
              >
                <defs>
                  <linearGradient id="sp-op-cursor-gold" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" style={{ stopColor: 'var(--gold-shine)' }} />
                    <stop offset="45%" style={{ stopColor: 'var(--gold-bright)' }} />
                    <stop offset="100%" style={{ stopColor: 'var(--gold-mid)' }} />
                  </linearGradient>
                </defs>
                <path
                  d={ARROW_PATH}
                  fill="url(#sp-op-cursor-gold)"
                  style={{ stroke: 'var(--forest-deep)' }}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                />
              </svg>

              {/* Tiny gold-horse badge — whose hand this is. */}
              <span
                className="absolute flex items-center justify-center rounded-full"
                style={{
                  left: 13,
                  top: 17,
                  width: 17,
                  height: 17,
                  background: FOREST,
                  border: '1.5px solid var(--gold-bright)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
                }}
              >
                <img src="/images/favicon-gold.png" alt="" className="h-[11px] w-[11px] object-contain" draggable={false} />
              </span>
            </motion.div>

            {/* Label bubble. */}
            <AnimatePresence>
              {label && (
                <motion.div
                  key={label}
                  className="absolute whitespace-nowrap"
                  style={{
                    ...(flipX ? { right: 10 } : { left: 30 }),
                    ...(flipY ? { bottom: 6 } : { top: 22 }),
                  }}
                  initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <span
                    className="block truncate rounded-md px-2 py-1 text-[11px] font-medium leading-tight"
                    style={{
                      maxWidth: bubbleMax,
                      background: FOREST,
                      color: 'var(--parchment)',
                      border: '1px solid var(--gold-mid)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                    }}
                  >
                    {label}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
