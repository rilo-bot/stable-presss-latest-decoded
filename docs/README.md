# Stable Press — Documentation

Generated from the 2026-07-23 full-project code review.

| Document | Contents |
|---|---|
| [PROJECT-OVERVIEW.md](./PROJECT-OVERVIEW.md) | What the app is, tech stack, architecture, feature surfaces, the data model (entities & relationships), and user journeys (signup/claim/org/staff, content publishing, magazine builder → bulletin, tipping, AI studios). |
| [REVIEW-FINDINGS.md](./REVIEW-FINDINGS.md) | The complete issues/bugs register — 4 Critical, 6 High, 13 Medium, 12 Low — each with `file:line`, a failure scenario, and a fix, plus a recommended fix order and a "verified correct" list. |
| [MAGAZINE-BUILDER-V2.md](./MAGAZINE-BUILDER-V2.md) | Design & phased build plan for the fresh AI-first magazine builder — free-form absolute-pixel elements + deterministic MuPDF extraction + worker/queue, adapted from the `../campaign-hq` reference app and fitted to stable-press (RBAC, frozen issues, existing sanitize/fonts/S3/puppeteer). Data model, per-element CRUD API, extraction/generation pipelines, AI surfaces, rendering/PDF chain, reliability strategy, UI/UX, and an 8-phase roadmap. |

See also the pre-existing [PLANNING.md](../PLANNING.md) and [RBAC.md](../RBAC.md) at the repo
root for the intended RBAC/entitlement design.
