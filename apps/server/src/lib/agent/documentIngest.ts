// ---------------------------------------------------------------------------
// Document ingest for the Studio Assistant.
//
// A user uploads a PDF / image / text file in the editor and the assistant
// analyses it ONCE here into a compact, faithful, editor-ready "digest". That
// digest then rides along in the editor context (small + reusable) so the agent
// can place its content into the bulletin via the normal edit tools — without
// re-reading the whole file on every chat turn.
//
//   • PDF  → text is extracted server-side (deterministic; no dependency on the
//            model provider passing file parts). Scanned/image-only PDFs with no
//            extractable text fall back to the multimodal vision path.
//   • images → sent to the model as a file part (vision).
//   • text / csv / markdown → decoded and passed inline.
// ---------------------------------------------------------------------------

import { generateObject } from 'ai'
import { z } from 'zod'
import { getAgentModel } from './provider.js'

// pdf-parse ships a debug block in its index.js that reads a sample file on
// import; importing the lib entry point directly avoids it. Server is CommonJS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (data: Buffer) => Promise<{ text?: string; numpages?: number }> =
  require('pdf-parse/lib/pdf-parse.js')

export type IngestKind = 'pdf' | 'image' | 'text'

/** Map a MIME type to the ingest path, or null if unsupported (Phase 1). */
export function ingestKind(contentType: string): IngestKind | null {
  const ct = (contentType || '').toLowerCase()
  if (ct === 'application/pdf') return 'pdf'
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
})

export type DocDigest = z.infer<typeof DocDigestSchema>

const SYSTEM =
  'You are a careful document analyst working for a magazine editor. Read the supplied document and extract a ' +
  'faithful, structured, editor-ready digest so the editor can place its content into a publication. Preserve real ' +
  'names, figures, dates, results and quotes EXACTLY as written. Do NOT invent, infer or embellish anything that is ' +
  'not present in the source. Keep it well-organised and reasonably concise (skip boilerplate and legal footers).'

const MAX_TEXT_CHARS = 100_000

/** Build a digest from already-extracted plain text. */
async function digestFromText(name: string, contentType: string, text: string): Promise<DocDigest> {
  const { object } = await generateObject({
    model: getAgentModel(),
    schema: DocDigestSchema,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Document name: ${name}\nType: ${contentType}\n\n--- BEGIN DOCUMENT ---\n` +
              text.slice(0, MAX_TEXT_CHARS) +
              `\n--- END DOCUMENT ---`,
          },
        ],
      },
    ],
  })
  return object
}

/** Build a digest by sending the raw file to the model (vision / native file part). */
async function digestFromFile(name: string, bytes: Buffer, contentType: string): Promise<DocDigest> {
  const { object } = await generateObject({
    model: getAgentModel(),
    schema: DocDigestSchema,
    system: SYSTEM,
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

/** Analyse one uploaded file into a digest. Throws on unsupported/empty/failed input. */
export async function ingestDocument(opts: {
  bytes: Buffer
  contentType: string
  name: string
}): Promise<DocDigest> {
  const kind = ingestKind(opts.contentType)
  if (!kind) throw new Error(`Unsupported file type: ${opts.contentType}`)

  if (kind === 'text') {
    const text = opts.bytes.toString('utf8')
    if (!text.trim()) throw new Error('That text file looks empty.')
    return digestFromText(opts.name, opts.contentType, text)
  }

  if (kind === 'pdf') {
    // Reliable path: pull the text out of the PDF ourselves and digest THAT.
    let text = ''
    let pages = 0
    try {
      const parsed = await pdfParse(opts.bytes)
      text = (parsed.text ?? '').trim()
      pages = parsed.numpages ?? 0
    } catch (e) {
      console.warn('[ingest] PDF text extraction failed, falling back to vision:', e instanceof Error ? e.message : e)
    }
    console.log(`[ingest] PDF "${opts.name}": ${pages} pages, ${text.length} chars extracted`)
    if (text.length >= 40) {
      return digestFromText(opts.name, 'application/pdf', text)
    }
    // Likely a scanned / image-only PDF — let the model read it visually.
    return digestFromFile(opts.name, opts.bytes, opts.contentType)
  }

  // image → vision
  return digestFromFile(opts.name, opts.bytes, opts.contentType)
}
