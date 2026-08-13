// ---------------------------------------------------------------------------
// GUARD — the two Phase 0 promises of docs/MAGAZINE-V2-BUILDER-PLAN.md, checked as
// PROPERTIES over generated inputs rather than as fixtures.
//
// Why a search and not more unit tests: both bugs this guards against were shipped WITH
// passing tests. The fidelity score reported "Matched your reference closely" on four
// separately ruined covers, and `themeForPage` blanked a page white-on-white — in both
// cases the fixtures simply never hit the shape that broke. A fixture proves one point; a
// property proves the shape of the whole space, and it is the only kind of check that can
// fail on a case nobody thought of.
//
// Deterministic on purpose (a seeded generator): a guard that fails intermittently gets
// ignored, and a guard nobody trusts is worse than no guard.
// ---------------------------------------------------------------------------

import {
  measureFidelity, isGuaranteed, MATCHED_AT, TEXT_MATCH_MIN, TEXT_VETO_MIN_AREA,
} from '../src/lib/magazineV2/layoutFidelity.js'
import { themeForPage, contrastRatio } from '../src/lib/magazineV2/applyLayout.js'
import type { Origin } from '../src/lib/magazineV2/readingToSpec.js'
import type { SolvedLayout } from '../src/lib/magazineV2/solveLayout.js'
import type { LeafRole } from '../src/lib/magazineV2/layoutSpec.js'
import type { MagazineElement } from '../src/lib/magazineV2/model.js'

import { PAGE_W, PAGE_H } from '../src/lib/magazineV2/config.js'

const DIMS = { width: PAGE_W, height: PAGE_H }
const ROUNDS = 4000

/** A seeded LCG — same sequence every run, on every machine. */
let seed = 0x5eed1a70
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0x100000000
}
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo)

const solvedOf = (leaves: [string, string, [number, number, number, number]][]): SolvedLayout => ({
  background: { ref: 'bg' },
  margin: 0,
  page: DIMS,
  leaves: leaves.map(([ref, role, [x, y, w, h]], i) => ({
    node: { kind: 'leaf' as const, role: role as LeafRole, contentRef: ref },
    box: { x, y, w, h },
    z: i,
  })),
})

const failures: string[] = []
const fail = (what: string, detail: string) => {
  if (failures.length < 12) failures.push(`${what}\n      ${detail}`)
}

// ── PROPERTY 1 ───────────────────────────────────────────────────────────────
// No slot whose placement was GUARANTEED may produce a "matched" verdict when the
// page's biggest piece of type did not land. This is the cover bug's certificate:
// a full-bleed photo scores IoU 1.0 by construction, and it used to float the mean
// above MATCHED_AT (0.72) no matter where the words went.

const TEXT_ROLE_POOL = ['headline', 'subhead', 'kicker', 'body', 'pullquote']

for (let i = 0; i < ROUNDS; i++) {
  // A cover: full-bleed photo plus a cluster of type somewhere on the sheet.
  const lines = 1 + Math.floor(rnd() * 4)
  const origin: Origin = { hero: { x: 0, y: 0, w: 1, h: 1 } }
  const leaves: [string, string, [number, number, number, number]][] = [
    ['hero', 'image', [0, 0, DIMS.width, DIMS.height]],
  ]
  let biggestTextIou = -1
  let biggestTextArea = 0
  for (let n = 0; n < lines; n++) {
    const ref = `t${n}`
    const role = TEXT_ROLE_POOL[Math.floor(rnd() * TEXT_ROLE_POOL.length)]!
    // Read box: a wide band big enough for its IoU to count (see TEXT_VETO_MIN_AREA).
    const w = between(0.5, 0.92)
    const h = between(TEXT_VETO_MIN_AREA / w + 0.005, 0.2)
    const read = { x: between(0.02, 1 - w - 0.02), y: between(0.02, 0.4), w, h }
    origin[ref] = read
    // Got box: deliberately displaced, which is what the fr-stretch actually does.
    const gy = between(0, 1 - h)
    const gh = Math.min(1 - gy, h * between(1, 9))
    const got = { x: read.x, y: gy, w, h: gh }
    leaves.push([ref, role, [got.x * DIMS.width, got.y * DIMS.height, got.w * DIMS.width, got.h * DIMS.height]])
    const ix = Math.max(0, Math.min(read.x + read.w, got.x + got.w) - Math.max(read.x, got.x))
    const iy = Math.max(0, Math.min(read.y + read.h, got.y + got.h) - Math.max(read.y, got.y))
    const inter = ix * iy
    const iou = inter / (read.w * read.h + got.w * got.h - inter)
    const area = read.w * read.h
    if (area > biggestTextArea) { biggestTextArea = area; biggestTextIou = iou }
  }

  const f = measureFidelity(solvedOf(leaves), origin, DIMS, { aspect: DIMS.width / DIMS.height })
  if (biggestTextIou < TEXT_MATCH_MIN && f.verdict === 'matched') {
    fail(
      'A page whose biggest type did not land was reported as MATCHED',
      `round ${i}: biggest text IoU ${biggestTextIou.toFixed(3)}, score ${f.score.toFixed(3)} — "${f.summary}"`,
    )
  }
  if (f.verdict === 'matched' && f.score < MATCHED_AT) {
    fail('"matched" below the matched bar', `round ${i}: score ${f.score.toFixed(3)}`)
  }
}

// ── PROPERTY 2 ───────────────────────────────────────────────────────────────
// The guard must not fire the other way: a page built exactly where the reference
// had it must still read as matched. A score that cries mismatch over a correct
// page is just as useless as one that flatters a wrong one.

for (let i = 0; i < ROUNDS / 4; i++) {
  const bandH = between(0.3, 0.6)
  const origin: Origin = {
    hero: { x: 0, y: 0, w: 1, h: bandH },
    headline: { x: 0.06, y: bandH + 0.03, w: 0.88, h: between(0.06, 0.12) },
  }
  origin.body = { x: 0.06, y: origin.headline!.y + origin.headline!.h + 0.02, w: 0.88, h: 0.2 }
  const px = (b: { x: number; y: number; w: number; h: number }): [number, number, number, number] =>
    [b.x * DIMS.width, b.y * DIMS.height, b.w * DIMS.width, b.h * DIMS.height]
  const f = measureFidelity(
    solvedOf([['hero', 'image', px(origin.hero!)], ['headline', 'headline', px(origin.headline!)], ['body', 'body', px(origin.body!)]]),
    origin,
    DIMS,
    { aspect: DIMS.width / DIMS.height },
  )
  if (f.verdict !== 'matched') {
    fail('A page placed EXACTLY on the reference was not reported as matched', `round ${i}: ${f.verdict} at ${f.score.toFixed(3)} — "${f.summary}"`)
  }
}

// ── PROPERTY 3 ───────────────────────────────────────────────────────────────
// Only a backing layer that fills BOTH the reference and the page is guaranteed.
// Type is never excluded, and a photo that failed to come out full-bleed keeps its
// full weight — that is a real failure, not a free pass.

const FULL = { x: 0, y: 0, w: 1, h: 1 }
for (const role of ['headline', 'body', 'caption', 'qr', 'icon']) {
  if (isGuaranteed(role, FULL, FULL)) fail('A text/graphic role was treated as guaranteed', `role "${role}"`)
}
for (let i = 0; i < 500; i++) {
  const h = between(0.05, 0.84)
  if (isGuaranteed('image', { x: 0, y: 0, w: 1, h }, FULL)) {
    fail('An inset reference photo was treated as guaranteed', `read height ${h.toFixed(3)}`)
  }
  if (isGuaranteed('image', FULL, { x: 0, y: 0, w: 1, h })) {
    fail('A photo that did NOT come out full-bleed was treated as guaranteed', `got height ${h.toFixed(3)}`)
  }
}

// ── PROPERTY 4 ───────────────────────────────────────────────────────────────
// No derived palette may be invisible against its own ground. White type over a dark
// photograph is the commonest cover idiom, and it used to produce white-on-white:
// the page came out blank and the score called it a match.

const INVISIBLE_AT = 1.6
const el = (color: string, fontSize: number, role: string): MagazineElement => ({
  id: `e${Math.floor(rnd() * 1e9)}`, type: 'text', x: 0, y: 0, w: 400, h: 100,
  rotation: 0, zIndex: 1, locked: false, source: 'manual',
  text: {
    content: 'words', role, fontFamily: 'Inter, Arial, sans-serif', fontSize,
    fontWeight: 400, color, align: 'left', lineHeight: 1.4, autoFit: 'shrink',
  },
} as MagazineElement)

const hex = () => {
  // Biased towards the extremes, because that is where the collisions live.
  const c = () => {
    const r = rnd()
    const v = r < 0.35 ? Math.floor(between(240, 256)) : r < 0.7 ? Math.floor(between(0, 24)) : Math.floor(between(0, 256))
    return Math.min(255, v).toString(16).padStart(2, '0')
  }
  return `#${c()}${c()}${c()}`
}

for (let i = 0; i < ROUNDS; i++) {
  const ink = hex()
  const second = hex()
  // Every combination of ground the page can present: an image background (the PDF-import
  // shape, which is what fell through to white), a colour, or nothing at all.
  const groundKind = i % 3
  const background = groundKind === 0
    ? { type: 'image', value: 'https://x/photo.jpg' }
    : groundKind === 1
      ? { type: 'color', value: hex() }
      : undefined
  const genTheme = i % 7 === 0 ? { palette: { bg: hex(), text: hex(), accent: hex() } } : null
  const theme = themeForPage(genTheme, {
    background,
    elements: [el(ink, 80, 'headline'), el(ink, 20, 'body'), el(second, 14, 'subhead')],
  })
  const { bg } = theme.palette
  for (const role of ['text', 'primary', 'secondary', 'accent'] as const) {
    const c = theme.palette[role]
    if (contrastRatio(c, bg) <= INVISIBLE_AT) {
      fail(
        `A derived palette put an invisible \`${role}\` on its own ground`,
        `round ${i}: ${role} ${c} on bg ${bg} = ${contrastRatio(c, bg).toFixed(2)}:1 (ink ${ink}, ground ${background?.type ?? 'none'})`,
      )
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`Checked ${ROUNDS} generated covers, ${ROUNDS / 4} exact rebuilds, 1000 guarantee cases and ${ROUNDS} derived palettes`)
if (failures.length === 0) {
  console.log('✓ one perfect region cannot certify a wrong page, a right page still reads as matched,')
  console.log('✓ and no derived palette is invisible on its own ground')
  process.exit(0)
}

console.error(`\nFIDELITY / LEGIBILITY PROPERTY BROKEN — ${failures.length} case${failures.length === 1 ? '' : 's'}:`)
for (const f of failures) console.error(`  ✗ ${f}`)
console.error(
  '\nThese are the two Phase 0 promises in docs/MAGAZINE-V2-BUILDER-PLAN.md: the score may\n' +
    'not flatter a page the client can see is wrong, and a derived palette may not paint\n' +
    'words the same colour as the page under them. Both shipped once with green tests.',
)
process.exit(1)
