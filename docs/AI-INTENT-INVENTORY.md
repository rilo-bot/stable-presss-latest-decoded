# AI Intent Inventory — what "the AI can do anything, anywhere" requires

**Status:** working document · input to the command-bus design
**Owner:** unassigned
**Created:** 2026-08-18

---

## Why this document exists

We decided to build AI reach first: an assistant that can change anything, anywhere
in a magazine, in one instruction, reversibly.

Before writing a command bus we need to know what commands it must carry. This
document derives that from **real instructions** rather than guesswork. Each entry
records what the AI must be able to *address* and what it must be able to *do*, then
grades it against the tools that exist today.

The output is [§3, the derived command set](#3-derived-command-set). That is what the
command bus is built from.

**Add to this document freely.** An instruction that turns out to be impossible is
more valuable here than in a bug report.

---

## 1. Where the agent stands today

`apps/server/src/lib/magazineV2/agent.ts` — 17 tools, model never writes the DB (each
tool stages an `AgentProposal`; the client applies them through the same rev-guarded
CRUD a human uses). Model `openai/gpt-5.6-sol`, `stepCountIs(16)`, 90s abort.

### The central constraint

The agent **reads every page but edits only the open one**. From the system prompt
(`agent.ts:143-146`):

> `get_page(page)` READS any page of the magazine (read-only). … You can only EDIT the
> open page; if they want another page changed, read it, say what you would change, and
> **ask them to open it**.

This is structural, not a prompt choice: `AgentCtx` (`agent.ts:204-215`) holds
`working: MagazineElement[]` for a single `pageIndex`. One working copy, one page.

### The asymmetry worth noticing

| Scope | Tools |
|---|---|
| **Document-wide** (already) | `add_page`, `add_content_pages`, `remove_page`, `reorder_pages` — all 1-based, owner-gated. `use_image_as_layout` can name a target page. `get_page` reads any page. |
| **Open page only** | `set_element_text`, `set_element_style`, `move_element`, `set_element_image`, `set_qr_link`, `add_element`, `add_media_image`, `add_stock_image`, `delete_element`, `change_text_to_image` |

So *structure* is already document-scoped. *Content and style* are not. Closing that gap
is most of the work.

### Coverage gaps inside the tools that do exist

- `set_element_style` covers `fontSize` / `fontWeight` / `color` / `align` / `lineHeight`
  and shape `fill` only. **Not** `letterSpacing`, `textTransform`, `fontFamily`,
  `vAlign`, or `autoFit` — all of which exist on the element model.
- `add_element` accepts `text | shape | qr`. **Icons cannot be added by the AI**, though
  the model supports them and the generator uses them.
- **No theme or palette tool exists.** `genTheme` is issue-level but unreachable.
- **No page-background tool exists.**
- **No tool edits the magazine title or subtitle.**
- No tool sets an image `focalPoint`, or locks/unlocks an element.

---

## 2. The instructions

Verdicts:

| | Meaning |
|---|---|
| ✅ **Works** | Expressible with today's tools |
| 🟡 **Addressability** | The action exists but the AI cannot reach the target |
| 🔴 **New command** | No tool can perform this at all |

---

### 2.1 "Move the stats page after the interview" — ✅ Works

**Address:** two pages, identified by *content* rather than number.
**Do:** reorder the running order.

`get_page` lets the agent read pages to work out which is which, and `reorder_pages`
takes 1-based positions. Requires magazine-owner permission (`canEditStructure`).

> **Note:** this works because the instruction is *structural*. It is the exception,
> not the pattern.

---

### 2.2 "Remove page 4" — ✅ Works

**Address:** one page by number. **Do:** delete it, renumber folios.

`remove_page` plus server-side `renumberFolios.ts`. Owner-gated.

---

### 2.3 "Add a contents page" — ✅ Works

**Address:** an insert position. **Do:** generate a designed page.

`add_content_pages` (the default for "add a page"; `add_page` is the explicit-blank
variant). Owner-gated.

---

### 2.4 "Shorten every headline" — 🟡 Addressability

**Address:** every text element with `role: 'headline'`, **across all pages**.
**Do:** rewrite each one's content.

The canonical failure. `set_element_text` exists and does exactly the right thing — but
only on the open page. Today the agent reads the other pages, describes what it would
change, and asks the user to open each one in turn.

**Needs:** a target selector that resolves across pages (`role`, page range, or "all"),
and a working copy spanning more than one page.

---

### 2.5 "Make the section labels uppercase and tracked" — 🔴 New command

**Address:** text elements by role, across pages. **Do:** set `textTransform` and
`letterSpacing`.

Fails twice over. Cross-page addressability, *and* `set_element_style` cannot set either
field even on the open page — despite both existing on `ElementTextData`
(`model.ts:66-67`).

Also the live drift bug: `textTransform` is missing from the web model mirror
(`apps/web/src/editor-v2/model.ts:16`), so uppercase would not render even once set.
Fixed by `packages/schema`.

**Needs:** `set_element_style` widened to the full text-style surface; cross-page
selector.

---

### 2.6 "Use more gold" / "make the whole magazine more elegant" — 🔴 New command

**Address:** the issue's theme. **Do:** change palette and/or font pairing, and have
every existing page reflect it.

Two independent blockers:

1. **No theme tool exists.** `genTheme` (palette + fonts) is stored on the magazine doc
   but no tool reads or writes it.
2. **Even with a tool, it would not work.** Palette values are resolved to literal hex
   and baked into every element at compose time, so changing `genTheme` re-tints nothing
   that already exists.

The second is the theme-indirection work — elements referencing style roles resolved at
render. Until that exists, "restyle the magazine" means editing every element
individually, which is exactly what the command set should let us avoid.

**Needs:** a theme command **and** theme indirection in the model. Flagged as the one
entry here that needs a model change, not just a command.

---

### 2.7 "Swap all the photos for brighter ones" — 🟡 Addressability

**Address:** every image element across all pages. **Do:** source a replacement per
image and repoint it.

`add_stock_image` and `set_element_image` do the work; scope is the blocker. Note the
per-image briefs are independent today, so "brighter" would be applied 12 separate times
with no shared interpretation — see the issue-level image style token in Phase 4.

**Needs:** cross-page selector; ideally a shared style token so one adjective produces
one consistent result.

---

### 2.8 "Make page 3 match page 2's style" — 🟡 Addressability

**Address:** read page 2, write page 3. **Do:** copy typography and colour decisions.

Explicitly the case the prompt tells the agent to hand back to the user: read the other
page, then *ask them to open it*. Half the instruction already works.

**Needs:** write access to a page other than the open one.

---

### 2.9 "Make the background of every page darker" — 🔴 New command

**Address:** every page's background. **Do:** set it.

Page background is on the page document (`background: { type, value }`) and **no tool
touches it**, on any page, ever.

**Needs:** a page-property command.

---

### 2.10 "Rename the magazine to 'Thoroughbred Racing'" — 🔴 New command

**Address:** the magazine document. **Do:** set title/subtitle.

No tool reaches magazine-level metadata. Trivial to add; listed because it shows the
addressing hierarchy has a whole missing level — magazine, not just page and element.

---

### 2.11 "Make this issue feel like the reference magazine I showed you" — 🔴 New command

**Address:** an uploaded reference image → the whole issue. **Do:** derive a design
system and hold it across every page.

`use_image_as_layout` reads a reference and rebuilds **one** page's structure. There is
no issue-level equivalent, and the reading caps at 28 regions keeping the largest by
area — so it discards exactly the small labels and table cells that carry the style.

**Needs:** the Phase 4 issue style contract. Recorded here because it is a likely
request and should not be promised early.

---

### 2.12 "Add a horseshoe icon next to each stat" — 🔴 New command

**Address:** elements across pages. **Do:** add icon elements.

`add_element` accepts `text | shape | qr` only. Icons exist in the model and the
generator places them, but the AI cannot.

**Needs:** `add_element` extended to `icon`; cross-page selector.

---

## 3. Derived command set

What the above actually asks for. Grouped so the bus can be built in dependency order.

### 3.1 Addressing — the missing layer

Every 🟡 above is one problem: there is no way to name a target that is not on the open
page. Selectors the instructions demand:

```
element by id                     (exists)
elements by role                  → "every headline"
elements by type                  → "all the photos"
scope: open page | page N | range | whole issue
page by number
page by content reference         → resolved via get_page, then by id
the issue theme
the magazine document
```

Two notes carried over from the audit:

- Resolve to **ids, not ordinals**, at stage time. `AgentProposal.pageId` already does
  this deliberately (`agent.ts:47-58`) because page order can change between the model's
  turn and the user pressing Apply. Selectors must follow the same rule.
- The working copy must span the pages a batch touches, not one page.

### 3.2 Commands

| Command | Status | Notes |
|---|---|---|
| `element.setText` | widen scope | exists as `set_element_text` |
| `element.setStyle` | widen scope **+ surface** | add `letterSpacing`, `textTransform`, `fontFamily`, `vAlign`, `autoFit` |
| `element.move` | widen scope | |
| `element.setImage` | widen scope | |
| `element.add` | widen scope **+ types** | add `icon`; keep photos going through the sourcing tools |
| `element.delete` | widen scope | |
| `element.setQrLink` | widen scope | |
| `page.setBackground` | **new** | |
| `page.add` / `page.remove` / `page.reorder` | exists | already document-scoped, owner-gated |
| `page.applyLayoutFromReference` | exists | exclusive — cannot batch with element edits (`LAYOUT_CLASH`) |
| `issue.setTheme` | **new** | needs theme indirection to be meaningful |
| `issue.setMeta` | **new** | title, subtitle |

### 3.3 Reserved — defined now, unimplemented

Per the plan, design the command set against the vocabulary we *want* so Phase 4 fills
in shapes rather than forcing a redesign. Declare and leave unimplemented:

```
element.setShape        radius · ellipse · gradient · stroke
element.setTextStyle    fontStyle: 'italic' · tabular figures
module.insert           a repeating module that expands outside the leaf budget
module.setStyle
issue.setStyleContract  accent usage · eyebrow treatment · margin · headline pattern
```

### 3.4 Batch semantics

Every instruction above except the ✅ ones touches several pages. Required:

- One instruction → one batch → one transaction → one undo entry.
- A batch spanning pages commits wholly or not at all. Per-page `rev` CAS is not
  sufficient; needs a document-level revision or a multi-page conditional write.
- `apply-layout` stays exclusive.
- Locked elements refuse at the command, as the tools do today.

---

## 4. Open questions

1. **Does the AI get a whole-issue working copy, or a page set declared up front?**
   Whole-issue is simpler to reason about and heavier to load. A declared page set is
   cheaper but needs the model to know its scope before it has read anything. Leaning
   toward: read via `get_page`, then declare the write set when staging.
2. **Confirmation granularity.** Today every proposal is individually reviewable. A
   40-element batch across 6 pages cannot be reviewed element by element. Per-batch
   summary with drill-down, or per-page?
3. **Permissions.** `canEditStructure` is owner-only. Does a cross-page *content* edit
   need the same gate? A collaborator scoped to page 3 must not restyle page 7.
   `AgentCtx.readable` already models per-caller read visibility — the write equivalent
   needs the same treatment.
4. **Cost.** `stepCountIs(16)` with a whole-issue context is materially more tokens per
   turn than today. Worth measuring before widening the context.

---

## 5. What this changes in the plan

- §2.6 (theme) is the only entry needing a **model** change rather than a command. It
  should move earlier or be explicitly deferred, since "make the magazine more elegant"
  is a likely first request and currently cannot work at all.
- §2.5 depends on `packages/schema` landing first — the field exists on the server and
  is missing from the web mirror, so setting it would silently do nothing.
- Six of twelve instructions fail on **addressability alone**. That single fix carries
  more value than any individual new command.
