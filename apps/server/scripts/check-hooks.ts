// ---------------------------------------------------------------------------
// Fail if a React hook is called AFTER an early return.
//
// This exists because of a real crash: a `useCan(...)` was added next to the
// publish gating it feeds — about forty lines below `if (s.loading) return …` in
// MagazineEditorV2. The first render (before `load()` flipped `loading`) ran the
// hook, the next render returned early and did not, and React threw
//
//   Uncaught Error: Rendered fewer hooks than expected.
//
// taking the whole magazine studio down. TypeScript cannot see this — a hook is
// an ordinary function call — and `vite build` does not care either, so both
// reported success while the studio was unopenable.
//
// The usual guard is eslint-plugin-react-hooks' `rules-of-hooks`. THIS REPO HAS NO
// ESLINT AT ALL: no config, no lint script, no plugin — the
// `// eslint-disable-next-line react-hooks/exhaustive-deps` comments scattered
// through the web app refer to a linter nobody installed. Rather than add a
// toolchain, this is one bespoke check in the style the repo already uses for
// permissions (check-permission-enforcement.ts, which likewise reads ../web/src).
//
// THE RULE IT CHECKS, and the reason it is narrow. Inside a top-level function,
// two things end the body for some render:
//
//   1. `  if (…) {` … `    return …` — a guard clause. Note the indentation: the
//      return is FOUR spaces in, not two. The first version of this script only
//      looked for two and therefore reported "✓ no hook is called after an early
//      return" on the very crash it was written for. It was fixed only because it
//      was tested against the real bug before being trusted.
//   2. `  return …` at two spaces — the component's own final return.
//
// A `use…(` call at two-space indentation after either one runs conditionally.
// Indentation is the discriminator on purpose: anything inside a nested callback
// sits deeper than two spaces, so a `return` inside an earlier `useEffect` cleanup
// cannot be mistaken for a guard clause.
//
// It deliberately does NOT try to catch hooks inside conditionals or loops — a real
// parser's job — so a pass here is not a promise that the Rules of Hooks hold, only
// that this specific crash cannot recur.
//
// Usage:  npx tsx scripts/check-hooks.ts        (exits 1 on a finding)
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const WEB_SRC = path.resolve(here, '../../web/src')

/** Every tracked .tsx under the web app. git ls-files so ignored paths stay out. */
function tsxFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '*.tsx', '--', WEB_SRC], { encoding: 'utf8', cwd: WEB_SRC })
  return out.split('\n').map((l) => l.trim()).filter(Boolean)
}

/** A hook CALL, not a definition: `useThing(` preceded by `=`, `(`, `{`, or space. */
const HOOK_CALL = /(?:^|[\s=([{,])use[A-Z][A-Za-z0-9_]*\s*\(/
/** `function Foo(` / `export function Foo(` / `export default function Foo(` at col 0. */
const FN_START = /^(?:export\s+)?(?:default\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/
/** The component's own final return: exactly two spaces of indent. */
const TOP_RETURN = /^ {2}return[\s(;]/
/** A guard clause opening at function-body level: `  if (…) {`. */
const GUARD_OPEN = /^ {2}(?:\} else )?if \(.*\)\s*\{\s*$/
/** …and the same thing on one line: `  if (…) return null;`. */
const GUARD_INLINE = /^ {2}(?:\} else )?if \(.*\)\s*return[\s(;]/
/** The return inside a guard clause — FOUR spaces, which is the whole point. */
const GUARD_RETURN = /^ {4}return[\s(;]/
/** The close of a function-body-level block. */
const BLOCK_CLOSE = /^ {2}\}/

interface Finding {
  file: string
  line: number
  fn: string
  returnLine: number
  text: string
}

const findings: Finding[] = []

for (const rel of tsxFiles()) {
  const abs = path.join(WEB_SRC, rel)
  let lines: string[]
  try {
    lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
  } catch {
    continue // deleted-but-tracked; nothing to check
  }

  let fn = ''
  let returnLine = 0 // 0 = no top-level return seen yet in this function

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (FN_START.test(line)) {
      // A new top-level function resets the state — its own returns and hooks are
      // unrelated to the previous one's.
      fn = line.replace(/^(?:export\s+)?(?:default\s+)?function\s+/, '').replace(/\s*\(.*$/, '')
      returnLine = 0
      continue
    }
    if (!fn) continue
    // Ignore comment lines: a hook named in prose is not a call. (This is why the
    // comment above writes `useCan(...)` and is still safe — but be explicit.)
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '')
    if (!code.trim()) continue

    // The component's own final return.
    if (returnLine === 0 && TOP_RETURN.test(code)) {
      returnLine = i + 1
      continue
    }
    // A one-line guard clause.
    if (returnLine === 0 && GUARD_INLINE.test(code)) {
      returnLine = i + 1
      continue
    }
    // A guard BLOCK: `  if (…) {` … does it return before its `  }`?
    if (returnLine === 0 && GUARD_OPEN.test(code)) {
      for (let j = i + 1; j < lines.length; j++) {
        const inner = lines[j]!
        if (BLOCK_CLOSE.test(inner)) break
        if (GUARD_RETURN.test(inner)) {
          returnLine = j + 1
          break
        }
      }
      continue
    }
    if (returnLine > 0 && /^ {2}\S/.test(code) && HOOK_CALL.test(code)) {
      findings.push({ file: rel, line: i + 1, fn, returnLine, text: code.trim().slice(0, 90) })
    }
  }
}

console.log(`Checked ${tsxFiles().length} .tsx files under apps/web/src`)
if (findings.length === 0) {
  console.log('✓ no hook is called after an early return')
  process.exit(0)
}

console.error(`\nHOOK AFTER AN EARLY RETURN — ${findings.length} finding${findings.length === 1 ? '' : 's'}:`)
for (const f of findings) {
  console.error(`  ✗ ${f.file}:${f.line}  in ${f.fn}()  (returns at line ${f.returnLine})`)
  console.error(`      ${f.text}`)
}
console.error(
  '\nMove the hook ABOVE every early return in that function. React counts hooks per\n' +
    'render: a render that takes the early path runs fewer of them and throws\n' +
    '"Rendered fewer hooks than expected", which unmounts the whole subtree.',
)
process.exit(1)
