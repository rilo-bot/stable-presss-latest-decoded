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
//
// The contents page's entry numbers ("04 — Bloodlines") go stale the same way and
// are repaired here too — syncContentsNumbers, called right after renumberFolios.
// ---------------------------------------------------------------------------

import { db } from '../db.js';
import { COL } from './collections.js';
import type { MagazineElement } from './model.js';
import { restampFolio } from './pageFurniture.js';
import { syncContentsPage, type ContentsSyncPage } from './contentsSync.js';

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

/**
 * The CONTENTS page is the other place a page number prints: "04 — Bloodlines" must
 * follow Bloodlines when it moves, exactly as its folio does. Run right after
 * renumberFolios, wherever that runs (the pages route's writeOrder, and "add pages"),
 * so the pages are read with their folios already re-stamped. See contentsSync.ts for
 * how an entry is matched to its page — only the digits of a confidently matched
 * entry's number ever change.
 *
 * Like the folio repair it writes `elements` only — not `rev`, not `updatedAt` — but
 * unlike it, it is a compare-and-set on the `rev` it read: a user editing the contents
 * page right now wins, and the numbers wait for the next structural change.
 *
 * `previousIds` is the order BEFORE the change (it lets an entry keep its page when two
 * pages share a headline, and recognise a page that was deleted); `kinds` names the
 * kinds the caller knows (the pages "add pages" just made). Both optional.
 *
 * NEVER THROWS — a structural op must not fail because the contents could not be
 * synced. Returns how many pages were rewritten.
 */
export async function syncContentsNumbers(
  orderedIds: string[],
  opts: { previousIds?: string[]; kinds?: Record<string, string> } = {},
): Promise<number> {
  try {
    if (orderedIds.length < 2) return 0;
    const docs = await db.collection(COL.pages).findByIds(orderedIds);
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const previous = (opts.previousIds ?? []).map(String);
    const prevNo = new Map(previous.map((id, i) => [id, i + 1]));
    const live = new Set(orderedIds.map(String));
    const removedPageNos = previous.flatMap((id, i) => (live.has(id) ? [] : [i + 1]));
    const pages: ContentsSyncPage[] = orderedIds.map((raw) => {
      const id = String(raw);
      const doc = byId.get(id);
      const kind = opts.kinds?.[id];
      const prev = prevNo.get(id);
      return {
        id,
        elements: doc && Array.isArray(doc.elements) ? (doc.elements as MagazineElement[]) : [],
        ...(kind ? { kind } : {}),
        ...(prev ? { prevPageNo: prev } : {}),
      };
    });
    const result = syncContentsPage(pages, { removedPageNos });
    let written = 0;
    for (const u of result.updates) {
      const id = orderedIds[u.pageIdx]!;
      const doc = byId.get(String(id));
      if (!doc) continue;
      const ok =
        typeof doc.rev === 'number'
          ? await db.collection(COL.pages).updateOneIf(id, { rev: doc.rev }, { elements: u.elements })
          : await db.collection(COL.pages).updateOne(id, { elements: u.elements });
      if (!ok) {
        console.log(`[magazineV2] contents: page ${u.pageIdx + 1} changed meanwhile — left as the user has it.`);
        continue;
      }
      written += 1;
      for (const c of u.changes) {
        console.log(`[magazineV2] contents: page ${u.pageIdx + 1} "${c.title.slice(0, 60)}" ${c.fromNo} → ${c.toNo}`);
      }
    }
    for (const s of result.skipped.slice(0, 20)) {
      console.log(`[magazineV2] contents: page ${s.pageIdx + 1} left "${s.title.slice(0, 60)}" as is — ${s.why}`);
    }
    return written;
  } catch (err) {
    console.warn('[magazineV2] contents sync failed (contents left as they were):', err instanceof Error ? err.message : err);
    return 0;
  }
}
