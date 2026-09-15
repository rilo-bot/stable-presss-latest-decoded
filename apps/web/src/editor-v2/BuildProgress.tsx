// ---------------------------------------------------------------------------
// Magazine Builder v2 — the waiting screens.
//
// Replaces the spinning circles. A spinner tells you the app is alive; it does
// not tell you anything is HAPPENING, and after ten seconds it starts to look
// like a hang. These screens instead show, from real data:
//
//   · a factual headline — "4 of 10 pages built"        (shimmering, not spinning)
//   · a rotating line naming the current kind of work   (flips every 2.6s)
//   · a progress bar that is DETERMINATE only when the server sent counts
//   · one tile per page, filling in as pages actually arrive
//   · elapsed time, because "it is still moving" is most of the reassurance
//
// Everything factual comes from buildStatus.ts — read the rule at the top of
// that file before adding anything here that looks like progress.
//
// Announced to screen readers ONCE per real change: the headline is the live
// region, and the decorative rotating line is aria-hidden. A line flipping every
// 2.6 seconds into an aria-live region would be an interruption, not information.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { buildStatus, linesFor, elapsedLabel, type BuildPhase } from './buildStatus';
import type { ReadingSummary } from './SourceReadingPanel';

const GOLD = 'var(--gold-bright)';

interface IssueLike {
  status?: string;
  stage?: string;
  pagesProcessed?: number;
  pagesTotal?: number;
}

/**
 * The next line, every `everyMs`.
 *
 * Walks the pool in order from a per-mount offset rather than picking at random:
 * a random pick repeats itself often enough to look broken ("Setting the
 * headline" three times running), and an ordered walk reads like a process.
 * Resets when the phase changes, so the words follow the work.
 */
function useRotatingLine(phase: BuildPhase, everyMs = 2600): { line: string; tick: number } {
  const pool = linesFor(phase);
  const offset = useRef(Math.floor(Math.random() * pool.length));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
    offset.current = Math.floor(Math.random() * linesFor(phase).length);
  }, [phase]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), everyMs);
    return () => clearInterval(id);
  }, [everyMs, phase]);

  return { line: pool[(offset.current + tick) % pool.length] ?? pool[0]!, tick };
}

/** Ticking elapsed clock, started on mount. */
function useElapsed(): string {
  const start = useRef(Date.now());
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return elapsedLabel(Date.now() - start.current);
}

/** The determinate/indeterminate track. One component so the two can't diverge. */
function Track({ fraction }: { fraction: number | null }) {
  const determinate = fraction !== null;
  return (
    <div
      className="relative h-1 w-full overflow-hidden rounded-full bg-studio-raise-2"
      role="progressbar"
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(fraction * 100) : undefined}
      aria-label="Build progress"
    >
      {determinate ? (
        // Real proportion, eased so a jump of one page glides instead of snapping.
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(2, fraction * 100)}%`, background: GOLD }}
        />
      ) : (
        // No count available — a travelling segment, which must never be mistaken
        // for a proportion. See buildStatus.ts for when this is the honest choice.
        <div className="track-sweep h-full w-1/3 rounded-full" style={{ background: GOLD, opacity: 0.75 }} />
      )}
    </div>
  );
}

/**
 * One tile per page, filled as pages land.
 *
 * `arrived` counts pages the client can actually see; `total` is what the server
 * said to expect. Capped at 24 tiles — beyond that a wall of squares stops
 * reading as progress, and the bar is doing the work anyway.
 */
function PageTiles({ arrived, total }: { arrived: number; total: number }) {
  if (total < 2 || total > 24) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => {
        const done = i < arrived;
        return (
          <div
            key={i}
            className={'h-7 w-5 rounded-[2px] border ' + (done ? 'tile-pop' : '')}
            style={
              done
                ? { borderColor: GOLD, background: 'color-mix(in srgb, var(--gold-bright) 22%, transparent)' }
                : { borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }
            }
          />
        );
      })}
    </div>
  );
}

/**
 * The full-screen build view: the studio's own loading state, and the canvas
 * while the first page is still being composed.
 *
 * `arrivedPages` is the number of pages the client HAS, which can lead
 * `pagesProcessed` by a poll — a page is inserted, then the counter is bumped.
 * Tiles use the larger of the two so a page that is visibly there is never shown
 * as pending.
 */
export function BuildProgress({
  issue,
  isAdding = false,
  arrivedPages = 0,
  title,
  hint,
  reading,
}: {
  issue: IssueLike | null | undefined;
  isAdding?: boolean;
  arrivedPages?: number;
  /** Overrides the factual headline. For states with no build behind them. */
  title?: string;
  hint?: string;
  /**
   * The live document read, when one is running (see readingSummary).
   *
   * It takes over this display rather than sitting beside it. Before, reading had
   * its own bordered box above the canvas while THIS said "Planning your issue" —
   * two progress bars, and the one in the middle was describing work that had not
   * started. Nothing is planned until the documents are read: the read IS the
   * progress, so for its duration it owns the headline, the second line and the bar.
   */
  reading?: ReadingSummary | null;
}) {
  const st = buildStatus(issue, isAdding);
  // No rotating flavour during a read. Its lines are about planning ("Sketching a
  // running order", "Mixing a colour palette") and none of it is happening yet —
  // the document's own progress is both truer and more use.
  const { line, tick } = useRotatingLine(title || reading ? 'finishing' : st.phase);
  const elapsed = useElapsed();
  const total = st.count?.total ?? Math.max(0, Math.floor(Number(issue?.pagesTotal) || 0));
  const shown = Math.max(arrivedPages, st.count?.done ?? 0);
  const headline = title ?? reading?.headline ?? st.headline;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* THE LIVE REGION IS THE PHASE, NOT THE COUNT. The visible headline
            includes "4 of 10", which changes on every poll — announcing that
            would mean up to 120 interruptions during one build. The phase
            changes a handful of times, and the count stays reachable at any
            moment through the progressbar's aria-valuenow below. */}
        <span className="sr-only" role="status" aria-live="polite">
          {title ??
            reading?.headline ??
            (st.phase === 'digitizing' ? 'Reading your document' : st.phase === 'composing' ? 'Building your pages' : 'Planning your issue')}
        </span>
        <p aria-hidden="true" className="text-center text-ui-lg font-semibold tracking-tight">
          <span className="shimmer-text">{headline}</span>
        </p>

        {/* Second line: the document being read, or the rotating flavour. Keyed on
            `tick` so React remounts it and the flip-in replays. */}
        <p
          key={reading ? 'reading' : tick}
          aria-hidden="true"
          className="build-line-in mt-1.5 truncate text-center text-ui text-studio-ink-3"
          title={reading?.detail}
        >
          {reading?.detail ?? line}
        </p>

        <div className="mt-4">
          <Track fraction={reading ? reading.fraction : st.fraction} />
          <div className="mt-1.5 flex items-center justify-between text-ui-sm tabular-nums text-studio-ink-4">
            <span>{reading ? reading.cost || 'reading' : st.count ? `${st.count.done} of ${st.count.total} pages` : 'working'}</span>
            <span>{elapsed}</span>
          </div>
        </div>

        {/* No tiles during a read. `pagesTotal` is the DEFAULT the issue was created
            with, not a plan — one tile per page of a magazine nobody has designed
            yet, filling up for reasons unrelated to the tiles. */}
        {!reading && total > 0 && (
          <div className="mt-4">
            <PageTiles arrived={shown} total={total} />
          </div>
        )}

        <p className="mt-4 text-center text-ui-sm leading-relaxed text-studio-ink-4">
          {reading
            ? 'You can leave this open — the magazine starts building itself as soon as the reading finishes.'
            : hint}
        </p>
      </div>
    </div>
  );
}

/**
 * The thin strip above the canvas once pages are streaming in — same facts, one
 * line high, so it can sit over a magazine the user is already editing.
 */
export function BuildBanner({
  issue,
  isAdding = false,
  arrivedPages = 0,
}: {
  issue: IssueLike | null | undefined;
  isAdding?: boolean;
  arrivedPages?: number;
}) {
  const st = buildStatus(issue, isAdding);
  const { line, tick } = useRotatingLine(st.phase);
  const shown = Math.max(arrivedPages, st.count?.done ?? 0);

  return (
    <div className="border-b border-[var(--gold-bright)]/25 bg-[var(--gold-bright)]/10 px-4 py-1.5">
      <div className="flex items-center gap-3 text-ui-sm">
        {/* Phase only in the live region — same reasoning as BuildProgress. */}
        <span className="sr-only" role="status" aria-live="polite">
          {isAdding ? 'Adding your new pages' : st.phase === 'digitizing' ? 'Reading your document' : 'Building your pages'}
        </span>
        {/* The gold comes from the wrapper; the shimmer inherits it. */}
        <span aria-hidden="true" className="font-semibold" style={{ color: GOLD }}>
          <ShimmerText>{st.count ? `${shown} of ${st.count.total} pages built` : st.headline}</ShimmerText>
        </span>
        <span key={tick} aria-hidden="true" className="build-line-in text-studio-ink-3">
          {line}
        </span>
        <div className="ml-auto flex w-40 flex-shrink-0 items-center gap-2">
          <Track fraction={st.fraction} />
        </div>
        <span className="flex-shrink-0 text-studio-ink-4">
          {isAdding ? 'new pages appear together when ready' : 'pages appear as they’re ready'}
        </span>
      </div>
    </div>
  );
}

/**
 * A single shimmering line for small waits — a busy button, a short fetch. No
 * bar, because there is nothing to count.
 *
 * Takes no colour: the sweep is built from `currentColor`, so it inherits the
 * text it replaces. See `.shimmer-text` in index.css for why that works.
 */
export function ShimmerText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`shimmer-text ${className}`}>{children}</span>;
}

/**
 * Rotating work lines with no bar — for the moment between "Generate" and the
 * studio opening, when there is no issue document to read counts from yet.
 */
export function WorkingLine({ phase = 'planning', className = '' }: { phase?: BuildPhase; className?: string }) {
  const { line, tick } = useRotatingLine(phase);
  return (
    <span key={tick} aria-hidden="true" className={`build-line-in ${className}`}>
      {line}
    </span>
  );
}
