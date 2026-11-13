// ---------------------------------------------------------------------------
// Background-job chips (runtime/jobs.ts) for the Operator panel.
//
//   <JobChips variant="panel" />     compact gold chips above the composer —
//                                    "Building pages 2 of 6 · The Home Straight"
//                                    with a thin bar; ✓ / ✕ for a little while
//                                    after it settles. Click → open its screen.
//   <JobChips variant="floating" />  the same line as a small top-centre pill
//                                    while the panel is CLOSED and no run is
//                                    active (during a run the presence pill owns
//                                    that spot and mirrors the job's progress).
//   <JobUpdateChip message={m} />    how a `[job-update]` user message renders
//                                    in the thread: a status line, not a bubble.
//
// Everything is marked data-operator-ui (readScreen skips it, and clicking it is
// not a takeover).
// ---------------------------------------------------------------------------

import { useNavigate } from 'react-router-dom';
import type { UIMessage } from 'ai';
import { Check, Loader2, X } from 'lucide-react';

import { OPERATOR_UI_ATTR } from '@/agent/operator/contracts';
import { useOperator } from '@/agent/operator/operatorStore';
import { useOperatorJobs, type OperatorJob } from '@/agent/operator/runtime/jobs';
import { useAuthStore } from '@/stores/authStore';
import { describeJobUpdate, parseJobUpdate } from './jobUpdates';

const uiAttr = { [OPERATOR_UI_ATTR]: '' };

function jobLine(j: OperatorJob): string {
  if (j.status === 'running') {
    const count = j.total > 0 ? ` ${Math.min(j.done, j.total)} of ${j.total}` : '…';
    return `${j.verb}${count} · ${j.label}`;
  }
  if (j.status === 'failed') return `${j.label} didn’t finish${j.error ? ` — ${j.error}` : ''}`;
  return `${j.label} — done${j.headline ? ` · ${j.headline}` : ''}`;
}

function useVisibleJobs(runningOnly: boolean): OperatorJob[] {
  const jobs = useOperatorJobs((s) => s.jobs);
  const uid = useAuthStore((s) => s.currentUser?.id);
  return jobs.filter(
    (j) => !j.dismissed && (!j.userId || !uid || j.userId === uid) && (!runningOnly || j.status === 'running'),
  );
}

function JobIcon({ job }: { job: OperatorJob }) {
  if (job.status === 'running') {
    return <Loader2 className="h-3.5 w-3.5 flex-shrink-0 motion-safe:animate-spin" style={{ color: 'var(--gold-bright)' }} />;
  }
  if (job.status === 'failed') {
    return (
      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <X className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full"
      style={{ background: 'rgba(212,168,67,0.22)', color: 'var(--gold-dark)' }}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  );
}

function Bar({ job }: { job: OperatorJob }) {
  if (job.status !== 'running') return null;
  const frac = job.total > 0 ? Math.min(1, job.done / job.total) : null;
  return (
    <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(212,168,67,0.18)' }}>
      {frac === null ? (
        <span className="block h-full w-1/3 motion-safe:animate-pulse rounded-full" style={{ background: 'var(--gold-mid)' }} />
      ) : (
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(4, frac * 100)}%`, background: 'linear-gradient(90deg, var(--gold-mid), var(--gold-bright))' }}
        />
      )}
    </span>
  );
}

export function JobChips({ variant }: { variant: 'panel' | 'floating' }) {
  const navigate = useNavigate();
  const opStatus = useOperator((s) => s.status);
  const jobs = useVisibleJobs(variant === 'floating');
  const dismiss = useOperatorJobs((s) => s.dismiss);

  if (!jobs.length) return null;

  if (variant === 'floating') {
    if (opStatus !== 'idle') return null; // the presence pill has the spot
    const j = jobs[jobs.length - 1]!;
    const more = jobs.length - 1;
    return (
      // Centred over the site — with the panel collapsed to its rail on desktop,
      // the rail takes the right edge (index.css, "THE STABLE HAND DOCK").
      <div className="pointer-events-auto fixed left-mid-stablehand top-2.5 z-[84] -translate-x-1/2 print:hidden sm:top-3" {...uiAttr}>
        <button
          type="button"
          onClick={() => j.href && navigate(j.href)}
          title={j.href ? 'Open it' : undefined}
          className="flex max-w-[min(92vw,420px)] flex-col rounded-full px-3.5 py-1.5 text-left text-xs font-medium shadow-lg"
          style={{
            background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)',
            color: 'var(--parchment)',
            border: '1px solid var(--gold-dark)',
          }}
        >
          <span className="flex items-center gap-2">
            <JobIcon job={j} />
            <span className="truncate">{jobLine(j)}</span>
            {more > 0 && <span style={{ color: 'var(--gold-mid)' }}>+{more}</span>}
          </span>
          <Bar job={j} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0 flex-col gap-1 border-t border-border bg-card px-3 py-2" {...uiAttr}>
      {jobs.map((j) => (
        <div
          key={j.id}
          className="group flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
          style={{ borderColor: 'rgba(212,168,67,0.45)', background: 'rgba(212,168,67,0.06)' }}
        >
          <span className="mt-px">
            <JobIcon job={j} />
          </span>
          <button
            type="button"
            onClick={() => j.href && navigate(j.href)}
            disabled={!j.href}
            title={j.href ? 'Open it' : undefined}
            className="min-w-0 flex-1 text-left disabled:cursor-default"
          >
            <span className={'block truncate ' + (j.status === 'failed' ? 'text-destructive' : 'text-foreground')}>{jobLine(j)}</span>
            {j.status === 'running' && j.headline && j.total === 0 && (
              <span className="block truncate text-[11px] text-muted-foreground">{j.headline}</span>
            )}
            <Bar job={j} />
          </button>
          <button
            type="button"
            onClick={() => dismiss(j.id)}
            aria-label={j.status === 'running' ? 'Hide (keeps watching in the background)' : 'Dismiss'}
            title={j.status === 'running' ? 'Hide — it keeps building' : 'Dismiss'}
            className="flex-shrink-0 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** A `[job-update]` message in the thread: a centred status line. */
export function JobUpdateChip({ message }: { message: UIMessage }) {
  const navigate = useNavigate();
  const p = parseJobUpdate(message) ?? {};
  const { ok, text } = describeJobUpdate(p);
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => p.href && navigate(p.href)}
        disabled={!p.href}
        title={p.href ? 'Open it' : undefined}
        className="flex max-w-[92%] items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
        style={{ borderColor: ok ? 'rgba(212,168,67,0.45)' : 'hsl(var(--destructive) / 0.4)' }}
      >
        {ok ? (
          <Check className="h-3 w-3 flex-shrink-0" strokeWidth={3} style={{ color: 'var(--gold-dark)' }} />
        ) : (
          <X className="h-3 w-3 flex-shrink-0 text-destructive" strokeWidth={3} />
        )}
        <span className="truncate">{text}</span>
      </button>
    </div>
  );
}
