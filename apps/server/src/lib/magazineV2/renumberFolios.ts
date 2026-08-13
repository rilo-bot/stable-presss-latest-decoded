// ---------------------------------------------------------------------------
// Magazine Builder v2 — keep printed page numbers true after a reorder.
//
// The folio a generated page carries is a real, editable ELEMENT (see
// pageFurniture.ts for why it isn't renderer chrome), and its number was stamped
// at generation time. So the moment a page moves, is inserted, duplicated or
// deleted, every folio after that point is a lie. This is the repair, and it is
// deliberately the only one: both places that write a new page order call it, so
// neither can forget.
//
// It writes `elements` and NOTHING else — in particular not `rev` and not
// `updatedAt`. A reorder must not make an approved page read as "approved and then
// edited" (publishGate derives that from rev), and re-stamping a number is not an
// edit anyone made.
//
// Pages with no folio — everything generated before this existed, every imported
// page, every hand-built page — are left untouched, so no migration is needed.
// ---------------------------------------------------------------------------

import { db } from '../db.js';
import { COL } from './collections.js';
import type { MagazineElement } from './model.js';
import { restampFolio } from './pageFurniture.js';

/**
 * Re-number the folios of `orderedIds` to their 1-based positions in that array.
 * Returns how many pages were rewritten (0 when nothing needed it). Never throws
 * on a missing page — a concurrent delete just means one fewer page to fix.
 */
export async function renumberFolios(orderedIds: string[]): Promise<number> {
  if (orderedIds.length === 0) return 0;
  const docs = await db.collection(COL.pages).findByIds(orderedIds);
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  let changed = 0;
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const doc = byId.get(String(id));
    if (!doc || !Array.isArray(doc.elements)) continue;
    const next = restampFolio(doc.elements as MagazineElement[], i + 1);
    if (!next) continue;
    await db.collection(COL.pages).updateOne(id, { elements: next });
    changed += 1;
  }
  return changed;
}
