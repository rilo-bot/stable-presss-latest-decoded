// ---------------------------------------------------------------------------
// Magazine command executor — apply a planned batch, or leave nothing behind.
//
// ATOMICITY, HONESTLY. There is no MongoDB transaction here, and that is a
// deliberate constraint rather than an oversight: `lib/db.ts` never exposes the
// MongoClient, and every write in the app goes through a wrapper whose methods
// take no session — so using a real transaction would mean adding session-aware
// variants of the entire wrapper, on a live system with no staging environment.
//
// What we have instead is better than it sounds, because of how pages are stored:
//
//   1. Elements live INSIDE the page document, so all of a batch's edits to one
//      page are ONE `updateOneIf` — genuinely atomic, and guarded by the same
//      page-rev CAS the element PATCH route already uses.
//   2. Everything detectable from state is rejected during planning, with zero
//      writes performed (see plan.ts).
//   3. The batch, including a snapshot inverse per page, is RECORDED before the
//      first write. So a partial apply is always recoverable, by us or by hand.
//   4. If a write fails part way through a multi-page batch, the pages already
//      written are reverted from their snapshots — a compensating rollback.
//
// The residual gap, stated plainly: if this process dies BETWEEN two page writes,
// the batch stays partially applied until something replays the record from (3).
// That is the point at which real transactions become worth the wrapper surgery.
// Single page batches — the overwhelming majority — have no such gap at all.
// ---------------------------------------------------------------------------

import type { AppliedPage, BatchResult, CommandBatch, MagazineElement, PageBackground } from '@rilo/schema';
import type { PlannedPage } from './plan.js';

/** One conditional page write. Returns false ONLY on a rev conflict. */
export interface PageWrite {
  pageId: string;
  expectedRev: number;
  elements: MagazineElement[];
  background?: PageBackground;
}

/**
 * Everything the executor needs from the outside world.
 *
 * A port, not a direct `db` call, so the whole flow — including the rollback path,
 * which is the part that must never be wrong and is almost impossible to trigger
 * against a real database — is unit-testable with a fake that fails on demand.
 */
export interface CommandStore {
  /** Conditional write. `false` = the rev moved, nobody else's data was touched. */
  writePage(write: PageWrite): Promise<boolean>;
  /** Persist the batch + its inverses BEFORE applying. Returns the batch id. */
  recordBatch(record: BatchRecord): Promise<string>;
  /** Stamp how it went. Never throws — a failed stamp must not fail the batch. */
  finishBatch(batchId: string, outcome: BatchOutcome): Promise<void>;
}

export interface BatchRecord {
  magazineId: string;
  label: string;
  origin: CommandBatch['origin'];
  /** Who ran it, for the audit trail. */
  actorId: string;
  commandCount: number;
  /** The undo payload: each touched page as it was, with the rev to check. */
  inverse: Array<{
    pageId: string;
    /** The rev the page will be at AFTER this batch — what undo must still find. */
    revAfter: number;
    elements: MagazineElement[];
    background: PageBackground;
  }>;
  createdAt: string;
}

export interface BatchOutcome {
  status: 'applied' | 'conflict' | 'rolled-back' | 'rollback-failed';
  applied: AppliedPage[];
  detail?: string;
  finishedAt: string;
}

export interface ExecuteDeps {
  store: CommandStore;
  /** Injected so this module stays free of clock reads (and stays testable). */
  now: () => string;
}

/**
 * Apply a planned batch.
 *
 * Never throws for an expected failure — a conflict, or a rollback — because the
 * caller has to report those to a user, not to a stack trace. A store that throws
 * is treated as a failed write and triggers the same compensation path.
 */
export async function executeBatch(
  plan: PlannedPage[],
  meta: { magazineId: string; label: string; origin: CommandBatch['origin']; actorId: string; commandCount: number },
  deps: ExecuteDeps,
): Promise<BatchResult> {
  const { store, now } = deps;

  const batchId = await store.recordBatch({
    magazineId: meta.magazineId,
    label: meta.label,
    origin: meta.origin,
    actorId: meta.actorId,
    commandCount: meta.commandCount,
    inverse: plan.map((p) => ({
      pageId: p.pageId,
      revAfter: p.revBefore + 1,
      elements: p.before.elements,
      background: p.before.background,
    })),
    createdAt: now(),
  });

  const applied: AppliedPage[] = [];

  for (const page of plan) {
    let ok = false;
    let thrown: unknown = null;
    try {
      ok = await store.writePage({
        pageId: page.pageId,
        expectedRev: page.revBefore,
        elements: page.elements,
        ...(page.background !== undefined ? { background: page.background } : {}),
      });
    } catch (err) {
      thrown = err;
    }

    if (ok) {
      applied.push({
        pageId: page.pageId,
        revBefore: page.revBefore,
        revAfter: page.revBefore + 1,
        commands: page.commands,
      });
      continue;
    }

    // ── This page did not take. Undo the ones that did. ──
    const detail = thrown
      ? `Page ${page.pageId} failed to write: ${thrown instanceof Error ? thrown.message : String(thrown)}`
      : `Page ${page.pageId} changed while this batch was being applied.`;

    if (applied.length === 0) {
      // Nothing was written, so there is nothing to undo. The cleanest failure.
      const outcome: BatchOutcome = { status: 'conflict', applied: [], detail, finishedAt: now() };
      await safeFinish(store, batchId, outcome);
      return { ok: false, batchId, label: meta.label, applied: [], failure: { reason: 'conflict', detail } };
    }

    const reverted = await rollback(plan, applied, store);
    const outcome: BatchOutcome = {
      status: reverted ? 'rolled-back' : 'rollback-failed',
      applied,
      detail: reverted
        ? detail
        : `${detail} — AND the revert failed, so this magazine is partially changed. Batch ${batchId} holds the original pages.`,
      finishedAt: now(),
    };
    await safeFinish(store, batchId, outcome);
    return {
      ok: false,
      batchId,
      label: meta.label,
      applied,
      failure: { reason: 'conflict', detail: outcome.detail! },
      rolledBack: reverted,
    };
  }

  await safeFinish(store, batchId, { status: 'applied', applied, detail: undefined, finishedAt: now() });
  return { ok: true, batchId, label: meta.label, applied };
}

/**
 * Put the already-written pages back.
 *
 * Reverting a page we just wrote at `revBefore + 1` means writing the snapshot
 * conditional on that rev — so if something else has since touched the page we
 * stop rather than overwrite a third party's edit. Newest-first, so a partially
 * reverted batch leaves the earliest pages consistent.
 *
 * Returns true only if EVERY page went back.
 */
async function rollback(plan: PlannedPage[], applied: AppliedPage[], store: CommandStore): Promise<boolean> {
  const byId = new Map(plan.map((p) => [p.pageId, p]));
  let allBack = true;
  for (const done of [...applied].reverse()) {
    const page = byId.get(done.pageId);
    if (!page) {
      allBack = false;
      continue;
    }
    try {
      const ok = await store.writePage({
        pageId: page.pageId,
        expectedRev: done.revAfter,
        elements: page.before.elements,
        background: page.before.background,
      });
      if (!ok) allBack = false;
    } catch {
      allBack = false;
    }
  }
  return allBack;
}

/** Recording the outcome is bookkeeping; it must never mask the real result. */
async function safeFinish(store: CommandStore, batchId: string, outcome: BatchOutcome): Promise<void> {
  try {
    await store.finishBatch(batchId, outcome);
  } catch (err) {
    console.warn('[magazineV2] could not stamp batch outcome:', err instanceof Error ? err.message : err);
  }
}
