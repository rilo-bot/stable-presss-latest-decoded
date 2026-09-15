// ---------------------------------------------------------------------------
// PDF text extraction, page by page.
//
// WHY THIS REPLACED pdf-parse
//
// pdf-parse 1.1.1 was published in 2018 and vendors pdf.js 1.10.100, also 2018.
// Three consequences, in order of seriousness:
//
//   1. SECURITY. We parse PDFs uploaded by users. pdf.js has had real CVEs since
//      — CVE-2024-4367 among them — and a vendored 2018 copy receives none of the
//      fixes. npm audit cannot even see it, because the parser is bundled rather
//      than depended on.
//   2. IT IS ALL-OR-NOTHING. pdf-parse returns one string for the whole document.
//      So a text PDF had no page numbers, no progress, and no resumability: a read
//      killed at 90% started again from nothing, and a citation could never say
//      which page it came from.
//   3. It cannot tell a page apart from a document. A 300-page report with a
//      scanned cover looked, to the "is there text?" test, exactly like a 300-page
//      scan — and vice versa.
//
// This module answers per PAGE, which is what makes batched, resumable reading
// possible and what lets a mixed document (typeset body, scanned appendix) be read
// properly instead of one way or the other.
//
// LOADING. pdfjs-dist ships ESM only, and this server compiles to CommonJS, where
// tsc rewrites `import()` into `require()` — which cannot load ESM. The Function
// indirection below hides the import from the compiler so it survives as a real
// dynamic import at runtime. Ugly, load-bearing, and the alternative was pinning a
// 2023 release that still carries the CVE.
// ---------------------------------------------------------------------------

/**
 * The slice of pdfjs this module uses, declared by hand.
 *
 * The library is loaded through an untyped dynamic import (see the header), so
 * without this everything past the import is `any` and a renamed method in a future
 * version would surface as a runtime crash on a user's upload rather than a
 * compile error. Narrow on purpose: these are the only members touched, so this is
 * also the list of what an upgrade has to keep.
 */
/** A text run as pdfjs reports it: the string, its own transform, and the width
 *  it occupies. `transform` is [a,b,c,d,e,f] in the page's text space — it is only
 *  a position once combined with the viewport's, which is what measurePage does. */
interface PdfjsTextItem {
  str?: string
  hasEOL?: boolean
  transform?: number[]
  width?: number
  fontName?: string
}
/** The page's own coordinate frame, with rotation and the MediaBox origin already
 *  folded into `transform`. Asking for it is the only honest way to get a box in
 *  the space a READER sees, rather than the space the file happens to store. */
interface PdfjsViewport {
  width: number
  height: number
  transform: number[]
}
interface PdfjsPage {
  getTextContent(): Promise<{ items?: PdfjsTextItem[] }>
  getOperatorList(): Promise<{ fnArray?: number[]; argsArray?: unknown[] }>
  getViewport(params: { scale: number }): PdfjsViewport
  cleanup(): void
}
interface PdfjsDoc {
  numPages: number
  getPage(pageNo: number): Promise<PdfjsPage>
  destroy(): Promise<void>
}
interface PdfjsLib {
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfjsDoc> }
  OPS: Record<string, number>
  /** Matrix multiply, pdfjs's own. Used rather than hand-rolled so the composition
   *  order can never disagree with the one pdfjs uses to render. */
  Util: { transform(a: number[], b: number[]): number[] }
}

/** Text extracted from one page, plus what to do when there is none. */
export interface PdfPageProbe {
  /** Everything legible in the page's text layer, in reading order. */
  text: string
  /**
   * True when the page paints an image. Only consulted for a page with no text:
   * it separates "a scan that needs OCR" from "a genuinely blank page", and
   * without it every blank page in a long document would be sent to the OCR
   * model to come back empty — paid for, and reported as a failure to read.
   */
  hasImage: boolean
}

/**
 * One run of text, placed on the page.
 *
 * Boxes are in POINTS with a top-left origin — the page as a reader sees it, with
 * rotation and any MediaBox offset already applied. Not fractions: this module
 * reports what it measured and leaves normalising to whoever knows what the
 * measurement is for.
 */
export interface PdfTextRun {
  x: number
  y: number
  w: number
  /** The type's height, i.e. its size — not the line's leading. */
  size: number
  text: string
  /** pdfjs's internal font handle ("g_d0_f1"). Useless as a family NAME, but two
   *  runs sharing it are set in the same face, which is what block grouping needs. */
  font: string
}

/** Where a page paints a picture. Same top-left point space as PdfTextRun. */
export interface PdfImageBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A page's geometry — where its words and pictures actually sit.
 *
 * WHY THIS IS SEPARATE FROM probe(). probe() answers "what does this page SAY",
 * which is what a reader building chunks needs and all it needs. This answers
 * "what does this page LOOK LIKE", which is a different question with a different
 * cost, asked by a different feature (matching a reference layout). Folding the two
 * together would make every page of every document pay for geometry nobody read.
 *
 * NOTE WHAT IS ABSENT: colour. pdfjs reports fill colour in the operator list, which
 * is a separate stream from getTextContent's items with no reliable correspondence
 * between them — so a colour here would be a guess about which run it belonged to.
 * `ReadRegion.color` is optional precisely so an honest reader can leave it out.
 */
export interface PdfPageMeasure {
  /** Page size in points, as displayed (rotation applied). */
  width: number
  height: number
  runs: PdfTextRun[]
  images: PdfImageBox[]
}

export interface PdfHandle {
  pageCount: number
  /** Extract one page (1-based). `probeImages: false` skips the operator-list scan,
   *  which is the expensive half and only matters when there is no text. */
  probe(pageNo: number, opts?: { probeImages?: boolean }): Promise<PdfPageProbe>
  /** Measure one page's geometry (1-based) — see PdfPageMeasure. */
  measure(pageNo: number): Promise<PdfPageMeasure>
  close(): Promise<void>
}

/** Per-page ceiling. A pathological page (a million tiny glyphs) must not hang a
 *  batch; the page is reported empty and OCR can have a go at it instead. */
const PAGE_TEXT_MS = 20_000

/** Ceiling on parsing the document structure. A malformed file can send pdfjs into
 *  a long recovery pass ("Indexing all PDF objects"); a read that will not start in
 *  a minute is a read the user should be told about. */
const OPEN_MS = 60_000

let pdfjsPromise: Promise<PdfjsLib> | null = null

/**
 * Where pdfjs's bundled font and CMap data live.
 *
 * Not optional extras. Without `standardFontDataUrl` pdfjs warns and falls back,
 * and glyph-to-unicode mapping degrades for documents that lean on the 14 standard
 * fonts — a QUIET loss of text quality, not an error. Without `cMapUrl`, text in a
 * CJK document encoded with a predefined CMap does not come out at all, and this
 * codebase deliberately supports CJK (see the two-character token floor in
 * retrieval.ts), so losing it would be a silent hole rather than a missing feature.
 *
 * Resolved from the installed package rather than hardcoded, so it survives a
 * hoisted or nested node_modules layout. Returns null if it cannot be found, in
 * which case pdfjs falls back as before — degraded, but not broken.
 */
function pdfjsAssetDirs(): { standardFontDataUrl?: string; cMapUrl?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path')
    const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
    // Trailing separator required: pdfjs concatenates the filename straight on.
    return {
      standardFontDataUrl: path.join(root, 'standard_fonts') + path.sep,
      cMapUrl: path.join(root, 'cmaps') + path.sep,
    }
  } catch (e) {
    console.warn('[pdfText] could not locate pdfjs font/cmap data:', e instanceof Error ? e.message : e)
    return {}
  }
}

/**
 * Load pdfjs once per process.
 *
 * `new Function` is what keeps `import` from being downleveled to `require` by the
 * CommonJS emit — see the module header. Cached because the first load parses a
 * couple of megabytes of JavaScript.
 */
async function pdfjs(): Promise<PdfjsLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = (new Function('s', 'return import(s)') as (s: string) => Promise<PdfjsLib>)(
      'pdfjs-dist/legacy/build/pdf.mjs',
    ).catch((err: unknown) => {
      pdfjsPromise = null // let a transient failure be retried
      throw err
    })
  }
  return pdfjsPromise
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}

/**
 * Assemble a page's text items into readable lines.
 *
 * `hasEOL` is why this is a function and not a `.join('')`. Concatenating the
 * items runs every line of a page together — headings into body, table cells into
 * one another — and the result is what a model reads and quotes back. pdf-parse's
 * output had exactly this problem.
 */
function linesFrom(items: Array<{ str?: string; hasEOL?: boolean }>): string {
  let out = ''
  for (const item of items) {
    if (typeof item?.str !== 'string') continue
    out += item.str
    if (item.hasEOL) out += '\n'
    // A pdfjs text item carries no trailing space, so words from adjacent items
    // would fuse. Only add one when the item did not already end in whitespace.
    else if (item.str && !/\s$/.test(item.str)) out += ' '
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Map a point through a [a,b,c,d,e,f] matrix. */
function apply(m: number[], x: number, y: number): [number, number] {
  return [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!]
}

/**
 * Where each picture on the page lands, by replaying the operator list.
 *
 * A PDF does not record an image's rectangle anywhere — it records "paint the unit
 * square" and leaves the rectangle implied by the transform in force at that moment.
 * So the only way to find out is to walk the stream keeping the same graphics-state
 * stack a renderer keeps: save/restore push and pop it, transform multiplies into it,
 * and at each paint op the unit square's four corners under the current matrix bound
 * the picture. Taking the corners' bbox rather than assuming an axis-aligned box is
 * what keeps a rotated or flipped image (PDF image space is y-up, ours is y-down)
 * honest instead of inside out.
 */
function imageBoxes(
  fnArray: number[],
  argsArray: unknown[],
  OPS: Record<string, number>,
  Util: PdfjsLib['Util'],
  base: number[],
): PdfImageBox[] {
  const paints = new Set(
    [OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].filter(
      (op): op is number => typeof op === 'number',
    ),
  )
  const out: PdfImageBox[] = []
  const stack: number[][] = []
  let ctm = base
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i]!
    if (op === OPS.save) {
      stack.push(ctm)
    } else if (op === OPS.restore) {
      ctm = stack.pop() ?? base
    } else if (op === OPS.transform) {
      const a = argsArray[i]
      if (Array.isArray(a) && a.length >= 6) ctm = Util.transform(ctm, a as number[])
    } else if (paints.has(op)) {
      const corners = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]
      const xs = corners.map((c) => c[0])
      const ys = corners.map((c) => c[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const w = Math.max(...xs) - x
      const h = Math.max(...ys) - y
      // A sliver is a rule or a texture tile, not a picture. Anything this thin
      // cannot be a composition element at any page size.
      if (w > 2 && h > 2) out.push({ x, y, w, h })
    }
  }
  return out
}

/** True if the page's operator list paints an image of any kind. */
function paintsImage(fnArray: number[], OPS: Record<string, number>): boolean {
  const imageOps = new Set(
    [OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].filter(
      (op) => typeof op === 'number',
    ),
  )
  return fnArray.some((op) => imageOps.has(op))
}

/**
 * Open a PDF for page-by-page reading. Throws if the file cannot be parsed at all.
 *
 * The options are chosen for UNTRUSTED input: no eval, no system font access, no
 * network fetches. A document uploaded by a stranger is parsed here, so the parser
 * gets as few capabilities as the job allows.
 */
export async function openPdf(bytes: Buffer): Promise<PdfHandle> {
  const lib = await pdfjs()
  const OPS = lib.OPS
  const doc = await withTimeout(
    lib.getDocument({
      // A copy, because pdfjs transfers ownership of the buffer it is given and the
      // caller still needs its bytes (for OCR of the pages with no text layer).
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      // Keep the parser off the network entirely: both of these are local directories.
      useWorkerFetch: false,
      ...pdfjsAssetDirs(),
      cMapPacked: true,
      // A password-protected PDF should fail rather than hang waiting for one.
      password: '',
    }).promise,
    OPEN_MS,
    'PDF open',
  )

  return {
    pageCount: Number(doc.numPages) || 0,
    async probe(pageNo: number, opts?: { probeImages?: boolean }): Promise<PdfPageProbe> {
      const page = await doc.getPage(pageNo)
      try {
        const content = await withTimeout(page.getTextContent(), PAGE_TEXT_MS, `page ${pageNo} text`)
        const text = linesFrom(content?.items ?? [])
        // The operator list is the expensive half, so only ask when the answer can
        // change anything: a page with text is read either way.
        if (text || opts?.probeImages === false) return { text, hasImage: false }
        try {
          const ops = await withTimeout(page.getOperatorList(), PAGE_TEXT_MS, `page ${pageNo} operators`)
          return { text, hasImage: paintsImage(ops?.fnArray ?? [], OPS) }
        } catch (e) {
          // Could not tell — assume there IS something to see. Sending a blank page
          // to OCR wastes one call; skipping a scanned page loses its content.
          console.warn(`[pdfText] page ${pageNo}: image probe failed:`, e instanceof Error ? e.message : e)
          return { text, hasImage: true }
        }
      } finally {
        // Release the page's caches as we go. Without this, sweeping a 500-page
        // document accumulates every page's fonts and glyphs for the whole run.
        try {
          page.cleanup()
        } catch {
          /* not worth failing a read over */
        }
      }
    },
    async measure(pageNo: number): Promise<PdfPageMeasure> {
      const page = await doc.getPage(pageNo)
      try {
        // scale 1 ⇒ one unit is one point, and `transform` carries the page's
        // rotation and MediaBox origin. Measuring in the rendered frame rather than
        // the stored one is what makes a rotated page read as its reader sees it.
        const viewport = page.getViewport({ scale: 1 })
        const vt = viewport.transform
        const content = await withTimeout(page.getTextContent(), PAGE_TEXT_MS, `page ${pageNo} text`)
        const runs: PdfTextRun[] = []
        for (const item of content?.items ?? []) {
          const str = typeof item?.str === 'string' ? item.str : ''
          if (!str.trim()) continue // a positioned space is not a run
          if (!Array.isArray(item.transform) || item.transform.length < 6) continue
          const tx = lib.Util.transform(vt, item.transform)
          // The type's height is the vertical scale of the combined matrix — NOT
          // transform[3] alone, which loses any skew or rotation in the run.
          const size = Math.hypot(tx[2]!, tx[3]!)
          if (!(size > 0)) continue
          const w = Math.max(0, Number(item.width) || 0)
          runs.push({
            // tx[5] is the BASELINE. A box drawn from the baseline down would sit
            // one line too low and every vertical relationship on the page — what is
            // above what — would be read wrong.
            x: tx[4]!,
            y: tx[5]! - size,
            w,
            size,
            text: str,
            font: typeof item.fontName === 'string' ? item.fontName : '',
          })
        }
        let images: PdfImageBox[] = []
        try {
          const ops = await withTimeout(page.getOperatorList(), PAGE_TEXT_MS, `page ${pageNo} operators`)
          images = imageBoxes(ops?.fnArray ?? [], ops?.argsArray ?? [], OPS, lib.Util, vt)
        } catch (e) {
          // Text alone is still a usable measurement — a layout with its pictures
          // missing is worse than one with them, and far better than none.
          console.warn(`[pdfText] page ${pageNo}: image geometry failed:`, e instanceof Error ? e.message : e)
        }
        return { width: viewport.width, height: viewport.height, runs, images }
      } finally {
        try {
          page.cleanup()
        } catch {
          /* not worth failing a measurement over */
        }
      }
    },
    async close(): Promise<void> {
      try {
        await doc.destroy()
      } catch {
        /* nothing useful to do */
      }
    },
  }
}
