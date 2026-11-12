// ---------------------------------------------------------------------------
// "The Stable Hand" — the global AI assistant available on every page.
//
// It has TWO modes, chosen by who is signed in:
//
//   Operator   (staff / invited team members — currentUser.isAdmin)
//              The Stable Hand ACTS in the app and shows it: a docked side
//              panel with a step timeline, confirm cards and Stop / Resume,
//              talking to /api/agent/operator. Lives in agent/operator/panel/
//              (OperatorPanel). Keyed by user id so one account never inherits
//              another's thread or run.
//
//   Concierge  (guests and members — everyone else)
//              The original guide: a floating chat that streams from
//              /api/agent/chat, which runs the model server-side and scopes
//              every read to the user's role. This component only:
//                - injects the session Bearer token,
//                - attaches the current page as context ("this horse" works),
//                - renders the streaming conversation,
//                - runs the one client tool (navigateTo),
//                - can be opened / seeded by inline "Ask" buttons via the shared
//                  agentUiStore.
//              Its behaviour is unchanged by the Operator work.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Square, Maximize2, Minimize2, Mic, Volume2, VolumeX, Loader2, Paperclip } from 'lucide-react';

import { apiUrl } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useAgentUi } from '@/stores/agentUiStore';
import { useStudioChrome } from '@/stores/studioChromeStore';
import { useStoryStudioUi } from '@/stores/storyStudioUiStore';
import { useBlogStudioUi } from '@/stores/blogStudioUiStore';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';
import { useChatAttachments } from '@/agent/attachments/useChatAttachments';
import { attachmentsToFileParts, CHAT_ATTACH_ACCEPT } from '@/agent/attachments/attachments';
import { AttachmentBar, MessageAttachments } from '@/agent/attachments/AttachmentViews';
import { ChoiceCard } from '@/agent/choices/ChoiceCard';
import { choiceCardState, lastStepOfferedChoices, messageChoices } from '@/agent/choices/choices';
import { describePage } from '@/agent/operator/panel/pageContext';
import { StablehandLauncher } from '@/agent/operator/panel/Launcher';
import { OperatorPanel } from '@/agent/operator/panel/OperatorPanel';

/** Mode switch — see the header. */
export function AgentWidget() {
  const isAdmin = useAuthStore((s) => s.currentUser?.isAdmin === true);
  const userId = useAuthStore((s) => s.currentUser?.id);
  if (isAdmin && userId) return <OperatorPanel key={userId} userId={userId} />;
  return <ConciergeWidget />;
}

/** sessionStorage flag: the chat already greeted this visitor in this browser session. */
const AUTO_OPEN_KEY = 'sp-stablehand-greeted';

/** The public site — everything outside the staff areas and the sign-in/invite flows. */
function isPublicSitePath(pathname: string): boolean {
  const root = pathname.split('/').filter(Boolean)[0] ?? '';
  return !['production-system', 'newsroom', 'login', 'signup', 'invite'].includes(root);
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
  if (root === 'production-system' && seg[1] === 'magazine-v2') return ['How do I build a magazine?', 'How do I publish this to Bulletins?'];
  if (root === 'production-system') return ['File a story for me', 'What can I do here?'];
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

// Map a navigateTo destination (+ optional entity id / Production System
// screen) to an in-app route.
function navPathFor(to: string, id?: string, screen?: string): string | null {
  switch (to) {
    case 'home': return '/';
    case 'news': return '/news';
    case 'bulletins': return '/bulletins';
    case 'horses': return '/horses';
    case 'parties': return '/parties';
    case 'tipping': return '/tipping';
    case 'podcast': return '/podcast';
    case 'dashboard': return '/dashboard';
    case 'newsroom': // legacy alias — older prompts/threads may still emit it
    case 'production-system': return screen ? `/production-system/${screen}` : '/production-system';
    // The Story Studio drawer lives in the Production System shell; onToolCall
    // opens it via its store after this navigation.
    case 'story-studio': return '/production-system/workflow';
    // Same arrangement for the Blog Studio: land on the Blogs screen, then its
    // store opens the drawer once the route has rendered.
    case 'blog-studio': return '/production-system/blogs';
    // Member AI studios (private editable pages with their own assistant).
    case 'horse-studio': return id ? `/studio/horse/${id}` : '/dashboard';
    case 'profile-studio': return id ? `/studio/${id}` : '/dashboard';
    case 'site-content': return '/site-content';
    case 'login': return '/login';
    case 'signup': return '/signup';
    case 'horse': return id ? `/horses/${id}` : '/horses';
    case 'party': return id ? `/parties/${id}` : '/parties';
    case 'article': return id ? `/articles/${id}` : '/news';
    case 'bulletin': return id ? `/bulletins/${id}` : '/bulletins';
    case 'organisation': return id ? `/orgs/${id}` : '/dashboard';
    // Staff Magazine Builder (v2): home, or straight into a magazine's editor.
    case 'magazine-v2': return id ? `/production-system/magazine-v2/${id}` : '/production-system/magazine-v2';
    default: return null;
  }
}

function ConciergeWidget() {
  const open = useAgentUi((s) => s.open);
  const setOpen = useAgentUi((s) => s.setOpen);
  const toggle = useAgentUi((s) => s.toggle);
  const pendingPrompt = useAgentUi((s) => s.pendingPrompt);
  // Hidden while the magazine editor is open (it has its own Studio Assistant).
  const suppressGlobal = useStudioChrome((s) => s.suppressGlobal);

  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useAutoGrowTextarea(inputRef, input);
  // Attach images/PDFs (📎 or paste) to hand the assistant — sent as file parts.
  const attach = useChatAttachments();

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

  const navigate = useNavigate();
  const addToolResultRef = useRef<((a: { tool: string; toolCallId: string; output: unknown }) => void) | null>(null);

  const { messages, sendMessage, status, error, stop, addToolResult } = useChat({
    transport,
    // Not after answer pills (offer_choices): that turn waits for the reader.
    sendAutomaticallyWhen: (o) => !lastStepOfferedChoices(o.messages) && lastAssistantMessageIsCompleteWithToolCalls(o),
    onToolCall: async ({ toolCall }) => {
      // navigateTo is the only client-executed tool; server tools resolve server-side.
      if (toolCall.toolName !== 'navigateTo') return;
      const { to, id, screen } = (toolCall.input ?? {}) as { to?: string; id?: string; screen?: string };
      // Opening the Story Studio drawer is gated the same way its button is —
      // don't pop a drawer the user can't file from.
      if (to === 'story-studio' && !can('stories.create')) {
        addToolResultRef.current?.({
          tool: 'navigateTo',
          toolCallId: toolCall.toolCallId,
          output: { ok: false, error: 'This account cannot create story drafts, so the Story Studio is unavailable — guide them instead.' },
        });
        return;
      }
      if (to === 'blog-studio' && !can('blogs.create')) {
        addToolResultRef.current?.({
          tool: 'navigateTo',
          toolCallId: toolCall.toolCallId,
          output: { ok: false, error: 'This account cannot create blog posts, so the Blog Studio is unavailable — guide them instead.' },
        });
        return;
      }
      const path = to ? navPathFor(to, id, screen) : null;
      if (path) {
        navigate(path);
        // The drawer mounts with the Production System shell; the flag applies
        // as soon as the route renders.
        if (to === 'story-studio') useStoryStudioUi.getState().setOpen(true);
        if (to === 'blog-studio') useBlogStudioUi.getState().openDesk();
      }
      addToolResultRef.current?.({
        tool: 'navigateTo',
        toolCallId: toolCall.toolCallId,
        output: path
          ? {
              ok: true,
              navigatedTo: path,
              ...(to === 'story-studio' ? { opened: 'Story Studio' } : {}),
              ...(to === 'blog-studio' ? { opened: 'Blog Studio' } : {}),
            }
          : { ok: false, error: `Unknown destination "${to}"` },
      });
    },
  });
  addToolResultRef.current = addToolResult as unknown as (a: { tool: string; toolCallId: string; output: unknown }) => void;
  const busy = status === 'submitted' || status === 'streaming';

  const send = (text: string) => {
    const t = text.trim();
    if ((!t && !attach.hasAttachments) || busy || attach.busy) return;
    void sendMessage(
      attach.hasAttachments ? { text: t, files: attachmentsToFileParts(attach.attachments) } : { text: t },
    );
    attach.clear();
    setInput('');
  };

  // ── Voice (push-to-talk: OpenAI ears + mouth, Claude stays the brain) — shared
  //    with the profile/onboarding assistants via useVoiceChat. ──
  const { voiceReady, voiceMode, setVoiceMode, recording, transcribing, caption, toggleMic } =
    useVoiceChat({ messages, send, busy, active: open && !suppressGlobal });

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

  // Greet visitors when they land on the public site (user request 2026-11-12):
  // the chat opens by itself, once per browser session — close it and it stays
  // closed until the next visit. On phones the panel would cover most of the page,
  // so they get a small "What can I do for you?" bubble on the launcher instead.
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    if (suppressGlobal || !isPublicSitePath(location.pathname)) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(AUTO_OPEN_KEY) === '1';
      sessionStorage.setItem(AUTO_OPEN_KEY, '1');
    } catch {
      /* storage blocked (private mode) — still greet, just not remembered */
    }
    if (seen || useAgentUi.getState().open) return;
    if (window.matchMedia('(min-width: 768px)').matches) setOpen(true);
    else setNudge(true);
    // Landing only: navigating around the site must not re-open a closed chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (open) setNudge(false);
  }, [open]);

  const starters = contextStarters(location.pathname);

  // The editor mounts its own assistant; don't show two launchers.
  if (suppressGlobal) return null;

  return (
    <>
      {/* Floating launcher — The Stable Hand mascot (gold horse), gamified */}
      <StablehandLauncher open={open} onClick={toggle} />

      {/* Phone greeting bubble (see the auto-open effect): tap to chat, × to dismiss. */}
      <AnimatePresence>
        {nudge && !open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-[5.25rem] right-5 z-50 flex max-w-[min(80vw,260px)] items-center gap-1 rounded-2xl rounded-br-sm border border-border bg-card py-1 pl-3.5 pr-1 shadow-xl print:hidden"
          >
            <button onClick={() => setOpen(true)} className="py-1.5 text-left text-sm font-medium text-foreground">
              Hi! What can I do for you?
            </button>
            <button
              onClick={() => setNudge(false)}
              aria-label="Dismiss"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
              // print:hidden for the same reason as the launcher — an open panel
              // would print an entire chat transcript over the page.
              'fixed bottom-24 right-5 z-50 flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl print:hidden ' +
              (expanded ? 'h-[min(88dvh,820px)] w-[min(96vw,640px)]' : 'h-[min(70dvh,560px)] w-[min(92vw,400px)]')
            }
          >
            {/* Header (forest green band, gold accents) */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ background: FOREST, borderBottom: '2px solid var(--gold-dark)' }}
            >
              <img
                src="/images/favicon-gold.png"
                alt=""
                className="h-7 w-7 flex-shrink-0 object-contain"
                style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }}
              />
              <div className="leading-tight">
                <div
                  className="font-[family-name:var(--font-display)] text-sm font-bold"
                  style={{ color: 'var(--parchment)' }}
                >
                  The Stable Hand
                </div>
                <div className="text-[11px]" style={{ color: 'var(--gold-mid)' }}>
                  Your Stable Press guide
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {voiceReady && (
                  <button
                    onClick={() => setVoiceMode((v) => !v)}
                    aria-label={voiceMode ? 'Turn off spoken replies' : 'Read replies aloud'}
                    title={voiceMode ? 'Spoken replies on' : 'Read replies aloud'}
                    className="flex h-7 w-7 items-center justify-center rounded-md transition-opacity hover:opacity-80"
                    style={{ color: voiceMode ? 'var(--gold-bright)' : 'var(--gold-mid)' }}
                  >
                    {voiceMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                )}
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
                  {/* The greeting, set as The Stable Hand's first message (static — no model call). */}
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground">
                      <p className="font-medium">Hi, I’m The Stable Hand. What can I do for you?</p>
                      <p className="mt-1 text-muted-foreground">
                        I can find horses, people and bulletins, explain tipping, and help with your own stable.
                      </p>
                    </div>
                  </div>
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

              {messages.map((m, i) => {
                const text = messageText(m);
                const mine = m.role === 'user';
                // Answer pills the assistant offered (offer_choices) — see agent/choices.
                const questions = mine ? null : messageChoices(m);
                if (!text && !mine && !questions) return null; // tool-only step, nothing to show yet
                const bubble = (
                  <div
                    className={
                      mine
                        ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
                        : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground'
                    }
                  >
                    {mine && <MessageAttachments message={m} tone="light" />}
                    {mine ? text : <MarkdownMessage text={text} />}
                  </div>
                );
                if (!questions) {
                  return (
                    <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                      {bubble}
                    </div>
                  );
                }
                const card = choiceCardState(messages, i);
                return (
                  <div key={m.id} className="flex flex-col items-start gap-2">
                    {text && bubble}
                    <ChoiceCard
                      questions={questions}
                      active={card.active}
                      answer={card.answer}
                      disabled={busy || attach.busy}
                      onSubmit={send}
                      tone="concierge"
                    />
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

            {/* Live caption while recording (interim words from the browser; the
                authoritative transcript still comes from OpenAI on stop) */}
            {(recording || transcribing) && (
              <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                <span className={'inline-block h-2 w-2 rounded-full ' + (recording ? 'animate-pulse bg-red-500' : 'bg-muted-foreground/50')} />
                <span className="line-clamp-2 italic">
                  {caption || (transcribing ? 'Transcribing…' : 'Listening… speak now')}
                </span>
              </div>
            )}

            {/* Composer */}
            <div className="border-t border-border bg-card">
            <AttachmentBar attachments={attach.attachments} onRemove={attach.remove} busy={attach.busy} tone="light" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 px-3 py-2.5"
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={CHAT_ATTACH_ACCEPT}
                className="hidden"
                onChange={(e) => { void attach.addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={recording || transcribing}
                aria-label="Attach an image or PDF"
                title="Attach an image or PDF (or paste one)"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onPaste={attach.onPaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={recording ? 'Listening…' : transcribing ? 'Transcribing…' : 'Ask me anything…'}
                disabled={recording || transcribing}
                // iOS Safari zooms the page into any field under 16px on focus
                // (and stays zoomed) — touch devices get 16px.
                className="flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm leading-snug outline-none focus:ring-2 disabled:opacity-70 [@media(pointer:coarse)]:text-[16px]"
                style={{ ['--tw-ring-color' as string]: GOLD }}
              />
              {voiceReady && !busy && (
                <button
                  type="button"
                  onClick={() => void toggleMic()}
                  disabled={transcribing}
                  aria-label={recording ? 'Stop recording' : 'Speak to The Stable Hand'}
                  title={recording ? 'Stop & send' : 'Speak'}
                  className={
                    'flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ' +
                    (recording ? 'animate-pulse border-red-500 bg-red-500/15 text-red-500' : 'border-border text-muted-foreground hover:bg-muted')
                  }
                >
                  {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
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
                  disabled={!input.trim() && !attach.hasAttachments}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-primary-foreground disabled:opacity-40"
                  style={{ background: GOLD }}
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
