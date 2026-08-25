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
      else if ((ch === '}' || ch === ']') && --depth === 0) {
        const group = text.slice(start, i + 1);
        try {
          return JSON.parse(group);
        } catch {
          // The REPAIRS ARE TRIED HERE, per candidate, and not once over the whole
          // text — because the outermost group must keep winning. A single
          // unquoted key in the real object used to drop this scan through to the
          // first `"box": {…}` inside it, which parses perfectly and is the wrong
          // object: the caller got `{x,y,w,h}` where it expected a whole reading,
          // and reported "I could not make out a layout" on an image the model had
          // read correctly. Tried independently and combined, since either
          // malformation can occur alone or together.
          const attempts = [
            repairUnquotedKeys(group),
            repairBracketMismatch(group),
            repairBracketMismatch(repairUnquotedKeys(group)),
          ];
          for (const attempt of attempts) {
            try {
              return JSON.parse(attempt);
            } catch {
              // try the next repair
            }
          }
          break; // this candidate group isn't valid JSON — try the next '{'
        }
      }
    }
  }
  return null;
}
