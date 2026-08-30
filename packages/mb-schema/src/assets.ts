// ---------------------------------------------------------------------------
// Assets — references to binaries. The bytes live in S3, never in the document.
// ---------------------------------------------------------------------------

import type { Id, Px } from './primitives.js';

/** Where a photo came from. Pexels is the library behind IMG-02. */
export type AssetSource = 'upload' | 'pexels';

export interface AssetRef {
  id: Id;
  /** SHA-256 of the original. Also the S3 key stem, so identical uploads dedupe. */
  hash: string;
  source: AssetSource;
  mimeType: string;
  /**
   * The photo's own size in pixels.
   *
   * Needed by IMG-03 to place a new photo at a sensible size, and by IMG-11 to
   * decide whether it will look poor at the size it has been given.
   */
  intrinsic: { w: Px; h: Px };
  originalFilename: string;
  /** Attribution. Required by the Pexels licence; null for uploads. */
  credit: string | null;
  /** The S3 key of the original. Derivatives are named from it. */
  storageKey: string;
}
