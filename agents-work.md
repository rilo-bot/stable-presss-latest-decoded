# Agents Work — Execution Plan

**Covers:** everything after Lane 0 is written, through to cutover
**Companions:** FOUNDATION v0.2 + Amendments 1 and 2, RULES + Amendment 1, Requirements v2.0, REPO-SURVEY

---

## 0. The shape of it

Five stages. Stages 1 and 2 are sequential and involve one agent. Stage 3 is where parallelism begins.

```
1. Lane 0 gate          verify the foundation      one agent
2. Vertical slice       prove the architecture     one agent
3. Parallel lanes       seven lanes at once        seven agents
4. Integration          the seams nobody owns      two or three agents
5. Acceptance           global checks, real users  one agent + humans
   → cutover → delete the old editor
```

**Do not skip to stage 3.** Every hour spent verifying the foundation saves several hours of reconciling seven divergent interpretations of a flaw in it.

---

## 1. Lane 0 gate

A checklist, not a formality. These are the failures that would silently poison seven lanes.

### 1.1 Build and test

- [ ] `npm run lint` passes with `--max-warnings=0`
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] All three scripts exist at the repository root (they did not before)
- [ ] ESLint is installed and its rules are scoped per RULES Amendment §A

### 1.2 The command layer

- [ ] The headless build test passes — a small magazine assembled with `dispatch()` alone, no UI, no browser
- [ ] All eight foundation commands have working inverses
- [ ] 50 random commands followed by 50 undos returns a document deeply equal to the start
- [ ] Coalescing works: a simulated drag produces one undo step, not dozens
- [ ] A command that fails validation leaves `store.current` **completely untouched** (Amendment 2 §3)

### 1.3 Mergeable commands — Amendment 2 §5

- [ ] No command takes an array index. `item.reorder` uses `{ afterId, beforeId }`
- [ ] Text commands are offsets into an identified paragraph. No `replaceContent`
- [ ] Applying the test to each of the eight: *could two people issue this at once and get a sensible result?*

Cheap to fix now with eight commands. Expensive with sixty.

### 1.4 Environment isolation

- [ ] `packages/mb-*` contain no `import.meta.env`, no `process.env`, no `window`
- [ ] They import and run under plain Node
- [ ] `configureDispatch()` is the only way validation is switched on

### 1.5 Contracts other lanes depend on

- [ ] Every type in FOUNDATION §5 exists, split across the files listed
- [ ] `validateMagazine()` reports errors rather than silently repairing
- [ ] The five toolbar slots and three panel slots exist and accept registration
- [ ] `SelectionState` including `hoveredId` is readable as data (FWD-07)
- [ ] Every route in §9.3 exists and is typed, stubbed where a lane owns it
- [ ] `pino` is configured and exported
- [ ] Unit conversion helpers exist (Amendment 1 §6)

**If a lane has to invent a shared type because Lane 0 did not create it, two lanes will invent it differently.** That is the single most expensive failure mode in this plan.

### 1.6 Namespacing

- [ ] Nothing collides with the existing `magazineV2` surface
- [ ] `MAGAZINE_BUILDER=true` gates every new route; with it off, all 404
- [ ] The old editor still works, untouched

---

## 2. Vertical slice

One agent. A thin path through every layer, proving the architecture before seven agents build on it.

**Scope:**

- Render one page from a magazine document
- Select an item; hover feedback on items and handles
- Move and resize by drag, and by keyboard
- **Two threaded text boxes** — type into the first, watch overflow flow into the second
- Add a photo from the computer
- Save to Mongo and reload with everything intact

**Why two threaded boxes and not one.** Threading is the highest-risk piece in the product and the main differentiator. A single text box proves nothing we do not already know. If the measure-and-split loop is wrong, that is a foundation problem — and finding it here, rather than after five lanes have built on it, is the entire purpose of this stage.

**Exit criteria:**

- [ ] The whole slice works end to end without manual intervention
- [ ] Undo reverses every step correctly
- [ ] The document round-trips through Mongo unchanged
- [ ] Threading survives editing at the start of the story
- [ ] Interaction latency stays under 16ms during drag (GL-17)

**Also produced here:** the first real velocity measurement. Estimate the remaining lanes from this, not from a guess made before any code existed.

---

## 3. Parallel lanes

Seven lanes, hard file ownership per FOUNDATION §11.

| Lane | Area | Depends on |
|---|---|---|
| 1 | Interaction — selection, drag, handles, guides, alignment | Slice |
| 2 | Text — everything TXT | Slice |
| 3 | Photos — everything IMG | Slice |
| 4 | Pages — everything DOC | Lane 0 only |
| 5 | Colour and shapes — CLR, SHP | Lane 0 only |
| 6 | Backend — publish, versions, assets, viewer | Lane 0 only |
| 7 | Shared UX — help, error boundaries, vocabulary scan, touch-target audit, text-size setting | Lane 0 only |

**Lanes 4, 5, 6 and 7 can start the moment Lane 0's gate passes** — they do not touch the canvas. Lanes 1, 2 and 3 wait for the slice, because they build directly on what it proves.

### 3.1 Rules while running

- One requirement ID at a time, finished completely, including its Section 7 checklist.
- Files created only under the lane's own path.
- Registration into slots, never modification of the shell or the registry.
- Every lane runs the full test suite before merging, not only its own.
- The primary acceptance test runs on every merge. If it breaks, **revert rather than patch forward**.

### 3.2 Blockers

When a lane needs something outside its path, it appends to `BLOCKERS.md`, stops that requirement, and moves to the next one in its lane. It never works around the problem.

```md
## [OPEN] TXT-11 — thread split loses the last word at box boundaries
**Lane:** 2 · **Raised:** 2026-09-02
**Where:** packages/mb-commands — outside my lane
**What I need:** the split point calculation to be exclusive, not inclusive
**Stopped:** yes — moved to TXT-12
```

Blockers are read between sessions and resolved by Lane 0. A blocker that sits open for more than a session is itself a problem — it means a lane is running at reduced capacity.

### 3.3 Lane task documents

Each lane gets its own document, self-contained enough that an agent needs only that plus RULES and the schema:

- Its requirement IDs, in build order with dependencies noted
- The commands it registers, with payload shapes
- The toolbar and panel slots it fills
- The exact list of files it may create
- Its tests
- Its known interactions with other lanes

**Written after the vertical slice, not before** — so they describe what the foundation actually turned out to be rather than what was planned.

---

## 4. Integration

The stage that gets forgotten, and where most of the remaining defects live. By construction, nobody owns the seams: each lane tested its own area and assumed the others behaved.

**Seams needing an explicit owner:**

| Seam | Lanes | Why it breaks |
|---|---|---|
| Text flowing around a photo | 2 + 3 | Moving a photo must reflow a threaded chain |
| Deleting a page holding a threaded chain | 4 + 2 | Thread links must repair, not dangle |
| Undo across a multi-lane operation | all | One user action, several lanes' commands, one undo step |
| Grouping items of mixed type | 1 + 2 + 3 + 5 | Transform maths differs per item type |
| Publishing a magazine using every feature | 6 + all | The first time the renderer sees everything at once |
| A repeating background containing a text box | 4 + 2 | Threading across a background is ambiguous — decide the behaviour |

**Approach:** build one deliberately maximal magazine using every feature, then work through it. That single document surfaces more integration defects than any amount of unit testing.

Budget real time for this. It is not a tidying-up phase.

---

## 5. Acceptance

### 5.1 Automated, across the whole product

- [ ] GL-01 touch-target audit — zero controls under 44×44, handles at least 14
- [ ] GL-02 at both text-size settings, no clipping anywhere
- [ ] GL-08 vocabulary scan — zero forbidden terms in any user-facing string
- [ ] GL-10 contrast audit — zero failures
- [ ] GL-11 at 200% browser zoom
- [ ] GL-13 primary acceptance test completed by keyboard alone
- [ ] GL-04 primary acceptance test completed with no drag at any point
- [ ] GL-17 latency under 16ms at p95 on a 24-page magazine

### 5.2 Human

The primary acceptance test from Requirements §2.4, with **five participants aged 70 or over** who have never seen the product:

> Create and publish a four-page magazine with two photographs, a headline, and body text — in under 30 minutes, unaided.

Then the same participants a week later, producing a second issue. That second session is what proves the tool is *memorable* rather than merely learnable, and it is the one most likely to get cut for time. Do not cut it.

Three or more participants failing the same step is a defect, not a training problem.

### 5.3 Cutover

1. Enable `MAGAZINE_BUILDER` for real users; leave `MAGAZINE_V2` on
2. Run both for a period, watching for anything the acceptance tests missed
3. Disable `MAGAZINE_V2`
4. Delete `editor-v2/`, `routes/magazinesV2/`, and the parts of `lib/magazineV2/` that are not shared

**Keep:** extraction (PDF and DOCX into editable pages), `fontMetrics.data.ts`, Pexels integration, the AI generation pipeline. All are needed for Phase B.

---

## 6. Running alongside — needs people, not agents

Neither of these blocks code today. Both become critical path within weeks, and neither happens without a name attached.

**The twelve ready-made designs (DOC-02).** A design commission, not an engineering task. It is the single biggest factor in whether output looks modern — no amount of code substitutes for a well-made layout. Lane 4 finishes with nothing to show without them. Start now.

**Recruiting five participants aged 70+.** Community centres, church groups, retirement associations. Takes weeks to arrange. Without an owner it silently never happens, and the usability problems surface after launch — which is exactly how the current platform reached the state that prompted this rebuild.

---

## 7. Decisions still open

| When | Question |
|---|---|
| Before Lane 0 ends | Confirm the stable-`publishId` publishing model with whoever reverted immutable editions on 2026-08-11 |
| Before Lane 0 ends | Do two people need to type in the same paragraph simultaneously? The only scenario that would justify taking on Yjs now (Amendment 2 §8) |
| Before integration | How broken can a magazine be before publish is blocked rather than warned? PUB-07 says warn and allow; the boundary needs a call |
| Before cutover | Anything in the old editor worth exporting before deletion |
| Phase B | Retarget the existing AI pipeline to emit commands, or replace it |

---

## 8. What good looks like at each stage

A quick self-check. If the answer to any of these is no, stop rather than continue.

| Stage | The question |
|---|---|
| Lane 0 | Can a magazine be built with no UI at all? |
| Slice | Does text flow from one box to the next, and survive editing at the start? |
| Lanes | Is every merged requirement complete against its full checklist, or merely working? |
| Integration | Does one magazine using every feature publish correctly? |
| Acceptance | Did five people who have never seen it succeed alone? |

The last one is the only question that actually matters. Everything above it exists to make the answer yes.
