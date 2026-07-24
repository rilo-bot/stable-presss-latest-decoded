// ---------------------------------------------------------------------------
// Magazine Builder v2 — whole-issue PDF extraction + single-page retry.
// Adapted from campaign-hq (apps/worker/src/jobs/processIssue.ts) to
// stable-press: raw Mongo driver, COL.* collections, no tenantId, pages keyed
// by stable _id (we create placeholders up front and map index → _id, since
// our db layer has no upsert-by-filter).
// ---------------------------------------------------------------------------

import { db } from '../../../server/src/lib/db.js';
import { storage } from '../../../server/src/lib/storage.js';
import { COL } from '../../../server/src/lib/magazineV2/collections.js';
import { PAGE_W, PAGE_H, MAX_PAGES_PER_ISSUE } from '../../../server/src/lib/magazineV2/config.js';
import { openPdf, countPages } from '../lib/pdf.js';
import { convertDocxToPdf } from '../lib/docx.js';
import { mapWithConcurrency } from '../lib/pool.js';
import { processSinglePage } from './processPage.js';

/** DOCX mime, and a key-suffix fallback — used to convert Word docs to PDF
 *  before extraction (the pipeline downstream only understands PDF). */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function isDocx(src: { key?: string; mimeType?: string } | undefined): boolean {
  return src?.mimeType === DOCX_MIME || !!src?.key?.toLowerCase().endsWith('.docx');
}

const PAGE_CONCURRENCY = Math.max(1, Number(process.env.MAGAZINE_V2_PAGE_CONCURRENCY ?? 3));

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = { _id: string; [k: string]: any };

/** Digitize a freshly-uploaded PDF into pages + editable elements. */
export async function processIssue(payload: { issueId: string }): Promise<void> {
  const { issueId } = payload;
  const issue = (await db.collection(COL.issues).findById(issueId)) as Doc | null;
  if (!issue) return; // deleted before the job ran — nothing to do
  const now = () => new Date().toISOString();

  try {
    const src = issue.sourceFile as { key?: string; mimeType?: string } | undefined;
    if (!src?.key) throw new Error('No source file to process.');

    let buffer = await storage.downloadObject(src.key);
    // Word docs: convert to PDF up front (via LibreOffice) so the rest of the
    // pipeline — openPdf and every per-page extractor — is unchanged.
    if (isDocx(src)) buffer = await convertDocxToPdf(buffer);
    const doc = openPdf(buffer);
    const totalPages = countPages(doc);
    if (totalPages <= 0) throw new Error('This file has no pages to process.');

    const capped = Math.min(totalPages, MAX_PAGES_PER_ISSUE);
    await db.collection(COL.issues).updateOne(issueId, {
      pagesTotal: capped,
      pagesProcessed: 0,
      stage: 'Digitizing pages',
      // No silent caps: if we truncate, say so on the issue.
      processingError: capped < totalPages ? `Only the first ${capped} of ${totalPages} pages were processed (per-issue page cap).` : '',
      sourceFile: { ...issue.sourceFile, pageCount: totalPages },
      updatedAt: now(),
    });

    // Clear any pages from a prior partial run (retry safety), then create a
    // "pending" placeholder per page up front so the UI shows pending (not
    // "missing") as pages finish out of order under concurrency.
    for (const p of (await db.collection(COL.pages).find({ magazineId: issueId })) as Doc[]) {
      await db.collection(COL.pages).deleteOne(p._id);
    }
    const pageIds: string[] = [];
    for (let i = 0; i < capped; i++) {
      pageIds[i] = await db.collection(COL.pages).insertOne({
        magazineId: issueId,
        index: i,
        width: PAGE_W,
        height: PAGE_H,
        background: { type: 'color', value: '#ffffff' },
        elements: [],
        status: 'pending',
        selectedForPublish: true,
        rev: 0,
        createdAt: now(),
        updatedAt: now(),
      });
    }

    let done = 0;
    let coverImage = '';
    const indices = Array.from({ length: capped }, (_v, i) => i);
    await mapWithConcurrency(indices, PAGE_CONCURRENCY, async (index) => {
      const result = await processSinglePage(doc, index, { issueId, pageId: pageIds[index]! });
      if (index === 0 && result?.backgroundUrl) coverImage = result.backgroundUrl;
      done += 1;
      await db.collection(COL.issues).updateOne(issueId, { pagesProcessed: done });
    });

    const failedCount = ((await db.collection(COL.pages).find({ magazineId: issueId, status: 'failed' })) as Doc[]).length;
    if (failedCount >= capped) {
      await db.collection(COL.issues).updateOne(issueId, {
        status: 'failed',
        processingError: 'Every page failed to process — the file may be corrupted or unreadable.',
        stage: '',
        updatedAt: now(),
      });
    } else {
      // Keep the truncation note if we capped; otherwise report partial failures
      // (or clear on a clean run).
      let processingError = '';
      if (failedCount > 0) processingError = `${failedCount} of ${capped} page(s) failed to process — retry them individually.`;
      else if (capped < totalPages) processingError = `Only the first ${capped} of ${totalPages} pages were processed (per-issue page cap).`;
      await db.collection(COL.issues).updateOne(issueId, {
        status: 'ready',
        ...(coverImage ? { coverImage } : {}),
        processingError,
        generatedAt: now(),
        stage: '',
        updatedAt: now(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    console.error(`[worker] issue ${issueId} failed:`, message);
    await db.collection(COL.issues).updateOne(issueId, { status: 'failed', processingError: message, stage: '', updatedAt: now() });
  }
}

/** Re-run extraction for ONE page (the retry endpoint). Re-downloads + re-opens
 *  the source (the worker may have restarted since the original job). */
export async function processPageJob(payload: { issueId: string; pageId: string; index: number }): Promise<void> {
  const { issueId, pageId, index } = payload;
  const issue = (await db.collection(COL.issues).findById(issueId)) as Doc | null;
  const src = issue?.sourceFile as { key?: string; mimeType?: string } | undefined;
  if (!issue || !src?.key) return;
  const now = () => new Date().toISOString();

  try {
    let buffer = await storage.downloadObject(src.key);
    // Same DOCX→PDF conversion as the full run — a retry re-downloads the
    // original source, which may be a Word doc.
    if (isDocx(src)) buffer = await convertDocxToPdf(buffer);
    const doc = openPdf(buffer);
    await processSinglePage(doc, index, { issueId, pageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Page retry failed';
    await db.collection(COL.pages).updateOne(pageId, { status: 'failed', error: message, updatedAt: now() });
  }

  const all = (await db.collection(COL.pages).find({ magazineId: issueId })) as Doc[];
  const failed = all.filter((p) => p.status === 'failed').length;
  if (issue.status === 'processing' || issue.status === 'failed') {
    await db.collection(COL.issues).updateOne(issueId, {
      status: failed >= all.length && all.length > 0 ? 'failed' : 'ready',
      processingError: failed > 0 ? `${failed} of ${all.length} page(s) failed to process.` : '',
      stage: '',
      updatedAt: now(),
    });
  }
}
