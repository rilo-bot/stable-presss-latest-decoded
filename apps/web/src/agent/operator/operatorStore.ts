// ---------------------------------------------------------------------------
// Operator run state — the ONE store presence, runtime and panel share.
//
//   panel    startRun() when a message is sent, endRun() when the stream is done,
//            stop() on the Stop button, resume() on Resume, renders steps[] and
//            pendingConfirm.
//   runtime  pushStep()/finishStep(), setProgress(), requestConfirm(),
//            pause('takeover'), waitUntilRunning(), abortSignal().
//   presence reads status / stepLabel / progress / cursor and renders.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
// Safety net: no confirm card or step line ever shows a raw id. The packs name
// people / records at the source (runtime/people, runtime/humanRef); this
// catches anything that slips through.
import { scrubIds } from './runtime/humanRef';

export type RunStatus = 'idle' | 'working' | 'paused';

export interface OperatorStep {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error' | 'needs-ok' | 'declined';
  detail?: string;
  at: number;
}

export interface PendingConfirm {
  id: string;
  summary: string;
}

export interface CursorState {
  visible: boolean;
  x: number;
  y: number;
  label?: string;
  /** Increments on every click so the ripple can key off it. */
  clickSeq: number;
}

interface OperatorState {
  status: RunStatus;
  pauseReason: 'takeover' | 'user' | null;
  /** Current one-line step, shown in the pill. */
  stepLabel: string;
  steps: OperatorStep[];
  progress: { label: string; done: number; total: number } | null;
  pendingConfirm: PendingConfirm | null;
  cursor: CursorState;
  /** The docked panel steps aside (fades out, ignores the pointer) because the
   *  element the cursor is working on sits underneath it — e.g. the magazine
   *  editor's Share button in its top-right toolbar. Presence sets it per
   *  target; it always clears for a confirm card and at the end of a run. */
  panelYield: boolean;

  startRun: () => void;
  endRun: () => void;
  stop: () => void;
  pause: (reason: 'takeover' | 'user') => void;
  resume: () => void;
  clearSteps: () => void;

  pushStep: (label: string, status?: OperatorStep['status']) => string;
  finishStep: (id: string, status: OperatorStep['status'], detail?: string) => void;
  setProgress: (p: OperatorState['progress']) => void;
  setCursor: (c: Partial<CursorState>) => void;
  setPanelYield: (y: boolean) => void;

  /** Resolves true on the user's OK, false on Cancel / Stop. */
  requestConfirm: (summary: string) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;

  /** Aborted by stop(); a fresh controller per run. */
  abortSignal: () => AbortSignal;
  /** Resolves immediately when working; waits while paused; rejects on stop. */
  waitUntilRunning: () => Promise<void>;
}

let controller = new AbortController();
let confirmResolver: ((ok: boolean) => void) | null = null;
let yieldTimer: ReturnType<typeof setTimeout> | null = null;
let resumeWaiters: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];
let seq = 0;
const nextId = () => `op-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const abortError = () => new DOMException('The Stable Hand was stopped.', 'AbortError');

function flushWaiters(ok: boolean) {
  const w = resumeWaiters;
  resumeWaiters = [];
  for (const x of w) (ok ? x.resolve() : x.reject(abortError()));
}

export const useOperator = create<OperatorState>((set, get) => ({
  status: 'idle',
  pauseReason: null,
  stepLabel: '',
  steps: [],
  progress: null,
  pendingConfirm: null,
  cursor: { visible: false, x: 0, y: 0, clickSeq: 0 },
  panelYield: false,

  startRun: () => {
    if (get().status !== 'idle') return;
    controller = new AbortController();
    set({ status: 'working', pauseReason: null, stepLabel: 'Thinking…', progress: null });
  },
  endRun: () => {
    if (confirmResolver) get().resolveConfirm(false);
    flushWaiters(false);
    set((s) => ({
      status: 'idle',
      pauseReason: null,
      stepLabel: '',
      progress: null,
      pendingConfirm: null,
      panelYield: false,
      cursor: { ...s.cursor, visible: false, label: undefined },
      steps: s.steps.map((st) => (st.status === 'running' ? { ...st, status: 'done' } : st)),
    }));
  },
  stop: () => {
    controller.abort();
    get().endRun();
  },
  pause: (reason) => {
    if (get().status !== 'working') return;
    set({ status: 'paused', pauseReason: reason });
  },
  resume: () => {
    if (get().status !== 'paused') return;
    set({ status: 'working', pauseReason: null });
    flushWaiters(true);
  },
  clearSteps: () => set({ steps: [] }),

  pushStep: (label, status = 'running') => {
    const id = nextId();
    set((s) => ({
      stepLabel: label,
      steps: [
        // a new step completes the previous running one
        ...s.steps.map((st) => (st.status === 'running' ? { ...st, status: 'done' as const } : st)),
        { id, label: scrubIds(label), status, at: Date.now() },
      ].slice(-200),
    }));
    return id;
  },
  finishStep: (id, status, detail) =>
    set((s) => ({ steps: s.steps.map((st) => (st.id === id ? { ...st, status, detail: detail === undefined ? undefined : scrubIds(detail) } : st)) })),
  setProgress: (progress) => set({ progress }),
  setCursor: (c) => set((s) => ({ cursor: { ...s.cursor, ...c } })),
  setPanelYield: (panelYield) => {
    // Stepping aside is MOMENTARY: it lasts while the cursor works under the
    // panel and the panel returns ~1.5s after the last such move. Without the
    // timer a long wait after one covered click (e.g. "Generate" → a magazine
    // build) left the whole chat invisible until the run ended.
    if (yieldTimer) clearTimeout(yieldTimer);
    yieldTimer = null;
    if (panelYield) {
      yieldTimer = setTimeout(() => {
        yieldTimer = null;
        set({ panelYield: false });
      }, 1500);
    }
    if (get().panelYield !== panelYield) set({ panelYield });
  },

  requestConfirm: (summary) => {
    if (confirmResolver) confirmResolver(false);
    const id = nextId();
    // The confirm card lives in the panel — it must be on screen to be answered,
    // and the parked ghost cursor (often left on a button near the panel) must
    // not sit over its Confirm / Stop buttons.
    set((s) => ({
      pendingConfirm: { id, summary: scrubIds(summary) },
      panelYield: false,
      cursor: { ...s.cursor, visible: false, label: undefined },
    }));
    get().pushStep(`Needs your OK: ${summary}`, 'needs-ok');
    return new Promise<boolean>((resolve) => {
      confirmResolver = resolve;
    });
  },
  resolveConfirm: (ok) => {
    const r = confirmResolver;
    confirmResolver = null;
    const pc = get().pendingConfirm;
    set((s) => ({
      pendingConfirm: null,
      steps: s.steps.map((st) =>
        st.status === 'needs-ok' ? { ...st, status: ok ? 'done' : 'declined' } : st,
      ),
    }));
    if (pc && r) r(ok);
  },

  abortSignal: () => controller.signal,
  waitUntilRunning: () => {
    if (controller.signal.aborted) return Promise.reject(abortError());
    if (get().status !== 'paused') return Promise.resolve();
    return new Promise<void>((resolve, reject) => resumeWaiters.push({ resolve, reject }));
  },
}));
