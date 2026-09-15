// ---------------------------------------------------------------------------
// Magazine Builder v2 — "use this layout", when the reference is a PDF page.
//
// The sibling of readLayout.ts, and deliberately shaped like it: same argument
// (something the caller has already proven belongs to this magazine), same return
// (`{ reading, error }`), same null-means-say-so contract. Everything downstream —
// applyReadingToPage, referenceFill, the apply-layout route, the agent's
// use_image_as_layout — consumes a LayoutReading and cannot tell which door it
// came through. That is the point: "match the layout" should not mean two features
// depending on what the user happened to attach.
//
// The DIFFERENCE is where the numbers come from. readLayout.ts sends a picture to
// a vision model and normalises what it says. This opens the file and measures.
// A PDF states where its words and pictures are; asking a model to look at a
// rendering of it and estimate the same numbers back would be strictly worse, and
// would cost a vision call to be worse.
// ---------------------------------------------------------------------------

import { openPdf } from '../agent/pdfText.js';
import { layoutFromMeasure } from './pdfPageLayout.js';
import type { LayoutReading } from './layoutReading.js';

export interface ReadLayoutPdfResult {
  reading: LayoutReading | null;
  error: string;
  /** Pages in the document — so a caller that asked for page 40 of a 12-page file
   *  can say which it was, and a picker can offer the real range. */
  pageCount: number;
}

/**
 * Measure one page of a PDF into a LayoutReading.
 *
 * `pageNo` is 1-based, as a person says it. Out of range is a plain answer rather
 * than an error: the user named a page, and being told the document only has
 * twelve is more use than a stack trace.
 */
export async function readLayoutPdfPage(bytes: Buffer, pageNo = 1): Promise<ReadLayoutPdfResult> {
  let pdf;
  try {
    pdf = await openPdf(bytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[magazineV2] layout measure failed to open the PDF: ${msg}`);
    return {
      reading: null,
      error: /password/i.test(msg)
        ? 'That PDF is password-protected, so I cannot read its layout.'
        : 'I could not open that PDF to read its layout.',
      pageCount: 0,
    };
  }
  try {
    const pageCount = pdf.pageCount;
    const wanted = Math.max(1, Math.floor(pageNo));
    if (pageCount < 1) return { reading: null, error: 'That PDF has no pages I can read.', pageCount };
    if (wanted > pageCount) {
      return {
        reading: null,
        error: `That document has ${pageCount} page${pageCount === 1 ? '' : 's'}, so there is no page ${wanted} to copy.`,
        pageCount,
      };
    }
    const measured = await pdf.measure(wanted);
    const reading = layoutFromMeasure(measured);
    if (!reading) {
      return {
        reading: null,
        // The honest cause, not a generic failure: a page with nothing placed on it
        // has no composition to copy, and a scan has no text layer to measure. Both
        // are the user's to act on — a different page will work.
        error:
          measured.runs.length === 0 && measured.images.length === 0
            ? `Page ${wanted} is blank — there is no layout on it to copy.`
            : `There is not enough on page ${wanted} to read as a layout. A page with a headline, some text and a picture works best.`,
        pageCount,
      };
    }
    console.log(
      `[magazineV2] measured page ${wanted}/${pageCount}: ${reading.regions.length} region(s), ${
        reading.columns ?? 1
      } column(s), aspect ${reading.aspect.toFixed(2)}`,
    );
    return { reading, error: '', pageCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[magazineV2] layout measure failed: ${msg}`);
    return { reading: null, error: 'I could not read that page’s layout just now — please try again.', pageCount: 0 };
  } finally {
    await pdf.close();
  }
}
