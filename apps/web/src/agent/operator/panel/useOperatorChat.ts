// ---------------------------------------------------------------------------
// useOperatorChat — the Operator panel's conversation + run lifecycle.
//
// The chat itself is plain AI SDK v6 useChat against POST /api/agent/operator.
// What this hook adds is the glue between that chat and the shared run store
// (useOperator), which the presence layer (gold frame, pill, ghost cursor) and
// the runtime (the hands) both read:
//
//   send          → startRun()                    the frame + pill appear
//   tool call     → executeClientTool() in the page, result fed back with
//                   addToolOutput → sendAutomaticallyWhen continues the loop
//   chat settles  → endRun()   ONLY once the stream is done AND no client tool
//                   is still running AND no confirm card is waiting
//   Stop (panel or gold pill) → useOperator.stop() + chat.stop(), and no
//                   automatic continuation until the user speaks again
//
// Why the client tool runs DETACHED from onToolCall: v6 awaits onToolCall inside
// the chat's serial job queue, and addToolOutput queues onto that same queue —
// awaiting a tool (which may sit on a confirm card for a minute) inside
// onToolCall would freeze the stream, and awaiting addToolOutput there would
// deadlock it. So onToolCall only enqueues; a promise chain runs the calls one
// at a time (two clicks must never interleave on the user's screen).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type FileUIPart, type UIMessage } from 'ai';

import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useOperator, type OperatorStep } from '@/agent/operator/operatorStore';
import { executeClientTool, isOperatorClientTool, setRouterNavigate, installTakeoverGuard } from '@/agent/operator/runtime';
import { setActiveJobRunId, useOperatorJobs } from '@/agent/operator/runtime/jobs';
import { describePage } from './pageContext';
import { clearSession, loadSession, newRunId, sanitizeMessages, saveSession } from './persistence';
import { jobUpdateText } from './jobUpdates';
import { lastStepOfferedChoices } from '@/agent/choices/choices';

export interface OperatorChatError {
  message: string;
}

/** Sub-steps (useOperator.pushStep lines) recorded against each client tool call. */
export type SubStepMap = Record<string, OperatorStep[]>;

const isAbortError = (e: unknown) =>
  (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError');

export function useOperatorChat(userId: string) {
  const navigate = useNavigate();

  // Restored once per mount — the widget is keyed by user id, so a different
  // account always gets its own thread.
  const initial = useMemo(() => loadSession(userId), [userId]);
  const [runId, setRunId] = useState(initial.runId);
  const runIdRef = useRef(runId);
  runIdRef.current = runId;
  // Background jobs started by actions belong to the conversation open now.
  setActiveJobRunId(runId);
  useEffect(() => {
    setActiveJobRunId(runId);
    return () => setActiveJobRunId(undefined);
  }, [runId]);

  // Status of the last HTTP response, so a 403/429 can be explained properly
  // (the transport's Error only carries the body text).
  const lastHttpStatus = useRef<number | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl('/api/agent/operator'),
        // Token, page and runId are read at SEND time, so one transport stays
        // correct while the Operator navigates and the user starts new chats.
        fetch: async (req, init) => {
          const token = useAuthStore.getState().token;
          const headers = new Headers(init?.headers);
          if (token) headers.set('Authorization', `Bearer ${token}`);
          let body = init?.body;
          if (typeof body === 'string') {
            try {
              const parsed = JSON.parse(body);
              parsed.pageContext = describePage(window.location.pathname);
              parsed.runId = runIdRef.current;
              body = JSON.stringify(parsed);
            } catch {
              /* leave body untouched */
            }
          }
          const res = await fetch(req as RequestInfo, { ...init, headers, body });
          lastHttpStatus.current = res.status;
          return res;
        },
      }),
    [],
  );

  // ── Lifecycle bookkeeping (refs: read from async code and store listeners) ──
  /** Set by Stop; blocks automatic continuation until the user sends again. */
  const stoppedRef = useRef(false);
  /** True while WE call endRun, so the store listener can tell it from a Stop. */
  const endingRef = useRef(false);
  const executingRef = useRef(0);
  const [executing, setExecuting] = useState(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const addToolOutputRef = useRef<((a: { tool: string; toolCallId: string; output: unknown }) => unknown) | null>(null);
  /** Bumped by New chat. A tool still finishing for the OLD thread must not
   *  report into the new one: v6's addToolOutput patches whatever message is
   *  LAST, and on the emptied thread it threw (an unhandled rejection). */
  const threadGenRef = useRef(0);
  const [subSteps, setSubSteps] = useState<SubStepMap>({});
  /** The client tool call executing right now (its row shows live sub-steps). */
  const [running, setRunning] = useState<{ id: string; since: number } | null>(null);

  const bumpExecuting = (d: number) => {
    executingRef.current = Math.max(0, executingRef.current + d);
    setExecuting(executingRef.current);
  };

  const runClientTool = (toolName: string, toolCallId: string, input: unknown) => {
    const gen = threadGenRef.current;
    bumpExecuting(1);
    queueRef.current = queueRef.current.then(async () => {
      let output: unknown;
      if (stoppedRef.current) {
        output = { ok: false, error: 'Stopped by the user.' };
      } else {
        // A continuation can arrive after the run ended (e.g. it settled while
        // the next request was in flight) — make sure the user SEES it working.
        if (useOperator.getState().status === 'idle') useOperator.getState().startRun();
        const since = Date.now();
        setRunning({ id: toolCallId, since });
        try {
          output = await executeClientTool(toolName, input);
        } catch (e) {
          output = {
            ok: false,
            error: isAbortError(e) || stoppedRef.current
              ? 'Stopped by the user.'
              : e instanceof Error ? e.message : String(e),
          };
        }
        // Snapshot the fine-grained steps this call produced for its row.
        const mine = useOperator.getState().steps.filter((s) => s.at >= since);
        if (mine.length) setSubSteps((m) => ({ ...m, [toolCallId]: mine }));
        setRunning(null);
      }
      // Not awaited (see header) — it queues behind the chat's own job.
      if (gen === threadGenRef.current) {
        Promise.resolve(addToolOutputRef.current?.({ tool: toolName, toolCallId, output })).catch((e) => {
          console.warn('[operator] could not report a tool result:', e);
        });
      }
      bumpExecuting(-1);
    });
  };

  const chat = useChat({
    id: `operator:${userId}`,
    messages: initial.messages,
    transport,
    // A turn that ended on answer pills (offer_choices) waits for the person:
    // that server tool always has its result, so without the guard the chat
    // would auto-continue and the model would talk over its own question.
    sendAutomaticallyWhen: (o) =>
      !stoppedRef.current && !lastStepOfferedChoices(o.messages) && lastAssistantMessageIsCompleteWithToolCalls(o),
    onToolCall: ({ toolCall }) => {
      // Server tools (searchStaff, getMagazine, …) resolve server-side and
      // stream their own output; only the page-side tools run here.
      if (!isOperatorClientTool(toolCall.toolName)) return;
      runClientTool(toolCall.toolName, toolCall.toolCallId, toolCall.input);
    },
  });
  addToolOutputRef.current = chat.addToolOutput as unknown as (a: { tool: string; toolCallId: string; output: unknown }) => unknown;

  const { status, messages } = chat;
  const statusRef = useRef(status);
  statusRef.current = status;
  const chatBusy = status === 'submitted' || status === 'streaming';
  const pendingConfirm = useOperator((s) => s.pendingConfirm);
  const opStatus = useOperator((s) => s.status);

  // ── Mount: give the runtime the router + the takeover guard ──
  useEffect(() => {
    setRouterNavigate((p: string) => navigate(p));
    const uninstall = installTakeoverGuard();
    return () => {
      setRouterNavigate(null);
      uninstall();
    };
    // `navigate` is stable enough for the runtime; re-binding is harmless.
  }, [navigate]);

  // ── Run started by a continuation (tool result → next request) ──
  useEffect(() => {
    if (chatBusy && !stoppedRef.current && useOperator.getState().status === 'idle') {
      useOperator.getState().startRun();
    }
  }, [chatBusy]);

  // ── End the run once everything has truly settled ──
  // Debounced: between a tool result being added and the follow-up request
  // flipping status to 'submitted' there are a few microtasks where the chat
  // looks 'ready'. Ending the run there would flicker the gold frame off/on.
  useEffect(() => {
    const settled = (status === 'ready' || status === 'error') && executing === 0 && !pendingConfirm;
    if (!settled) return;
    const t = window.setTimeout(() => {
      const st = statusRef.current;
      const op = useOperator.getState();
      if ((st === 'ready' || st === 'error') && executingRef.current === 0 && !op.pendingConfirm && op.status !== 'idle') {
        endingRef.current = true;
        try {
          op.endRun();
        } finally {
          endingRef.current = false;
        }
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [status, executing, pendingConfirm]);

  // ── Stop pressed OUTSIDE the panel (the gold pill) → stop the chat too ──
  const chatStopRef = useRef(chat.stop);
  chatStopRef.current = chat.stop;
  useEffect(
    () =>
      useOperator.subscribe((s, prev) => {
        if (prev.status !== 'idle' && s.status === 'idle' && !endingRef.current) {
          stoppedRef.current = true;
          const st = statusRef.current;
          if (st === 'submitted' || st === 'streaming') void chatStopRef.current();
        }
      }),
    [],
  );

  // Unmount (sign-out, mode switch): never leave the frame up.
  useEffect(
    () => () => {
      if (useOperator.getState().status !== 'idle') useOperator.getState().stop();
    },
    [],
  );

  // ── Persist (debounced) ──
  useEffect(() => {
    const t = window.setTimeout(() => saveSession(userId, runIdRef.current, messages), 400);
    return () => window.clearTimeout(t);
  }, [messages, userId, runId]);

  // ── Public API ──
  const working = chatBusy || executing > 0 || opStatus !== 'idle';

  const send = useCallback(
    (text: string, files?: FileUIPart[]) => {
      stoppedRef.current = false;
      const op = useOperator.getState();
      if (op.status === 'idle') {
        op.clearSteps();
        op.startRun();
      }
      // A Stop or a failed request can leave the last turn with a call that was
      // never answered; close it off so the thread stays valid for the model.
      if (executingRef.current === 0) {
        const msgs = chat.messages as UIMessage[];
        const fixed = sanitizeMessages(msgs, { ok: false, error: 'Stopped before it finished.' });
        if (fixed.some((m, i) => m !== msgs[i])) chat.setMessages(fixed);
      }
      void chat.sendMessage(files && files.length ? { text, files } : { text });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat.sendMessage, chat.messages, chat.setMessages],
  );

  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    useOperator.getState().stop();
    void chatStopRef.current();
  }, []);

  // ── Auto-resume: a background job (runtime/jobs.ts) settled ──
  // Post a `[job-update] {...}` into the conversation that started it, so the
  // AI carries on by itself. Only that conversation (runId match — a New chat
  // means the user moved on), and only once the panel is idle: a job that ends
  // mid-run waits its turn. One update per turn; the next goes after the AI's
  // reply settles. Stop does not cancel this — Stop ends the AI's turn, not the
  // server job, and the job's outcome is news either way.
  const sendRef = useRef(send);
  sendRef.current = send;
  const jobs = useOperatorJobs((s) => s.jobs);
  const idleForJobs = !working && !pendingConfirm;
  useEffect(() => {
    const settled = jobs.filter((j) => j.status !== 'running' && !j.delivered);
    if (!settled.length) return;
    const belongs = (j: (typeof settled)[number]) => j.runId === runIdRef.current && (!j.userId || j.userId === userId);
    // Another conversation's job: show its chip, never post into this thread.
    for (const j of settled) if (!belongs(j)) useOperatorJobs.getState().markDelivered(j.id);
    if (!idleForJobs || !settled.some(belongs)) return;
    // Settle first — a tool result and the follow-up request leave a brief
    // "ready" gap that must not be mistaken for idle.
    const t = window.setTimeout(() => {
      const st = statusRef.current;
      const op = useOperator.getState();
      if (!(st === 'ready' || st === 'error') || executingRef.current > 0 || op.status !== 'idle' || op.pendingConfirm) return;
      const next = useOperatorJobs
        .getState()
        .jobs.find((j) => j.status !== 'running' && !j.delivered && belongs(j));
      if (!next) return;
      useOperatorJobs.getState().markDelivered(next.id);
      sendRef.current(jobUpdateText(next));
    }, 1200);
    return () => window.clearTimeout(t);
  }, [jobs, idleForJobs, runId, userId]);

  const newChat = useCallback(() => {
    threadGenRef.current += 1;
    stopAll();
    useOperator.getState().clearSteps();
    clearSession(userId);
    const id = newRunId();
    runIdRef.current = id;
    setRunId(id);
    setSubSteps({});
    chat.setMessages([]);
    chat.clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, stopAll, chat.setMessages, chat.clearError]);

  // Friendly error text (403 / 429 / not configured / generic).
  let errorText: string | null = null;
  if (chat.error) {
    const code = lastHttpStatus.current;
    const raw = chat.error.message ?? '';
    let serverMsg: string | undefined;
    try {
      const j = JSON.parse(raw) as { error?: unknown };
      if (typeof j?.error === 'string') serverMsg = j.error;
    } catch {
      /* not JSON */
    }
    if (code === 403) errorText = 'The Stable Hand acts in the app for staff and invited team members.';
    else if (code === 429) errorText = serverMsg ?? 'The Stable Hand has reached today’s limit. Please try again tomorrow.';
    // Too many messages (route cap) or too many bytes (every request re-sends
    // the thread's inline attachments). Retrying can never succeed, and the
    // generic "try again" line left the user retrying a dead thread.
    else if (code === 413) errorText = 'This conversation has grown too large to send — start a New chat to carry on.';
    else if (raw.includes('resting')) errorText = 'The assistant isn’t switched on yet — an OpenRouter key needs to be set on the server.';
    else errorText = 'I had trouble just then. Please try again in a moment.';
  }

  return {
    messages: messages as UIMessage[],
    status,
    chatBusy,
    working,
    executing,
    running,
    subSteps,
    errorText,
    send,
    stopAll,
    newChat,
  };
}
