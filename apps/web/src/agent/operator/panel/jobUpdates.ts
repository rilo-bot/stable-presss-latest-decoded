// ---------------------------------------------------------------------------
// [job-update] messages — how a finished background job (runtime/jobs.ts)
// re-enters the Operator conversation.
//
// The panel sends them as a USER message (that is what makes the model take a
// turn) whose text is the marker followed by compact JSON. The server relabels
// them as app notices before the model sees them (routes/agentOperator), and
// the panel renders them as a small status chip, never as a user bubble.
// ---------------------------------------------------------------------------

import type { UIMessage } from 'ai';
import { jobUpdatePayload, type OperatorJob } from '@/agent/operator/runtime/jobs';

export const JOB_UPDATE_MARKER = '[job-update]';

export interface JobUpdatePayload {
  jobId?: string;
  kind?: string;
  label?: string;
  finished?: boolean;
  ok?: boolean;
  error?: string;
  summary?: unknown;
  href?: string;
}

export function jobUpdateText(job: OperatorJob): string {
  return `${JOB_UPDATE_MARKER} ${JSON.stringify(jobUpdatePayload(job))}`;
}

function textOf(m: Pick<UIMessage, 'parts'>): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function isJobUpdateMessage(m: Pick<UIMessage, 'role' | 'parts'>): boolean {
  return m.role === 'user' && textOf(m).trimStart().startsWith(JOB_UPDATE_MARKER);
}

export function parseJobUpdate(m: Pick<UIMessage, 'parts'>): JobUpdatePayload | null {
  const t = textOf(m).trimStart();
  if (!t.startsWith(JOB_UPDATE_MARKER)) return null;
  try {
    const j = JSON.parse(t.slice(JOB_UPDATE_MARKER.length).trim()) as unknown;
    return j && typeof j === 'object' ? (j as JobUpdatePayload) : {};
  } catch {
    return {};
  }
}

/** "The Home Straight finished building — 6 pages" / "… failed: reason". */
export function describeJobUpdate(p: JobUpdatePayload): { ok: boolean; text: string } {
  const label = p.label || 'The job';
  const ok = p.ok ?? !p.error;
  if (!ok) return { ok, text: `${label} didn’t finish${p.error ? ` — ${p.error}` : ''}` };
  const s = (p.summary ?? {}) as { pageCount?: unknown; pagesAdded?: unknown };
  const pages = (n: number) => `${n} page${n === 1 ? '' : 's'}`;
  if (p.kind === 'magazine-build') {
    const tail =
      typeof s.pagesAdded === 'number'
        ? ` — ${pages(s.pagesAdded)} added`
        : typeof s.pageCount === 'number'
          ? ` — ${pages(s.pageCount)}`
          : '';
    return { ok, text: `${label} finished building${tail}` };
  }
  return { ok, text: `${label} finished` };
}
