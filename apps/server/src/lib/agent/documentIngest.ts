// ---------------------------------------------------------------------------
// Document ingest for the Studio Assistant.
//
// A user uploads a PDF / image / text file in the editor and the assistant
// analyses it ONCE here into a compact, faithful, editor-ready "digest" PLUS the
// verbatim full text. The digest rides along in the editor context (small +
// reusable); the full text feeds the bulk compose/fill pass.
//
//   • PDF → text is extracted server-side, PAGE BY PAGE, with pdfjs (see
//            pdfText.ts; deterministic, no model round-trip). Any page with no text
//            layer but something drawn on it is SPLIT out as a single-page PDF
//            (pdf-lib) and OCR'd by the vision model. This keeps every model call
//            small and reliable instead of one giant multi-page call that blows the
//            timeout, and — because the decision is per page, not per document — a
//            typeset report with a scanned appendix is read correctly throughout,
//            paying for OCR only on the pages that actually need it.
//   • images → sent to the model as a file part (vision).
//   • text / csv / markdown → decoded and passed inline.
// ---------------------------------------------------------------------------

import { generateObject, generateText } from 'ai'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import { PDFDocument } from 'pdf-lib'
import mammoth from 'mammoth'
import { getAgentModel, getOcrModel } from './provider.js'
import { openPdf, type PdfPageProbe } from './pdfText.js'
import { MAX_SOURCE_BYTES } from '../magazineV2/config.js'

export type IngestKind = 'pdf' | 'image' | 'text' | 'docx'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Map a MIME type to the ingest path, or null if unsupported (Phase 1). */
export function ingestKind(contentType: string): IngestKind | null {
  const ct = (contentType || '').toLowerCase()
  if (ct === 'application/pdf') return 'pdf'
  if (ct === DOCX_MIME) return 'docx'
  if (ct.startsWith('image/')) return 'image'
  if (ct.startsWith('text/') || ct === 'application/json') return 'text'
  return null
}

const DocDigestSchema = z.object({
  title: z.string().describe('A short title for the document.'),
  summary: z.string().describe('One to three plain sentences: what this document is.'),
  sections: z
    .array(
      z.object({
        heading: z.string().describe('A short label for this part of the document.'),
        body: z.string().describe('The section content, kept faithful to the source (lightly cleaned).'),
      }),
    )
    .describe('The document broken into labelled sections in reading order.'),
  facts: z
    .array(z.string())
    .describe('Discrete key facts an editor might place: names, dates, prices, results, quotes.'),
  tables: z
    .array(
      z.object({
        caption: z.string().optional(),
        rows: z.array(z.array(z.string())).describe('Row-major cells; first row is the header if present.'),
      }),
    )
    .optional()
    .describe('Any tabular data, e.g. results or rosters.'),
  icons: z
    .array(
      z.object({
        label: z.string().describe('The nearby text/concept the icon sits with, e.g. "email", "phone", "trophy", "website".'),
        name: z.string().describe('Best-guess Lucide icon NAME in PascalCase, e.g. "Mail", "Phone", "Trophy", "Globe", "Award", "Users".'),
      }),
    )
    .optional()
    .describe('Distinct icons/symbols visible in the document (contact/social glyphs, badges, award/trophy marks), each mapped to the closest common Lucide icon name. Omit if none are clearly present.'),
})

export type DocDigest = z.infer<typeof DocDigestSchema>

const SYSTEM =
  'You are a careful document analyst working for a magazine editor. Read the supplied document and extract a ' +
  'faithful, structured, editor-ready digest so the editor can place its content into a publication. Preserve real ' +
  'names, figures, dates, results and quotes EXACTLY as written. Do NOT invent, infer or embellish anything that is ' +
  'not present in the source. Keep it well-organised and reasonably concise (skip boilerplate and legal footers).\n' +
  'Also note any DISTINCT ICONS or symbols you actually see (contact/social glyphs like email/phone, award/trophy ' +
  'marks, badges) in the `icons` field: for each, give the nearby label and the closest common Lucide icon name in ' +
  'PascalCase (e.g. Mail, Phone, Globe, Trophy, Award, Users, Star, Heart, Calendar, MapPin). Only include icons that ' +
  'are genuinely present — never invent decorative icons.'

const OCR_SYSTEM =
  'You are a precise OCR transcriber for a magazine editor. Transcribe ALL text visible on the page EXACTLY as ' +
  'written — preserve names, numbers, dates, prices, results, headings and captions verbatim and in natural reading ' +
  'order. Do NOT summarise, translate, reformat, add, or invent anything. Output ONLY the transcribed text as plain ' +
  'text. If the page contains no readable text, output nothing at all.'

// Bounds so a slow/stalled model call or a pathological PDF can never hang the
// request forever (the route would otherwise wait indefinitely on the network).
const FULLTEXT_CHARS = 80_000 // verbatim text kept for the bulk compose/fill pass
const MODEL_ABORT_MS = 90_000 // generateObject ceiling (single-image vision path)
const PAGE_OCR_MS = 75_000 // per-page OCR ceiling (image-based PDF path)
// OCR pages this many at a time. Kept LOW on purpose: firing several large scanned
// pages at the vision provider at once makes them queue/throttle, so each call's
// wall-clock blows past PAGE_OCR_MS and the whole wave aborts (observed: a page
// timing out at 75s under concurrency 3). Two-at-a-time gives each call the
// headroom to actually return — fewer-but-completing beats more-but-aborted.
const VISION_CONCURRENCY = 2
const MAX_VISION_PAGES = 24 // cap OCR work (matches the 24-page bulletin template)
/**
 * Largest file we will split pages out of for a visual read.
 *
 * This is a MEMORY bound, not a policy one: pdf-lib loads the whole PDF to copy a
 * page out of it. Set to the size we actually accept (MAX_SOURCE_BYTES), so the rule
 * is simply "anything we took, we can read" — a smaller number here means refusing
 * to read a file the upload endpoint already agreed to store, which is the sort of
 * disagreement between two limits that nobody notices until a user hits it.
 *
 * Overridable, because it is the one number here tied to the host, not the design.
 */
const VISION_MAX_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.MAGAZINE_V2_VISION_MAX_BYTES ?? MAX_SOURCE_BYTES),
)

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}

/** Tag a failure as a transient upstream/provider problem (retryable) rather than
 *  a problem with the file. The route surfaces this as a "try again" 502 instead
 *  of a 422 that wrongly blames the document. */
function upstreamError(message: string): Error {
  return Object.assign(new Error(message), { retryable: true })
}

/** Run an async fn over items with a bounded concurrency. fn must not throw
 *  (catch internally) — a rejection would abort the whole batch. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, () => worker()))
  return results
}

/**
 * Build a lightweight digest from already-extracted text WITHOUT a model call, so
 * upload stays fast (no OpenRouter round-trip). The FULL verbatim text — returned
 * alongside — is what the bulk compose/fill actually consumes; this digest is only
 * the compact preview shown in the chat context.
 */
function cheapDigest(name: string, text: string): DocDigest {
  const clean = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)
  const title = (lines[0] || name).slice(0, 120)
  const summary = lines.slice(0, 3).join(' ').slice(0, 300) || `Uploaded document "${name}".`
  return { title, summary, sections: [{ heading: 'Document', body: clean.slice(0, 2000) }], facts: [] }
}

/** Build a digest by sending the raw file to the model (vision / native file part). */
async function digestFromFile(
  name: string,
  bytes: Buffer,
  contentType: string,
  model: LanguageModel = getAgentModel(),
): Promise<DocDigest> {
  const { object } = await generateObject({
    model,
    schema: DocDigestSchema,
    system: SYSTEM,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(MODEL_ABORT_MS),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Analyse this uploaded file named "${name}" and extract a faithful structured digest.` },
          { type: 'file', data: bytes, mediaType: contentType },
        ],
      },
    ],
  })
  return object
}

/** True for AbortSignal.timeout / provider-abort failures, which deserve the
 *  route's 504 "took too long" message rather than the generic 500. */
function isTimeoutish(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  // Name checks cover AbortSignal.timeout; the message test stays narrow so a
  // provider error that merely mentions "aborted" still gets the fallback read.
  return e.name === 'TimeoutError' || e.name === 'AbortError' || /timed?\s*out/i.test(e.message)
}

const IMAGE_DESCRIBE_SYSTEM =
  'You are a careful visual analyst working for a magazine editor. Describe the supplied image faithfully and ' +
  'concretely so an editor can write about it: what it shows, all legible text/labels/numbers EXACTLY as written, ' +
  'and — for charts or graphs — the axes, series, units and the key figures/trends. Do NOT invent or embellish ' +
  'anything not visible. Plain text only, reasonably concise.'

/** Forgiving image fallback: a plain-text vision description (no strict schema).
 *  Charts/graphs often defeat the structured digest call — its required
 *  sections/facts shape doesn't map onto a graphic — so when that call fails we
 *  ask for a simple description instead and wrap it into a digest ourselves. */
async function describeImageFallback(name: string, bytes: Buffer, contentType: string): Promise<DocDigest> {
  const { text } = await generateText({
    model: getAgentModel(),
    system: IMAGE_DESCRIBE_SYSTEM,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(MODEL_ABORT_MS),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Describe this uploaded image named "${name}" for a magazine editor.` },
          { type: 'file', data: bytes, mediaType: contentType },
        ],
      },
    ],
  })
  const clean = (text || '').trim()
  if (!clean) {
    throw new Error("I couldn't read that image — try a clearer or smaller image, or paste its key details instead.")
  }
  return {
    title: name,
    summary: clean.slice(0, 300),
    sections: [{ heading: 'Image', body: clean.slice(0, 4000) }],
    facts: [],
  }
}

/** Outcome of OCR'ing one page. `ok:true` means the call SUCCEEDED — `text` may
 *  still be '' for a genuinely blank page. `ok:false` means the call FAILED
 *  (timeout / throttle / provider error), which must NOT be read as "blank page".
 *  Keeping the two apart is what stops an infrastructure blip from being reported
 *  to the user as an unreadable scan. */
type OcrPageResult = { ok: true; text: string } | { ok: false; error: string }

/** OCR a single one-page PDF via the OCR model (mistral-ocr engine). Never throws
 *  — one bad page can't sink the whole document; the caller inspects `ok` to tell
 *  an empty page apart from a failed call. `filename` is set so OpenRouter/the
 *  provider reliably recognises the part as a PDF. */
async function ocrPdfPage(model: LanguageModel, pageBytes: Buffer, pageNo: number): Promise<OcrPageResult> {
  try {
    const { text } = await generateText({
      model,
      system: OCR_SYSTEM,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(PAGE_OCR_MS),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Transcribe every piece of text on this single page (page ${pageNo}).` },
            { type: 'file', data: pageBytes, mediaType: 'application/pdf', filename: `page-${pageNo}.pdf` },
          ],
        },
      ],
    })
    return { ok: true, text: (text || '').trim() }
  } catch (e) {
    console.warn(`[ingest] OCR failed for page ${pageNo}:`, e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Copy the NAMED pages out of a PDF as single-page PDF buffers (pure JS, no
 * rendering). `pageNos` are 1-based; the result is aligned to it index for index.
 *
 * An explicit list rather than "the first N", for two reasons. A batched read only
 * ever needs its own slice — splitting the whole document up front held every
 * single-page PDF in memory at once, tolerable behind a 24-page cap and thousands
 * of buffers without one. And the pages needing OCR are not a contiguous range at
 * all now that the text/scan decision is made per page: a report with a scanned
 * insert asks for pages 4, 5 and 91.
 *
 * Page numbers outside the document are skipped rather than throwing, and the
 * returned array is then shorter — so callers must not assume a one-to-one mapping
 * when they may have passed junk. The reader never does: its numbers come from
 * pdfjs's own page count.
 */
export async function splitPdfPagesAt(bytes: Buffer, pageNos: number[]): Promise<Buffer[]> {
  if (pageNos.length === 0) return []
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const total = src.getPageCount()
  const out: Buffer[] = []
  for (const pageNo of pageNos) {
    const index = Math.floor(pageNo) - 1
    if (index < 0 || index >= total) continue
    const doc = await PDFDocument.create()
    const [pg] = await doc.copyPages(src, [index])
    doc.addPage(pg)
    out.push(Buffer.from(await doc.save()))
  }
  return out
}

/** Image-based / scanned PDF: split into pages and OCR them in parallel, then
 *  stitch the verbatim text back together so the bulk fill has real content. */
async function ocrPdfByPage(
  name: string,
  bytes: Buffer,
  maxPages: number = MAX_VISION_PAGES,
  pageCount = 0,
): Promise<IngestResult> {
  let split: { pages: Buffer[]; total: number }
  try {
    const want = Math.max(1, Math.min(MAX_VISION_PAGES, maxPages))
    const total = pageCount > 0 ? pageCount : want
    const wanted = Array.from({ length: Math.min(want, total) }, (_, i) => i + 1)
    split = { pages: await splitPdfPagesAt(bytes, wanted), total }
  } catch (e) {
    // Couldn't split (corrupt/odd PDF) — last resort: one bounded vision call on
    // the whole file. Better a thin digest than a hard failure.
    console.warn('[ingest] PDF split failed, falling back to whole-file vision:', e instanceof Error ? e.message : e)
    const digest = await digestFromFile(name, bytes, 'application/pdf', getOcrModel())
    const text = [digest.summary, ...digest.sections.map((s) => `${s.heading}\n${s.body}`), ...digest.facts]
      .filter(Boolean)
      .join('\n\n')
    return { digest, fullText: text.slice(0, FULLTEXT_CHARS) }
  }

  const { pages, total } = split
  if (pages.length === 0) throw new Error('That PDF has no pages I can read.')

  const model = getOcrModel()
  const pageResults = await mapLimit(pages, VISION_CONCURRENCY, (buf, i) => ocrPdfPage(model, buf, i + 1))
  const texts = pageResults.map((r) => (r.ok ? r.text : ''))
  const readCount = texts.filter((t) => t.trim().length > 0).length
  const errorCount = pageResults.filter((r) => !r.ok).length

  if (readCount === 0) {
    // Only blame the scan when EVERY page's OCR call actually succeeded and came
    // back empty. If any page ERRORED (timeout/throttle/provider), we can't
    // conclude the document is a blank scan — surface a retryable error so the
    // user is told to try again rather than to "use a clearer scan".
    if (errorCount > 0) {
      const firstError = pageResults.find((r) => !r.ok) as Extract<OcrPageResult, { ok: false }> | undefined
      console.warn(
        `[ingest] PDF "${name}": OCR errored on ${errorCount}/${pages.length} pages, 0 read; first error: ${firstError?.error ?? 'unknown'}`,
      )
      throw upstreamError(
        'Reading that PDF failed just now (the reader hit a temporary error) — please try again in a moment.',
      )
    }
    throw new Error(
      "I couldn't read any text from this PDF — it looks like a photo/scan with no legible text. " +
        'Try a clearer scan or a text-based PDF.',
    )
  }

  const combined = texts
    .map((t, i) => (t.trim() ? `--- Page ${i + 1} ---\n${t.trim()}` : ''))
    .filter(Boolean)
    .join('\n\n')
  const fullText = combined.slice(0, FULLTEXT_CHARS)

  const capped = total > pages.length
  if (capped) console.log(`[ingest] PDF "${name}": OCR capped at ${pages.length}/${total} pages`)
  console.log(`[ingest] PDF "${name}": OCR read ${readCount}/${pages.length} pages, ${fullText.length} chars`)

  const digest = cheapDigest(name, fullText)
  const coverage = capped ? ` (read the first ${pages.length} of ${total} pages)` : ''
  return { digest: { ...digest, summary: digest.summary + coverage }, fullText }
}

/** A digest (compact summary, used in chat context) plus the verbatim full text
 *  (used by the bulk compose/fill pass — the real source of maximal coverage). */
export interface IngestResult {
  digest: DocDigest
  fullText: string
}

// ---------------------------------------------------------------------------
// PAGE-AT-A-TIME READING, for the background read job.
//
// ingestDocument (below) answers "give me this whole document, now" — the shape a
// blocking HTTP request needs, and the reason a scanned PDF had to be cut to six
// pages to fit a browser timeout. A job has no client waiting, so it can read
// every page; but it can also be KILLED half way, and then the work already done
// must not be thrown away.
//
// So this hands each page back as it completes, letting the caller persist it
// before the next one starts, and skips pages the caller says it already holds.
// That is the whole of resume: no page is read twice, and no page is lost.
//
// It also reads a BOUNDED RANGE rather than the whole document, because the worker
// runs one job at a time: a handler that read a 5,000-page scan to the end would
// hold the only lane for hours, and every other magazine in the system would wait
// on it. The caller sweeps in batches and re-enqueues between them.
// ---------------------------------------------------------------------------

/**
 * THERE IS NO PAGE CAP ON THE JOB PATH. A document is read to its last page.
 *
 * There used to be one (200), and before that 24 and 6, and every one of them was
 * really a proxy for something else: a browser waiting on the read, or one big
 * upload monopolising the single worker. Both are now addressed directly — the read
 * is a background job (heartbeat, so watching it cannot kill it) swept in batches
 * (so it cannot hold the lane) — which leaves nothing for a page cap to protect.
 *
 * A cap that stays after its reason has gone is the worst kind: it silently returns
 * two thirds of a report and nothing in the system knows the difference between
 * that and a short document.
 *
 * `maxPages` remains available per call, for a caller that genuinely wants a
 * PREVIEW of the first few pages. Absent means all of them.
 */
/** Wall-clock ceiling for ONE BATCH's OCR (not the document's — a document may
 *  take as many batches as it needs). A hard stop, so a provider that has slowed to
 *  a crawl yields an honest short batch instead of a job that never ends. */
export const JOB_OCR_BUDGET_MS = 30 * 60_000
/**
 * Pages one batch reads before handing the queue back to everybody else.
 *
 * The worker claims ONE job at a time, so a read that ran to the end of a
 * 5,000-page scan would hold the only lane for hours and no other magazine in the
 * system could generate meanwhile — one user's upload becomes everyone's outage.
 * The caller sweeps in batches and re-enqueues between them; the requeued row is
 * new, and claimOne takes the oldest first, so it lands BEHIND whatever arrived
 * while this batch ran. Fairness falls out of the ordering, with no scheduler.
 *
 * Sized so a batch is minutes, not hours: 25 pages at the worst-case per-page OCR
 * ceiling, four in flight, is well under ten minutes.
 */
export const JOB_BATCH_PAGES = 25
/**
 * Pages one batch will LOOK AT — a far larger number than JOB_BATCH_PAGES, because
 * the two bound different costs.
 *
 * Extracting a page's text layer is local and takes milliseconds; OCR'ing a page is
 * a model call taking up to 75 seconds and costing money. Bounding both at 25 would
 * make a 2,000-page typeset report take 80 batches to read something it can do in
 * four, for no benefit to anyone waiting behind it. So the OCR budget is what keeps
 * a run short, and this only keeps a run finite.
 */
export const JOB_SCAN_PAGES = 400
/** Pages in flight at once on the job path. Higher than the request path's 2:
 *  there is no request timeout to blow, only provider throughput. */
const JOB_VISION_CONCURRENCY = 4

/** One unit of reading. `ok:false` means the call FAILED — distinct from a page
 *  that genuinely had no text, which is `ok:true` with an empty string. */
export interface PageRead {
  pageNo: number
  text: string
  ok: boolean
}

/**
 * What ONE batch of reading did.
 *
 * Deliberately facts and not prose: the reader reports what it looked at and what
 * failed, and the store phrases the coverage (sweptCoverage). When both did it,
 * they disagreed — the reader's page-cap wording outlived the cap it described.
 */
export interface ReadPagesResult {
  kind: 'pdf-text' | 'pdf-ocr' | 'docx' | 'text' | 'image'
  /** Read UNITS, not necessarily printed pages: a text layer or a Word body is
   *  extracted in ONE unit covering the whole document, while a scan is one unit
   *  per page. Coverage is counted in the same unit the reader used, so it can
   *  never imply a document was partly read just because it was read at once. */
  unitsTotal: number
  /** The highest unit this read will ever reach — `unitsTotal`, or lower if the
   *  caller imposed a page cap. Kept apart from the total so a capped read stops
   *  without the coverage arithmetic forgetting how long the document really was. */
  unitsCeiling: number
  /** Units this batch tried to read (skipped ones excluded). */
  attempted: number
  /** Units this batch read WITHOUT error — a blank page counts, a timeout does not. */
  ok: number
  /** Units whose read errored this batch. Numbers, not a count, so the caller can
   *  union them across batches without double-counting a retry. */
  failedUnits: number[]
  /** Units this batch sent to the OCR model — the only pages that cost anything.
   *  Numbers rather than a count for the same reason: a retried batch must not be
   *  able to inflate what the read is reported to have cost. */
  ocrUnits: number[]
  /** The last unit this batch passed over. Everything in [1, sweptTo] has now been
   *  looked at, by this batch or an earlier one. Where the NEXT batch starts is the
   *  caller's decision (sourceStore.nextBatchFrom) — the reader reports how far it
   *  got and does not also get an opinion about what that means. */
  sweptTo: number
  /** True when the wall-clock budget, rather than the end of the range, stopped it. */
  outOfTime: boolean
}

/**
 * How far a batch actually got — the resume point, and an off-by-one with teeth.
 *
 * Normally a batch covers its whole range. When the wall-clock stops it, pages are
 * abandoned mid-flight: mapLimit walks the range in order through a shared cursor,
 * so what it drops is broadly a suffix, but with several pages in flight the
 * boundary is not exact. Resuming at the LOWEST abandoned page is the only choice
 * that cannot skip one, and any page past it that did get read is already stored,
 * so the next batch skips it for free.
 *
 * Returns `from - 1` — no progress — when the clock stopped the batch before its
 * first page. The caller must refuse to requeue that rather than loop for ever;
 * see sourceStore.sweepAdvanced.
 */
export function sweptThrough(opts: { from: number; pageCount: number; firstMissed?: number | null }): number {
  const from = Math.max(1, Math.floor(opts.from))
  const last = from - 1 + Math.max(0, Math.floor(opts.pageCount))
  const missed = opts.firstMissed
  if (missed == null || !Number.isFinite(missed)) return last
  // Clamp both ways: a missed page outside the range says nothing about it.
  return Math.min(last, Math.max(from - 1, Math.floor(missed) - 1))
}

/**
 * Read part of a document, handing each unit to `onUnit` as it lands.
 *
 * `skipUnits` are units the caller already has stored: neither read nor reported as
 * failures. `startUnit` says where to resume, and the two budgets bound the batch:
 * `ocrBudget` pages sent to the model, `scanBudget` pages looked at. A PDF sweeps
 * forward until one of them runs out and reports how far it got; every other kind is
 * a single unit and always completes in one call.
 */
export async function readDocumentUnits(opts: {
  bytes: Buffer
  contentType: string
  name: string
  skipUnits?: Set<number>
  /** 1-based page to resume the sweep at. Defaults to the start of the document. */
  startUnit?: number
  /** Pages needing OCR that this batch may read before handing the queue back.
   *  Defaults to JOB_BATCH_PAGES. This is the budget that matters: OCR is the slow,
   *  paid part, so it is what decides how long one run holds the worker. */
  ocrBudget?: number
  /** Pages this batch may LOOK AT. Defaults to JOB_SCAN_PAGES — see there for why
   *  it is much larger than the OCR budget. */
  scanBudget?: number
  maxPages?: number
  budgetMs?: number
  onUnit: (unit: PageRead) => Promise<void>
}): Promise<ReadPagesResult> {
  const kind = ingestKind(opts.contentType)
  if (!kind) throw new Error(`Unsupported file type: ${opts.contentType}`)
  const skip = opts.skipUnits ?? new Set<number>()

  /** Emit a single whole-document unit (everything but a scanned PDF). */
  const single = async (text: string, k: ReadPagesResult['kind']): Promise<ReadPagesResult> => {
    const held = skip.has(0)
    if (!held) await opts.onUnit({ pageNo: 0, text, ok: true })
    return {
      kind: k,
      unitsTotal: 1,
      unitsCeiling: 1,
      attempted: held ? 0 : 1,
      ok: held ? 0 : 1,
      failedUnits: [],
      ocrUnits: [],
      sweptTo: 1,
      outOfTime: false,
    }
  }

  if (kind === 'text') {
    const text = opts.bytes.toString('utf8')
    if (!text.trim()) throw new Error('That text file looks empty.')
    return single(text, 'text')
  }

  if (kind === 'docx') {
    let text = ''
    try {
      const out = await mammoth.extractRawText({ buffer: opts.bytes })
      text = (out.value ?? '').trim()
    } catch (e) {
      console.warn('[ingest] DOCX text extraction failed:', e instanceof Error ? e.message : e)
      throw new Error("I couldn't read that Word document — it may be corrupted. Try re-saving it or exporting to PDF.")
    }
    if (text.length < 2) throw new Error('That Word document looks empty.')
    return single(text, 'docx')
  }

  if (kind === 'image') {
    // Vision-only: there is no verbatim text, so the digest is the content. The
    // job stores that on the document row rather than as chunks.
    return {
      kind: 'image',
      unitsTotal: 1,
      unitsCeiling: 1,
      attempted: 0,
      ok: 0,
      failedUnits: [],
      ocrUnits: [],
      sweptTo: 0,
      outOfTime: false,
    }
  }

  // ── PDF ──
  //
  // ONE PAGE AT A TIME, AND THE DECISION IS PER PAGE. The old reader asked "does
  // this DOCUMENT have text?" of one concatenated string, and a single answer had
  // to serve every page: a 300-page report with a scanned cover looked exactly
  // like a 300-page scan. Now each page is asked for itself, so a typeset body
  // with a scanned appendix is read the right way throughout — and, because text
  // extraction is nearly free while OCR is not, only the pages that actually need
  // the model are paid for.
  // No cap unless the caller asked for one. Infinity rather than a big number, so
  // nobody later reads a large constant here as a limit worth respecting.
  const cap = opts.maxPages == null ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(opts.maxPages))
  // 1-based page numbers throughout, so unit 0 is never a PDF page — it means "the
  // whole document as one body", and the two must not collide in `skipUnits`.
  const from = Math.max(1, Math.floor(opts.startUnit ?? 1))
  const ocrBudget = Math.max(1, Math.floor(opts.ocrBudget ?? JOB_BATCH_PAGES))
  const scanBudget = Math.max(1, Math.floor(opts.scanBudget ?? JOB_SCAN_PAGES))
  const deadline = Date.now() + Math.max(60_000, opts.budgetMs ?? JOB_OCR_BUDGET_MS)

  const pdf = await openPdf(opts.bytes)
  const failedUnits: number[] = []
  /** Pages actually handed to the OCR model, for the cost reading. */
  const ocrUnits: number[] = []
  let ok = 0
  let outOfTime = false
  let sawScan = false
  /** The lowest page we did not get to. See sweptThrough. */
  let firstMissed = Number.POSITIVE_INFINITY

  try {
    const total = pdf.pageCount
    if (total === 0) throw new Error('That PDF has no pages I can read.')
    const ceiling = Math.min(total, cap)
    /** Result shape for every exit from here, so the arithmetic is written once. */
    const done = (sweptTo: number, attempted: number): ReadPagesResult => ({
      kind: sawScan ? 'pdf-ocr' : 'pdf-text',
      unitsTotal: total,
      unitsCeiling: ceiling,
      attempted,
      ok,
      failedUnits,
      ocrUnits,
      sweptTo,
      outOfTime,
    })

    // Resuming past the ceiling: nothing to do, and the sweep is already over. Can
    // happen after a cap change, or on a duplicate delivery of the last batch.
    if (from > ceiling) return done(ceiling, 0)

    // Pass one: extract the text layer, page by page, emitting as we go. Pages with
    // no text but something drawn on them are collected for OCR; pages with neither
    // are BLANK — read, empty, and not worth a model call.
    const needOcr: number[] = []
    let attempted = 0
    let scanned = 0
    let lastScanned = from - 1

    for (let pageNo = from; pageNo <= ceiling; pageNo++) {
      if (Date.now() > deadline) {
        outOfTime = true
        firstMissed = Math.min(firstMissed, pageNo)
        break
      }
      // Both budgets stop the run, and for different reasons: the OCR budget keeps
      // one document from holding the worker for hours, the scan budget keeps a
      // 5,000-page text PDF from doing the same far more cheaply.
      if (needOcr.length >= ocrBudget || scanned >= scanBudget) break
      if (skip.has(pageNo)) {
        // Already stored. Still counts as swept — it is behind us either way.
        lastScanned = pageNo
        continue
      }
      scanned += 1
      attempted += 1
      let probe: PdfPageProbe
      try {
        probe = await pdf.probe(pageNo)
      } catch (e) {
        // One unreadable page must not sink the document. Recorded as failed so the
        // coverage owns up to it, and the sweep moves on.
        console.warn(`[ingest] page ${pageNo}: text extraction failed:`, e instanceof Error ? e.message : e)
        failedUnits.push(pageNo)
        lastScanned = pageNo
        continue
      }
      if (probe.text) {
        ok += 1
        // Persisted BEFORE the next page is read, so a kill costs one page.
        await opts.onUnit({ pageNo, text: probe.text, ok: true })
      } else if (probe.hasImage) {
        needOcr.push(pageNo)
      } else {
        ok += 1 // a genuinely blank page: successfully read, nothing on it
      }
      lastScanned = pageNo
    }

    if (needOcr.length === 0) return done(sweptThrough({ from, pageCount: lastScanned - from + 1, firstMissed }), attempted)

    // Pass two: OCR the pages with no text layer. Guarded on size, because splitting
    // a page out means loading the whole file into pdf-lib.
    //
    // Too large is NOT a reason to fail a document we can partly read. The guard
    // used to sit in front of the whole PDF path, where "no text" meant the entire
    // file; per-page, one scanned insert in a 60MB typeset report would have failed
    // the lot. So: if we found text, keep it and own up to the pages we skipped. If
    // we found none, the document really is an unreadable scan and saying so is the
    // useful answer.
    if (opts.bytes.length > VISION_MAX_BYTES) {
      if (ok === 0) {
        throw new Error(
          "This PDF's pages are images (no selectable text), and the file is too large for me to read them " +
            'visually. Please upload a text-based PDF or a smaller version.',
        )
      }
      console.warn(
        `[ingest] "${opts.name}": ${needOcr.length} image page(s) skipped — file is ${Math.round(opts.bytes.length / 1e6)}MB, over the visual-read limit`,
      )
      failedUnits.push(...needOcr)
      return done(sweptThrough({ from, pageCount: lastScanned - from + 1, firstMissed }), attempted)
    }
    sawScan = true
    const buffers = await splitPdfPagesAt(opts.bytes, needOcr)
    const model = getOcrModel()
    await mapLimit(buffers, JOB_VISION_CONCURRENCY, async (buf, i) => {
      const pageNo = needOcr[i]!
      if (Date.now() > deadline) {
        outOfTime = true
        firstMissed = Math.min(firstMissed, pageNo)
        return
      }
      const got = await ocrPdfPage(model, buf, pageNo)
      if (!got.ok) {
        // A failed CALL is not an unread page for resume purposes: sweeping past it
        // is what stops one flaky page being retried for ever. It is recorded so the
        // coverage can own up to it.
        failedUnits.push(pageNo)
        return
      }
      ok += 1
      ocrUnits.push(pageNo)
      await opts.onUnit({ pageNo, text: got.text, ok: true })
    })

    return done(sweptThrough({ from, pageCount: lastScanned - from + 1, firstMissed }), attempted)
  } finally {
    await pdf.close()
  }
}

/** Analyse one uploaded file. Throws on unsupported/empty/failed input. */
export async function ingestDocument(opts: {
  bytes: Buffer
  contentType: string
  name: string
  /** OCR at most this many pages of a scanned/image PDF (the rest are skipped
   *  with a coverage note). Callers building a short PREVIEW pass a small number
   *  so the read returns in seconds instead of minutes. Defaults to the full cap. */
  maxOcrPages?: number
}): Promise<IngestResult> {
  const kind = ingestKind(opts.contentType)
  if (!kind) throw new Error(`Unsupported file type: ${opts.contentType}`)

  if (kind === 'text') {
    const text = opts.bytes.toString('utf8')
    if (!text.trim()) throw new Error('That text file looks empty.')
    // Fast path: no model call — just keep the verbatim text + a cheap preview.
    return { digest: cheapDigest(opts.name, text), fullText: text.slice(0, FULLTEXT_CHARS) }
  }

  if (kind === 'docx') {
    // Word docs are a zip of XML — mammoth pulls the raw text in-process (pure JS,
    // no LibreOffice / model call), same fast path as a plain text file.
    let text = ''
    try {
      const out = await mammoth.extractRawText({ buffer: opts.bytes })
      text = (out.value ?? '').trim()
    } catch (e) {
      console.warn('[ingest] DOCX text extraction failed:', e instanceof Error ? e.message : e)
      throw new Error("I couldn't read that Word document — it may be corrupted. Try re-saving it or exporting to PDF.")
    }
    if (text.length < 2) throw new Error('That Word document looks empty.')
    console.log(`[ingest] DOCX "${opts.name}": ${text.length} chars extracted`)
    return { digest: cheapDigest(opts.name, text), fullText: text.slice(0, FULLTEXT_CHARS) }
  }

  if (kind === 'pdf') {
    // Reliable + FAST path: pull the text out of the PDF ourselves (no model call).
    // Page by page, and only as far as this request needs — a preview asks for a
    // handful, so there is no reason to parse three hundred.
    let text = ''
    let pages = 0
    const want = Math.max(1, opts.maxOcrPages ?? MAX_VISION_PAGES)
    try {
      const pdf = await openPdf(opts.bytes)
      try {
        pages = pdf.pageCount
        const parts: string[] = []
        for (let n = 1; n <= Math.min(pages, want); n++) {
          // No image probe: this path only needs to know whether there is text, and
          // the operator-list scan is the expensive half.
          const probe = await pdf.probe(n, { probeImages: false })
          if (probe.text) parts.push(probe.text)
          if (parts.join('\n\n').length >= FULLTEXT_CHARS) break
        }
        text = parts.join('\n\n').trim()
      } finally {
        await pdf.close()
      }
    } catch (e) {
      console.warn('[ingest] PDF text extraction failed/slow, falling back to OCR:', e instanceof Error ? e.message : e)
    }
    console.log(`[ingest] PDF "${opts.name}": ${pages} pages, ${text.length} chars extracted`)
    if (text.length >= 40) {
      return { digest: cheapDigest(opts.name, text), fullText: text.slice(0, FULLTEXT_CHARS) }
    }
    // Little/no extractable text — image-based/scanned PDF. OCR it page by page.
    // Reading it visually is heavy, so guard the size first.
    if (opts.bytes.length > VISION_MAX_BYTES) {
      throw new Error(
        "This PDF looks image-based (no selectable text), and it's too large for me to read visually. " +
          'Please upload a text-based PDF or a smaller version.',
      )
    }
    return await ocrPdfByPage(opts.name, opts.bytes, want, pages)
  }

  // image → vision. The structured digest call is strict (schema'd generateObject),
  // which charts/graphs regularly defeat; never let that dead-end the upload.
  try {
    return { digest: await digestFromFile(opts.name, opts.bytes, opts.contentType), fullText: '' }
  } catch (e) {
    if (isTimeoutish(e)) {
      throw new Error('Reading that image timed out — try a smaller or simpler image.')
    }
    console.warn('[ingest] image digest failed, falling back to plain description:', e instanceof Error ? e.message : e)
    try {
      return { digest: await describeImageFallback(opts.name, opts.bytes, opts.contentType), fullText: '' }
    } catch (e2) {
      if (isTimeoutish(e2)) {
        throw new Error('Reading that image timed out — try a smaller or simpler image.')
      }
      // Both reads failed — most likely a provider/transient problem rather than
      // the image itself (the details are in the warn above), so suggest a retry
      // rather than blaming the file. Still 422-mappable ("couldn't read that").
      console.warn('[ingest] image fallback failed:', e2 instanceof Error ? e2.message : e2)
      throw new Error("I couldn't read that image just now — please try again in a moment, or paste its key details instead.")
    }
  }
}
