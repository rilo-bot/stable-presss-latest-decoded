// ---------------------------------------------------------------------------
// Magazine Builder v2 — where a magazine's DOCUMENTS are, whichever store holds
// them.
//
// There are two, and which one a PDF is in depends only on how it arrived:
//
//   sourceDocs    uploaded on the way into a new magazine. Read in the worker,
//                 chunked for retrieval, page-counted, coverage tracked.
//   media (doc)   attached in the studio chat. Stored, listed in Uploads, and
//                 carrying whatever text the browser extracted at the time.
//
// That split is an accident of the two features growing separately, not a
// distinction anybody using the product makes — they attached a PDF either way.
// So any feature phrased in terms of "the user's document" has to look in both, and
// a feature that looks in one is silently broken for half the ways of getting a
// document here. This is that lookup, in one place, so it cannot be half-right in
// two.
//
// THE MAGAZINE IS THE ALLOW-LIST. Every caller passes a docId that came from
// outside — a request body, or a model's tool call — and the scope check here is
// what stops it being a way to read any document in the system.
// ---------------------------------------------------------------------------

import { db } from '../db.js';
import { COL } from './collections.js';
import { getSourceDoc } from './sourceDocsDb.js';

/** One document, reduced to what a consumer needs: what it is called, where its
 *  bytes are, and what kind of file it is. */
export interface MagazineDocument {
  docId: string;
  name: string;
  s3Key: string;
  contentType: string;
  /** Pages, when something has counted them. 0 means unknown — a chat attachment
   *  was never read page by page — and never "empty". */
  pages: number;
}

function isPdf(contentType: string): boolean {
  return contentType === 'application/pdf';
}

/** True when this document has a page design that can be copied. Only a PDF does:
 *  a Word or text file is a stream of words with no page in it. */
export function canCopyLayout(doc: MagazineDocument): boolean {
  return isPdf(doc.contentType);
}

/**
 * One document of this magazine, by id, from either store — or null when the id
 * names nothing this magazine holds.
 *
 * Source documents are checked first: when a file is in both (attaching one still
 * writes to both), that is the copy that knows its own page count.
 */
export async function magazineDocument(magazineId: string, docId: string): Promise<MagazineDocument | null> {
  const source = await getSourceDoc(docId);
  if (source && !source.deletedAt && String(source.magazineId) === String(magazineId)) {
    return {
      docId: String(source._id),
      name: source.originalName,
      s3Key: source.s3Key,
      contentType: source.contentType,
      pages: Number(source.coverage?.pagesTotal) || 0,
    };
  }
  const asset = (await db.collection(COL.media).findById(String(docId))) as {
    _id: string;
    magazineId?: string;
    kind?: string;
    key?: string;
    originalName?: string;
    alt?: string;
    contentType?: string;
  } | null;
  if (asset && asset.kind === 'doc' && String(asset.magazineId) === String(magazineId) && asset.key) {
    return {
      docId: String(asset._id),
      name: String(asset.originalName ?? asset.alt ?? 'document'),
      s3Key: String(asset.key),
      contentType: String(asset.contentType ?? ''),
      pages: 0,
    };
  }
  return null;
}
