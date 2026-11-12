// ---------------------------------------------------------------------------
// AI usage attribution for worker jobs — the job-side twin of the API's
// aiSurface middleware (apps/server/src/lib/agent/aiUsageRoute.ts).
//
// Every model call a magazine job makes (planner, copy, layout, document OCR,
// import labelling…) is metered by the provider wrapper; this wraps the HANDLER
// in withAiUsage so those records carry the Magazine Builder surface, the
// magazine, the person who asked for it and the job id as the session — what
// the Campaign Engine "AI Activity" page groups a generation run by.
//
// The payloads carry no user, so the requester is read off the magazine (its
// owner) or, for a document read, the document's uploader. One cheap findById;
// any failure just leaves the record without a user — it never fails the job.
// ---------------------------------------------------------------------------

import { db } from '../../server/src/lib/db.js';
import { COL } from '../../server/src/lib/magazineV2/collections.js';
import { withAiUsage, type AiUsageContext } from '../../server/src/lib/agent/aiUsage.js';
import type { JobHandler } from './queue.js';

/** A step label for calls whose model carries none (the magazine roles label themselves). */
const FEATURE_BY_JOB: Record<string, string> = {
  generateIssue: 'generate-issue',
  generatePages: 'generate-pages',
  readSourceDoc: 'document-read',
  processIssue: 'import',
  processPage: 'import',
  copyDocumentPage: 'import',
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

async function attributionFor(type: string, payload: unknown, jobId: string): Promise<AiUsageContext> {
  const p = (payload ?? {}) as { issueId?: unknown; docId?: unknown };
  const base: AiUsageContext = {
    surface: 'magazine-builder',
    feature: FEATURE_BY_JOB[type],
    sessionId: jobId,
  };
  try {
    const issueId = str(p.issueId);
    if (issueId) {
      const issue = await db.collection(COL.magazines).findById(issueId);
      return { ...base, entityType: 'magazine', entityId: issueId, userId: str(issue?.ownerId) };
    }
    const docId = str(p.docId);
    if (docId) {
      const doc = await db.collection(COL.sourceDocs).findById(docId);
      const magazineId = str(doc?.magazineId);
      return {
        ...base,
        ...(magazineId ? { entityType: 'magazine', entityId: magazineId } : {}),
        userId: str(doc?.ownerId),
      };
    }
  } catch (err) {
    console.warn('[worker] AI usage attribution lookup failed (job continues):', err instanceof Error ? err.message : err);
  }
  return base;
}

/** `handler`, with every model call it makes attributed to the Magazine Builder. */
export function meteredJob(type: string, handler: JobHandler): JobHandler {
  return async (payload, ctx) => {
    const usage = await attributionFor(type, payload, ctx.jobId);
    return withAiUsage(usage, () => handler(payload, ctx));
  };
}
