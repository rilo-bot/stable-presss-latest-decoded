// ---------------------------------------------------------------------------
// The Stable Hand's frame — ONE look and size for both modes of the assistant
// (components/AgentWidget.tsx): the visitor/member Concierge and the staff
// Operator. Each mode keeps its own conversation (children + header buttons);
// this owns where it sits on screen.
//
//   Desktop (≥1024px)  docked on the right, the full height of the window, and
//                      the SITE moves over — like Claude in Chrome's side panel,
//                      nothing is covered (index.css, "THE STABLE HAND DOCK").
//                      Header: Widen/Narrow (≈420 ↔ ≈640px), Collapse, Close.
//                      Collapsed it is a slim rail on the right edge (horse +
//                      chevron); the site gets its space back. Click it to
//                      expand. Collapsed / wide are remembered (agentUiStore).
//   Below 1024px       a bottom sheet over the page (nothing can be pushed on a
//                      phone), with the same header; collapsing = the launcher.
//   Closed             the gold-horse launcher (Launcher.tsx), plus the phone
//                      greeting bubble for a signed-in user's first page.
//
// The panel is z-[85]: above the magazine editor (z-60), its dialogs (z-70) and
// the studio AI drawers (z-80) — on desktop those all stop at the dock anyway;
// on a phone the sheet must stay reachable over them (the Operator drives them,
// and Stop / the confirm card must always be in reach).
//
// `operator` marks it all data-operator-ui (readScreen skips it; typing in it is
// not "the user took over") and the panel data-operator-panel (presence measures
// it to step aside when the cursor works underneath it on a phone).
// ---------------------------------------------------------------------------

import { useLayoutEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronsLeft, Maximize2, Minimize2, PanelRightClose, X } from 'lucide-react';

import { OPERATOR_UI_ATTR } from '@/agent/operator/contracts';
import { StablehandLauncher } from '@/agent/operator/panel/Launcher';
import { GreetingBubble } from '@/components/StablehandGreeting';
import { useStablehandDockLayout } from '@/lib/stablehandDock';
import { useAgentUi } from '@/stores/agentUiStore';

const FOREST = 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)';

/** The dock's slide — the same curve + duration as --stablehand-w's transition
 *  in index.css, so the panel's edge and the site's edge move as one. */
const SLIDE = { type: 'tween', duration: 0.26, ease: [0.2, 0.8, 0.2, 1] } as const;
const SHEET = { type: 'spring', stiffness: 340, damping: 32 } as const;

/** Header icon button (the modes' own header actions use it too). */
export const stablehandHeaderBtn = 'flex h-7 w-7 items-center justify-center rounded-md transition-opacity hover:opacity-80';

/** Keep pointer / mouse downs inside the assistant. Radix modals dismiss on any
 *  outside pointerdown and app menus close on any outside mousedown — the panel
 *  must stay usable next to a dialog or menu the Operator is driving. */
const keepInside = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function StablehandShell({
  subtitle,
  headerActions,
  children,
  operator = false,
  working = false,
  yieldPanel = false,
  sheetLow = false,
  inStudio = false,
  closeTitle = 'Close',
  whenHidden,
}: {
  /** Under the name in the header. */
  subtitle: ReactNode;
  /** The mode's own header buttons (voice, new chat), before Widen / Collapse / Close. */
  headerActions?: ReactNode;
  /** Conversation + composer (a flex column fills the rest of the panel). */
  children: ReactNode;
  /** Operator chrome — see the header. */
  operator?: boolean;
  /** The Operator is mid-run: a gold ring on the launcher / rail. */
  working?: boolean;
  /** Fade + let the pointer through while the cursor works under the panel. */
  yieldPanel?: boolean;
  /** Phone sheet drops to a short strip (a step is acting on the page). */
  sheetLow?: boolean;
  /** A full-screen Studio is open: lift the phone launcher clear of its composer. */
  inStudio?: boolean;
  closeTitle?: string;
  /** Shown while the full panel is not (the Operator's floating job chips). */
  whenHidden?: ReactNode;
}) {
  const open = useAgentUi((s) => s.open);
  const collapsed = useAgentUi((s) => s.collapsed);
  const wide = useAgentUi((s) => s.wide);
  const greetingBubble = useAgentUi((s) => s.greetingBubble);
  const { setOpen, expand, collapse, setWide, setGreetingBubble } = useAgentUi.getState();
  const dock = useStablehandDockLayout();
  const reduce = useReducedMotion();

  const showPanel = open && !collapsed;
  const showRail = open && collapsed && dock;
  const showLauncher = !showPanel && !showRail;

  // Tell the page to make room (index.css reads these; only ≥1024px and on
  // screen). A layout effect, so the site has started moving over by the first
  // frame the panel paints. No cleanup here — removing and re-adding on every
  // change could restart the width transition; the unmount effect clears it.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute('data-stablehand-dock', collapsed ? 'rail' : 'panel');
    else root.removeAttribute('data-stablehand-dock');
    if (wide) root.setAttribute('data-stablehand-size', 'wide');
    else root.removeAttribute('data-stablehand-size');
  }, [open, collapsed, wide]);
  useLayoutEffect(
    () => () => {
      document.documentElement.removeAttribute('data-stablehand-dock');
      document.documentElement.removeAttribute('data-stablehand-size');
    },
    [],
  );

  const uiAttrs: Record<string, string> = operator ? { [OPERATOR_UI_ATTR]: '' } : {};
  const panelAttrs: Record<string, string> = operator ? { ...uiAttrs, 'data-operator-panel': '' } : {};
  const hidden = reduce ? { opacity: 0 } : dock ? { x: '100%' } : { opacity: 0, y: 40 };

  return (
    // A Radix modal (the story form, a confirm dialog) aria-hides everything
    // outside itself — The Stable Hand panel and its confirm card included, so a
    // screen reader could not reach Confirm / Stop while the Operator drove the
    // dialog. Radix (aria-hidden's hideOthers) always spares [aria-live] nodes
    // and never descends into them; "off" announces nothing (the default for an
    // aside). One PERSISTENT wrapper, so a panel that opens while the modal is
    // already up (the confirm card re-opening it) is spared too. display:contents
    // keeps it out of layout.
    <div aria-live="off" data-stablehand-shell="" style={{ display: 'contents' }}>
      {showLauncher && (
        <StablehandLauncher
          open={false}
          onClick={expand}
          placement="corner"
          liftOnPhone={inStudio}
          working={working}
          zClass={inStudio ? 'z-[65]' : 'z-50'}
          operatorUi={operator}
        />
      )}
      {!showPanel && whenHidden}
      {/* Phone / tablet greeting for a signed-in user (StablehandGreeting.tsx). */}
      <GreetingBubble
        show={greetingBubble && showLauncher}
        onOpen={() => setOpen(true)}
        onDismiss={() => setGreetingBubble(false)}
      />

      {/* ── Collapsed: the rail ── */}
      <AnimatePresence>
        {showRail && (
          <motion.aside
            key="stablehand-rail"
            {...panelAttrs}
            aria-label="The Stable Hand (collapsed)"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={SLIDE}
            onPointerDown={keepInside}
            onMouseDown={keepInside}
            className="fixed right-0 top-0 z-[85] flex h-[100dvh] flex-col items-center border-l print:hidden"
            // pointer-events: Radix modals set `pointer-events:none` on <body>.
            style={{ width: 'var(--stablehand-rail-w)', background: FOREST, borderColor: 'var(--gold-dark)', pointerEvents: 'auto' }}
          >
            <button
              type="button"
              onClick={expand}
              aria-label="Expand The Stable Hand"
              title="Expand The Stable Hand"
              className="flex w-full flex-1 flex-col items-center gap-3 pb-3 pt-3 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--gold-bright)]"
            >
              <span
                className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                style={{ border: '1px solid var(--gold-mid)', boxShadow: '0 0 0 3px rgba(212,168,67,0.14)' }}
              >
                {working && (
                  <span
                    aria-hidden
                    className={'absolute -inset-1 rounded-full border-2 border-transparent ' + (reduce ? '' : 'animate-spin')}
                    style={{ borderTopColor: 'var(--gold-bright)', borderRightColor: reduce ? 'var(--gold-bright)' : 'transparent' }}
                  />
                )}
                <img
                  src="/images/favicon-gold.png"
                  alt=""
                  className="h-6 w-6 object-contain"
                  style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }}
                />
              </span>
              <ChevronsLeft className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--gold-bright)' }} />
              <span
                className="whitespace-nowrap font-[family-name:var(--font-display)] text-xs font-bold tracking-wide [writing-mode:vertical-rl]"
                style={{ color: 'var(--parchment)' }}
              >
                The Stable Hand
                {working && <span style={{ color: 'var(--gold-bright)' }}> · working…</span>}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close The Stable Hand"
              title={closeTitle}
              className={stablehandHeaderBtn + ' mb-3 h-8 w-8 flex-shrink-0'}
              style={{ color: 'var(--gold-bright)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── The panel: docked (desktop) or a bottom sheet ── */}
      <AnimatePresence>
        {showPanel && (
          <motion.aside
            key={dock ? 'stablehand-dock' : 'stablehand-sheet'}
            {...panelAttrs}
            aria-label="The Stable Hand"
            initial={hidden}
            animate={{ opacity: yieldPanel ? 0 : 1, x: 0, y: 0 }}
            exit={hidden}
            transition={dock || reduce ? SLIDE : SHEET}
            onPointerDown={keepInside}
            onMouseDown={keepInside}
            style={{
              pointerEvents: yieldPanel ? 'none' : 'auto',
              ...(dock ? { width: 'var(--stablehand-panel-w)' } : {}),
            }}
            className={
              'fixed z-[85] flex flex-col overflow-hidden border-border bg-card print:hidden ' +
              (dock
                ? 'right-0 top-0 h-[100dvh] border-l shadow-[-6px_0_22px_rgba(0,0,0,0.10)]'
                : 'inset-x-0 bottom-0 rounded-t-2xl border-t shadow-2xl transition-[height] duration-300 ' +
                  (sheetLow ? 'h-[38dvh]' : 'h-[75dvh]'))
            }
          >
            {/* Header (forest green band, gold accents) */}
            <div
              className="flex flex-shrink-0 items-center gap-2 px-4 py-3"
              style={{ background: FOREST, borderBottom: '2px solid var(--gold-dark)' }}
            >
              <img
                src="/images/favicon-gold.png"
                alt=""
                className="h-7 w-7 flex-shrink-0 object-contain"
                style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }}
              />
              <div className="min-w-0 leading-tight">
                <div
                  className="font-[family-name:var(--font-display)] text-sm font-bold"
                  style={{ color: 'var(--parchment)' }}
                >
                  The Stable Hand
                </div>
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--gold-mid)' }}>
                  {subtitle}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {headerActions}
                {dock && (
                  <button
                    type="button"
                    onClick={() => setWide(!wide)}
                    aria-label={wide ? 'Narrow the panel' : 'Widen the panel'}
                    title={wide ? 'Narrow' : 'Widen'}
                    className={stablehandHeaderBtn}
                    style={{ color: 'var(--gold-bright)' }}
                  >
                    {wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                )}
                {dock && (
                  <button
                    type="button"
                    onClick={collapse}
                    aria-label="Collapse The Stable Hand to the side"
                    title="Collapse to the side"
                    className={stablehandHeaderBtn}
                    style={{ color: 'var(--gold-bright)' }}
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close The Stable Hand"
                  title={closeTitle}
                  className={stablehandHeaderBtn}
                  style={{ color: 'var(--gold-bright)' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {children}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
