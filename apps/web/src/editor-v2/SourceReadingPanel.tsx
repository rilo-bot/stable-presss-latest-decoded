// ---------------------------------------------------------------------------
// "Your documents are being read" — the studio's view of a read in progress.
//
// WHY THIS HAS TO EXIST
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
// WHY IT IS THREE EXPORTS AND NOT ONE PANEL
//
// It used to be a bordered box stacked under the build banner, and the result was
// THREE progress indicators on one screen: the gold strip saying "Planning your
// issue", this box saying "Reading your document…", and the centre of the canvas
// saying "Planning your issue" again — two of them the same sentence, none of them
// the whole truth, and the box shoving the canvas down the page to say it.
//
// A build has ONE progress display. So the polling is a hook, the live state is a
// summary the build screen renders inside its own block, and the only thing that
// still gets a surface of its own is TROUBLE — a document that failed or was cut
// short, which has to outlive the build screen because it explains a thin magazine
// long after the reading is over.
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

/**
 * Poll this issue's source documents until they settle.
 *
 * ONE caller, deliberately: the studio calls it and hands the rows to whatever
 * needs them. Two components each running this would be two requests every four
 * seconds for the same answer, and the split below (live state on the build
 * screen, trouble in its own strip) is exactly the shape that invites it.
 *
 * An empty `issueId` polls nothing and returns null, so the caller can switch it
 * off without breaking the rules of hooks.
 */
export function useSourceReading(issueId: string): SourceDocSummary[] | null {
  const [sources, setSources] = useState<SourceDocSummary[] | null>(null);
  // A ref, not state: the poll loop reads it without wanting to re-run on change.
  const stopped = useRef(false);

  useEffect(() => {
    if (!issueId) {
      setSources(null);
      return;
    }
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

  return sources;
}

/** The live read, reduced to what ONE progress display needs to say. */
export interface ReadingSummary {
  /** Headline for the build screen — it is reading, not planning, and the screen
   *  said "Planning your issue" throughout the read before this existed. */
  headline: string;
  /** Which document, and how far in. Takes the place of the rotating flavour line,
   *  which cheerfully claimed "Mixing a colour palette" during a four-minute read. */
  detail: string;
  /** Pages read / pages total. `null` until the first batch has opened the file —
   *  the total is unknown until then, and a bar pinned at zero reads as a stall. */
  fraction: number | null;
  /** What the read costs, when anything needed OCR. */
  cost: string;
}

/**
 * What to show while documents are still being read, or null when none are.
 *
 * Null is the signal to the build screen that it can go back to talking about the
 * build — there is no third state to get wrong.
 */
export function readingSummary(sources: SourceDocSummary[] | null | undefined): ReadingSummary | null {
  const working = (sources ?? []).filter(isWorking);
  if (working.length === 0) return null;
  // The furthest-along document leads. With several attached, one bar for "the
  // read" is a fiction — but the bar has to be about something, and the file whose
  // pages are actually moving is the one a person is watching.
  const lead = working.reduce((a, b) => (b.pagesRead > a.pagesRead ? b : a));
  const others = working.length - 1;
  return {
    headline: working.length === 1 ? 'Reading your document' : `Reading ${working.length} documents`,
    detail: [lead.originalName, statusText(lead), others > 0 ? `+${others} more` : ''].filter(Boolean).join(' · '),
    fraction: lead.pagesTotal > 0 ? Math.min(1, lead.pagesRead / lead.pagesTotal) : null,
    cost: costText(lead),
  };
}

/**
 * The only part of a read that still gets a surface of its own: a document that
 * FAILED or was cut short.
 *
 * Separate from the live progress because it is a different kind of fact. Progress
 * is transient and belongs with the build display; this explains why a magazine is
 * thin, and has to be readable long after the build screen is gone.
 */
export function SourceTrouble({ sources }: { sources: SourceDocSummary[] | null | undefined }) {
  const bad = (sources ?? []).filter((s) => s.status === 'failed' || s.coverage?.truncated);
  if (bad.length === 0) return null;
  return (
    <div className="border-b border-amber-400/25 bg-amber-400/10 px-4 py-1.5 text-ui-sm">
      <ul className="space-y-0.5">
        {bad.map((s) => (
          <li key={s.id} className="flex items-baseline gap-1.5">
            <span className="truncate font-medium" title={s.originalName}>
              {s.originalName}
            </span>
            <span className={s.status === 'failed' ? 'text-destructive' : 'text-amber-600 dark:text-amber-500'}>
              — {s.status === 'failed' ? s.error || 'could not be read' : s.coverage?.reason || statusText(s)}
            </span>
          </li>
        ))}
      </ul>
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
