# Magazine v2 — Editor UI Gaps

Five element/page fields the data model and (in most cases) the server and
renderer already support in full, with **no control in the Inspector** to set
them from the studio. Found reviewing every file in
`apps/web/src/editor-v2/` end to end. Each entry below was verified against
both the client and server code — not just "the Inspector doesn't show it" —
so the fix scope quoted is real, not a guess.

Nothing here is started yet. Ordered cheapest/highest-leverage first.

---

- [ ] **Wire up the `locked` toggle** — *S*
  This is the standout: `locked` is a **complete, server-enforced feature
  with zero entry point**. The server already blocks writes and deletes on a
  locked element (`isLockedAgainst`, `apps/server/src/routes/magazinesV2/index.ts:2441`,
  returning 403 "That element is locked. Unlock it first.", with an explicit
  `{locked:false}` escape hatch already honored). The client already handles
  that 403 correctly — reverts the optimistic edit and toasts
  (`apps/web/src/editor-v2/store.ts:594-601`). The only missing piece is a
  button. → Add a lock/unlock icon to the Inspector's **Arrange** section
  (`Inspector.tsx:460-468`, next to "To front"/"To back"):
  `onClick={() => set({ locked: !el.locked })}`. While locked, also disable
  drag/resize in `EditorCanvas.tsx` (currently `el.locked` is never even
  *read* there — a locked element would still drag locally via `updateLocal`
  before the server's commit gets rejected and reverted, a confusing
  round-trip the UI should just prevent up front).

- [ ] **Text `autoFit`: shrink vs. clip toggle** — *S*
  Real, load-bearing server behavior, not cosmetic: `layout.ts:221` only
  re-fits font size on save when `autoFit === 'shrink'`; `pageFurniture.ts:205`
  explicitly relies on `'clip'` to keep fixed-size furniture (page numbers,
  running heads) from ever being re-fit. A manually added text box can never
  be switched into `'clip'` mode to pin an exact size, nor back to `'shrink'`
  once set some other way. → A 2-option segmented control (Shrink to fit /
  Fixed size) in Inspector's **Size & weight** section
  (`Inspector.tsx:295-309`), same pattern as the existing Alignment control.

- [ ] **Custom icon upload** — *S–M*
  `icon.src` (a custom uploaded glyph, as opposed to a registry name) is a
  real field the Inspector already *explains* — "A custom uploaded icon is in
  use; pick a glyph above to replace it" (`Inspector.tsx:438`) — but never
  lets you *set*. Right now the only way in is upstream (AI/extraction); the
  only way out is picking a registry glyph, which clears it. → Mirror the
  Photo element's existing "Replace image" upload button
  (`Inspector.tsx:347-372`) in the Icon section: upload → set `icon.src`,
  clear `icon.name`.

- [ ] **Shape opacity** — *S*
  `shape.opacity` (the translucent-scrim field used for text-over-photo
  overlays) has no control anywhere. Note for whoever picks this up: it is
  **not** a data-loss bug — the server deep-merges `shape` one level
  (`writePipeline.ts:37-41`), so editing Fill color from the Inspector does
  *not* wipe an opacity a page already had. It is a pure gap: nothing lets a
  person dial in a scrim by hand. → An opacity slider/stepper (0–100%) in the
  Shape element's **Fill** section (`Inspector.tsx:394-398`), alongside the
  existing color control — `set({ shape: { ...el.shape, opacity: v } })`
  (spread the existing shape so the color survives, matching how the server
  already merges it).

- [ ] **Image focal point** — *M*
  Actually rendered when present — `IssuePageCanvas.tsx:126-127` sets
  `objectPosition` from `image.focalPoint` for a Cover-fit photo — so this
  one *works* end to end, it just can't be set by a person. Fit is Cover or
  Contain only; there's no way to say which part of a Cover-cropped photo
  stays in frame. → Needs real UI, not a stepper: a draggable crosshair over
  the image thumbnail in the **Replace image** section
  (`Inspector.tsx:347-372`), writing `{x,y}` as 0–1 fractions on drag-end.
  Worth doing as its own pass rather than bundled with the others above.

---

**Not on this list on purpose:** `text.role` and `image.alt` are also
uneditable from the Inspector, but that looked deliberate (role drives layout
semantics set at generation time; alt text has no visible UI need yet) rather
than an oversight — flagging here in case that reasoning turns out to be
wrong.