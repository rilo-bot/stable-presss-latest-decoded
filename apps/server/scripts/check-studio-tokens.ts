// ---------------------------------------------------------------------------
// Fail if the magazine studio reintroduces an ad-hoc size, opacity or colour.
//
// The studio was migrated onto one vocabulary (index.css → :root, exposed through
// tailwind.config.js as `studio-*` and the `ui` / `ui-sm` / `ui-lg` type scale).
// Before that it had SEVEN font sizes of which all but four sites were ≤12px,
// FOURTEEN white-opacity steps for text alone, navy panels hardcoded as #0b1220 /
// #0d1626, and a sky-blue accent competing with gold. 716 replacements later none
// of that is left — and nothing stops the next edit putting `text-[11px]
// text-white/45` back, because Tailwind is perfectly happy with it.
//
// So this is the guard, in the same style as check-permission-enforcement.ts and
// check-hooks.ts: no new toolchain, one grep per banned pattern, a real exit code.
//
// It is scoped to apps/web/src/editor-v2 on purpose. The rest of the app has its
// own (light) surface vocabulary and its own drift, which docs/THEME-REVIEW.md
// tracks separately — widening this check would fail on 170 pre-existing sites and
// immediately get switched off.
//
// Usage:  npx tsx scripts/check-studio-tokens.ts
// ---------------------------------------------------------------------------

import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const STUDIO = path.resolve(here, '../../web/src/editor-v2')

interface Ban {
  /** Must be global — every occurrence is reported, not just the first. */
  re: RegExp
  what: string
  use: string
}

const BANS: Ban[] = [
  {
    re: /text-\[[0-9.]+px\]/g,
    what: 'an arbitrary font size',
    use: 'text-ui-sm (12px) · text-ui (13px) · text-ui-lg (15px)',
  },
  {
    re: /\btext-(?:xs|sm|base|lg|xl)\b/g,
    what: "Tailwind's default type scale",
    use: 'the ui scale — text-ui-sm · text-ui · text-ui-lg',
  },
  {
    re: /(?:text|bg|border|ring|divide|outline)-white(?:\/[0-9[])/g,
    what: 'a white opacity step',
    use: 'text-studio-ink{,-2,-3,-4} · bg-studio-raise{,-2} · border-studio-hair/edge',
  },
  {
    re: /#0b1220|#0d1626/gi,
    what: 'the old navy panel colour',
    use: 'bg-studio-bg · bg-studio-panel',
  },
  {
    re: /\b(?:text|bg|border|ring|accent|from|to|shadow)-(?:sky|blue|indigo|violet|purple)-[0-9]/g,
    what: 'a blue/violet accent',
    use: 'studio-gold for accents, studio-select for selection on a page',
  },
  {
    re: /#7c3aed|#9061f9/gi,
    what: 'the retired violet',
    use: 'var(--studio-select) · hsl(var(--brand-accent)) on light surfaces',
  },
]

/** Lines that are comments are documentation, not usage — this file's own prose
 *  names several banned tokens, and so do the migration notes in the studio. */
const isComment = (line: string) => /^\s*(?:\/\/|\*|\/\*)/.test(line)

interface Hit { file: string; line: number; text: string; ban: Ban }
const hits: Hit[] = []

const files = fs.readdirSync(STUDIO).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
for (const f of files) {
  const lines = fs.readFileSync(path.join(STUDIO, f), 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (isComment(line)) return
    for (const ban of BANS) {
      ban.re.lastIndex = 0
      if (ban.re.test(line)) hits.push({ file: f, line: i + 1, text: line.trim().slice(0, 100), ban })
    }
  })
}

console.log(`Checked ${files.length} files in apps/web/src/editor-v2`)
if (hits.length === 0) {
  console.log('✓ the studio uses only its token vocabulary')
  process.exit(0)
}

console.error(`\nAD-HOC STYLING IN THE STUDIO — ${hits.length} finding${hits.length === 1 ? '' : 's'}:`)
for (const h of hits) {
  console.error(`  ✗ ${h.file}:${h.line} — ${h.ban.what}`)
  console.error(`      ${h.text}`)
  console.error(`      use: ${h.ban.use}`)
}
console.error('\nSee the MAGAZINE STUDIO CHROME block in apps/web/src/index.css.')
process.exit(1)
