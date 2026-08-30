// ---------------------------------------------------------------------------
// Magazine Builder v2 — pull a JSON object out of model text.
//
// Lifted verbatim out of generate.ts (where it was private) so the layout-reading
// agent can use the SAME parser as the art-director. Copying it would have been
// two subtly different brace scanners a month from now, and the subtlety here is
// the entire point: the naive first-`{`/last-`}` slice it replaced spanned two
// objects or swallowed prose braces, and every failure silently fell back to a
// fixed seed layout — the "same layout every time" bug.
//
// Pure: no I/O, no LLM.
// ---------------------------------------------------------------------------

/**
 * Re-quote BARE IDENTIFIER KEYS in a JSON-ish string (`colorRef: "text"` →
 * `"colorRef": "text"`).
 *
 * Not general JSON5 tolerance, and deliberately not: this repairs the ONE
 * malformation models actually produce here, and leaves anything else to fail
 * loudly. Measured on the reference read, 3 of 4 vision responses came back with
 * exactly `colorRef` unquoted while every other key was correct — enough to make
 * "use this layout" fail most of the time on a real cover.
 *
 * STRING-AWARE, which is the whole difficulty: a `note` reading
 * "Summer 2026: the issue" must not be rewritten. So this walks the text with the
 * same inStr/esc discipline as the brace scanner below and only ever rewrites
 * outside string literals. A key is only repaired where JSON demands one — right
 * after `{` or `,` — so a bare word anywhere else is left alone to fail.
 */
export function repairUnquotedKeys(text: string): string {
  let out = '';
  let i = 0;
  let inStr = false;
  let esc = false;
  // Whether the next non-space token is in KEY position (just after `{` or `,`).
  let atKey = false;
  while (i < text.length) {
    const ch = text[i]!;
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') { inStr = true; atKey = false; out += ch; i++; continue; }
    if (ch === '{' || ch === ',') { atKey = true; out += ch; i++; continue; }
    if (ch === '[' || ch === ':') { atKey = false; out += ch; i++; continue; }
    if (/\s/.test(ch)) { out += ch; i++; continue; }
    if (atKey && /[A-Za-z_$]/.test(ch)) {
      // A bare word in key position. Only rewrite when a `:` really follows it,
      // so `[true, false]` and other bare values are untouched.
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$]/.test(text[j]!)) j++;
      let k = j;
      while (k < text.length && /\s/.test(text[k]!)) k++;
      if (text[k] === ':') {
        out += `"${text.slice(i, j)}"`;
        i = j;
        atKey = false;
        continue;
      }
    }
    atKey = false;
    out += ch;
    i++;
  }
  return out;
}

/**
 * Fix a MISMATCHED CLOSING BRACKET TYPE (`}` closing an array, or `]` closing an
 * object) — a different malformation than repairUnquotedKeys targets. A deeply
 * nested layout tree (rows/cols/stacks several levels deep, closed by a long tail
 * of `}]` characters) occasionally loses track near the end and closes an array
 * with `}` instead of `]`, or vice versa — confirmed on real art-director output:
 * a fully-formed, otherwise-valid page tree failed JSON.parse on exactly one
 * swapped closer near the end and was discarded for a fixed seed.
 *
 * String-aware, like repairUnquotedKeys: walks a bracket stack and, on every
 * closer, emits whatever type the open stack actually expects — the same
 * correction a human would make for a single typo'd bracket. A stray closer with
 * nothing open is dropped rather than guessed at. Already-valid JSON round-trips
 * unchanged, since every closer already matches what the stack expects.
 */
export function repairBracketMismatch(text: string): string {
  return rewriteBrackets(text, false);
}

/**
 * Fix an UNBALANCED tail: everything repairBracketMismatch does, plus closing
 * whatever is still open at the end of the text (an unterminated string included,
 * so a response cut off mid-value still yields the tree built so far).
 *
 * Used on its own only as a finishing step; the interesting repair is
 * repairMissingClosers below, which uses this after every edit it makes.
 */
export function repairBalance(text: string): string {
  return rewriteBrackets(text, true);
}

/** How many closers repairCloserCount may add or remove before giving up. A handful
 *  of bracket typos is a typo; a dozen is a different response than the one we asked
 *  for, and guessing at it is worse than falling back to the seed. Also the loop's
 *  termination guarantee — progress is required but not strictly monotonic. */
const MAX_CLOSER_EDITS = 8;

/**
 * Repair a MISCOUNTED CLOSING RUN in the middle of the text — the malformation that
 * was actually costing pages, and the one no amount of end-of-text balancing fixes.
 *
 * Measured, not imagined, on two real art-director responses, both
 * `finishReason: 'stop'` (complete responses, not truncations), and the miscount ran
 * in BOTH directions. One closed a finished sub-tree with `}}]}}}` where the nesting
 * needed `}}]}]}}` — a closer of the wrong type and, one level out, a closer simply
 * absent. The other wrote `}}]}}]}}` where `}}]}]}}` was due: one closer too MANY,
 * which shut the root's own children array early. Both present identically, as a `,`
 * at a point where JSON demands a property name. In both, the run of closers is the
 * only thing the model got wrong; the design above it was complete and good.
 *
 * Why it mattered so much: parseJsonObject needs a candidate's depth to return to
 * exactly 0 to form a group at all. With the count wrong the outermost object never
 * balanced, so the scan from the first `{` never formed a group — repairUnquotedKeys
 * and repairBracketMismatch never even RAN, since they are only tried on a group
 * that closed. The scan advanced to the next `{`, the value of `"page"`, a small
 * perfectly-balanced fragment — and returned THAT. normalizeLayoutSpec found no
 * `root`, returned null, and a page the model had designed correctly silently
 * became "unusable — using seed".
 *
 * ERROR-DIRECTED, because nothing else knows where the run went wrong: JSON.parse
 * reports the offset it choked on, we try each small edit that could plausibly fix
 * a miscount THERE, re-balance the tail, and ask again. An edit is kept only if the
 * parser then gets FURTHER (never backwards), which together with the hard cap above
 * is what makes this terminate. Only `}` and `]` are ever added or removed, and only
 * where the parser has already refused to continue — so the worst case is a valid
 * tree of a slightly different shape than the model intended, which beats the seed
 * page it was getting instead. normalizeLayoutSpec remains the trust boundary either
 * way.
 *
 * Returns the best candidate it reached; the caller still decides whether the result
 * parses into anything usable.
 */
export function repairCloserCount(text: string): string {
  let candidate = repairBalance(text);
  for (let round = 0; round < MAX_CLOSER_EDITS; round++) {
    const pos = parseFailureOffset(candidate);
    if (pos === null) return candidate; // it parses — done
    if (pos < 0) return candidate; // failure with no offset to act on (e.g. a truncated literal)
    let best: string | null = null;
    let reach = pos;
    for (const edit of closerEditsAt(candidate, pos)) {
      // Re-balance after each edit: changing where a container ends leaves the run
      // after it wrong too, and the next round must see a tail-closed string or it
      // fails at the end of input instead of at the next real defect.
      const attempt = repairBalance(edit.text);
      const at = parseFailureOffset(attempt);
      if (at === null) return attempt;
      // Put the new offset back on the pre-edit scale, so "further" compares like
      // with like across a character we added or removed.
      const got = at - edit.delta;
      // The FIRST edit that does not regress is taken; a later one displaces it only
      // by getting strictly further. Ties would otherwise be settled by whichever
      // happened to be last in the list, which is not a reason to prefer it.
      if (best === null ? got >= reach : got > reach) { reach = got; best = attempt; }
    }
    if (best === null) return candidate; // no edit helped — stop guessing
    candidate = best;
  }
  return candidate;
}

/**
 * The small edits that could fix a miscounted closing run at a failure reported at
 * `pos`, in the order they are worth trying. `delta` is the length change, so the
 * caller can compare progress across edits of different sizes.
 *
 * The offset is rarely where the fix belongs. A run that is one closer SHORT shows
 * up as a failure on the token AFTER the separator, not on the separator:
 * `…"node":{…}}]}]},{"weight"` parses happily up to the `,` — legal inside the
 * still-open wrapper object — and only chokes on the `{` that follows, because an
 * object wants a property name there. The missing `}` belongs BEFORE that comma,
 * where the wrapper was meant to end. A run that is one closer LONG presents
 * identically, and is fixed by dropping the closer immediately before the comma —
 * which is why both directions are offered here and the caller measures rather than
 * assumes.
 */
function closerEditsAt(text: string, pos: number): { text: string; delta: number }[] {
  const insert = (at: number) =>
    ['}', ']'].map((c) => ({ text: text.slice(0, at) + c + text.slice(at), delta: 1 }));

  let sep = pos - 1;
  while (sep >= 0 && /\s/.test(text[sep]!)) sep--;
  if (text[sep] !== ',') return insert(pos);

  let prev = sep - 1;
  while (prev >= 0 && /\s/.test(text[prev]!)) prev--;
  const drop =
    text[prev] === '}' || text[prev] === ']'
      ? [{ text: text.slice(0, prev) + text.slice(prev + 1), delta: -1 }]
      : [];
  return [...insert(sep), ...drop, ...insert(pos)];
}

/** The offset JSON.parse choked on: null if it parses, -1 if it failed without
 *  naming an offset (V8 omits one for "Unexpected end of JSON input"). */
function parseFailureOffset(text: string): number | null {
  try {
    JSON.parse(text);
    return null;
  } catch (err) {
    const m = /at position (\d+)/.exec(err instanceof Error ? err.message : '');
    return m ? Number(m[1]) : -1;
  }
}

/** The shared string-aware bracket walk behind both repairs above. Emits whatever
 *  closer type the open stack actually expects, drops a stray closer with nothing
 *  open, and — when `closeRemaining` — shuts any string and brackets left open at
 *  the end. Already-valid JSON round-trips unchanged either way, since every closer
 *  already matches and nothing is left on the stack. */
function rewriteBrackets(text: string, closeRemaining: boolean): string {
  const stack: ('{' | '[')[] = [];
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === '{' || ch === '[') { stack.push(ch); out += ch; continue; }
    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if (open === undefined) continue; // stray closer with nothing open — drop it
      out += open === '[' ? ']' : '}';
      continue;
    }
    out += ch;
  }
  if (closeRemaining) {
    if (inStr) out += '"';
    // Innermost first: the stack pops in exactly the order the closers must appear.
    while (stack.length > 0) out += stack.pop() === '[' ? ']' : '}';
  }
  return out;
}

/** Extract the FIRST complete, brace-balanced JSON object from model text
 *  (tolerates prose or ``` fences around it, and stray braces AFTER it).
 *  String-aware, so braces inside string literals don't miscount.
 *
 *  Depth counts `{`/`[` opens and `}`/`]` closes TOGETHER, not `{`/`}` alone: a
 *  response with a mismatched closer type (a `}` that should have been a `]`, see
 *  repairBracketMismatch) still has every open bracket closed by SOME bracket, so
 *  brace-only counting could run past the object's true end without ever
 *  returning to zero — which silently skipped repair entirely and matched a
 *  smaller, wrong inner object instead (confirmed on real art-director output).
 *  Unified depth finds the real boundary regardless of which closer type was
 *  used; repairBracketMismatch then fixes the type so JSON.parse accepts it.
 *  Returns null if none parses. */
export function parseJsonObject(text: string): unknown | null {
  if (!text) return null;
  // Try each '{' as a candidate start: scan its balanced (string-aware) group and
  // parse it; if that group isn't valid JSON (e.g. a prose "{note}" before the
  // real object), advance to the next '{' and try again.
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const group = balancedGroupAt(text, start);
    // The REPAIRS ARE TRIED HERE, per candidate, and not once over the whole text —
    // because the outermost group must keep winning. A single unquoted key in the
    // real object used to drop this scan through to the first `"box": {…}` inside
    // it, which parses perfectly and is the wrong object: the caller got
    // `{x,y,w,h}` where it expected a whole reading, and reported "I could not make
    // out a layout" on an image the model had read correctly.
    if (group !== null) {
      const parsed = parseWithRepairs(group);
      if (parsed !== FAILED) return parsed;
    }
    // The honest scan has now failed for this candidate — either it never balanced
    // (a closer missing, so no group was ever formed) or the group it did form is
    // beyond the type/key repairs. ONLY NOW do we allow the NUMBER of brackets to be
    // altered, and still from THIS start, so the outermost candidate keeps its
    // precedence over the small valid fragments nested inside it. Without this step
    // a miscounted closing run sent the whole response through to an inner fragment
    // — see repairCloserCount for the two measured cases.
    const rebalanced = parseWithRepairs(repairCloserCount(text.slice(start)));
    if (rebalanced !== FAILED) return rebalanced;
  }
  return null;
}

/** Sentinel: `null` is a legitimate JSON.parse result, so failure needs its own value. */
const FAILED = Symbol('parse-failed');

/** Parse a candidate as-is, then under each repair. Tried independently and
 *  combined, since either malformation can occur alone or together. */
function parseWithRepairs(candidate: string): unknown | typeof FAILED {
  const attempts = [
    candidate,
    repairUnquotedKeys(candidate),
    repairBracketMismatch(candidate),
    repairBracketMismatch(repairUnquotedKeys(candidate)),
  ];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try the next repair
    }
  }
  return FAILED;
}

/** The substring from `start` through the closer that returns depth to zero, or
 *  null if the text ends while something is still open. See the header note on why
 *  `{`/`[` and `}`/`]` are counted TOGETHER. */
function balancedGroupAt(text: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if ((ch === '}' || ch === ']') && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
