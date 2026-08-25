# `@rilo/schema`

One definition of the magazine document model, shared by `apps/server`, `apps/web` and
`apps/worker`.

## Why this exists

The element model used to be declared **twice** — once in
`apps/server/src/lib/magazineV2/model.ts` and again, hand-copied, in
`apps/web/src/editor-v2/model.ts`, whose header asked future editors to "change this
too". They drifted, and nothing caught it:

| Field | Server had | Web had |
| --- | --- | --- |
| `ElementTextAlign` | `left · center · right · justify` | `justify` **missing** |
| `ElementTextTransform` | the whole type | **absent** |
| `ElementTextData.letterSpacing` | yes | **absent** |
| `ElementTextData.textTransform` | yes | **absent** |
| `ElementTextData.minFontSize` | yes | **absent** |
| `fontWeight` | `400…900` | `900` **missing** |

Two of those were live rendering bugs, not just type lies: the generator writes
`letterSpacing` and `textTransform: 'uppercase'` onto text elements
(`composeFromSolved.ts`), and the web renderer — which draws the editor, the public
bulletin **and** the PDF — never read either. Every tracked all-caps kicker the art
director designed was rendering as plain sentence case.

A drift bug is not a mistake anyone made; it is the predictable outcome of two copies.
So there is one copy now.

## Why types-only

This package contains **no runtime code** — only `.d.ts` declarations. That is a
deliberate constraint, because it makes the package free to consume:

- Every import erases at compile time, so there is **no build step**, no `dist`, and
  nothing to sequence in the build.
- No workspace symlink or `npm install` is required to resolve it — TypeScript `paths`
  in each app's tsconfig is enough.
- No Vite alias, and no CommonJS/ESM/NodeNext friction, even though the three apps use
  three different module settings.

Consumers **must** import with `import type` so the erasure is guaranteed (the web app
has `isolatedModules: true`, which enforces this anyway).

## Wiring

Each app maps the specifier in its own tsconfig:

```jsonc
"baseUrl": ".",
"paths": { "@rilo/schema": ["../../packages/schema/types/index.d.ts"] }
```

## Runtime validation stays in the server

`apps/server/src/lib/magazineV2/model.ts` remains the authority that coerces and
validates on every write. It cannot move here: it depends on `sanitize.ts`
(`isomorphic-dompurify`) and the icon registry, which would give this package
dependencies and a runtime.

What it does now is import its union types from here and prove, at compile time, that
its runtime arrays cover every member — see the `Exhaustive` assertions in that file.
Add a role to a union here without adding it to the array there and the server stops
compiling.

## Adding a field

1. Add it here.
2. Handle it in the server's validator (`model.ts`) so writes accept it.
3. **Apply it in `apps/web/src/editor-v2/IssuePageCanvas.tsx`** or it will not render —
   in the editor, the viewer, or the PDF. This is the step that was missed before.
