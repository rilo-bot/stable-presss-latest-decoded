/**
 * Stable Press — published bulletin (magazine) types.
 *
 * A BULLETIN IS A MAGAZINE. `/bulletins` is the public newsstand, `/bulletins/:id`
 * is the reader, and both render frozen snapshots produced by the Magazine
 * Builder. This file describes only that public, frozen side; the editable draft
 * model lives with the builder (`@/editor-v2/model`).
 *
 * ── What used to be here ────────────────────────────────────────────────────
 * Most of this file described the v1 TEMPLATE builder: a `PageTypeKey` union of 48
 * locked page layouts, `MagazinePage` with its `regionId → RegionContent` map, the
 * four region kinds (`TextContent`/`ImageContent`/`QrContent`/`IconContent`),
 * `TextStyle`, `RegionDef`, `Magazine`, `MagazineSummary`, `MagazineAccess`,
 * `MagazineCollaborator`, `PublishPayload` and `ImageRef`. That builder is gone.
 *
 * `PublishedIssue.pages` was typed `MagazinePage[]` while ACTUALLY holding one of
 * two incompatible shapes, chosen by a `builder: 'v1' | 'v2'` discriminator — v1
 * template pages, or the builder's free-form element pages. The type said one
 * thing and the data was frequently the other, so every reader had to check
 * `builder` by convention and cast around it. With one builder left there is one
 * shape, and the compiler can finally be told the truth.
 */

import type { IssuePageData } from '@/editor-v2/model';

/**
 * A frozen, public-facing snapshot produced by publishing a magazine.
 *
 * Persisted server-side (collection `issues`) so a published bulletin is readable
 * by anyone on any device. Every image is referenced by URL inside the element
 * payload, so a snapshot is fully self-contained — the reader never touches the
 * draft. Written only by `POST /api/magazinesV2/issues/:id/publish`; `/api/issues`
 * is read-only.
 */
export interface PublishedIssue {
  id: string;
  /** The draft this was frozen from (`magazinesV2`). */
  magazineIdV2?: string;
  title: string;
  edition: string;
  /** Cover image URL, preserved for re-publish fidelity. */
  coverImage: string;
  /** Resolved cover URL for the newsstand thumbnail — set at publish time. */
  coverImageUrl: string;
  /** Snapshot of the published pages (all of them, or the selected subset). */
  pages: IssuePageData[];
  scope: 'full' | 'selected';
  /** Bumped on every republish. Also the PDF cache key, so a republish invalidates it. */
  version: number;
  publishedAt: string;
  /** Soft-unpublish marker; non-null = hidden from the public newsstand. */
  unpublishedAt: string | null;
}

/** Lightweight list row from `GET /api/issues` — omits the heavy `pages`. */
export interface IssueSummary {
  id: string;
  magazineIdV2?: string;
  title: string;
  edition: string;
  coverImageUrl: string;
  scope: 'full' | 'selected';
  version: number;
  publishedAt: string;
  unpublishedAt: string | null;
  pageCount: number;
}
