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
 * font system — **A4 portrait @ 150 DPI** (210×297mm = 8.268×11.693in). Uploaded
 * pages use whatever raster size the extractor produces at the same DPI, so
 * uploaded and generated issues share one coordinate space.
 *
 * THE ONE SOURCE OF TRUTH FOR SHEET SIZE. Everything that needs the canonical page
 * box imports these — the solver, the fixed templates (whose slot boxes are
 * FRACTIONS of the page, so they rescale for free), the PDF export's fallback sheet
 * (lib/pdf.ts), the viewer's fallback (apps/web BulletinViewer) and the worker's
 * import fallback. It used to be duplicated as literals in three of those places,
 * which is exactly how the PDF export once printed every page onto a Letter sheet.
 *
 * Existing pages are NOT migrated: a page carries its own width/height, the PDF
 * export takes the sheet from the page, and the viewer sizes each page from its own
 * box — so issues generated as Letter keep printing as Letter.
 *
 * 150 DPI is unchanged, so **pt = px × 0.48** and the type scale in roleScale.ts
 * still means the same physical sizes. A4 is 35px narrower and 104px taller than
 * the Letter box it replaces.
 */
export const PAGE_W = 1240;
export const PAGE_H = 1754;

/** The DPI those page pixels are measured at. Mirrored (as a comment, not a literal)
 *  by the PDF export and the viewer, and the basis of every pt↔px conversion. */
export const PAGE_DPI = 150;

// ── Source-file upload caps (enforced by the v2 issue-create route, Phase 1) ──
/** Max source PDF size accepted for import. */
export const MAX_SOURCE_BYTES = 150 * 1024 * 1024; // 150 MB

/**
 * What one OCR’d page is reckoned to cost, in USD.
 *
 * A READING, not a bill. It exists because the page caps are gone: a document is
 * now read to its last page, so a 900-page scan is real spend that nothing in the
 * product would otherwise mention. An estimate the user can see before and during a
 * read is what makes "no cap" a choice rather than a surprise.
 *
 * Env-overridable because the true rate belongs to the provider contract, not to
 * this file, and a number hardcoded here WILL drift away from it. Set to 0 to turn
 * the estimate off entirely.
 */
export const OCR_USD_PER_PAGE = Math.max(0, Number(process.env.MAGAZINE_V2_OCR_USD_PER_PAGE ?? 0.001));
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
