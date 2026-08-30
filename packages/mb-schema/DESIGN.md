# mb-schema — design note

**Lane 0, step 2.** Written before the code, per LANE-0 §4. Locked once building starts.

## What it is

The document model every other package imports, plus validation, unit conversion, and
factories for a valid blank magazine. Types only — no behaviour that mutates a magazine.
That lives in `mb-commands`.

## Consumers

`mb-commands` (handlers mutate these types), `mb-store` (holds one `Magazine`),
`mb-render` (reads one `Page`), all six feature lanes, and the server routes.

## Constraints

FOUNDATION v0.3 §5 fixes the shape. **`mb-schema` imports nothing** (§4), which decides
two things below. RULES Amendment §C's strict flags apply, so `noUncheckedIndexedAccess`
and `exactOptionalPropertyTypes` are on — every array index is `T | undefined` and no
optional property may be assigned `undefined` explicitly.

## Decisions

**Id generation is injected, not imported.** `Id` is documented as `nanoid(12)`, but
importing nanoid would break the zero-dependency rule, and §6.3 forbids environmental
globals in `mb-*`. `defaults.ts` takes `{ newId, now }`. The headless build test and the
undo property test both need reproducible ids anyway, so injection is what makes them
deep-comparable.

**`fractional-indexing` is not a dependency here.** Order keys are *generated* by command
handlers (§6.6), so the package belongs to `mb-commands`. `mb-schema` only declares
`OrderKey` and checks sorting. A blank magazine has no items, so nothing here needs to
generate a key.

**`Page.width/height` is authoritative; `pageSetup` is the default for new pages.**
ADR-002 says pages carry their own size so mixed sizes work. Two fields holding the same
fact is the pattern §13 warns against, so the relationship is stated in the type comment
and nothing reads `pageSetup` at render time.

**A blank magazine is one spread holding one page.** The smallest structure satisfying
invariants 9, 10 and 11 — a front cover, which is also the last spread, so both
single-page rules hold on the same object.

**New invariant 12: with `facingPages` false, every spread holds exactly one page.**
Invariants 9 and 11 are both conditioned on facing pages being on, so single-page mode had
no rule at all.

**Validation reports; it never repairs** (§5.7). Errors carry a stable `code` for tests to
assert on and a `path` naming the offending object — a message string alone is untestable
and drifts.

**Added during the build, not in the original note:** a blank magazine ships two saved
looks at **stable ids** — `look-heading` and `look-body`. TXT-13 names both ("Heading",
"Body text"), so shipping them is the requirement rather than an invention; but invariant 5
requires every paragraph's `lookId` to resolve, so the first text box any lane creates
needs a look that already exists. Generated ids would force a lookup by name, which breaks
the moment a user renames a look. The existing system uses the same trick for folio
furniture ids. This is a decision Lane 2 and Lane 4 inherit, so it is called out here and
in the handover rather than left in the code.

## Files

`primitives.ts` · `units.ts` · `text.ts` · `items.ts` · `assets.ts` · `magazine.ts` ·
`validation.ts` · `defaults.ts` · `index.ts`

Import order is strictly one-way: primitives ← text ← items ← magazine. No cycles.

## Tests

`units.test.ts` — round-trip conversions, the known A4 dimensions.
`defaults.test.ts` — a blank magazine validates clean under both checkers; two blanks with
the same injected factory are deep-equal.
`validation.test.ts` — one case per invariant, each asserting the specific `code`, plus a
valid fixture producing zero errors.

## Rejected

**Branded types for `Id` and `Color`.** Stronger, but every lane would need a cast at
every boundary — including from JSON off the wire, where the brand is a lie anyway.
Plain aliases with validation at the edge is the honest version.

**Validating colour format as an invariant.** Not in FOUNDATION's list of eleven, and
adding invariants Lane 0 invented is how a schema grows rules other lanes did not agree to.
