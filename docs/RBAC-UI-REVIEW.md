# RBAC console — UI/UX review & rebuild plan

**Date:** 2026-08-04 · **Screen:** Roles & Permissions (`/production-system/roles`)
· **File:** [RolesPermissionsView.tsx](../apps/web/src/pages/newsroom/views/RolesPermissionsView.tsx)
(564 lines, one component tree)

Companion to [RBAC-STAFF-CAMPAIGN-ENGINE-REVIEW.md](./RBAC-STAFF-CAMPAIGN-ENGINE-REVIEW.md),
which covers whether the rules are *correct*. This one is only about whether a
human can drive them.

## The measurement

Counted from the live catalogue the screen renders from:

| Axis | Items | Rows |
|---|---|---|
| Modules (navigation) | 24 | 5 (Workspace 3, Content 7, Stables 4, Management 5, Editor Hub 5) |
| Permissions (actions) | 38 | 9 (Platform Access 4, Stories 4, Editorial 3, Publishing 2, Blogs 5, Media 2, **Podcast 13**, Compensation 1, Team & Settings 4) |
| Workflow stages | 5 | 1 |
| **Per role card** | **67 checkboxes** | **15 rows** |

Every card is rendered **fully expanded, permanently**. With the four seeded roles
that is ~200 checkboxes on first paint, and the only way to answer "what roles do
we have?" is to scroll past all of them.

The file's own header comment argues for this: *"each showing its ENTIRE access at
a glance… the list only ever showed counts (18 permissions)"*. That was the right
diagnosis of the *previous* design and it overshot the fix. Showing everything is
not the same as showing it at a glance — 67 checkboxes of which 8 are ticked is
not a glance, it is a subtraction problem.

---

## Findings

### Structure

**S1 — The list is not a list.** No collapse, no summary, no way to see the roster
of roles as a roster. This is the headline complaint and everything below compounds it.

**S2 — Three unrelated axes are flattened into 15 identical-looking rows.**
Navigation, actions and board columns render through the same `PermissionRow` with
nothing between them. "Content" (a module *section*) and "Blogs" (a permission
*resource*) are visually indistinguishable and mean entirely different things. The
only cue is a `w-36` label column.

**S3 — Podcast is a third of the grid** (13 of 38 actions) for a feature with one
screen and no module row of its own. It dominates the visual weight of every card
and pushes everything else below the fold.

**S4 — Read mode and edit mode are the same 67 checkboxes.** Unchecked ones stay
rendered at `opacity-45`, so reading a role means visually filtering out the 59
things it *cannot* do. Read mode should show only what IS granted.

### Editing

**E1 — Unsaved work is discarded silently.** `closeEditor()` resets on Cancel with
no dirty check anywhere: no confirm, no route guard, no `beforeunload`. Sixty-seven
checkboxes of configuration, one stray Cancel.

**E2 — One-card-at-a-time is enforced by hiding the other cards' buttons.**
`locked ? null` removes Edit and Delete from every other role with no explanation
of why they vanished.

**E3 — No search or filter.** 67 checkboxes and no way to type "blog".

**E4 — No diff.** "Start from <role>" clones three tick-sets and then gives no
indication of what has changed since — neither against the clone source nor
against the saved role. No "reset to built-in default" for a system role either.

**E5 — `window.confirm` for delete.** The one destructive action in the console
uses a browser dialog while the rest of the app has a real `Dialog` (the story
delete in `ProductionSystemLayout`). It also can't show what is being lost beyond
a sentence.

**E6 — The icon picker is ~20 unlabelled 13px buttons in a 280px box.** Tap
targets far under the 24px floor, and `aria-label={name}` gives a screen reader
"ShieldCheck" with no indication it is an icon choice.

### Accessibility

**A1 — Disabled checkboxes are the entire read view.** `disabled` inputs are not
keyboard-focusable, so in read mode a keyboard or screen-reader user cannot
traverse the grid at all — the information is only available to a mouse and an eye.

**A2 — `opacity-45` on `text-muted-foreground`** for every unchecked label. Muted
foreground is already the low end of the text scale; at 45% it is far below AA.
Same class of failure as THEME-REVIEW's gold-as-text finding.

**A3 — The permission description is `title`-only.** The catalogue ships a real
explanatory sentence for all 38 actions and it is reachable only by hovering a
mouse — invisible on touch, unreliable for assistive tech, and untranslatable in
practice.

### Honesty / safety

**H-a — Escalation-capable permissions look like ordinary ones.**
`platform.admin`, `roles.manage`, `team.manage` and `claims.verify` sit in the
Platform Access row styled exactly like "See the Draft column". Given C1 in the
companion review (`roles.manage` self-escalates to full platform access), these
need visible weight.

**H-b — The console offers grants the server will refuse.** Once C1 is fixed with
an amplification rule, ticking a permission the actor does not hold will 403 on
save. The UI must mark those *before* the click, not surface a failure after.

**H-c — 24 of the 67 checkboxes currently control nothing on the server.** The
module axis is browser-only (H1 in the companion review). The screen presents
Navigation with exactly the same authority as Actions.

**H-d — The empty state is unreachable.** "No roles defined yet" cannot render:
`seedRoles` inserts four on every boot.

---

## Plan

Five phases. 1–3 are the rebuild the complaint is about; 4 is safety; 5 is the
assignment side.

### Phase 1 — the list becomes a list

Collapsed accordion row per role:

```
▸ ⬢ Superadmin      SYSTEM     1 user    Everything, always
▸ ⬤ Administrator   BUILT-IN   2 users   Full platform · 24 screens · all 5 columns
▸ ⬤ Editor          BUILT-IN   4 users   Publish, approve, edit any · 18 screens · all columns
▸ ⬤ Contributor     BUILT-IN   9 users   Draft & submit own work · 8 screens · 2 columns
▸ ⬤ Racing Desk               0 users   No access granted yet
[+ New role]
```

- The summary line is **written from the permission set**, not a count. A role
  holding `content.publish` reads "Publish"; the "18 granted" number goes away.
- Click the row → expands in place. One open at a time.
- Search filters by role name **and by what it grants**, so typing "publish"
  surfaces every role that can.
- Order: immutable, then system, then custom (already how the API sorts).

### Phase 2 — the expanded read view shows only what is granted

Three labelled groups, chips not checkboxes, nothing unchecked rendered:

```
  CAN DO        [Publish] [Approve] [Send back] [Edit any story] [+9 more]
  CAN OPEN      [Overview] [Workflow Board] [All Stories] [+15 more]
  BOARD         [Draft] [Submitted] [Approved] [Scheduled] [Published]

  ⚠ Holds Manage roles — can change what every role on the platform grants.

                                            [Edit permissions]  [Delete]
```

- Solves S4, A1 and A2 together: no disabled inputs, no 45%-opacity text, and the
  content is plain readable markup.
- Long groups truncate with "+N more" rather than filling the screen; Podcast
  collapses behind a single line when the role holds most of it (S3).
- The warning line addresses H-a.

### Phase 3 — the editor moves out of the card

**Decided 2026-08-04: right-hand sheet.** Considered and rejected — editing inside
the expanded accordion row (too narrow for the inline descriptions, which is the
fix for A3), and a dedicated `/roles/:slug` page (deep-linkable, but leaves the
list so you lose comparison against other roles).

A full-height right-hand **sheet** rather than an inline flip:

- Kills E2 outright — nothing about the list needs to be disabled or hidden while
  the sheet is open, so no other card loses its buttons.
- Gives the 67 controls real width, with the list still visible behind for
  reference (which was the actual goal of the inline design).
- Layout: identity fields (name, description, colour, icon) at the top, then the
  three axes as **sections with sticky headings and their own count badges** —
  fixing S2 — reachable by a segmented control for long lists.
- **Search box filters all 67** as you type (E3).
- Per-resource All/None kept; add a global Clear all.
- **Dirty state is tracked and shown**: "4 added, 1 removed" in the sheet footer,
  a diff toggle against the saved role, Cancel confirms when dirty, and a route
  guard (E1, E4).
- "Reset to built-in default" for `isSystem` roles (E4).
- Each action's catalogue `description` renders **inline under its label**, not in
  a `title` (A3). This is the main reason the sheet needs the extra width.
- Icon picker gets ≥28px targets in a labelled grid (E6).

### Phase 4 — safety and honesty

- Mark permissions the actor cannot grant as unavailable, with a reason (H-b).
  Best done in the same change as the C1 server fix so the two agree.
- Warning treatment on the four escalation-capable ids (H-a).
- Replace `window.confirm` with the app's `Dialog`, naming the role and its
  assignee count (E5).
- Either label the Screens section honestly ("controls navigation only") or hold
  it until H1 lands (H-c).
- Delete the unreachable empty state (H-d).

### Phase 5 — the assignment side

`TeamManagementView` (554 lines) is out of scope above but is the other half of the
job: the role dropdown names a role without saying what it grants, so choosing one
means going to a different screen. Show the Phase-1 summary line inline in the
picker.

---

## Sequencing note

Phases 1 and 2 are self-contained and deliver the whole "list, click to expand"
ask without touching the editor. Phase 3 is the larger piece. Phase 4 wants to
land alongside the C1 fix in the companion review.
