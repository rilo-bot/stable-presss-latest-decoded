// ---------------------------------------------------------------------------
// Document ingest for the Studio Assistant.
//
// A user uploads a PDF / image / text file in the editor and the assistant
// analyses it ONCE here into a compact, faithful, editor-ready "digest" PLUS the
// verbatim full text. The digest rides along in the editor context (small +
// reusable); the full text feeds the bulk compose/fill pass.
//
//   • PDF (text-based) → text is extracted server-side with pdf-parse
//            (deterministic; no model round-trip).
//   • PDF (image-based / scanned) → no extractable text, so the PDF is SPLIT into
//            single pages (pdf-lib) and each page is OCR'd by the vision model in
//            parallel. This keeps every model call small + reliable (instead of
//            one giant multi-page call that blows the timeout) AND yields real
//            verbatim text so the bulletin fill has something to work from.
//   • images → sent to the model as a file part (vision).
//   • text / csv / markdown → decoded and passed inline.
// ---------------------------------------------------------------------------

import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { PDFDocument } from 'pdf-lib'
import mammoth from 'mammoth'
import { getAgentModel } from './provider.js'

// pdf-parse ships a debug block in its index.js that reads a sample file on
// import; importing the lib entry point directly avoids it. Server is CommonJS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (data: Buffer) => Promise<{ text?: string; numpages?: number }> =
  require('pdf-parse/lib/pdf-parse.js')

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
const PDF_PARSE_MS = 30_000 // text-extraction ceiling
const PAGE_OCR_MS = 75_000 // per-page OCR ceiling (image-based PDF path)
// OCR pages this many at a time. Kept LOW on purpose: firing several large scanned
// pages at the vision provider at once makes them queue/throttle, so each call's
// wall-clock blows past PAGE_OCR_MS and the whole wave aborts (observed: a page
// timing out at 75s under concurrency 3). Two-at-a-time gives each call the
// headroom to actually return — fewer-but-completing beats more-but-aborted.
const VISION_CONCURRENCY = 2
const MAX_VISION_PAGES = 24 // cap OCR work (matches the 24-page bulletin template)
const VISION_MAX_BYTES = 50 * 1024 * 1024 // cap the image/scanned-PDF fallback (matches the /ingest 50mb body limit)

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
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
async function digestFromFile(name: string, bytes: Buffer, contentType: string): Promise<DocDigest> {
  const { object } = await generateObject({
    model: getAgentModel(),
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

/** OCR a single one-page PDF via the vision model. Never throws — returns '' on
 *  timeout/failure so one bad page can't sink the whole document. */
async function ocrPdfPage(pageBytes: Buffer, pageNo: number): Promise<string> {
  try {
    const { text } = await generateText({
      model: getAgentModel(),
      system: OCR_SYSTEM,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(PAGE_OCR_MS),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Transcribe every piece of text on this single page (page ${pageNo}).` },
            { type: 'file', data: pageBytes, mediaType: 'application/pdf' },
          ],
        },
      ],
    })
    return (text || '').trim()
  } catch (e) {
    console.warn(`[ingest] OCR failed for page ${pageNo}:`, e instanceof Error ? e.message : e)
    return ''
  }
}

/** Split a PDF into single-page PDF buffers (pure JS, no rendering). Capped. */
async function splitPdfPages(bytes: Buffer, maxPages: number): Promise<{ pages: Buffer[]; total: number }> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const total = src.getPageCount()
  const n = Math.min(total, maxPages)
  const pages: Buffer[] = []
  for (let i = 0; i < n; i++) {
    const doc = await PDFDocument.create()
    const [pg] = await doc.copyPages(src, [i])
    doc.addPage(pg)
    pages.push(Buffer.from(await doc.save()))
  }
  return { pages, total }
}

/** Image-based / scanned PDF: split into pages and OCR them in parallel, then
 *  stitch the verbatim text back together so the bulk fill has real content. */
async function ocrPdfByPage(name: string, bytes: Buffer, maxPages: number = MAX_VISION_PAGES): Promise<IngestResult> {
  let split: { pages: Buffer[]; total: number }
  try {
    split = await splitPdfPages(bytes, Math.max(1, Math.min(MAX_VISION_PAGES, maxPages)))
  } catch (e) {
    // Couldn't split (corrupt/odd PDF) — last resort: one bounded vision call on
    // the whole file. Better a thin digest than a hard failure.
    console.warn('[ingest] PDF split failed, falling back to whole-file vision:', e instanceof Error ? e.message : e)
    const digest = await digestFromFile(name, bytes, 'application/pdf')
    const text = [digest.summary, ...digest.sections.map((s) => `${s.heading}\n${s.body}`), ...digest.facts]
      .filter(Boolean)
      .join('\n\n')
    return { digest, fullText: text.slice(0, FULLTEXT_CHARS) }
  }

  const { pages, total } = split
  if (pages.length === 0) throw new Error('That PDF has no pages I can read.')

  const pageTexts = await mapLimit(pages, VISION_CONCURRENCY, (buf, i) => ocrPdfPage(buf, i + 1))
  const readCount = pageTexts.filter((t) => t.trim().length > 0).length
  if (readCount === 0) {
    throw new Error(
      "I couldn't read any text from this PDF — it looks like a photo/scan with no legible text. " +
        'Try a clearer scan or a text-based PDF.',
    )
  }

  const combined = pageTexts
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
    let text = ''
    let pages = 0
    try {
      const parsed = await withTimeout(pdfParse(opts.bytes), PDF_PARSE_MS, 'PDF text extraction')
      text = (parsed.text ?? '').trim()
      pages = parsed.numpages ?? 0
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
    return await ocrPdfByPage(opts.name, opts.bytes, opts.maxOcrPages ?? MAX_VISION_PAGES)
  }

  // image → vision
  return { digest: await digestFromFile(opts.name, opts.bytes, opts.contentType), fullText: '' }
}
