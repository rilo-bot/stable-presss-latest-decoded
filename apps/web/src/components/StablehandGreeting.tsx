// ---------------------------------------------------------------------------
// When The Stable Hand opens by itself.
//
// History: 2026-11-12 it greeted EVERYONE landing on the public site. After the
// live demo the user narrowed it (2026-11-13): "When user is signed out don't
// open stable hand automatically … Only when the user is signed in then it opens
// automatically; when signed out then not." So:
//   - signed-in accounts only (staff and members alike — both modes of the
//     assistant read the same agentUiStore, so this one hook serves both and is
//     mounted once, in components/AgentWidget.tsx);
//   - signed-out visitors: never, and no greeting bubble — the launcher is theirs;
//   - once per browser session, on the first page of the visit — close it and it
//     stays closed while they browse; the next visit greets them again. Someone
//     who signs in during the visit is greeted on the page they land on after
//     signing in;
//   - only on the public site (not sign-in / invite flows or the Campaign Engine);
//   - desktop (≥1024px, where the panel docks beside the site and covers nothing):
//     the assistant opens, in the user's remembered state (panel or rail);
//     tablets / phones (where it would be a sheet over the page): a small
//     "What can I do for you?" bubble on the launcher instead.
// Signing out (or a stale session dropping on load) puts the assistant away.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAgentUi } from '@/stores/agentUiStore';
import { useAuthStore } from '@/stores/authStore';
import { useStudioChrome } from '@/stores/studioChromeStore';

/** sessionStorage flag: the assistant already greeted this user in this browser session. */
const GREETED_KEY = 'sp-stablehand-greeted';

/** Where the panel docks beside the site (StablehandShell's breakpoint). */
const DOCK_QUERY = '(min-width: 1024px)';

/** The public site — everything outside the staff areas and the sign-in/invite flows. */
export function isPublicSitePath(pathname: string): boolean {
  const root = pathname.split('/').filter(Boolean)[0] ?? '';
  return !['production-system', 'newsroom', 'login', 'signup', 'invite'].includes(root);
}

function isAuthFlowPath(pathname: string): boolean {
  const root = pathname.split('/').filter(Boolean)[0] ?? '';
  return ['login', 'signup', 'invite'].includes(root);
}

/** Greet once: open (desktop) or show the bubble (smaller screens). */
function greet(pathname: string): void {
  if (!isPublicSitePath(pathname)) return;
  // A full-screen Studio with its own assistant is on screen (the profile
  // onboarding guide, the magazine editor) — don't stack a second one on it.
  if (useStudioChrome.getState().suppressGlobal) return;
  let seen = false;
  try {
    seen = sessionStorage.getItem(GREETED_KEY) === '1';
    sessionStorage.setItem(GREETED_KEY, '1');
  } catch {
    /* storage blocked (private mode) — still greet, just not remembered */
  }
  const ui = useAgentUi.getState();
  if (seen || ui.open) return;
  if (window.matchMedia(DOCK_QUERY).matches) ui.openRemembered();
  else ui.setGreetingBubble(true);
}

/**
 * Open the assistant (or show the phone bubble) for a signed-in user's first
 * page of the visit. Mount ONCE (AgentWidget) — it serves both modes.
 */
export function useLandingGreeting(): void {
  const signedIn = useAuthStore((s) => !!s.currentUser && !!s.token);
  const { pathname } = useLocation();
  // 'landing'   the first page of this load — greet if signed in
  // 'signin'    a signed-out visitor; waiting to see if they sign in
  // 'after'     they just signed in — greet on the page they land on next
  // 'done'      this page load's chance has been used
  const stage = useRef<'landing' | 'signin' | 'after' | 'done'>('landing');
  const wasSignedIn = useRef(signedIn);

  useEffect(() => {
    if (wasSignedIn.current && !signedIn) {
      // Signed out, or a persisted session the server just refused: the
      // assistant was opened for a signed-in user — put it away.
      const ui = useAgentUi.getState();
      ui.setOpen(false);
      ui.setGreetingBubble(false);
    }
    if (!wasSignedIn.current && signedIn && stage.current === 'signin') stage.current = 'after';
    wasSignedIn.current = signedIn;

    if (stage.current === 'landing') {
      if (!signedIn) {
        stage.current = 'signin';
        return;
      }
      stage.current = 'done';
      greet(pathname);
      return;
    }
    if (stage.current === 'after' && signedIn) {
      // Still on the sign-in form: the redirect to their page is a beat away.
      if (isAuthFlowPath(pathname)) return;
      stage.current = 'done';
      greet(pathname);
    }
  }, [signedIn, pathname]);
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
