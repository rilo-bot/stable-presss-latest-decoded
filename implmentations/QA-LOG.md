# QA Log

Defects found in **code that has already been written**, by review and by execution.

This is deliberately not `BLOCKERS.md`. That file carries open *decisions* and cross-lane
*blockers* — questions nobody has answered yet. This one carries *findings*: something is
built, it is wrong or incomplete, and here is the proof. A finding never blocks a lane from
continuing; it is work to schedule.

## How to use it

- **IDs are stable.** `QA-01` is `QA-01` forever. Never renumber, never reuse.
- **Every finding carries proof** — the command that shows it, and its real output. A finding
  that cannot be demonstrated is an opinion and does not belong here.
- **Append findings; edit only status.** Change `[OPEN]` to `[FIXED]` or `[WONTFIX]` and add a
  one-line `**Closed:**` note saying what was done and where. Do not delete entries.
- A `[FIXED]` finding stays `[FIXED]` until a later review pass re-runs its proof. Only then
  does it become `[VERIFIED]`.

## Severity

| | Meaning |
|---|---|
| **High** | Corrupts a document, crashes, or silently edits the wrong thing. Fix before the next package builds on it. |
| **Medium** | A real gap with a known failure mode. Cheap now, expensive after dependent code lands. |
| **Low** | Quality, noise, or a rule that reads stronger than it enforces. |

---

## Review passes

| Pass | Date | Scope | Gates | Raised |
|---|---|---|---|---|
| 1 | 2026-08-30 | `packages/mb-schema` (Lane 0, deliverable 1) | `typecheck:packages` ✅ · `vitest run` ✅ 35/35 · `lint --max-warnings=0` ✅ | QA-01 … QA-16 |

**Pass 1 method.** Read all twelve source files; ran the three gates; then ran an adversarial
probe constructing malformed documents and asserting on `validateMagazine()` output, plus a
lint probe on a deliberately non-conforming file inside `mb-schema`. Probe files were removed;
the working tree was left as found.

**Pass 1 note.** The three gates passing is real and worth stating: no `any`, no `!`, no
`@ts-` comments, explicit return types throughout, and the lint config proves it rather than
asserting it. Every finding below is a gap in coverage, not sloppiness in what was covered.

---

## Open findings

### [OPEN] QA-01 — Only *item* ids are checked for uniqueness; four other id kinds address commands
**Severity:** High · **Raised:** pass 1 · **Where:** `packages/mb-schema/src/validation.ts` — `checkUniqueItemIds`

Invariant 7 covers items. The foundation command set (FOUNDATION v0.3 §6.7) addresses by four
different id kinds, and only one of them is guarded:

| Payload | Unique? | Consequence of a duplicate |
|---|---|---|
| `item.*  { itemId }` | yes | — |
| `item.create { pageId, … }` | **no** | Item lands on the wrong page; DOC-06 navigation goes to the wrong page |
| `text.insert { paragraphId, offset, text }` | **no** | **Typing silently edits the wrong paragraph** |
| `text.delete { paragraphId, offset, length }` | **no** | Deletes from the wrong paragraph |

Nothing checks that a `Record` key agrees with the `.id` inside it either, so
`stories['s1'] = { id: 's2', … }` validates clean while the two are used interchangeably.

**Proof**
```
duplicate Paragraph.id in one story  ->  [no errors]
duplicate Page.id and Spread.id      ->  [no errors]
```

**Why it matters:** `text.insert` / `text.delete` are the entire text write path under
Amendment 2 §5.2. A duplicate paragraph id is silent corruption with no error anywhere.

**Suggested fix:** extend invariant 7 to every addressable id — item, page, spread, paragraph
— and add a record-key-matches-`.id` check for `stories`, `looks`, `assets`, `backgrounds`.

---

### [OPEN] QA-02 — `Page.backgroundId` is never checked to resolve
**Severity:** High · **Raised:** pass 1 · **Where:** `packages/mb-schema/src/validation.ts` — `checkReferences`

Invariants 1, 5 and 6 cover `storyId`, `lookId` and `assetId`. `backgroundId` is the fourth
reference type in the model and was missed.

**Proof**
```
dangling Page.backgroundId  ->  [no errors]
```

**Why it matters:** more than a normal missing check. Under `noUncheckedIndexedAccess`,
`magazine.backgrounds[id]` is `RepeatingBackground | undefined`, and RULES §1.1 requires the
renderer to throw rather than fall back — so a dangling `backgroundId` becomes an uncaught
`InvariantError` in the render path with **no validation error naming the cause**. That is
precisely the failure `validateStructure` exists to prevent.

**Suggested fix:** add `background-missing` to `ValidationCode` and check it in
`checkReferences`, alongside the other three.

---

### [OPEN] QA-09 — The unit formatters are a lossy round trip, and nothing stops a panel using them as one
**Severity:** High (product) · **Raised:** pass 1 · **Where:** `packages/mb-schema/src/units.ts` — `formatPt`, `formatMm`

`formatPt` rounds to whole points; `formatMm` to one decimal.

**Proof**
```
formatPt: 11.5pt -> 23.9583px -> shown "12"   -> 25.0000px
formatMm: 88.9px -> shown "15.1"              -> 89.1732px  (drift 0.2732px)
```

The module header says these are for rendering "a number for a person to read" — but a
controlled React input both renders *and* reads, so the ordinary way a lane wires an
inspector **is** the round trip. Consequences:

- **Half-point text sizes are unrepresentable.** 10.5pt is a common body size. TXT-04's
  acceptance criterion is *"all three methods work and produce identical results for the same
  value"* — type 11.5, see 12.
- **Position and size drift ~0.27px per inspect-and-commit cycle** — invisible once, visible
  after a user nudges the same box repeatedly.

**Why it matters:** this is a shared Lane 0 surface that five lanes will build panels on. It
is also where BLOCKERS D-08 (the user-facing unit) was silently decided in code — mm for
geometry, pt for type — ahead of the requirements amendment D-08 asks for.

**Suggested fix:** ship `parseMm` / `parsePt` so the write path is named and distinct, state
in the header that formatted output is never a write source, and reconsider whole-number
points.

---

### [OPEN] QA-16 — Spreads have no order key, so page reordering cannot be mergeable
**Severity:** Medium · **Raised:** pass 1 · **Where:** `packages/mb-schema/src/magazine.ts` — `Magazine.spreads`

Amendment 2 §5.1 requires entity-relative ordering for *"item z-order, page order, and
paragraph order"*. `ItemBase.order` and `Paragraph.order` shipped; `Spread` has none, and
FOUNDATION v0.3 invariant 10 quietly narrowed the list to `Page.items`, `Group.children`,
`RepeatingBackground.items`, `Story.paragraphs`. There is also no `page.reorder` in the
foundation command set.

**Why it matters:** DOC-05 (reorder pages) is a MUST. As things stand it lands as an array
splice — the thing §5.1 forbids — and it will be Lane 4 writing it against a Lane 0 schema
that cannot express the alternative.

**Relationship to BLOCKERS D-01:** D-01 asked for order keys *or* dropping the mergeability
claim. The code took the first option for items and paragraphs. D-01 should not be closed
until page order is settled the same way, or §5.1 is amended to exclude it.

---

### [OPEN] QA-03 — No invariant requires a magazine to have at least one page
**Severity:** Medium · **Raised:** pass 1 · **Where:** `packages/mb-schema/src/validation.ts` — `checkSpreads`

**Proof**
```
magazine with zero spreads / zero pages  ->  [no errors]
```

With `spreads.length === 0`, `lastIndex` is `-1`, both lookups are `undefined`, and the
interior loop never runs — so an empty magazine validates clean. DOC-04 (delete pages) needs
a floor to refuse against; the existing system has exactly this guard ("a magazine must have
at least one page").

---

### [OPEN] QA-04 — `columns.count === 0` validates clean
**Severity:** Medium · **Raised:** pass 1 · **Where:** `magazine.ts` (`Page.columns`), `items.ts` (`TextBox.columns`)

**Proof**
```
columns.count === 0 (page and box)  ->  [no errors]
```

A divide-by-zero in the thread-layout engine that Lane 0 writes next (FOUNDATION v0.3 §9).
Negative `gutter` is equally unguarded.

---

### [OPEN] QA-05 — Documented numeric ranges are unenforced
**Severity:** Medium · **Raised:** pass 1 · **Where:** `items.ts` — `opacity`, `rotation`, `minFontScale`

**Proof**
```
opacity 5, rotation 99999, minFontScale -3  ->  [no errors]
```

`opacity` is documented `0..1`; `minFontScale` is a floor and must be positive. This matters
more than it normally would because FWD-02 means the AI emits these values, and a model is
exactly the caller that will hand you `opacity: 100`.

---

### [OPEN] QA-06 — `Group.frame` has no defined relationship to its children
**Severity:** Medium · **Raised:** pass 1 · **Where:** `packages/mb-schema/src/items.ts` — `Group`

**Proof**
```
group frame 1x1 containing a 500x500 child  ->  [no errors]
```

FOUNDATION v0.3 does not say whether a group's frame is *derived* (a computed bounding box,
in which case it should not be stored) or *authoritative* (children positioned relative to
it, in which case `Rect` means something different inside a group). Today it is stored and
means nothing, and `item.resize` on a group has no defined behaviour.

**Why it matters:** `item.resize` is Lane 0; ARR-13 (group) is Lane 1. This is the seam, and
it needs deciding before `mb-commands`, not after.

---

### [OPEN] QA-07 — A thread chain may cross a group boundary
**Severity:** Medium · **Raised:** pass 1 · **Where:** `validation.ts` — `checkThreads`

**Proof**
```
thread chain crossing into a group  ->  [no errors]
```

`item.delete` is specified as "must repair thread links". That is substantially harder when
the deleted item is a group containing half a chain — and it compounds BLOCKERS D-17, which
already has no expressible inverse for deleting a mid-chain box.

**Suggested fix:** forbid it by invariant, or specify the repair. Either is fine; silence is
not.

---

### [OPEN] QA-08 — `thread-cycle` is unreachable as a primary signal
**Severity:** Medium · **Raised:** pass 1 · **Where:** `validation.ts` — `checkThreads`

**Proof**
```
symmetric 2-cycle  ->  [thread-headless, thread-headless]
```

Cycle detection walks forward from chain heads, so a *symmetric* cycle — the only kind that
can exist without also breaking invariant 2 — has no head and reports as `thread-headless`.
`thread-cycle` can therefore only fire alongside `thread-asymmetric`.

**Why it matters:** `ValidationCode` is documented as "a contract tests assert on". Invariant
3's "chains are acyclic" currently has no test exercising the code path named after it — the
existing test acknowledges this in a comment and asserts `thread-headless` instead.

**Suggested fix:** detect cycles independently of head-walking, or drop the code and let
`thread-headless` own the case.

---

### [OPEN] QA-10 — The mb-schema "imports nothing" rule does not enforce that
**Severity:** Low · **Raised:** pass 1 · **Where:** `eslint.config.mjs` — the `packages/mb-schema/**` block

**Proof** — a file inside `packages/mb-schema/src` importing `node:fs` lints clean. Only the
relative import was flagged:
```
2:1  error  '../../../apps/server/src/lib/magazineV2/model.js' import is restricted…
✖ 1 problem
```

The rule is a denylist — `['@rilo/*', '../../*', 'immer', 'react', 'yjs']` — so `nanoid`,
`lodash`, any npm package and every `node:` builtin pass. The message says *"mb-schema
imports nothing."*

**Why it matters:** a rule that reads stronger than it enforces is the specific failure RULES
§10 is about. The zero-dependency contract is load-bearing — every package depends on this one.

**Suggested fix:** invert to an allowlist — restrict everything, permit only `./*`.

---

### [OPEN] QA-11 — A per-package `no-restricted-imports` replaces the global one
**Severity:** Low · **Raised:** pass 1 · **Where:** `eslint.config.mjs`

In ESLint flat config a rule entry is **replaced**, not merged. So for `packages/mb-schema/**`
the lane-boundary ban and the editor-v2 / magazineV2 ban from the `NEW_CODE` block are gone.
The probe above still caught a magazineV2 import — but by luck, via mb-schema's own `../../*`
pattern, not via the ban that exists for it.

**Why it matters:** the same per-package override added for `mb-commands` would silently drop
both guards, and nothing would report it.

**Suggested fix:** repeat the shared patterns in each per-package block, or express the
package-specific rule under a differently-named restriction so the two compose.

---

### [OPEN] QA-12 — One duplicate order key produces two errors
**Severity:** Low · **Raised:** pass 1 · **Where:** `validation.ts` — `checkOrderKeys`

**Proof**
```
single duplicate order key -> 2 errors  ->  [duplicate-order-key, collection-unsorted]
```

An equal key trips both the uniqueness check and the `member.order <= previous` sort check.
Error counts are therefore unreliable for any UI reporting "N problems", and for any test
asserting a length.

---

### [OPEN] QA-13 — `validateMagazine` walks the document twice
**Severity:** Low · **Raised:** pass 1 · **Where:** `validation.ts:454`

`walkItems()` is called directly and again inside `validateStructure()`. Correct, wasteful.
It runs on every command in dev.

---

### [OPEN] QA-14 — Dead fallback
**Severity:** Low · **Raised:** pass 1 · **Where:** `validation.ts:249`

`paths.get(id) ?? \`item(${id})\`` — every caller passes an id that is in the map, so the
fallback is unreachable. RULES §1.1 discourages exactly this shape, and an unreachable one
gives no signal if the assumption ever changes.

---

### [OPEN] QA-15 — Spec and code disagree on the number of invariants
**Severity:** Low · **Raised:** pass 1 · **Where:** `validation.ts:2` vs FOUNDATION v0.3 §5.8

The module header says "the twelve rules"; v0.3 lists eleven. The twelfth — with facing pages
off, every spread holds one page — is an implementation addition. It is a good rule; it is
also drift on day one, and RULES treats the invariant list as a contract.

**Suggested fix:** add it to v0.3 §5.8 as invariant 12.

---

## Closed findings

*None yet.*

---

## Open decisions the shipped code has now answered

Recorded so `BLOCKERS.md` entries are not re-litigated. **None of these are closed here** —
closing a `D-` entry belongs to whoever owns it. This is evidence for that decision.

| Entry | Status after pass 1 |
|---|---|
| **D-01** — order keys have nowhere to live | **Answered for items and paragraphs.** `ItemBase.order` and `Paragraph.order` are `OrderKey`, and invariant 10 enforces uniqueness and sortedness. **Still open for page order** — see QA-16. |
| **D-02** — `'shrink'` has no fitted-size field | **Appears answered by design.** `magazine.ts` states derived values are never stored; the authored `fontSize` is the ceiling, `TextBox.minFontScale` the floor, and the fitted size is computed at render. Confirm this is the intent and close. |
| **D-11** — `item.setProps` is an escape hatch | **Answered exactly as suggested.** `ItemBaseProps = Pick<ItemBase, 'frame' \| 'rotation' \| 'opacity' \| 'locked'>` in `items.ts`, with the reasoning in a comment. |
| **D-12** — no invariant covers the back cover | **Answered.** `checkSpreads` enforces a single-page first *and* last spread, two-page interiors, and a single-page final interior when the count is odd. |
| **D-08** — the user-facing unit is named nowhere | **Decided in code, not in the requirements.** `units.ts` establishes millimetres for geometry and points for type. The requirements amendment D-08 asks for has not happened, and QA-09 is a direct consequence of the decision landing implementation-first. |

---

## Lane 0 gate status

Deliverable 1 (`packages/mb-schema`) is substantially complete and all three gates are green.
Outstanding from FOUNDATION v0.3 §14:

- Deliverable 9 — `pino` is installed in `apps/server/package.json` but not configured or exported.
- RULES-AMENDMENT-1 §E — `max-lines` has no path exemption for generated data files.
- Deliverables 2–8 and 10–12 not started.

**Recommendation.** QA-01, QA-02, QA-04 and QA-09 are all changes to files Lane 0 already
owns, and together are well under an hour. Closing them before `packages/mb-commands` starts
is far cheaper than closing them after twelve command handlers are written against the
current invariants — QA-01 in particular, because `text.insert` addressing a non-unique
`paragraphId` is the kind of defect that is invisible until a user's typing appears in the
wrong paragraph.
