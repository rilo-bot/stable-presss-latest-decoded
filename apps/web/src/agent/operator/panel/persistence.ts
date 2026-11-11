// ---------------------------------------------------------------------------
// Operator conversation persistence (sessionStorage).
//
// The Operator navigates — and some screens it drives do full reloads (a login
// bounce, a hard refresh by the user mid-task). A conversation that vanished on
// every reload would make a multi-step job impossible to follow, so the panel
// keeps the thread + its runId in sessionStorage: per tab (two tabs never fight
// over one thread), per user (a shared machine never shows one person's thread
// to the next), and gone when the tab closes.
//
// THE HAZARD: a reload can land in the middle of a tool call. Restoring an
// assistant message whose client tool call never got a result would leave the
// thread invalid (the server cannot convert an unanswered call) — and blindly
// re-running it would REPLAY a click or an action the user may have watched
// half-happen. So unresolved calls are closed off as failed, with a reason the
// model can read and recover from.
// ---------------------------------------------------------------------------

import { isToolUIPart, type UIMessage } from 'ai';

const KEY_PREFIX = 'stablehand.operator.v1:';
const MAX_MESSAGES = 150;
/** Data-URL file parts bigger than this are dropped from storage (~220 KB). */
const MAX_INLINE_FILE_CHARS = 300_000;

export const INTERRUPTED = { ok: false, error: 'Interrupted by a page reload.' } as const;

interface Stored {
  runId: string;
  messages: UIMessage[];
}

export function newRunId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

const UNFINISHED = new Set(['input-streaming', 'input-available', 'approval-requested', 'approval-responded']);

/** Close off every tool call that never got a result (see header). Also used
 *  after a Stop / failed request, with a different reason, before the next
 *  user turn — an aborted stream can leave a call unanswered just the same. */
export function sanitizeMessages(messages: UIMessage[], reason: { ok: false; error: string } = INTERRUPTED): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== 'assistant') return m;
    let changed = false;
    const parts = m.parts.flatMap((p) => {
      if (!isToolUIPart(p) || !UNFINISHED.has(p.state)) return [p];
      changed = true;
      // A call whose input never finished streaming has nothing worth keeping.
      if (p.state === 'input-streaming') return [];
      return [{ ...p, state: 'output-available', output: reason, errorText: undefined, approval: undefined } as typeof p];
    });
    return changed ? { ...m, parts } : m;
  });
}

/** Swap oversized inline attachments for a note (storage is ~5 MB per origin). */
function slimFiles(messages: UIMessage[], maxChars: number): UIMessage[] {
  return messages.map((m) => {
    let changed = false;
    const parts = m.parts.map((p) => {
      if (p.type === 'file' && p.url.startsWith('data:') && p.url.length > maxChars) {
        changed = true;
        return { type: 'text' as const, text: `[Attachment “${p.filename ?? 'file'}” was not kept after the page reloaded.]` };
      }
      return p;
    });
    return changed ? { ...m, parts } : m;
  });
}

/** Keep the newest `max` messages, starting on a user turn. */
function capMessages(messages: UIMessage[], max: number): UIMessage[] {
  if (messages.length <= max) return messages;
  const tail = messages.slice(-max);
  const firstUser = tail.findIndex((m) => m.role === 'user');
  return firstUser > 0 ? tail.slice(firstUser) : tail;
}

export function loadSession(userId: string): Stored {
  try {
    const raw = sessionStorage.getItem(keyFor(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      if (parsed && typeof parsed.runId === 'string' && Array.isArray(parsed.messages)) {
        const messages = parsed.messages.filter(
          (m): m is UIMessage => !!m && typeof m.id === 'string' && Array.isArray(m.parts),
        );
        return { runId: parsed.runId, messages: sanitizeMessages(messages) };
      }
    }
  } catch {
    /* corrupt / blocked storage → fresh thread */
  }
  return { runId: newRunId(), messages: [] };
}

export function saveSession(userId: string, runId: string, messages: UIMessage[]): void {
  const key = keyFor(userId);
  const base = capMessages(sanitizeMessages(messages), MAX_MESSAGES);
  // Progressively smaller until it fits: big files out, then all inline files,
  // then fewer messages.
  const attempts: UIMessage[][] = [
    slimFiles(base, MAX_INLINE_FILE_CHARS),
    slimFiles(base, 0),
    capMessages(slimFiles(base, 0), Math.floor(MAX_MESSAGES / 3)),
  ];
  for (const msgs of attempts) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ runId, messages: msgs } satisfies Stored));
      return;
    } catch {
      /* quota → try the next, smaller version */
    }
  }
}

export function clearSession(userId: string): void {
  try {
    sessionStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}
