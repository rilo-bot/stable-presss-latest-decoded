// ---------------------------------------------------------------------------
// Runs — the character-level structure inside a paragraph.
//
// A run is plain text plus sparse character overrides. Every text edit is
// ultimately a splice across this array, and getting the splice wrong is where
// text bugs live: applying bold to part of a run has to split it into three, and
// undoing has to put the three back as one.
//
// Offsets everywhere are into the paragraph's CONCATENATED text, never into a
// particular run. That is what lets `text.insert` name a position without
// knowing the run structure, which may have changed since the caller looked.
// ---------------------------------------------------------------------------

import type { CharacterProps, TextRun } from '@rilo/mb-schema';

/**
 * Every character property, as a value.
 *
 * Typed as a total Record so adding a property to `CharacterProps` is a compile
 * error here rather than a silently incomplete comparison — which would make two
 * differently formatted runs merge into one and lose formatting.
 */
const CHARACTER_KEY_MAP: Record<keyof CharacterProps, true> = {
  fontFamily: true,
  fontWeight: true,
  italic: true,
  underline: true,
  fontSize: true,
  letterSpacing: true,
  color: true,
  textTransform: true,
};

/** `Object.keys` widens to string[]; the Record above is what keeps this honest. */
const CHARACTER_KEYS = Object.keys(CHARACTER_KEY_MAP) as Array<keyof CharacterProps>;

export function runsLength(runs: readonly TextRun[]): number {
  let total = 0;
  for (const run of runs) total += run.text.length;
  return total;
}

export function runsText(runs: readonly TextRun[]): string {
  let text = '';
  for (const run of runs) text += run.text;
  return text;
}

export function sameOverrides(
  a: Partial<CharacterProps>,
  b: Partial<CharacterProps>,
): boolean {
  for (const key of CHARACTER_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * The runs covering `[from, to)`, split at the boundaries.
 *
 * Out-of-range bounds clamp rather than throw: the caller has already validated
 * the offsets it was given, and this is also used internally with derived bounds.
 */
export function sliceRuns(runs: readonly TextRun[], from: number, to: number): TextRun[] {
  const out: TextRun[] = [];
  let cursor = 0;

  for (const run of runs) {
    const start = cursor;
    const end = start + run.text.length;
    cursor = end;

    const takeFrom = Math.max(from, start);
    const takeTo = Math.min(to, end);
    if (takeTo <= takeFrom) continue;

    out.push({
      text: run.text.slice(takeFrom - start, takeTo - start),
      overrides: { ...run.overrides },
    });
  }

  return out;
}

/**
 * Drops empty runs and merges adjacent runs whose formatting matches.
 *
 * Without this, every edit leaves the array a little more fragmented than it
 * found it, and after a few hundred keystrokes a paragraph is a run per
 * character. An empty array is a legal result — an empty paragraph is real, and
 * a caret can sit in one.
 */
export function normaliseRuns(runs: readonly TextRun[]): TextRun[] {
  const out: TextRun[] = [];

  for (const run of runs) {
    if (run.text.length === 0) continue;
    const previous = out[out.length - 1];
    if (previous !== undefined && sameOverrides(previous.overrides, run.overrides)) {
      previous.text += run.text;
      continue;
    }
    out.push({ text: run.text, overrides: { ...run.overrides } });
  }

  return out;
}

/** Replaces `[offset, offset + length)` with `insert`. */
export function spliceRuns(
  runs: readonly TextRun[],
  offset: number,
  length: number,
  insert: readonly TextRun[],
): TextRun[] {
  const total = runsLength(runs);
  return normaliseRuns([
    ...sliceRuns(runs, 0, offset),
    ...insert,
    ...sliceRuns(runs, offset + length, total),
  ]);
}

/**
 * The formatting text typed at `offset` inherits. D-19.
 *
 * The run to the LEFT, so continuing a bold word stays bold. At offset 0 there
 * is nothing to the left, so the first run wins — typing in front of a heading
 * should not produce body text.
 */
export function overridesAt(
  runs: readonly TextRun[],
  offset: number,
): Partial<CharacterProps> {
  if (runs.length === 0) return {};

  if (offset <= 0) {
    const first = runs[0];
    return first === undefined ? {} : { ...first.overrides };
  }

  let cursor = 0;
  for (const run of runs) {
    const end = cursor + run.text.length;
    if (offset <= end) return { ...run.overrides };
    cursor = end;
  }

  const last = runs[runs.length - 1];
  return last === undefined ? {} : { ...last.overrides };
}
