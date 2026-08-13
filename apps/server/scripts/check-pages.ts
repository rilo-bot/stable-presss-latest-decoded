// ---------------------------------------------------------------------------
// GUARD — the Phase 1.5a promises of docs/MAGAZINE-V2-BUILDER-PLAN.md §4b, checked as
// PROPERTIES over generated pages rather than as fixtures.
//
// Furniture is appended AFTER layout QA has already passed, so it is the one thing on a
// page that nothing downstream will ever check. If it could overlap content, escape the
// sheet, or quietly count as substance and float a thin page over the density bar, the
// only place that would show up is the printed PDF — which is exactly how the wordless
// cover reached the client. A fixture proves one page; this proves the shape of the space.
//
// Deterministic on purpose (a seeded generator): a guard that fails intermittently gets
// ignored, and a guard nobody trusts is worse than no guard.
// ---------------------------------------------------------------------------

import { pageFurniture, freeBands, BAND_MIN, FURNITURE_IDS } from '../src/lib/magazineV2/pageFurniture.js'
import { densityOf, MIN_ELEMENTS } from '../src/lib/magazineV2/pageDensity.js'
import { normalizeElements } from '../src/lib/magazineV2/writePipeline.js'
import { PAGE_W, PAGE_H } from '../src/lib/magazineV2/config.js'
import { MAX_LEAVES } from '../src/lib/magazineV2/layoutSpec.js'
import { PAGE_TEMPLATE_KINDS, type PageTemplateKind } from '../src/lib/magazineV2/templates.js'
import type { MagazineElement } from '../src/lib/magazineV2/model.js'

const DIMS = { width: PAGE_W, height: PAGE_H }
const ROUNDS = 4000

/** A seeded LCG — same sequence every run, on every machine. */
let seed = 0x1e5f0110
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0x100000000
}
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!

const failures: string[] = []
const fail = (what: string, detail: string) => {
  if (failures.length < 12) failures.push(`${what}\n      ${detail}`)
}

const overlaps = (a: MagazineElement, b: MagazineElement) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const palette = { primary: '#1f3d2b', secondary: '#5c6b60', accent: '#d4a843', bg: '#faf7f0', text: '#141414' }
const fonts = { display: 'Playfair Display', body: 'Inter' }

/** A random page's worth of content — sometimes politely inset, sometimes bleeding
 *  off an edge, sometimes hugging exactly the band minimum. */
function randomPage(i: number): MagazineElement[] {
  const n = 1 + Math.floor(rnd() * 8)
  // Every margin the art-director can choose, plus the two boundary values that decide
  // whether a band is usable at all, plus full bleed.
  const margin = pick([0, 10, 20, BAND_MIN - 1, BAND_MIN, 36, 60, 96])
  const raw: unknown[] = []
  for (let k = 0; k < n; k++) {
    const bleed = i % 5 === 0 && k === 0 // a full-bleed hero on a fifth of the pages
    const x = bleed ? 0 : between(margin, PAGE_W - margin - 120)
    const y = bleed ? 0 : between(margin, PAGE_H - margin - 120)
    const w = bleed ? PAGE_W : between(60, PAGE_W - margin - x)
    const h = bleed ? PAGE_H : between(40, PAGE_H - margin - y)
    const kind = rnd()
    raw.push(
      kind < 0.6
        ? {
            type: 'text', x, y, w, h,
            text: { content: 'Real editorial copy here', role: 'body', fontFamily: fonts.body, fontSize: 18, fontWeight: 400, color: palette.text, align: 'left', lineHeight: 1.4, autoFit: 'clip' },
          }
        : kind < 0.85
          ? { type: 'image', x, y, w, h, image: { assetId: 'a', url: 'https://cdn.example.com/p.jpg', alt: '', fit: 'cover' } }
          : { type: 'shape', x, y, w, h, shape: { fill: '#cccccc' } },
    )
  }
  return normalizeElements(raw, DIMS)
}

const grounds = [
  { type: 'color' as const, value: palette.bg },
  { type: 'color' as const, value: 'linear-gradient(135deg, #34614a 0%, #1f3d2b 45%, #18301f 100%)' },
  { type: 'image' as const, value: 'https://cdn.example.com/scan.jpg' },
  { type: 'color' as const, value: 'rgb(250, 247, 240)' }, // a paint we don't parse
]

// ── PROPERTY 1 ───────────────────────────────────────────────────────────────
// Furniture may only ever occupy space that is provably empty, and may never leave
// the sheet. This is what makes it safe to append after QA has already passed.

for (let i = 0; i < ROUNDS; i++) {
  const elements = randomPage(i)
  const kind = pick(PAGE_TEMPLATE_KINDS)
  const background = pick(grounds)
  const furniture = pageFurniture({ background, elements }, {
    kind,
    sectionTitle: i % 3 === 0 ? '' : 'A Section Title That Could Be Rather Long Indeed',
    magazineTitle: 'Good Morning Horse',
    pageNumber: 1 + (i % 24),
    palette,
    fonts,
  })
  for (const f of furniture) {
    if (f.x < 0 || f.y < 0 || f.x + f.w > PAGE_W || f.y + f.h > PAGE_H) {
      fail('Furniture escaped the sheet', `round ${i}: ${f.id} at ${f.x},${f.y} ${f.w}×${f.h} on a ${PAGE_W}×${PAGE_H} page`)
    }
    for (const c of elements) {
      if (overlaps(f, c)) {
        const b = freeBands(elements)
        fail(
          'Furniture landed on top of page content',
          `round ${i}: ${f.id} (${f.x},${f.y} ${f.w}×${f.h}) over ${c.type} ${c.id} (${c.x},${c.y} ${c.w}×${c.h}); bands t${b.top} b${b.bottom} l${b.left} r${b.right}`,
        )
      }
    }
    if (!FURNITURE_IDS.includes(f.id)) {
      fail('Furniture shipped an unregistered id', `round ${i}: ${f.id} is not in FURNITURE_IDS, so nothing can re-stamp or strip it`)
    }
  }
}

// ── PROPERTY 2 ───────────────────────────────────────────────────────────────
// Chrome is not substance. Adding furniture must never change a page's density
// verdict — otherwise a running head and a folio would silently lower the bar by
// three on every page in the issue.

for (let i = 0; i < ROUNDS; i++) {
  const elements = randomPage(i)
  const kind = pick(PAGE_TEMPLATE_KINDS)
  const furniture = pageFurniture({ background: { type: 'color', value: palette.bg }, elements }, {
    kind, sectionTitle: 'Section', magazineTitle: 'Good Morning Horse', pageNumber: 1 + (i % 24), palette, fonts,
  })
  const before = densityOf(elements, kind)
  const after = densityOf([...elements, ...furniture], kind)
  if (after.meaningful !== before.meaningful || after.tooSparse !== before.tooSparse) {
    fail(
      'Furniture changed a page’s density verdict',
      `round ${i}: ${kind} went ${before.meaningful}/${before.min} (sparse ${before.tooSparse}) → ${after.meaningful}/${after.min} (sparse ${after.tooSparse}) with ${furniture.length} furniture element(s)`,
    )
  }
}

// ── PROPERTY 3 ───────────────────────────────────────────────────────────────
// Every density bar must be reachable inside the art-director's leaf budget. A bar
// above MAX_LEAVES is unsatisfiable, so every page of that kind would burn all its
// self-heal attempts and drop to the fixed template — the exact opposite of the
// intent. This is the check that will fire when Phase 1.5b raises the bars.

for (const kind of PAGE_TEMPLATE_KINDS as readonly PageTemplateKind[]) {
  const min = MIN_ELEMENTS[kind]
  if (min > MAX_LEAVES) {
    fail(
      'A density bar cannot be met within the leaf budget',
      `${kind} demands ${min} content elements but the art-director may emit at most ${MAX_LEAVES} leaves`,
    )
  }
  // Leaves are not all content: scrims, panels and spacers earn no credit, so a bar
  // that leaves no room for backing devices is a trap too.
  if (min > MAX_LEAVES - 2) {
    fail(
      'A density bar leaves no room for backing devices',
      `${kind} demands ${min} of ${MAX_LEAVES} leaves as content, leaving under 2 for scrims/panels/spacers`,
    )
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`Checked ${ROUNDS} furnished pages, ${ROUNDS} density verdicts and ${PAGE_TEMPLATE_KINDS.length} page-kind bars`)
if (failures.length === 0) {
  console.log('✓ furniture only ever occupies provably empty space and never leaves the sheet,')
  console.log('✓ chrome never counts as substance, and every density bar fits the leaf budget')
  process.exit(0)
}

console.error(`\nPAGE FURNITURE / DENSITY PROPERTY BROKEN — ${failures.length} case${failures.length === 1 ? '' : 's'}:`)
for (const f of failures) console.error(`  ✗ ${f}`)
process.exit(1)
