// ---------------------------------------------------------------------------
// "Your documents are being read" — the studio's view of a read in progress.
//
// WHY THIS SCREEN HAS TO EXIST
//
// Removing the page caps changed what waiting looks like. It used to be seconds,
// in the browser, before the studio ever opened; now a 600-page scan is read in
// the worker and can legitimately take a long time. Without something showing what
// is happening, the studio just looks broken — and the user's reasonable response
// to a magazine that seems stuck is to reload or start again, which is the worst
// possible thing to do while a read they are paying for is running.
//
// So this reports facts, per document: pages read of pages total, and what the read
// is expected to cost. It also renders `partial` honestly rather than as success,
// because "we read 40 of 300 pages" is the difference between a thin magazine being
// the AI's fault and it being a truncated document's.
//
// It renders NOTHING when there are no source documents, so mounting it costs a
// screen with no attachments nothing at all.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

import * as api from './api';
import type { SourceDocSummary } from './api';

/** How often to re-ask while a read is in flight. Reading is minutes-long work, so
 *  a slow poll is plenty and keeps this off the API's back. */
const POLL_MS = 4000;

/** A document still in flight — what makes us keep polling. */
function isWorking(s: SourceDocSummary): boolean {
  return s.status === 'queued' || s.status === 'reading';
}

function prettyBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function SourceReadingPanel({ issueId }: { issueId: string }) {
  const [sources, setSources] = useState<SourceDocSummary[] | null>(null);
  // A ref, not state: the poll loop reads it without wanting to re-run on change.
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const rows = await api.listSources(issueId);
        if (stopped.current) return;
        setSources(rows);
        // Stop polling once every document has settled. Not a fixed number of
        // attempts: a read has no predictable length any more, and a poll that gave
        // up after N tries would abandon exactly the long documents this exists for.
        if (rows.some(isWorking)) timer = setTimeout(tick, POLL_MS);
      } catch {
        // A blip must not end the watch — the read is still going regardless of
        // whether we could see it this second.
        if (!stopped.current) timer = setTimeout(tick, POLL_MS * 2);
      }
    };
    void tick();

    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [issueId]);

  if (!sources || sources.length === 0) return null;
  // Once everything is read there is nothing to report: the magazine itself is the
  // report. A panel that lingered saying "done" would just be clutter.
  if (!sources.some((s) => isWorking(s) || s.status === 'failed' || s.coverage?.truncated)) return null;

  const working = sources.filter(isWorking);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <div className="mb-2 font-medium">
        {working.length > 0
          ? `Reading ${working.length === 1 ? 'your document' : `${working.length} documents`}…`
          : 'Your documents'}
      </div>
      <ul className="space-y-2">
        {sources.map((s) => (
          <li key={s.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate" title={s.originalName}>
                {s.originalName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{statusText(s)}</span>
            </div>
            {isWorking(s) && <Progress read={s.pagesRead} total={s.pagesTotal} />}
            {/* Coverage and cost are stated, never only logged. The whole point of
                keeping a `partial` status is that somebody is told about it. */}
            {s.coverage?.truncated && s.coverage.reason && (
              <div className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">{s.coverage.reason}</div>
            )}
            {s.status === 'failed' && s.error && (
              <div className="mt-0.5 text-xs text-destructive">{s.error}</div>
            )}
            {costText(s) && <div className="mt-0.5 text-xs text-muted-foreground">{costText(s)}</div>}
          </li>
        ))}
      </ul>
      {working.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          You can leave this open — the magazine starts building itself as soon as the reading finishes.
        </div>
      )}
    </div>
  );
}

/**
 * A bar for pages read of pages total.
 *
 * Indeterminate until the total is known, and that distinction is the point: the
 * page count only arrives once the first batch has opened the document, and a bar
 * pinned at zero reads as a stall rather than as a start.
 */
function Progress({ read, total }: { read: number; total: number }) {
  const known = total > 0;
  const pct = known ? Math.min(100, Math.round((read / total) * 100)) : 0;
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
      <div
        className={known ? 'h-full bg-primary transition-[width] duration-500' : 'h-full w-1/4 animate-pulse bg-primary/60'}
        style={known ? { width: `${pct}%` } : undefined}
      />
    </div>
  );
}

function statusText(s: SourceDocSummary): string {
  switch (s.status) {
    case 'queued':
      return `queued · ${prettyBytes(s.size)}`;
    case 'reading':
      // Page numbers when we have them. `pagesTotal` is 0 until the first batch has
      // opened the document, and claiming "page 0 of 0" would read as a stall.
      return s.pagesTotal > 0 ? `page ${s.pagesRead} of ${s.pagesTotal}` : 'starting…';
    case 'ready':
      return s.pagesTotal > 1 ? `read · ${s.pagesTotal} pages` : 'read';
    case 'partial':
      return `partly read · ${s.pagesRead} of ${s.pagesTotal} pages`;
    case 'failed':
      return 'could not be read';
    default:
      return s.status;
  }
}

/**
 * What the read costs, when there is anything to say.
 *
 * Shown while it runs, not after, because the number is only useful to somebody
 * deciding whether to let a long read finish. Silent when nothing needed OCR — a
 * typeset document costs nothing to read and saying "$0.00" invites a question
 * where there is no answer needed.
 */
function costText(s: SourceDocSummary): string {
  const e = s.estimate;
  if (!e || e.ocrPagesExpected <= 0) return '';
  const pages = `${e.ocrPagesExpected} scanned page${e.ocrPagesExpected === 1 ? '' : 's'}`;
  const money = e.usd > 0 ? ` · about $${e.usd.toFixed(2)}` : '';
  return e.projected ? `≈ ${pages} to transcribe${money}` : `${pages} transcribed${money}`;
}
