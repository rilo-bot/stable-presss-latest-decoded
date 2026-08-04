/**
 * Uploaded source documents, analysed server-side into a compact digest.
 *
 * Split out of the old `editor/agent/types.ts` when the v1 template magazine
 * builder was removed. These three types are the ONLY part of that file that
 * outlived it: the Magazine Builder v2 composer uploads a brief, a PDF or a
 * photo, `/api/agent/editor/ingest` reads it once and returns this shape, and the
 * generator places from the digest rather than re-reading the file per page.
 *
 * Everything else in that file described v1's named-region edit model (CtxRegion,
 * StagedEdit, UndoEntry, EditPayload…) and went with it.
 */

export interface DocDigest {
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  facts: string[];
  tables?: { caption?: string; rows: string[][] }[];
  /** Icons/symbols seen in the source: a nearby label + best-guess Lucide name. */
  icons?: { label: string; name: string }[];
}

export interface DocAttachment {
  id: string;
  name: string;
  kind: 'pdf' | 'image' | 'text';
  digest: DocDigest;
  /** Verbatim extracted text for the bulk compose/fill pass (empty for vision-only docs). */
  fullText: string;
  /**
   * For uploaded IMAGES: the persisted (S3 or data-URL fallback) URL of the image
   * itself, so it can be PLACED into a page rather than only described.
   */
  uploadedUrl?: string;
}

/** Digest-only attachment shape — omits the heavy verbatim text. */
export type CtxAttachment = Omit<DocAttachment, 'fullText'>;
