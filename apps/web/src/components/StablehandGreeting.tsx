// ---------------------------------------------------------------------------
// The Stable Hand greets everyone who lands on the public site (user request
// 2026-11-12: "when any person land on public site by default stable hand ai
// chat window remain open and ask what can i do for you").
//
// Shared by both modes of the assistant (components/AgentWidget.tsx): the
// visitor/member Concierge and the staff Operator panel. Both read the same
// open flag (agentUiStore), so this only decides WHEN to open:
//   - once per browser session, on the first page of the visit — close it and it
//     stays closed while they browse; the next visit greets them again;
//   - only on the public site (not sign-in / invite flows or the Campaign Engine);
//   - desktop/tablet: the chat opens; phones (where the panel would cover the
//     page): a small "What can I do for you?" bubble on the launcher instead.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAgentUi } from '@/stores/agentUiStore';

/** sessionStorage flag: the assistant already greeted this visitor in this browser session. */
const GREETED_KEY = 'sp-stablehand-greeted';

/** The public site — everything outside the staff areas and the sign-in/invite flows. */
export function isPublicSitePath(pathname: string): boolean {
  const root = pathname.split('/').filter(Boolean)[0] ?? '';
  return !['production-system', 'newsroom', 'login', 'signup', 'invite'].includes(root);
}

/**
 * Open the assistant (or show the phone bubble) on the visit's landing page.
 * Call once from the mounted assistant; `suppressed` skips it (e.g. the editor
 * has its own assistant).
 */
export function useLandingGreeting(suppressed = false): { nudge: boolean; dismissNudge: () => void } {
  const open = useAgentUi((s) => s.open);
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    if (suppressed || !isPublicSitePath(window.location.pathname)) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(GREETED_KEY) === '1';
      sessionStorage.setItem(GREETED_KEY, '1');
    } catch {
      /* storage blocked (private mode) — still greet, just not remembered */
    }
    if (seen || useAgentUi.getState().open) return;
    if (window.matchMedia('(min-width: 768px)').matches) useAgentUi.getState().setOpen(true);
    else setNudge(true);
    // Landing only: navigating around the site must not re-open a closed chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) setNudge(false);
  }, [open]);

  return { nudge, dismissNudge: () => setNudge(false) };
}

/** The phone greeting bubble above the launcher: tap to chat, × to dismiss. */
export function GreetingBubble({ show, onOpen, onDismiss }: { show: boolean; onOpen: () => void; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="fixed bottom-[5.25rem] right-5 z-50 flex max-w-[min(80vw,260px)] items-center gap-1 rounded-2xl rounded-br-sm border border-border bg-card py-1 pl-3.5 pr-1 shadow-xl print:hidden"
        >
          <button onClick={onOpen} className="py-1.5 text-left text-sm font-medium text-foreground">
            Hi! What can I do for you?
          </button>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
