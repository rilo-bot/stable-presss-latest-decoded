// ---------------------------------------------------------------------------
// Magazine Builder v2 — configuration, feature flag, and canonical constants.
//
// v2 is a fresh, layout-as-data builder (free-form absolute-pixel elements +
// deterministic extraction) that ships ALONGSIDE the existing v1 template
// builder. Everything v2 is gated behind MAGAZINE_V2 so v1 is untouched until
// v2 is proven. See docs/MAGAZINE-BUILDER-V2.md.
// ---------------------------------------------------------------------------

/** Master switch. When false (default), no v2 route/behaviour is exposed. */
export const MAGAZINE_V2_ENABLED = process.env.MAGAZINE_V2 === 'true';

/**
 * Canonical page dimensions for generated / blank pages and the coordinate +
 * font system (US Letter portrait @ 150 DPI). Uploaded pages use whatever raster
 * size the extractor produces at the same DPI, so uploaded and generated issues
 * share one coordinate space.
 */
export const PAGE_W = 1275;
export const PAGE_H = 1650;

// ── Source-file upload caps (enforced by the v2 issue-create route, Phase 1) ──
/** Max source PDF size accepted for import. */
export const MAX_SOURCE_BYTES = 150 * 1024 * 1024; // 150 MB
/** Accepted source mime types. DOCX is converted to PDF by the worker
 *  (LibreOffice headless) before extraction — see apps/worker/src/lib/docx.ts. */
export const ALLOWED_SOURCE_MIME = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]);
/** Hard ceiling on pages digitised/generated per issue. */
export const MAX_PAGES_PER_ISSUE = 120;

// ── Media-image upload caps (cover images, inspector uploads) ────────────────
/** Max size for a directly-uploaded image (cover / media library). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
/** Accepted image mime types for direct uploads. */
export const ALLOWED_IMAGE_MIME = new Set<string>(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
/** Map an accepted image mime to a file extension. */
export function imageExtFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}

// ── AI attachment caps (enforced server-side by v2 agent routes — closes M5) ──
export const MAX_AI_ATTACHMENTS = 5;
export const MAX_AI_ATTACHMENT_CHARS = 12_000_000; // ~12 MB data-URL per file
