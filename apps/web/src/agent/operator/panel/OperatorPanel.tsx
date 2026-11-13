// ---------------------------------------------------------------------------
// The Stable Hand OPERATOR panel — the chat side panel for staff / invited team
// members, modelled on the Claude in Chrome side panel: you ask, it works in
// the app while you watch, and the panel narrates every step.
//
// Layout lives in components/StablehandShell.tsx, shared with the visitor /
// member Concierge (one look, one size): on desktop (≥1024px) docked on the
// right with the site pushed left — nothing is covered, so the cursor can always
// be seen working — collapsible to a slim rail and widenable; on smaller screens
// a bottom sheet that drops to a short strip while a step runs, so the user can
// still see the screen it is acting on. The ghost cursor and targeting measure
// getBoundingClientRect, so a pushed page needs nothing special from them.
//
// It stays reachable everywhere — including full-screen Studios like the
// Magazine Builder, which suppress the concierge — because a run often starts
// on one screen and finishes inside an editor (which the dock pushes too).
//
// Everything here is marked data-operator-ui: readScreen() skips it and the
// takeover guard does not treat typing in the panel as "the user took over".
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Send, Square, Mic, Volume2, VolumeX, Loader2, Paperclip, SquarePen } from 'lucide-react';

import { useOperator } from '@/agent/operator/operatorStore';
import { installNativeDialogs, syncOperatorAttachments } from '@/agent/operator/runtime';
import { useAgentUi } from '@/stores/agentUiStore';
import { useStudioChrome } from '@/stores/studioChromeStore';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';
import { useStablehandDockLayout } from '@/lib/stablehandDock';
import { useChatAttachments } from '@/agent/attachments/useChatAttachments';
import { attachmentsToFileParts, CHAT_ATTACH_ACCEPT } from '@/agent/attachments/attachments';
import { AttachmentBar, MessageAttachments } from '@/agent/attachments/AttachmentViews';
import { useOperatorChat } from './useOperatorChat';
import { AssistantMessage } from './StepTimeline';
import { JobChips, JobUpdateChip } from './JobChips';
import { isJobUpdateMessage } from './jobUpdates';
import { choiceCardState, messageChoices } from '@/agent/choices/choices';
import { ConfirmCard, PausedBanner } from './ConfirmCard';
import { StablehandShell, stablehandHeaderBtn } from '@/components/StablehandShell';

const GOLD = 'hsl(var(--brand-accent))';

const OPERATOR_STARTERS = [
  'Create a new magazine',
  'Share a magazine page with a teammate',
  'File a story with AI',
  'What can you do on this screen?',
];

function messageText(m: { parts?: Array<{ type: string; text?: string }> }): string {
  return (m.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');
}

export function OperatorPanel({ userId }: { userId: string }) {
  // "Open" for this panel = the full panel is showing (not the rail / closed).
  const open = useAgentUi((s) => s.open && !s.collapsed);
  const pendingPrompt = useAgentUi((s) => s.pendingPrompt);
  const inStudio = useStudioChrome((s) => s.suppressGlobal);
  const stepLabel = useOperator((s) => s.stepLabel);
  const opStatus = useOperator((s) => s.status);
  const pendingConfirm = useOperator((s) => s.pendingConfirm);
  const panelYield = useOperator((s) => s.panelYield);

  const isDesktop = useStablehandDockLayout();
  const reduce = useReducedMotion();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useAutoGrowTextarea(inputRef, input);
  const attach = useChatAttachments();

  const { messages, chatBusy, working, executing, running, subSteps, errorText, send: sendChat, stopAll, newChat } =
    useOperatorChat(userId);

  // Runtime glue: answer the app's window.confirm/alert/prompt while a run is
  // active (restored when it ends), and hand the runtime the files the user
  // attached in this thread for the `upload` tool (synced from the messages, so
  // picker, paste and a restored thread are all covered).
  useEffect(() => installNativeDialogs(), []);
  useEffect(() => syncOperatorAttachments(messages), [messages]);

  const send = (text: string) => {
    const t = text.trim();
    if ((!t && !attach.hasAttachments) || working || attach.busy) return;
    sendChat(t, attach.hasAttachments ? attachmentsToFileParts(attach.attachments) : undefined);
    attach.clear();
    setInput('');
  };

  // Voice (push-to-talk) — same shared hook as the concierge.
  const { voiceReady, voiceMode, setVoiceMode, recording, transcribing, caption, toggleMic } =
    useVoiceChat({ messages, send, busy: chatBusy, active: open });

  // An inline "Ask" button queued a question — send it once, then clear.
  useEffect(() => {
    if (!pendingPrompt) return;
    send(pendingPrompt);
    useAgentUi.getState().consumePrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  // Keep the latest message / step / confirm card in view.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages, open, chatBusy, stepLabel, pendingConfirm, opStatus, reduce]);

  // The confirm card only renders inside the open panel. A run the user hid
  // the panel on ("Hide — The Stable Hand keeps working") or collapsed to the
  // rail otherwise stalled on an invisible card with nothing on screen to
  // answer it — bring the full panel back.
  useEffect(() => {
    const ui = useAgentUi.getState();
    if (pendingConfirm && (!ui.open || ui.collapsed)) ui.setOpen(true);
  }, [pendingConfirm]);

  // Mobile: while a step acts on the page, drop the sheet to a strip so the
  // user can watch it — unless it's waiting on them.
  const sheetLow = !isDesktop && executing > 0 && !pendingConfirm && opStatus !== 'paused';
  const showThinking = (chatBusy || executing > 0) && !pendingConfirm && opStatus !== 'paused';
  const lastIdx = messages.length - 1;

  return (
    <StablehandShell
      operator
      working={working}
      // Presence sets panelYield while the cursor works on something the panel
      // covers (the phone sheet — the docked panel covers nothing): fade out and
      // let the pointer through, so the user sees the real button being clicked.
      yieldPanel={panelYield}
      sheetLow={sheetLow}
      inStudio={inStudio}
      closeTitle={working ? 'Hide — The Stable Hand keeps working' : 'Close'}
      whenHidden={<JobChips variant="floating" />}
      subtitle={
        <>
          {working && (
            <span className="relative flex h-1.5 w-1.5">
              {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: 'var(--gold-bright)' }} />}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold-bright)' }} />
            </span>
          )}
          Working in Stable Press
        </>
      }
      headerActions={
        <>
          {voiceReady && (
            <button
              type="button"
              onClick={() => setVoiceMode((v) => !v)}
              aria-label={voiceMode ? 'Turn off spoken replies' : 'Read replies aloud'}
              title={voiceMode ? 'Spoken replies on' : 'Read replies aloud'}
              className={stablehandHeaderBtn}
              style={{ color: voiceMode ? 'var(--gold-bright)' : 'var(--gold-mid)' }}
            >
              {voiceMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={newChat}
            disabled={messages.length === 0 && !working}
            aria-label="New chat"
            title="New chat"
            className={stablehandHeaderBtn + ' disabled:opacity-40'}
            style={{ color: 'var(--gold-bright)' }}
          >
            <SquarePen className="h-4 w-4" />
          </button>
        </>
      }
    >
      {/* Conversation */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Hi, I’m The Stable Hand. What can I do for you?</p>
            <p className="text-sm text-muted-foreground">
              I can work in Stable Press for you — open screens, fill in forms and run actions while you
              watch. I’ll always ask before anything that publishes, shares or sends.
            </p>
            <div className="flex flex-wrap gap-2">
              {OPERATOR_STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                  style={{ borderColor: 'rgba(212,168,67,0.45)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          if (isJobUpdateMessage(m)) return <JobUpdateChip key={m.id} message={m} />;
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  <MessageAttachments message={m} tone="light" />
                  {messageText(m)}
                </div>
              </div>
            );
          }
          if (m.role !== 'assistant') return null;
          // Answer pills: live until the person replies ([job-update]
          // notices don't count) or a newer card replaces them.
          const card = messageChoices(m) ? choiceCardState(messages, i, isJobUpdateMessage) : null;
          return (
            <AssistantMessage
              key={m.id}
              message={m}
              live={working && i === lastIdx}
              running={running}
              subSteps={subSteps}
              choices={
                card
                  ? { active: card.active, answer: card.answer, disabled: working || attach.busy, onSubmit: send }
                  : undefined
              }
            />
          );
        })}

        {showThinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
              <span className="inline-flex gap-1" style={{ color: 'var(--gold-mid)' }}>
                <span className="motion-safe:animate-bounce">•</span>
                <span className="motion-safe:animate-bounce [animation-delay:120ms]">•</span>
                <span className="motion-safe:animate-bounce [animation-delay:240ms]">•</span>
              </span>
              {stepLabel && <span className="line-clamp-2 text-xs">{stepLabel}</span>}
            </div>
          </div>
        )}

        {errorText && <p className="text-xs text-destructive">{errorText}</p>}

        <PausedBanner onStop={stopAll} />
        <ConfirmCard />
      </div>

      {/* Live caption while recording */}
      {(recording || transcribing) && (
        <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <span className={'inline-block h-2 w-2 rounded-full ' + (recording ? 'animate-pulse bg-red-500' : 'bg-muted-foreground/50')} />
          <span className="line-clamp-2 italic">
            {caption || (transcribing ? 'Transcribing…' : 'Listening… speak now')}
          </span>
        </div>
      )}

      <JobChips variant="panel" />

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
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
            placeholder={
              recording ? 'Listening…' : transcribing ? 'Transcribing…' : working ? 'The Stable Hand is working…' : 'Tell me what to do…'
            }
            disabled={recording || transcribing}
            // iOS Safari zooms the page into any field under 16px on focus
            // (and stays zoomed) — touch devices get 16px.
            className="flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm leading-snug outline-none focus:ring-2 disabled:opacity-70 [@media(pointer:coarse)]:text-[16px]"
            style={{ ['--tw-ring-color' as string]: GOLD }}
          />
          {voiceReady && !working && (
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
          {working ? (
            <button
              type="button"
              onClick={stopAll}
              aria-label="Stop The Stable Hand"
              title="Stop"
              className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              style={{ borderColor: 'var(--gold-mid)' }}
            >
              <Square className="h-3.5 w-3.5" style={{ fill: 'currentColor' }} /> Stop
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!input.trim() && !attach.hasAttachments}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-primary-foreground disabled:opacity-40"
              style={{ background: GOLD }}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </StablehandShell>
  );
}
