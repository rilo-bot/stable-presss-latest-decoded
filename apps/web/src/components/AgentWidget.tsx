// ---------------------------------------------------------------------------
// "The Stablehand" — a global AI concierge available on every page.
//
// A floating button opens a chat panel. The conversation streams from the real
// backend (/api/agent/chat) which runs the model server-side via OpenRouter and
// scopes every data read to the signed-in user's role. This component only:
//   - injects the session Bearer token (so the agent acts at the user's scope),
//   - attaches the current page as context (so "this horse" / "this page" work),
//   - renders the streaming conversation,
//   - can be opened (and seeded with a question) by inline "Ask" buttons
//     anywhere in the app, via the shared agentUiStore.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles, Square, Maximize2, Minimize2 } from 'lucide-react';

import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useAgentUi } from '@/stores/agentUiStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { MarkdownMessage } from '@/components/MarkdownMessage';

// ── Page-context derivation ────────────────────────────────────────────────
// Turns the current path into a small hint the assistant can use. The agent
// resolves names/details itself via its tools using the entity id.
interface PageContext {
  path: string;
  title: string;
  entity?: { type: string; id: string };
}

function describePage(pathname: string): PageContext {
  const seg = pathname.split('/').filter(Boolean);
  const titleFor: Record<string, string> = {
    '': 'Home',
    news: 'The News',
    newsletter: 'Newsletter',
    bulletins: 'Print Bulletins',
    horses: 'Horse Register',
    articles: 'Article',
    tipping: 'Tipping Ring',
    podcast: 'The Gallop Podcast',
    parties: 'Industry Directory',
    dashboard: 'Your Dashboard',
    orgs: 'Organisation',
    studio: 'Profile Studio',
    newsroom: 'Newsroom',
    'site-content': 'Site Content',
    claims: 'Verify Claims',
    staff: 'Staff Admin',
  };
  const entityType: Record<string, string> = {
    horses: 'horse',
    articles: 'article',
    parties: 'party',
    bulletins: 'bulletin',
    orgs: 'organisation',
    studio: 'party',
  };
  const root = seg[0] ?? '';
  const ctx: PageContext = { path: pathname, title: titleFor[root] ?? 'Stable Press' };
  if (seg.length >= 2 && entityType[root]) {
    ctx.entity = { type: entityType[root], id: seg[1] };
  }
  return ctx;
}

// Suggested openers tailored to where the reader is.
const DEFAULT_STARTERS = [
  'What can you help me with?',
  'Show me some horses',
  'How do I claim a racing role?',
  'What’s in the latest bulletin?',
];

function contextStarters(pathname: string): string[] {
  const seg = pathname.split('/').filter(Boolean);
  const root = seg[0] ?? '';
  const hasId = seg.length >= 2;
  if (root === 'horses' && hasId) return ['Tell me about this horse', 'Who are its connections?', 'Show its race form'];
  if (root === 'horses') return ['Show me some horses', 'Find a particular horse'];
  if (root === 'parties' && hasId) return ['Tell me about this party', 'What horses are they connected to?'];
  if (root === 'parties') return ['Find a trainer', 'Browse the owners'];
  if (root === 'articles' && hasId) return ['Summarise this article', 'What is this about?'];
  if (root === 'studio') return ['Help me complete my profile', 'What should I add?'];
  if (root === 'tipping') return ['How does tipping work?', 'Who is on the leaderboard?'];
  if (root === 'bulletins') return ['What is in the latest bulletin?', 'Show me past editions'];
  if (root === 'dashboard') return ['What can I do here?', 'How do I claim a racing role?'];
  if (root === 'podcast') return ['What is the latest episode?'];
  return DEFAULT_STARTERS;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

const FOREST = 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)';
const GOLD = 'hsl(var(--brand-accent))';

export function AgentWidget() {
  const open = useAgentUi((s) => s.open);
  const setOpen = useAgentUi((s) => s.setOpen);
  const toggle = useAgentUi((s) => s.toggle);
  const pendingPrompt = useAgentUi((s) => s.pendingPrompt);
  // Hidden while the magazine editor is open (it has its own Studio Assistant).
  const suppressGlobal = useEditorAgentUi((s) => s.suppressGlobal);

  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Created once. The custom fetch reads the token + current page at SEND time,
  // so a single transport stays correct as the user navigates and signs in/out.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl('/api/agent/chat'),
        fetch: async (req, init) => {
          const token = useAuthStore.getState().token;
          const headers = new Headers(init?.headers);
          if (token) headers.set('Authorization', `Bearer ${token}`);
          let body = init?.body;
          if (typeof body === 'string') {
            try {
              const parsed = JSON.parse(body);
              parsed.pageContext = describePage(window.location.pathname);
              body = JSON.stringify(parsed);
            } catch {
              /* leave body untouched */
            }
          }
          return fetch(req as RequestInfo, { ...init, headers, body });
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const busy = status === 'submitted' || status === 'streaming';

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput('');
  };

  // An inline "Ask" button queued a question — send it once, then clear.
  useEffect(() => {
    if (!pendingPrompt) return;
    send(pendingPrompt);
    useAgentUi.getState().consumePrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  // Keep the latest message in view.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, status]);

  const starters = contextStarters(location.pathname);

  // The editor mounts its own assistant; don't show two launchers.
  if (suppressGlobal) return null;

  return (
    <>
      {/* Floating launcher (forest green + gold) */}
      <motion.button
        aria-label="Ask the Stablehand"
        onClick={toggle}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg"
        style={{ background: FOREST, border: '1px solid var(--gold-mid)' }}
      >
        {open ? (
          <X className="h-6 w-6" style={{ color: 'var(--gold-bright)' }} />
        ) : (
          <MessageCircle className="h-6 w-6" style={{ color: 'var(--gold-bright)' }} />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={
              // max-h keeps the panel within the viewport so the header is never
              // clipped at the top, regardless of the bottom anchor / expanded size.
              'fixed bottom-24 right-5 z-50 flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl ' +
              (expanded ? 'h-[min(88dvh,820px)] w-[min(96vw,640px)]' : 'h-[min(70dvh,560px)] w-[min(92vw,400px)]')
            }
          >
            {/* Header (forest green band, gold accents) */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ background: FOREST, borderBottom: '2px solid var(--gold-dark)' }}
            >
              <Sparkles className="h-5 w-5" style={{ color: 'var(--gold-bright)' }} />
              <div className="leading-tight">
                <div
                  className="font-[family-name:var(--font-display)] text-sm font-bold"
                  style={{ color: 'var(--parchment)' }}
                >
                  The Stablehand
                </div>
                <div className="text-[11px]" style={{ color: 'var(--gold-mid)' }}>
                  Your Stable Press guide
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setExpanded((v) => !v)}
                  aria-label={expanded ? 'Shrink chat' : 'Expand chat'}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-opacity hover:opacity-80"
                  style={{ color: 'var(--gold-bright)' }}
                >
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-opacity hover:opacity-80"
                  style={{ color: 'var(--gold-bright)' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Hello! I’m here to help you find your way around Stable Press — horses, parties,
                    bulletins, tipping, your own stable, and more. What would you like to do?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {starters.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                        style={{ borderColor: 'hsl(var(--primary) / 0.25)' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => {
                const text = messageText(m);
                const mine = m.role === 'user';
                if (!text && !mine) return null; // tool-only step, nothing to show yet
                return (
                  <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={
                        mine
                          ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
                          : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground'
                      }
                    >
                      {mine ? text : <MarkdownMessage text={text} />}
                    </div>
                  </div>
                );
              })}

              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce">•</span>
                      <span className="animate-bounce [animation-delay:120ms]">•</span>
                      <span className="animate-bounce [animation-delay:240ms]">•</span>
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-destructive">
                  {error.message?.includes('resting')
                    ? 'The assistant isn’t switched on yet — an OpenRouter key needs to be set on the server.'
                    : 'I had trouble just then. Please try again in a moment.'}
                </p>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-border bg-card px-3 py-2.5"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything…"
                className="flex-1 rounded-full border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ ['--tw-ring-color' as string]: GOLD }}
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  aria-label="Stop"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground"
                >
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!input.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-primary-foreground disabled:opacity-40"
                  style={{ background: GOLD }}
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
