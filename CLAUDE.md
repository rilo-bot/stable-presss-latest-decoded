# Magazine Builder

A rebuild of the magazine editor. The existing platform — auth, RBAC, worker, storage,
database — is **not** being replaced. Only the editor and its data model.

## Read before writing any code

| Document | What it is |
|---|---|
| `implmentations/RULES.md` | Engineering rules. Binding. |
| `implmentations/RULES-AMENDMENT-1.md` | What changed in RULES after the repo survey. |
| `implmentations/FOUNDATION-v0.2.md` | Architecture and lane boundaries. Supersedes `FOUNDATION.md`. |
| `implmentations/FOUNDATION-v0.2-AMENDMENT-2.md` | Yjs removed; plain JSON + Immer. Wins where it conflicts. |
| `REPO-SURVEY.md` | What already exists in this repository. |
| `docs/magazine/Magazine-Builder-Requirements-v2.0.pdf` | The product requirements. Requirement IDs come from here. |
| `BLOCKERS.md` | Open decisions and reported blockers. Check before starting a requirement. |
| `implmentations/QA-LOG.md` | Defects found in code already written, with proof. Check before extending a package. |

`implmentations/FOUNDATION.md` (v0.1) is superseded in full. Do not follow it.

> **Note:** `FOUNDATION-v0.2-AMENDMENT-2.md` cites a `FOUNDATION-v0.2-AMENDMENT-1.md`
> that is not in the repository. Its items 2–8 are described as still binding. Until it
> is supplied, treat that gap as open — see BLOCKERS.md.

## The boundary

New code lives under `magazine-builder` paths only:

```
packages/mb-*
apps/web/src/magazine-builder/**
apps/server/src/routes/magazineBuilder/**
apps/server/src/lib/magazineBuilder/**
apps/worker/src/jobs/publishMagazine.ts
```

**Never open these.** The existing builder keeps working until cutover:

```
apps/web/src/editor-v2/**
apps/server/src/routes/magazinesV2/**
apps/server/src/lib/magazineV2/**
apps/server/tests/magazineV2/**
apps/worker/src/jobs/processIssue.ts
apps/worker/src/jobs/processPage.ts
```

Collections `magazinesV2`, `magazinePagesV2`, `mediaAssetsV2`, `magazineChatV2`,
`magazineThreadsV2`, `magazineReviewsV2`, `issues`; routes `/api/magazinesV2`,
`/production-system/magazine-v2`, `/bulletins/:id`; and the `MAGAZINE_V2` flag are all
off limits.

**Reused read-only** — import, never modify: `lib/auth.ts` (`attachAccount`),
`lib/rbac.ts`, `lib/db.ts`, `lib/storage.ts`, `lib/ensureIndexes.ts`, the worker queue,
and the Pexels integration.

### Files that may be edited, additively only

Six files must gain a line to mount the new work. Add; never change an existing line.

```
apps/server/src/routes/index.ts        mount the router
apps/web/src/App.tsx                   add the studio and reader routes
apps/worker/src/index.ts               register the publish handler
apps/server/src/lib/ensureIndexes.ts   append index specs
package.json                           root scripts
apps/web/tailwind.config.js            only if new tokens are needed
```

The publish job's payload type goes in `lib/magazineBuilder/jobs.ts`, **not** in the
existing `lib/magazineV2/jobs.ts`.

## Conventions

- Feature flag `MAGAZINE_BUILDER=true`. With it off, every new route 404s.
- Coordinates are pixels in page-canonical space (A4 @ 150 DPI = 1240 × 1754).
- Nothing mutates a magazine except through a command (FWD-01).
- Commands must be mergeable: identify entities, never array positions.
- Strict TypeScript and the lint rules apply to **new code only**. When editing an
  existing file, follow its local conventions — do not reformat it.

## When you are blocked

Append to `BLOCKERS.md`, stop that requirement, and move to the next one in your lane.
Do not work around a problem in shared code. A workaround looks like working code, passes
review, and encodes a wrong assumption three other lanes then build on.
