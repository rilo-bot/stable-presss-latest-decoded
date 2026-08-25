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

/** Extract the FIRST complete, brace-balanced JSON object from model text
 *  (tolerates prose or ``` fences around it, and stray braces AFTER it).
 *  String-aware, so braces inside string literals don't miscount.
 *  Returns null if none parses. */
export function parseJsonObject(text: string): unknown | null {
  if (!text) return null;
  // Try each '{' as a candidate start: scan its brace-balanced (string-aware)
  // group and parse it; if that group isn't valid JSON (e.g. a prose "{note}"
  // before the real object), advance to the next '{' and try again.
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
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        const group = text.slice(start, i + 1);
        try {
          return JSON.parse(group);
        } catch {
          // The REPAIR IS TRIED HERE, per candidate, and not once over the whole
          // text — because the outermost group must keep winning. A single
          // unquoted key in the real object used to drop this scan through to the
          // first `"box": {…}` inside it, which parses perfectly and is the wrong
          // object: the caller got `{x,y,w,h}` where it expected a whole reading,
          // and reported "I could not make out a layout" on an image the model had
          // read correctly.
          try {
            return JSON.parse(repairUnquotedKeys(group));
          } catch {
            break; // this candidate group isn't valid JSON — try the next '{'
          }
        }
      }
    }
  }
  return null;
}
