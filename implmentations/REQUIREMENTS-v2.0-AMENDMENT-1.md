# Product Requirements v2.0 — Amendment 1

**Amends:** GL-09 and GL-15
**Reason:** as written the two cannot both be satisfied
**Affects:** Lane 0's shell, and every lane that builds a properties panel — 1, 2, 3, 5

---

## The problem

**GL-09** requires every control to be present at all times, enabled or disabled by selection, so that nothing moves and users navigate by position.

**GL-15** caps a panel at seven visible options.

Text alone needs roughly fifteen controls: font, size, colour, bold, italic, underline, four alignments, line spacing, letter spacing, two list types, and turn. Photos need trim, turn, flip, corner radius, see-through, replace, and text wrap. No arrangement of the properties panel satisfies both requirements.

Neither requirement is wrong. They are protecting different things, and the conflict comes from applying both at the same granularity.

- GL-09 protects **spatial memory**. Our users find things by remembering where they are, not by recognising an icon. A panel whose contents rearrange by selection forces re-orientation every time.
- GL-15 protects **attention**. Fifteen controls presented at once is overwhelming, regardless of whether they always sit in the same place.

The resolution applies each at the level it actually governs.

---

## GL-09, replaced

> ### GL-09 — Stable layout · MUST
>
> The toolbar and side panels occupy the same position at all times.
>
> Within the properties panel, **sections appear in a fixed order for every item type**:
>
> 1. **Size & position**
> 2. **Appearance** — the controls specific to what is selected
> 3. **Colour**
> 4. **Arrange** — order, lock, group
>
> A section that does not apply to the current selection **is shown and disabled, never removed**. Sections never reorder, never move, and never appear or disappear.
>
> Within a section, controls may differ by item type — a photo's Appearance section shows trim and turn, a text box's shows font and size. What must not change is **which sections exist and where they are**.
>
> **Done when:** screenshots taken with a text box, a photo, and a shape selected show the same four sections in the same positions, with inapplicable ones visibly disabled.

**What changed.** The original required every *control* to be present. It now requires every *section* to be present. Controls inside a section vary by selection; the panel's structure does not.

**Why this preserves the intent.** Someone who has learned that colour is the third section down finds it in the third section every time, whatever is selected. That is the muscle memory GL-09 exists to protect. Requiring a photo's trim button to be permanently visible while text is selected protects nothing and costs a great deal of space.

---

## GL-15, replaced

> ### GL-15 — Option limit · MUST
>
> No section shows more than seven options at once.
>
> **One option means one labelled control group**, not one clickable target. Bold, italic and underline together are one option. Four alignment buttons are one option. A size control offering a list, a typed box, and larger/smaller buttons is one option.
>
> Beyond seven, the remaining options go behind a control labelled **"More settings"** within that same section — never in a different section, never in a separate dialog, never in a menu.
>
> Nothing required by the primary acceptance test (§2.4) may sit behind "More settings".
>
> **Done when:** every section is counted by labelled control group and none exceeds seven in its default state, and the primary acceptance test is completed without opening "More settings" once.

**What changed.** "Option" is now defined. The original capped an undefined thing, which is the ambiguity this amendment exists to remove — counted as clickable targets, a text panel is about fifteen; counted as labelled groups, it is seven.

**Why one group and not one target.** The cost to the user is the number of decisions, not the number of buttons. Four alignment buttons in a row is a single decision — "how should this line up" — presented as one labelled group. Splitting that into four options would count it as four times the burden of a font picker, which is backwards.

---

## Worked example — the text properties panel

The seven visible options for a selected text box:

| # | Option | Contains |
|---|---|---|
| 1 | Font | Family picker, showing each name in its own face |
| 2 | Size | List, typed value, and larger/smaller buttons |
| 3 | Colour | The shared colour chooser |
| 4 | Style | Bold, italic, underline |
| 5 | Alignment | Left, centre, right, straight edges both sides |
| 6 | Spacing | Line spacing and letter spacing sliders |
| 7 | Lists | Bullets and numbers |

Behind **"More settings"** in the same section: turn to any angle, continue in another box, capitals, first-line indent, indents, space before and after, vertical alignment.

**Check against the primary acceptance test.** Producing a four-page magazine with a headline and body text needs font, size, colour, and alignment — options 1, 2, 3 and 5. All visible. "More settings" is never opened. The test passes.

---

## What this means for each lane

**Lane 0** builds the four fixed sections as a shell contract. Lanes register controls *into* a section; they do not create sections.

```ts
export type PanelSection = 'position' | 'appearance' | 'colour' | 'arrange';

export function registerPanelOption(
  section: PanelSection,
  itemType: Item['type'],
  option: PanelOption
): void;

export interface PanelOption {
  /** User-visible group label. */
  label: string;
  /** Lower sorts first. Options 1-7 are visible; 8+ go behind More settings. */
  weight: number;
  render: () => ReactNode;
}
```

The shell handles the seven-option cut and the "More settings" disclosure. A lane cannot accidentally exceed the cap, because it never controls the boundary.

**Lanes 1, 2, 3 and 5** register options with a weight. Getting the weights right matters — the seven with the lowest weights are what a user sees, and anything the acceptance test needs must be among them.

**Lane 7** adds the section count and the acceptance-test check to its audit tooling.

---

## One open item

**Weights need coordinating across lanes.** Text, photo, shape and group options all land in the same Appearance section, and each lane assigns its own weights without seeing the others.

They do not collide — a photo's options and a text box's options never appear together, because only one item type is selected at a time. But if two lanes both use weight `10` for different item types, nothing breaks.

Where it *would* matter is a mixed selection — a photo and a text box selected together. Simplest rule, and the one I would take: **a mixed selection shows only the options common to every selected type** — position, colour, arrange. Appearance is shown and disabled.

Lane 1 owns multi-selection (ARR-03) and should confirm that.
