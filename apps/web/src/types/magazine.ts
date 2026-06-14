/**
 * Stable Press — Magazine / Bulletin builder data model.
 *
 * A "magazine" is a fixed-layout, multi-page document (the NZTROF-style bulletin).
 * The LAYOUT of each page is locked (defined by a page-template component); only
 * the CONTENT of declared regions (text / image / qr) is editable.
 *
 * A page therefore stores no JSX — it stores a `pageType` key into the template
 * registry plus a flat `content` map of regionId -> value. The same template
 * component renders both the editor (editable) and the public viewer (read-only),
 * which guarantees the published issue is pixel-identical to the editor.
 */

// ── Page identity ───────────────────────────────────────────────────────────

/** One key per locked page layout in the registry (apps/web/src/editor/templates). */
export type PageTypeKey =
  | 'cover'
  | 'president-update'
  | 'editor-letter'
  | 'important-discussion'
  | 'headline-story'
  | 'young-owners'
  | 'women-in-racing'
  | 'regional-north'
  | 'regional-south'
  | 'owners-lounge'
  | 'karaka-sales'
  | 'celebration-wall'
  | 'future-together'
  | 'breeder-feature'
  | 'horse-welfare'
  | 'business-owners'
  | 'leaderboards'
  | 'gamification'
  | 'predictions'
  | 'predictions-followup'
  | 'ownership-education'
  | 'winning-moments'
  | 'owners-voice'
  | 'back-cover';

// ── Text styling ────────────────────────────────────────────────────────────

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface TextStyle {
  /** FontId key from the font registry; resolved to a CSS stack at render. */
  fontFamily: string;
  /** px — the design's exact size. */
  fontSize: number;
  /** 400 | 500 | 600 | 700 | 800 | 900 — block-level base weight. */
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  /** hex, e.g. "#0a2342". */
  color: string;
  align: TextAlign;
  /** unitless multiplier (preserves print leading). */
  lineHeight?: number;
  /** px. */
  letterSpacing?: number;
  /** px — optional uppercase tracking helpers handled in CSS, not here. */
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export type ImageFit = 'cover' | 'contain';

// ── Region content (discriminated union, keyed in a page's content map) ──────

export interface TextContent {
  kind: 'text';
  /** Sanitized inline HTML (may contain <b>/<i>/<u>/<span style="color|font">). */
  html: string;
  style: TextStyle;
}

export interface ImageContent {
  kind: 'image';
  /** An image key ("img-<hash>" → images table) OR a direct URL (e.g. Unsplash). */
  src: string;
  fit: ImageFit;
  /** 0..1 focal point for panning within a fixed frame (default 0.5/0.5). */
  focalX?: number;
  focalY?: number;
  alt?: string;
}

export interface QrContent {
  kind: 'qr';
  targetUrl: string;
  /** Foreground / background hex; default from the print design. */
  fg?: string;
  bg?: string;
}

export type RegionContent = TextContent | ImageContent | QrContent;
export type RegionKind = RegionContent['kind'];

/** Declarative description of an editable region inside a page template. */
export interface RegionDef {
  id: string;
  kind: RegionKind;
  label: string;
}

// ── Pages, magazines, issues ────────────────────────────────────────────────

export interface MagazinePage {
  id: string;
  pageType: PageTypeKey;
  /** Editor-facing name, e.g. "Cover" or "Regional Roundups — North". */
  label: string;
  /** 1-based print order. */
  number: number;
  /** Drives "publish selected pages". */
  selectedForPublish: boolean;
  /** regionId -> value. Seeded from the template's defaultContent on creation. */
  content: Record<string, RegionContent>;
}

export type MagazineStatus = 'draft' | 'published';

/** A user's role on a single magazine (server-persisted drafts are collaborative). */
export type MagazineRole = 'owner' | 'editor' | 'contributor';

/** A staff member granted access to a magazine, scoped to specific pages. */
export interface MagazineCollaborator {
  userId: string;
  email: string;
  displayName: string;
  /** editor = edit any page + manage; contributor = edit only `pageIds`. */
  role: 'editor' | 'contributor';
  /** Page ids this person may edit, or 'all'. */
  pageIds: string[] | 'all';
}

/** The editable working draft (server-persisted, collaborative). */
export interface Magazine {
  id: string;
  title: string;
  edition: string;
  /** Image key or URL used as the newsstand cover thumbnail. */
  coverImage: string;
  status: MagazineStatus;
  pages: MagazinePage[];
  createdAt: string;
  updatedAt: string;
  /** Back-links to issues spawned from this draft. */
  publishedIssueIds: string[];
  /** Creator — full control. */
  ownerId: string;
  ownerName?: string;
  collaborators: MagazineCollaborator[];
}

/** Lightweight studio list row from `GET /api/magazines`. */
export interface MagazineSummary {
  id: string;
  title: string;
  edition: string;
  coverImage: string;
  status: MagazineStatus;
  pageCount: number;
  ownerId: string;
  ownerName?: string;
  collaborators: MagazineCollaborator[];
  /** The caller's role on this magazine. */
  myRole: MagazineRole;
  updatedAt: string;
}

/** The caller's access to a loaded magazine (returned alongside the full doc). */
export interface MagazineAccess {
  role: MagazineRole;
  editablePageIds: string[] | 'all';
}

/** A staff member that can be picked as a collaborator (Share dialog dropdown). */
export interface StaffOption {
  userId: string;
  displayName: string;
  email: string;
  staffRoles: string[];
}

/**
 * A frozen, public-facing snapshot produced by publishing. Persisted server-side
 * (collection `issues`) so published bulletins are visible to every reader on any
 * device — not just the editor's browser. Every image is referenced by URL inside
 * the page content (S3 in deployment, inline data URL in local dev), so the issue
 * is fully self-contained and the public viewer needs no access to the draft store.
 */
export interface PublishedIssue {
  id: string;
  magazineId: string;
  title: string;
  edition: string;
  /** Cover image key/URL, preserved for re-publish fidelity. */
  coverImage: string;
  /** Resolved cover image URL (or data URL) for thumbnails — set at publish time. */
  coverImageUrl: string;
  /** Snapshot of ONLY the published pages (all, or the selected subset). */
  pages: MagazinePage[];
  scope: 'full' | 'selected';
  version: number;
  publishedAt: string;
  /** Soft-unpublish marker; non-null = hidden from the public list. */
  unpublishedAt: string | null;
}

/** Lightweight list row returned by `GET /api/issues` (omits the heavy `pages`). */
export interface IssueSummary {
  id: string;
  magazineId: string;
  title: string;
  edition: string;
  coverImageUrl: string;
  scope: 'full' | 'selected';
  version: number;
  publishedAt: string;
  unpublishedAt: string | null;
  pageCount: number;
}

/** Body POSTed to publish a new issue (server stamps id/version/timestamps). */
export interface PublishPayload {
  magazineId: string;
  title: string;
  edition: string;
  coverImage: string;
  coverImageUrl: string;
  pages: MagazinePage[];
  scope: 'full' | 'selected';
}

/** Deduplicated image payload. Pages/issues reference these by `key`. */
export interface ImageRef {
  key: string;
  kind: 'dataurl' | 'url';
  value: string;
  bytes: number;
  createdAt: string;
}
