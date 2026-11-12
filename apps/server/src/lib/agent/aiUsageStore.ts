// ---------------------------------------------------------------------------
// Mongo sink for the AI usage meter (aiUsage.ts) — collection `aiUsage`.
//
// One document per model call. Installed at boot by the API (src/index.ts) and
// the worker (apps/worker/src/index.ts), so generation jobs are metered too.
// Read by the Campaign Engine "AI Activity" page (routes/aiActivity).
// ---------------------------------------------------------------------------

import { db } from '../db.js'
import { AI_USAGE } from '../collections.js'
import { setAiUsageSink } from './aiUsage.js'

let installed = false

/** Send every AI usage record to the `aiUsage` collection. Idempotent. */
export function installAiUsageStore(): void {
  if (installed) return
  installed = true
  setAiUsageSink(async (record) => {
    await db.collection(AI_USAGE).insertOne({ ...record, deletedAt: null })
  })
}
