# Lane 2 — Text

**Starts after:** the vertical slice proves thread layout
**Read first:** RULES.md + Amendment 1 · FOUNDATION v0.3 · Requirements v2.0 + Amendment 1 · LANE-0-FOUNDATION.md §4 for the working cycle

---

## 1. Your role

You own everything the user does with words. This is the largest lane, the hardest, and the one four other lanes bump into.

It is also where the product's reason for existing lives. **Threading — text flowing from one box into the next across pages — is the thing Canva cannot do.** Saved looks are the second. If those two are excellent, the product has a case; if they are mediocre, it is a worse Canva.

**You are not building the text engine.** Thread layout — measuring where a story overflows and computing split points — is Lane 0's, in `packages/mb-render`. You consume `ThreadLayout`. If it is wrong, that is a blocker, not something to work around.

---

## 2. What you own

```
apps/web/src/magazine-builder/features/text/
  types.ts  constants.ts
  commands/       one file per handler
  components/     panel, editing surface, overflow warning
  hooks/
  index.ts        registration only
```

## 3. What you must not touch

- `packages/mb-*` — Lane 0's. Needing a change there is a blocker.
- Any other `features/` directory.
- The shell, the toolbar, or the panel structure. You register into slots.
- **Thread layout.** You call it; you do not modify it.
- `text.insert`, `text.delete`, `text.splitParagraph`, `text.mergeParagraph`, `text.connectBox`, `text.disconnectBox` — all Lane 0's, because they maintain invariants 2 to 4 and 12.

---

## 4. Working cycle

Think → Analyse → Discuss → Finalize → Build, as defined in LANE-0-FOUNDATION §4. One requirement at a time, finished completely, before starting the next.

The Discuss step matters more here than anywhere else. Text has more edge cases than the rest of the product combined — selections spanning runs, spanning paragraphs, spanning boxes in a chain, paste from Word, an empty paragraph, a look deleted while in use. Find them in Analyse, not in Build.

---

## 5. Following Canva — and where it has no answer

Canva is the reference for interaction. Two places it does not apply.

### 5.1 Copy Canva

| Behaviour | What Canva does | Adopt |
|---|---|---|
| Font picker | Each name rendered in its own face, search box, recently used pinned at top | Yes — TXT-03 |
| Entering edit mode | First click selects the box, a later click enters editing | Yes — see 5.3 |
| Leaving edit mode | Escape, or clicking elsewhere | Yes |
| Selection formatting | Toolbar reflects the selection; applying to a range splits runs | Yes |
| Size control | Dropdown of common sizes plus a typed field plus +/− buttons | Yes — TXT-04 |
| Colour | One shared chooser everywhere | Yes — CLR-01, Lane 5 owns it |
| Paste | Strips foreign styling, keeps bold and italic | Yes — TXT-02 |

### 5.2 Where Canva has no answer — threading

Canva has no text threading. Every text box is independent. The reference for TXT-11 is InDesign and Microsoft Publisher.

**What they do:** an overflow marker on the box; click it, then click where the text should continue; a visible link between connected boxes when one is selected.

**What to change for our users:** InDesign requires the user to then click a destination, which is a second step an 80-year-old may not understand and may abandon halfway. See §7.1 — we place the box for them.

### 5.3 Where Canva conflicts with our rules — and TXT-02 needs amending

Canva's model is: **first click selects the box, a second click enters text editing.** That is right, and it is what you should build.

But TXT-02 currently says *"A single click on existing text places a cursor."* Those contradict, and Canva's version is better for our users: once a layout is set, moving a box is more common than editing it, and accidentally entering edit mode when you meant to move is worse than the reverse.

This does **not** violate GL-05's no-double-click rule. There is no timing window — the second click can come ten seconds later. It is two independent clicks, not a double-click.

**Raise this as a blocker** so TXT-02 gets amended rather than you diverging from it silently. Lane 1 owns selection (ARR-01) and needs the same answer.

---

## 6. A change to the overflow default — read before TXT-12

FOUNDATION §9.3 sets `overflow: 'warn'` as the default. Following Canva properly suggests something better, and you should raise it as a blocker before building TXT-12.

**Canva's model:** a text box grows downward as you type. Nothing is ever hidden. The box may overlap other items, which the user can see and fix.

That is a strong property for our users — better than clipping, because nothing disappears. But it is not sufficient for a magazine, because a page has a hard bottom edge, and a box that grows past it hides text again with no warning.

**The synthesis, which I think is right:**

| Box state | Behaviour |
|---|---|
| Free-standing, room on the page | **Grow downward.** Canva behaviour. Nothing hidden, no warning needed. |
| Free-standing, would pass the page bottom | Stop growing. Show the TXT-12 warning. |
| Part of a thread chain | **Never grow.** A connected box is a fixed frame — that is what connecting means. Overflow flows onward; at the end of the chain, warn. |

This keeps warn as the fallback and shrink as an opt-in, but makes growth the first response — which is what Canva users expect and what causes the least confusion.

**File this as a blocker.** It changes `TextBox` semantics, which is Lane 0's schema, and D-03 which was already decided.

---

## 7. The hard parts

Most of your time goes here. Everything else is a panel control.

### 7.1 Threading — TXT-11

The differentiator, and the thing with no good precedent for our audience.

**Starting a connection.** Two routes, both leading to the same place:

- From the overflow warning: *"Continue in another box"*
- From the panel, behind More settings: *"Continue in another box"*

**Where the new box goes — do not ask the user.** Create it automatically:

1. Same position and size as the current box, on the **next page**.
2. If there is no next page, create one first.
3. Scroll to it, select it, and show the connection.

InDesign makes you click a destination. That is a second decision, and a second chance to abandon the task. Placing it for them costs nothing — the box can be moved afterwards like any other, and the whole thing is one undo step.

**Showing the connection.** When a box in a chain is selected, draw a visible line from its bottom edge to the next box's top edge — across pages, indicated by an arrow at the page edge. Both boxes show a small chain marker so the relationship is visible without selecting.

**Language.** Never "thread", "link", or "flow" (GL-08). Say *"Continue in another box"*, *"This text continues on page 4"*, *"Stop continuing"*.

### 7.2 Saved looks — TXT-13

**The cascade is the feature.** Changing "Body text" updates 40 pages. That is what makes a magazine consistent without effort, and it is the second thing Canva cannot do.

Three things to get right:

**One undo step.** Updating a look that 200 paragraphs use is one entry, not 200.

**Tell them what happened.** The requirement asks for this explicitly: *"Body text updated — 47 pieces of text changed."* Without it, a change on page 1 silently altering page 30 is alarming.

**Deleting a look must reassign.** `look.delete { lookId, reassignTo }` — the payload carries the destination. Never orphan a paragraph. Ask which look to move them to, showing the count: *"18 pieces of text use this. Which look should they use instead?"*

### 7.3 Editing in place — TXT-02

Deceptively large. You are building a text editor over structured runs, not HTML.

- Caret positioning from `ThreadLayout`'s line positions
- Selection across runs, paragraphs, and **across boxes in a chain**
- IME composition — do not break Chinese, Japanese, or Korean input
- Paste from Word and from the web, keeping bold and italic, discarding everything else
- Undo granularity: one typed word is one entry, via `coalesceKey`

**Applying formatting to a selection splits runs.** Selecting the middle of a run and pressing bold turns one run into three. Get this right early — it is the source of most text bugs, and it interacts with `text.insert`'s offsets.

**Insertion at a boundary inherits the left run's formatting** (D-19). At offset 0, inherit the first run.

### 7.4 The overflow warning — TXT-12

Must appear within one second and be unmissable. Not a subtle icon — a visible band on the box saying, in plain words, that some text is hidden.

Three actions, each one click, each undoable:

| Action | Behaviour |
|---|---|
| *"Make this box bigger"* | Grow downward to fit, stopping at the page bottom. Overlapping unlocked items is allowed — Canva-style layouts overlap freely and it is visible. Stop before overlapping a **locked** item, since locking means "do not disturb this". |
| *"Make the text smaller"* | Set `overflow: 'shrink'` on this box. One field. No look edited, no paragraph overrides written. |
| *"Continue in another box"* | §7.1. |

---

## 8. Build order

Dependency-ordered. Do not reorder without a reason.

| # | Requirement | Note |
|---|---|---|
| 1 | **TXT-01** Add text | Simplest path to a box on the page |
| 2 | **TXT-02** Edit in place | Everything below needs a cursor. The biggest single item. |
| 3 | **TXT-13** Saved looks | Before formatting — formatting writes overrides *on top of* looks |
| 4 | **TXT-03** Font | |
| 5 | **TXT-04** Size | |
| 6 | **TXT-05** Colour | Uses Lane 5's chooser. Stub it if Lane 5 has not landed. |
| 7 | **TXT-06** Bold, italic, underline | First thing needing run splitting |
| 8 | **TXT-07** Alignment | |
| 9 | **TXT-12** Warning, two actions | "Continue in another box" comes with step 10 |
| 10 | **TXT-11** Threading | The hard one. Budget accordingly. |
| 11 | **TXT-12** third action | Completes step 9 |
| 12 | **TXT-08** Line and letter spacing | |
| 13 | **TXT-09** Lists | |
| 14 | **TXT-10** Turn to any angle | |
| 15 | **TXT-14** Spell check | Last — nothing depends on it |

TXT-12 is deliberately split. Overflow can happen from the moment text exists, so detection and warning must land before threading, but the third action needs threading to exist.

---

## 9. Commands you register

Lane 0 owns text mutation and chain structure. You own formatting and box configuration.

```ts
// Formatting
text.setLook              { paragraphIds: Id[], lookId: Id }
text.setParagraphOverride { paragraphId: Id, props: Partial<ParagraphProps> }
text.setRunOverride       { paragraphId: Id, from: number, to: number,
                            props: Partial<CharacterProps> }
text.setAlign             { paragraphIds: Id[], align: ParagraphProps['align'] }
text.setListType          { paragraphIds: Id[], listType: Paragraph['listType'] }

// Looks
look.create               { look: SavedLook }
look.update               { lookId: Id, props: Partial<ParagraphProps> }
look.delete               { lookId: Id, reassignTo: Id }

// Box configuration
box.setOverflow           { boxId: Id, overflow: 'warn' | 'shrink' }
box.setColumns            { boxId: Id, count: number, gutter: Px }
box.setVerticalAlign      { boxId: Id, align: TextBox['verticalAlign'] }
box.setInsets             { boxId: Id, insets: Insets }
```

**`text.setRunOverride` is the difficult one.** Applying bold to a range that crosses run boundaries splits runs, and its inverse must restore the original run structure exactly — not merely unset bold, because the runs may have been merged. Carry the original runs in the inverse payload.

**Every command's payload must pass the §6.6 test:** could two people issue this at once and get a sensible result? Note that `paragraphIds: Id[]` is fine — identifiers, not positions.

---

## 10. Panel options and weights

Per Requirements Amendment 1, you register into the Appearance section with a weight. The seven lowest weights are visible; the rest go behind "More settings" in the same section.

| Weight | Option | Visible |
|---|---|---|
| 10 | Font | Yes |
| 20 | Size | Yes |
| 30 | Colour | Yes |
| 40 | Style — bold, italic, underline | Yes |
| 50 | Alignment | Yes |
| 60 | Spacing — line and letter | Yes |
| 70 | Lists | Yes |
| 80 | Turn | More settings |
| 90 | Continue in another box | More settings |
| 100 | Capitals | More settings |
| 110 | Indents | More settings |
| 120 | Space before and after | More settings |
| 130 | Vertical alignment | More settings |
| 140 | Columns | More settings |

**Check against the primary acceptance test.** A four-page magazine with a headline and body text needs font, size, colour, and alignment — all visible. "More settings" is never opened. If your weights ever push one of those below the cut, the test fails.

Saved looks are **not** in this list — they are a distinct control at the top of the Appearance section, above the options, because applying a look is the intended first action and everything below it is refinement.

---

## 11. Seams with other lanes

| Lane | Seam | Owner |
|---|---|---|
| 1 | Click behaviour — select versus edit (§5.3) | Lane 1 owns ARR-01. Agree it, do not diverge. |
| 1 | Resizing a text box reflows its chain | You provide the relayout; Lane 1 calls it during drag |
| 3 | Moving a photo with wrap reflows text | Lane 3 triggers; you relayout |
| 4 | Deleting a page holding a chain | Lane 4 dispatches; Lane 0's `item.delete` repairs |
| 4 | Text boxes in repeating backgrounds cannot thread | Hide the control. Lane 4 enforces. |
| 5 | Text colour | Lane 5 owns the chooser; you call it |

**Integration risk to flag now:** resize and photo-move both trigger relayout during a *drag*, which must stay under GL-17's 16ms. A naive full relayout of a six-box chain will not make that. Cache by box, invalidate forward only, and relayout on drag end rather than per frame if needed.

---

## 12. Traps

**Selections crossing boxes in a chain.** A user drags from box 1 to box 3. Selection is a range in the *story*, not in a box. Get this right at TXT-02 or retrofit it painfully at TXT-11.

**Run splitting is where text bugs live.** Bold on a partial run, then italic on an overlapping partial, then undo both. Test this specifically.

**Look overrides are not look edits.** Setting a paragraph's size writes `Paragraph.overrides`, which detaches it from that aspect of the look forever. That is correct, but users are surprised when updating the look no longer changes that paragraph. Consider showing a marker on overridden paragraphs.

**Empty paragraphs are real.** Pressing Enter twice creates one with no runs. It must render with correct height from its look, and accept a caret.

**Do not store computed values.** Fitted scale, line positions, overflow counts all live in `ThreadLayout`. If you find yourself writing one into the document, stop.

**Spell check must not appear in output.** Marks are editor-only, and must not interfere with selection or caret positioning.

---

## 13. Your gate

Beyond RULES §7 for every requirement:

1. **Threading.** A 3,000-word story across six connected boxes. Adding a sentence at the start correctly reflows all six.
2. **Look cascade.** Changing "Body text" updates every paragraph using it, in one undo step, with the count shown.
3. **Look deletion.** No paragraph is ever orphaned.
4. **Selection across boxes.** Selecting from box 1 into box 3 and applying bold works.
5. **Round trip.** Text survives save and reload with formatting and thread structure intact.
6. **Headless.** Every TXT requirement is achievable through `dispatch()` alone (FWD-02).
7. **Latency.** Typing and dragging a text box stay under 16ms at p95 with a six-box chain.
8. **Warning.** Appears within one second of overflow and cannot be missed at a glance.

---

## 14. Blockers to raise on day one

Three, before you build anything:

1. **TXT-02's click behaviour** (§5.3) — needs amending to select-then-edit, and Lane 1 needs the same answer.
2. **The overflow default** (§6) — grow-then-warn rather than warn-immediately. Changes `TextBox` semantics, which is Lane 0's schema.
3. **"Make this box bigger" and overlap** — I have specified: overlap unlocked items freely, stop before locked ones. Confirm rather than assume, since Lane 1 owns overlap behaviour generally.

Raise all three in `BLOCKERS.md` before step 1, since two of them change what you build in TXT-01 and TXT-02.
