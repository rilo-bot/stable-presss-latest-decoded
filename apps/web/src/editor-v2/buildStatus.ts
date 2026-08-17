// ---------------------------------------------------------------------------
// Magazine Builder v2 — what to SAY while the magazine is being built.
//
// Pure functions + copy. No React, no fetching, so the rules below can be read
// (and reasoned about) without opening a component.
//
// THE ONE RULE: never claim progress the server did not report.
//
// The build emits exactly four real signals, polled every ~1.5s:
//   status ('processing' | 'ready' | 'failed') · stage (a short backend string)
//   pagesProcessed / pagesTotal · and the pages themselves, which stream in.
//
// Everything factual on screen — the counter, the bar, the page tiles — comes
// from those. The rotating lines are FLAVOUR, and each pool is written to be
// true of the phase it belongs to: the planning lines describe what `planIssue`
// actually decides (title, palette, fonts, running order), the composing lines
// what `composeOnePage` actually does (boxes, columns, photos, captions), the
// digitizing lines what the import worker actually does (read, lift text, find
// images). None of them names a page number or a percentage, because those are
// facts and facts come from the server.
//
// WHY THERE IS AN INDETERMINATE MODE. Pages are composed CONCURRENTLY
// (`mapWithConcurrency`), so `pagesProcessed` is a count of finished pages, not
// a cursor — "building page 3" would be a guess, "3 of 10 done" is a fact. Two
// windows have no trustworthy count: planning (nothing is countable yet), and
// the brief gap after an add-pages request before the worker resets the
// counters (they still hold the PREVIOUS run's values, i.e. done >= total). A
// bar that crept forward through those would be decoration pretending to be
// data, so they get a shimmer with no number instead. Once the add-pages run
// sets its own counts (it bumps pagesProcessed per composed page now), the
// counter is real and shown — the pages themselves still land together at the
// end, which is why the banner's trailing copy says so.
// ---------------------------------------------------------------------------

export type BuildPhase = 'planning' | 'composing' | 'digitizing' | 'finishing';

export interface BuildStatus {
  phase: BuildPhase;
  /** The factual headline. Always safe to show; never a guess. */
  headline: string;
  /** Real counts, or null when this phase has no countable progress. */
  count: { done: number; total: number } | null;
  /** 0–1 for the bar; null when the phase is indeterminate. */
  fraction: number | null;
}

interface IssueLike {
  status?: string;
  stage?: string;
  pagesProcessed?: number;
  pagesTotal?: number;
}

/**
 * Which phase, from the stage string the server wrote.
 *
 * Unknown and empty stages fall back to 'planning' — the indeterminate one. A new
 * backend stage should degrade to "we're working on it", never to a bar sitting
 * still at a number that means nothing.
 */
export function phaseOf(issue: IssueLike | null | undefined): BuildPhase {
  const stage = String(issue?.stage ?? '');
  if (stage === 'Digitizing pages') return 'digitizing';
  if (stage === 'Designing pages') return 'composing';
  if (stage === 'Preparing to digitize' || stage === 'Designing the issue') return 'planning';
  return 'planning';
}

/**
 * The whole factual picture, derived once and passed down.
 *
 * `isAdding` is the "add more pages" run. It is passed in rather than sniffed
 * because the client knows it (the store sets `adding`) and the document does
 * not. It only changes the WORDING while the counter is stale (the window
 * before the worker resets the counts, when they still show the previous run's
 * finished "8 of 8"); once the run's own counts land, the real counter shows.
 */
export function buildStatus(issue: IssueLike | null | undefined, isAdding = false): BuildStatus {
  const phase = phaseOf(issue);
  const total = Math.max(0, Math.floor(Number(issue?.pagesTotal) || 0));
  const doneRaw = Math.max(0, Math.floor(Number(issue?.pagesProcessed) || 0));
  const done = total ? Math.min(doneRaw, total) : doneRaw;

  // Countable only when the phase composes pages AND the counter has somewhere
  // left to go. `done >= total` while still processing means the counter is stale
  // (the window between an add-pages request and the worker resetting the counts),
  // and a full bar is the one thing worse than no bar. Add-pages now DOES keep
  // the counter honest (pagesTotal/pagesProcessed are set at the start of the run
  // and bumped per page), so isAdding no longer forces indeterminate — it only
  // picks the fallback wording while the counter is stale.
  const countable = (phase === 'composing' || phase === 'digitizing') && total > 0 && done < total;

  // Counts go in the headline whenever they are trustworthy — that is the number
  // the user actually wants — and the phase name stands in when they are not.
  const headline = countable
    ? phase === 'digitizing'
      ? `${done} of ${total} pages read`
      : `${done} of ${total} pages built`
    : isAdding
      ? 'Adding your new pages'
      : phase === 'digitizing'
        ? 'Reading your document'
        : phase === 'composing'
          ? 'Building your pages'
          : phase === 'planning'
            ? 'Planning your issue'
            : 'Finishing up';

  return {
    phase,
    headline,
    count: countable ? { done, total } : null,
    fraction: countable ? done / total : null,
  };
}

/**
 * The rotating lines, per phase.
 *
 * Each is a real step of that phase, phrased in the present tense and kept under
 * ~40 characters so it can't wrap mid-flip. Deliberately no page numbers, no
 * percentages, no "almost done" — the headline owns the facts.
 */
const LINES: Record<BuildPhase, string[]> = {
  planning: [
    'Reading your brief',
    'Sketching a running order',
    'Choosing a cover story',
    'Picking a type pairing',
    'Mixing a colour palette',
    'Deciding what leads',
    'Naming the issue',
    'Writing a standfirst',
    'Grouping the themes',
    'Balancing long and short reads',
    'Sizing the feature well',
    'Leaving room for pictures',
  ],
  composing: [
    'Drawing the page grid',
    'Setting the headline',
    'Flowing the body copy',
    'Measuring the columns',
    'Placing your photographs',
    'Cropping to the frame',
    'Writing the captions',
    'Pulling a quote',
    'Hanging the kicker',
    'Aligning to the baseline',
    'Checking the margins',
    'Tightening the leading',
    'Applying the palette',
    'Adding the folio',
    'Squaring the gutters',
    'Letting the page breathe',
    'Reflowing an overset line',
    'Sitting text beside the photo',
  ],
  digitizing: [
    'Opening your file',
    'Counting the pages',
    'Reading the layout',
    'Lifting the text off the page',
    'Finding the images',
    'Keeping the type where it sat',
    'Measuring each block',
    'Rebuilding the text boxes',
    'Matching the fonts',
    'Sampling the colours',
    'Straightening a scan',
    'Preserving the page order',
  ],
  finishing: [
    'Setting the cover',
    'Numbering the pages',
    'Saving your draft',
    'Tidying the last details',
    'Opening the studio',
    'Almost there',
  ],
};

/** The pool for a phase. Never empty, so a caller can index it without guarding. */
export function linesFor(phase: BuildPhase): string[] {
  return LINES[phase] ?? LINES.planning;
}

/** 48 lines across four pools — kept honest by `linesFor`, counted here for the curious. */
export const TOTAL_LINES = Object.values(LINES).reduce((n, l) => n + l.length, 0);

/** "1:04" — elapsed, because knowing it is moving is most of the reassurance. */
export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
