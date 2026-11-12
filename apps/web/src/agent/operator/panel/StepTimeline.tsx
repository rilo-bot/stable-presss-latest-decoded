// ---------------------------------------------------------------------------
// The Operator's step timeline — what the Stablehand DID, in order.
//
// An assistant message is rendered part by part, so the narration and the
// actions interleave the way they happened ("I'll open the builder" → Opened
// Magazine Builder → Clicked “Share” → "Done — shared page 3 with Sam"). Runs
// of consecutive tool calls become one compact list: spinner while running,
// ✓ when done, ✕ on error — each row expandable to the short input / output and
// the finer-grained runtime steps (ui.step lines) it produced. The point is
// trust: a person who can see every click can tell exactly what changed.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { isToolUIPart, getToolName, type UIMessage, type DynamicToolUIPart, type ToolUIPart } from 'ai';
import { Check, ChevronRight, Loader2, Minus, Ban, RotateCcw, X } from 'lucide-react';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { ChoiceCard } from '@/agent/choices/ChoiceCard';
import { choicesOfPart, isChoicesPart, type ChoiceQuestion } from '@/agent/choices/choices';
import { useOperator, type OperatorStep } from '@/agent/operator/operatorStore';
import { scrubIds } from '@/agent/operator/runtime/humanRef';
import { stepLabel, truncate } from './toolLabels';
import type { SubStepMap } from './useOperatorChat';

type AnyToolPart = ToolUIPart | DynamicToolUIPart;
const ELEMENT_TOOLS = new Set(['click', 'type', 'select', 'waitFor', 'scrollTo']);
type RowState = 'running' | 'done' | 'error' | 'retry' | 'declined' | 'stopped';

/**
 * Errors The Stable Hand makes and then corrects itself: arguments the action
 * refused (e.g. 7 pages when the builder takes 1, 2, 3, 4 or 6), or a button not
 * on screen yet. Nothing in the app changed and it immediately tries again, so
 * these show as a calm "retrying" row — a red X made users think the work failed.
 */
const SELF_CORRECTING = /data-agent-id|ref:|readScreen|Invalid arguments|not available on this screen|Visible anchors|No element/i;

function rawErrorOf(p: AnyToolPart): string | undefined {
  if (p.state === 'output-error') return p.errorText;
  if (p.state === 'output-available') {
    const o = p.output as { ok?: unknown; error?: unknown } | null | undefined;
    if (o && typeof o === 'object' && o.ok === false && typeof o.error === 'string') return o.error;
  }
  return undefined;
}

function rowState(p: AnyToolPart, live: boolean): RowState {
  switch (p.state) {
    case 'output-available': {
      const o = p.output as { ok?: unknown; declined?: unknown } | null | undefined;
      if (o && typeof o === 'object' && o.ok === false) {
        if (o.declined) return 'declined';
        return SELF_CORRECTING.test(rawErrorOf(p) ?? '') ? 'retry' : 'error';
      }
      return 'done';
    }
    case 'output-error':
      return SELF_CORRECTING.test(p.errorText ?? '') ? 'retry' : 'error';
    case 'output-denied':
      return 'declined';
    default:
      // No result yet: running while the conversation is live, otherwise it
      // was cut short (Stop / an error) and will never finish.
      return live ? 'running' : 'stopped';
  }
}

function errorOf(p: AnyToolPart): string | undefined {
  if (p.state === 'output-error') return userFacingError(p.errorText);
  if (p.state === 'output-available') {
    const o = p.output as { ok?: unknown; error?: unknown; declined?: unknown } | null | undefined;
    if (o && typeof o === 'object' && o.ok === false) {
      if (o.declined === true) return 'You said no — nothing was changed.';
      if (typeof o.error === 'string') return userFacingError(o.error);
    }
  }
  return undefined;
}

/** Tool errors are written for the MODEL (ids, schemas, "call readScreen").
 *  The user gets one plain line; the model still sees the full text. */
function userFacingError(raw: string | undefined): string {
  const e = (raw ?? '').trim();
  if (!e) return 'That step didn’t work.';
  if (/stopped by the user/i.test(e)) return 'Stopped by you.';
  // The app's own window.confirm(), held back by the runtime until the user OKs a card.
  if (/declined automatically/i.test(e)) return 'The app asked to confirm — nothing changed until you say OK.';
  if (/declined/i.test(e)) return 'You said no — nothing was changed.';
  if (/Invalid arguments/i.test(e)) return 'Adjusting the details and trying again.';
  if (SELF_CORRECTING.test(e)) return 'Not on screen yet — trying another way.';
  if (/\b(403|forbidden|not permitted|permission)\b/i.test(e)) return 'Your role doesn’t allow this.';
  if (/\b(401|sign in)\b/i.test(e)) return 'Please sign in again.';
  // A short, human server message is fine to show; anything long is noise.
  return e.length <= 120 ? scrubIds(e) : 'That step didn’t work.';
}

function StateIcon({ state }: { state: RowState }) {
  const box = 'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full';
  switch (state) {
    case 'running':
      return <Loader2 className="h-4 w-4 flex-shrink-0 motion-safe:animate-spin" style={{ color: 'var(--gold-bright)' }} />;
    case 'done':
      return (
        <span className={box} style={{ background: 'rgba(212,168,67,0.18)', color: 'var(--gold-dark)' }}>
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      );
    case 'error':
      return (
        <span className={box + ' bg-destructive/15 text-destructive'}>
          <X className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      );
    case 'retry':
      return (
        <span className={box} style={{ background: 'rgba(212,168,67,0.18)', color: 'var(--gold-dark)' }}>
          <RotateCcw className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      );
    case 'declined':
      return (
        <span className={box + ' bg-muted text-muted-foreground'}>
          <Ban className="h-2.5 w-2.5" />
        </span>
      );
    default:
      return (
        <span className={box + ' bg-muted text-muted-foreground'}>
          <Minus className="h-2.5 w-2.5" />
        </span>
      );
  }
}

function SubSteps({ steps }: { steps: OperatorStep[] }) {
  if (!steps.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 border-l pl-2" style={{ borderColor: 'rgba(212,168,67,0.35)' }}>
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          {s.status === 'running' ? (
            <Loader2 className="mt-0.5 h-3 w-3 flex-shrink-0 motion-safe:animate-spin" style={{ color: 'var(--gold-bright)' }} />
          ) : (
            <span className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: s.status === 'error' ? 'hsl(var(--destructive))' : 'var(--gold-mid)' }} />
          )}
          <span>{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

function StepRow({
  part,
  live,
  liveSteps,
  doneSteps,
}: {
  part: AnyToolPart;
  live: boolean;
  liveSteps: OperatorStep[] | null;
  doneSteps: OperatorStep[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const name = getToolName(part);
  const state = rowState(part, live);
  const output = part.state === 'output-available' ? part.output : undefined;
  const steps = liveSteps ?? doneSteps ?? [];
  // For the element tools the runtime's own step line names the element by its
  // REAL label (“Share”), which beats humanising the data-agent-id.
  const runtimeLabel = ELEMENT_TOOLS.has(name) && state !== 'running' ? steps[0]?.label : undefined;
  const label = runtimeLabel ?? stepLabel(name, part.input, output, state === 'running');
  const err = errorOf(part);
  // A runtime step that only restates the row ("Share pages…" under the
  // "Share pages…" row) is noise — drop it; show the rest only if a real
  // breakdown remains.
  const norm = (s: string) => s.replace(/[.…\s]+$/, '').toLowerCase();
  const rowKey = norm(stepLabel(name, part.input, undefined, true));
  const distinct = steps.filter((s) => norm(s.label) !== rowKey);
  const breakdown = distinct.length > 1 || (distinct.length === 1 && steps.length > 1) ? distinct : [];
  // Users see plain-English steps only — never the raw tool input / result JSON
  // (the full technical record lives in the run log: AI Activity › The Stable Hand). A row
  // only expands when it has a real breakdown to show.
  const canExpand = breakdown.length > 0;

  return (
    <li className="text-xs">
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        aria-expanded={canExpand ? open : undefined}
        className={
          'group flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors ' +
          (canExpand ? 'hover:bg-muted' : 'cursor-default')
        }
      >
        <span className="mt-px">
          <StateIcon state={state} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={'block leading-snug ' + (state === 'running' ? 'font-medium text-foreground' : 'text-foreground/85')}>
            {label}
          </span>
          {err && (
            <span className={'block truncate text-[11px] ' + (state === 'retry' ? 'text-muted-foreground' : 'text-destructive')}>
              {truncate(err, 140)}
            </span>
          )}
          {state === 'stopped' && <span className="block text-[11px] text-muted-foreground">Stopped</span>}
        </span>
        {canExpand && (
          <ChevronRight
            className={'mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ' + (open ? 'rotate-90' : 'opacity-0 group-hover:opacity-100')}
          />
        )}
      </button>
      {/* Live runtime steps stay visible under a running row even when collapsed. */}
      {!open && state === 'running' && breakdown.length > 0 && (
        <div className="ml-7 pb-1">
          <SubSteps steps={breakdown.slice(-3)} />
        </div>
      )}
      {open && canExpand && (
        <div className="mb-1 ml-7 rounded-md border border-border bg-muted/40 p-2">
          <SubSteps steps={breakdown} />
        </div>
      )}
    </li>
  );
}

/** How many finished rows stay visible before the rest fold behind "Show N earlier". */
const VISIBLE_WHEN_DONE = 4;

export function StepTimeline({
  parts,
  live,
  running,
  subSteps,
}: {
  parts: AnyToolPart[];
  live: boolean;
  running: { id: string; since: number } | null;
  subSteps: SubStepMap;
}) {
  const [showAll, setShowAll] = useState(false);
  const steps = useOperator((s) => s.steps);
  const anyRunning = parts.some((p) => rowState(p, live) === 'running');
  const hidden = !showAll && !anyRunning ? Math.max(0, parts.length - VISIBLE_WHEN_DONE) : 0;
  const shown = hidden ? parts.slice(hidden) : parts;

  return (
    <div className="w-full rounded-xl border px-1.5 py-1" style={{ borderColor: 'rgba(212,168,67,0.28)', background: 'rgba(212,168,67,0.04)' }}>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex w-full items-center gap-1 px-1.5 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-3 w-3" /> Show {hidden} earlier step{hidden === 1 ? '' : 's'}
        </button>
      )}
      <ul>
        {shown.map((p) => (
          <StepRow
            key={p.toolCallId}
            part={p}
            live={live}
            liveSteps={running && running.id === p.toolCallId ? steps.filter((s) => s.at >= running.since) : null}
            doneSteps={subSteps[p.toolCallId]}
          />
        ))}
      </ul>
    </div>
  );
}

// ── Whole assistant message: text bubbles interleaved with step lists ────────
type Segment =
  | { kind: 'text'; text: string; key: string }
  | { kind: 'tools'; parts: AnyToolPart[]; key: string }
  | { kind: 'choices'; questions: ChoiceQuestion[]; key: string };

function segmentsOf(m: UIMessage): Segment[] {
  const out: Segment[] = [];
  m.parts.forEach((p, i) => {
    const last = out[out.length - 1];
    if (p.type === 'text') {
      if (!p.text) return;
      if (last?.kind === 'text') last.text += p.text;
      else out.push({ kind: 'text', text: p.text, key: `t${i}` });
    } else if (isChoicesPart(p)) {
      // offer_choices is not a step the user watches — it is the answer pills
      // (shown once its input has fully streamed in).
      const questions = choicesOfPart(p);
      if (questions) out.push({ kind: 'choices', questions, key: `c${i}` });
    } else if (isToolUIPart(p)) {
      if (last?.kind === 'tools') last.parts.push(p);
      else out.push({ kind: 'tools', parts: [p], key: `s${i}` });
    }
    // step-start / reasoning / sources / data parts: nothing to show.
  });
  return out;
}

/** The answer pills' wiring for one message (see agent/choices). */
export interface MessageChoices {
  active: boolean;
  answer?: string;
  disabled: boolean;
  onSubmit: (text: string) => void;
}

export function AssistantMessage({
  message,
  live,
  running,
  subSteps,
  choices,
}: {
  message: UIMessage;
  live: boolean;
  running: { id: string; since: number } | null;
  subSteps: SubStepMap;
  /** Absent → any answer pills render read-only. */
  choices?: MessageChoices;
}) {
  const segments = segmentsOf(message);
  if (!segments.length) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      {segments.map((s) =>
        s.kind === 'text' ? (
          <div key={s.key} className="max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground">
            <MarkdownMessage text={s.text} />
          </div>
        ) : s.kind === 'choices' ? (
          <ChoiceCard
            key={s.key}
            questions={s.questions}
            active={choices?.active ?? false}
            answer={choices?.answer}
            disabled={choices?.disabled ?? true}
            onSubmit={(text) => choices?.onSubmit(text)}
            tone="operator"
          />
        ) : (
          <StepTimeline key={s.key} parts={s.parts} live={live} running={running} subSteps={subSteps} />
        ),
      )}
    </div>
  );
}
