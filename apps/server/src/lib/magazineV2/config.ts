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
 *  (LibreOffice headless) before extraction — see apps/worker/src/lib/docx.ts.
 *  A JPEG/PNG imports as a single pixel-faithful page (no MuPDF pass). */
export const ALLOWED_SOURCE_MIME = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'image/jpeg',
  'image/png',
]);

/** Map an accepted source mime to the S3 key extension we store it under, so the
 *  worker can tell PDF / DOCX / image apart from the key alone (a robust fallback
 *  to the S3 content-type). Anything unexpected falls back to 'pdf'. */
export function sourceExtForMime(mime: string): 'pdf' | 'docx' | 'jpg' | 'png' {
  switch (mime) {
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    default:
      return 'pdf';
  }
}
/** Hard ceiling on pages digitised/generated per issue. */
export const MAX_PAGES_PER_ISSUE = 120;

// ── AI attachment caps (enforced server-side by v2 agent routes — closes M5) ──
export const MAX_AI_ATTACHMENTS = 5;
export const MAX_AI_ATTACHMENT_CHARS = 12_000_000; // ~12 MB data-URL per file
