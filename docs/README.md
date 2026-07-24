# Stable Press — Documentation

Started from the 2026-07-23 full-project code review; kept current as later
reviews are added.

| Document | Contents |
|---|---|
| [PROJECT-OVERVIEW.md](./PROJECT-OVERVIEW.md) | What the app is, tech stack, architecture, feature surfaces, the data model (entities & relationships), and user journeys (signup/claim/org/staff, content publishing, magazine builder → bulletin, tipping, AI studios). |
| [REVIEW-FINDINGS.md](./REVIEW-FINDINGS.md) | The complete issues/bugs register — 4 Critical, 6 High, 13 Medium, 12 Low — each with `file:line`, a failure scenario, and a fix, plus a recommended fix order and a "verified correct" list. |
| [MAGAZINE-BUILDER-V2.md](./MAGAZINE-BUILDER-V2.md) | Design & phased build plan for the fresh AI-first magazine builder — free-form absolute-pixel elements + deterministic MuPDF extraction + worker/queue, adapted from the `../campaign-hq` reference app and fitted to stable-press (RBAC, frozen issues, existing sanitize/fonts/S3/puppeteer). Data model, per-element CRUD API, extraction/generation pipelines, AI surfaces, rendering/PDF chain, reliability strategy, UI/UX, and an 8-phase roadmap. |
| [MAGAZINE-V2-SCALABILITY-REVIEW.md](./MAGAZINE-V2-SCALABILITY-REVIEW.md) | 2026-07-24 scalability + codebase review of Magazine v2 (pipeline, API/data-model, worker/queue, editor). Verdict: correct + single-instance-ready, **not** horizontally scalable. Scorecard (overall Scalability C−, Code B−), the 5 cross-cutting risks (zero indexes, dead retry path, single-process ceiling, materialize-everything, unbounded loops), per-area detail, and a P0→P3 roadmap. Claims verified against source. |
| [MAGAZINE-V2-FIXES-CHECKLIST.md](./MAGAZINE-V2-FIXES-CHECKLIST.md) | Actionable, trackable P0→P3 fix checklist derived from the scalability review — each item with file refs, rationale, and effort estimate. Nothing started yet. |
| [TEMPLATE-BUILDER-V2-REVIEW.md](./TEMPLATE-BUILDER-V2-REVIEW.md) | 2026-07-24 multi-agent review of the v2 template builder — core sound, 28 findings (5 High / 8 Medium / 15 Low). |
| [FAKE-DATA-REMOVED.md](./FAKE-DATA-REMOVED.md) | 2026-07-24 fake-data audit + remediation. Server/worker clean; app-chrome fabrications (follower counts, subscriber/issue stats, fake /news articles, "Vol. 47", placeholder ABN, hardcoded template count) removed with what-to-display-instead notes. Magazine templates left as-is (known item). |

See also the pre-existing [PLANNING.md](../PLANNING.md) and [RBAC.md](../RBAC.md) at the repo
root for the intended RBAC/entitlement design.
