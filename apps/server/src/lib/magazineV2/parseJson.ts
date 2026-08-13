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
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          break; // this candidate group isn't valid JSON — try the next '{'
        }
      }
    }
  }
  return null;
}
