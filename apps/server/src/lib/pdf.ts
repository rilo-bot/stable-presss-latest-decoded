// ---------------------------------------------------------------------------
// Server-side PDF rendering via headless Chromium (Puppeteer).
//
// Why server-side and not html2canvas/jsPDF in the browser: the bulletin pages
// are absolutely-positioned magazine layouts with web fonts. Rasterizing the DOM
// client-side reflows/distorts that structure and is slow (a canvas per A4 page).
// A real Chromium renders the EXACT same React route the reader sees and prints
// it with the page's own `@media print` rules — pixel-faithful and fast.
//
// We render the live public viewer route (`/bulletins/:id`) rather than
// re-implementing the templates on the server, so there is a single source of
// truth for the layout. The page raises a `data-bulletin-ready="true"` marker
// once the issue, its fonts, and its images have loaded; we wait for that before
// printing so nothing is captured half-painted.
// ---------------------------------------------------------------------------

/**
 * The slice of puppeteer this module uses, declared by hand.
 *
 * Same approach, and the same reason, as the pdfjs declarations in
 * lib/agent/pdfText.ts. Importing the real types is not available to us: puppeteer
 * is ESM-only, this file is compiled as CommonJS by the API and as NodeNext by
 * apps/worker, and in that combination even `import type` is an error without a
 * `resolution-mode` attribute. Declaring the surface keeps the file compiling in
 * both builds with no per-build syntax.
 *
 * Narrow on purpose: these are the only members touched, so this doubles as the
 * list of what a puppeteer upgrade has to keep.
 */
interface PptrRequest {
  url(): string
  headers(): Record<string, string>
  continue(overrides?: { headers?: Record<string, string> }): Promise<void>
}
interface PptrPage {
  setRequestInterception(enabled: boolean): Promise<void>
  on(event: 'request', handler: (req: PptrRequest) => void): void
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<unknown>
  evaluate<T>(fn: () => T): Promise<T>
  pdf(opts: Record<string, unknown>): Promise<Uint8Array>
  close(): Promise<void>
}
interface Browser {
  newPage(): Promise<PptrPage>
  /** False once Chromium has died — the check that stops a dead singleton being reused. */
  connected: boolean
  on(event: 'disconnected', handler: () => void): void
  close(): Promise<void>
}
interface PuppeteerNode {
  launch(opts: Record<string, unknown>): Promise<Browser>
}
import { PAGE_W, PAGE_H } from './magazineV2/config.js'

/**
 * Load puppeteer through a real dynamic import, not a static one.
 *
 * Same problem — and the same fix — as pdfjs-dist in lib/agent/pdfText.ts. This
 * module is compiled twice: the API builds it as CommonJS (`moduleResolution:
 * node`, which ignores the ESM/CJS boundary) and apps/worker typechecks it as
 * NodeNext, which does not. puppeteer is ESM-only, so the static import that the
 * API tolerated fails the worker's build with TS1479 — and the worker is now the
 * ONLY thing that renders, so it has to compile there.
 *
 * The `new Function` indirection hides the import from tsc's CommonJS emit, which
 * would otherwise rewrite it to a `require()` that cannot load an ES module. Cached
 * because the first load parses several megabytes of launcher.
 */
let puppeteerPromise: Promise<PuppeteerNode> | null = null
async function puppeteer(): Promise<PuppeteerNode> {
  if (!puppeteerPromise) {
    puppeteerPromise = (new Function('s', 'return import(s)') as (s: string) => Promise<{ default: PuppeteerNode }>)(
      'puppeteer',
    )
      .then((m) => m.default ?? (m as unknown as PuppeteerNode))
      .catch((err: unknown) => {
        puppeteerPromise = null // let a transient failure be retried
        throw err
      })
  }
  return puppeteerPromise
}

// Reuse ONE browser across requests — launching Chromium costs ~300ms+ and a
// lot of memory, so a per-request launch would be both slow and wasteful.
let browserPromise: Promise<Browser> | null = null
let currentBrowser: Browser | null = null

/** Drop the shared browser so the next render launches a fresh Chromium. Called
 *  when the instance disconnects/crashes or a render fails against it — the fix
 *  for the "download works only after a server restart" class of failure. */
function resetBrowser(): void {
  const b = currentBrowser
  browserPromise = null
  currentBrowser = null
  if (b) void b.close().catch(() => {})
}

// ---------------------------------------------------------------------------
// Rendered-PDF cache. Rendering navigates a headless browser and downloads every
// page image over the network — slow (tens of seconds for an image-heavy issue).
// Published issues are FROZEN snapshots that only change on republish (which bumps
// version/updatedAt), so a content-addressed cache lets every download after the
// first return instantly. Bounded by total bytes so a few large issues can't OOM
// the process; least-recently-used entries are evicted first.
// ---------------------------------------------------------------------------
const CACHE_MAX_BYTES = 256 * 1024 * 1024 // 256 MB ceiling across all cached PDFs
const pdfCache = new Map<string, Buffer>() // insertion order = LRU order
let pdfCacheBytes = 0

function cacheGet(key: string): Buffer | undefined {
  const buf = pdfCache.get(key)
  if (buf) {
    // Mark most-recently-used by reinserting at the end.
    pdfCache.delete(key)
    pdfCache.set(key, buf)
  }
  return buf
}

function cacheSet(key: string, buf: Buffer): void {
  if (buf.length > CACHE_MAX_BYTES) return // too big to cache sensibly
  if (pdfCache.has(key)) pdfCacheBytes -= pdfCache.get(key)!.length
  pdfCache.set(key, buf)
  pdfCacheBytes += buf.length
  // Evict oldest until under the ceiling.
  while (pdfCacheBytes > CACHE_MAX_BYTES && pdfCache.size > 1) {
    const oldest = pdfCache.keys().next().value as string
    pdfCacheBytes -= pdfCache.get(oldest)!.length
    pdfCache.delete(oldest)
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer()
      .then((p) =>
        p.launch({
        headless: true,
        // --no-sandbox / --disable-setuid-sandbox are required to run as root in
        // most container hosts (Render, Docker). --disable-dev-shm-usage avoids
        // crashes from the small default /dev/shm in containers.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        // Talk to Chromium over a file-descriptor pipe instead of a WebSocket.
        // The default WS transport waits for Chromium to print its ws:// endpoint
        // to stdout, which stalls (and hits "Timed out ... waiting for the WS
        // endpoint URL to appear in stdout") when the host is momentarily saturated
        // and Chromium is slow to emit that line. The pipe transport has no such
        // startup handshake, so it launches reliably under load.
        pipe: true,
        // Give a loaded machine (dev box running Vite HMR + a full browser, or a
        // busy container) more than Puppeteer's default 30s to bring Chromium up
        // before failing the render.
        timeout: 60_000,
        }),
      )
      .then((b) => {
        currentBrowser = b
        // A crashed/killed Chromium fires 'disconnected'; drop the singleton so
        // the very next render relaunches instead of reusing a dead browser
        // (the long-uptime failure that made downloads work only after a restart).
        b.on('disconnected', () => {
          if (currentBrowser === b) {
            browserPromise = null
            currentBrowser = null
          }
        })
        return b
      })
      .catch((err) => {
        browserPromise = null // allow a fresh launch attempt next time
        throw err
      })
  }
  const browser = await browserPromise
  // If a previous render crashed the browser, relaunch it.
  if (!browser.connected) {
    resetBrowser()
    return getBrowser()
  }
  return browser
}

/** The page's own pixel box, so one magazine page maps to exactly one sheet. */
export interface SheetSize {
  width: number
  height: number
}

/**
 * Canonical generated page — A4 portrait at 150 DPI, IMPORTED from
 * lib/magazineV2/config.ts rather than restated, because a mirrored literal here is
 * how this file once printed every page onto the retired v1 builder's sheet. Only a
 * fallback: an UPLOADED page carries whatever size the extractor rasterised, and
 * pages generated before the switch to A4 carry theirs, so the caller passes the
 * issue's real dims.
 */
const DEFAULT_SHEET: SheetSize = { width: PAGE_W, height: PAGE_H }

/**
 * DPI those page pixels are measured at. Generated pages are A4 at 150 DPI; the
 * extractor rasterises uploads at the same 150 (`RENDER_DPI` in
 * apps/worker/src/lib/pdf.ts). Chromium reads a bare `px` as a CSS pixel (1/96in),
 * so asking for 1240px of paper yields a 12.9-inch sheet — the right shape at an
 * unusable size. Dividing by 150 asks for the 8.27 inches the page was designed as.
 *
 * Mirrored by RASTER_DPI in apps/web/src/pages/BulletinViewer.tsx, which sizes the
 * `@page` box the same way for native browser printing.
 */
const RASTER_DPI = 150

/**
 * Render a bulletin viewer URL to a PDF, using the per-version cache.
 *
 * @param url       Absolute URL of the public viewer (e.g. http://localhost:5173/bulletins/abc).
 * @param cacheKey  Content-addressed key (issue id + version + updatedAt). When the
 *                  same key is requested again the cached buffer is returned without
 *                  re-rendering. Pass an empty string to bypass the cache.
 * @param token     Optional Bearer token — forwarded ONLY to same-app `/api/` calls so
 *                  staff can export an unpublished (preview) edition the headless,
 *                  otherwise-anonymous browser couldn't fetch on its own.
 * @param sheet     The issue's page box in px. Pass the FIRST page's width/height —
 *                  `page.pdf()` takes one size for the whole document, and an issue's
 *                  pages are uniform in practice.
 */
export async function renderBulletinPdf(
  url: string,
  cacheKey: string,
  token?: string,
  forceRefresh = false,
  sheet: SheetSize | undefined = DEFAULT_SHEET,
): Promise<Buffer> {
  if (cacheKey && !forceRefresh) {
    const hit = cacheGet(cacheKey)
    if (hit) return hit
  }

  const box = sheet ?? DEFAULT_SHEET

  try {
    return await renderOnce(url, cacheKey, token, box)
  } catch (err) {
    // Classic long-uptime failure: the shared Chromium died in a way `.connected`
    // didn't catch, so every render against it throws. Reset and try ONCE more
    // with a fresh browser before surfacing the error.
    console.warn('[pdf] render failed, relaunching Chromium and retrying once:', err instanceof Error ? err.message : err)
    resetBrowser()
    return await renderOnce(url, cacheKey, token, box)
  }
}

async function renderOnce(url: string, cacheKey: string, token: string | undefined, sheet: SheetSize): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    if (token) {
      await page.setRequestInterception(true)
      page.on('request', (req) => {
        // Attach auth to our API only — never leak it to fonts/S3/other origins.
        if (req.url().includes('/api/')) {
          const headers = { ...req.headers(), authorization: `Bearer ${token}` }
          void req.continue({ headers })
        } else {
          void req.continue()
        }
      })
    }

    // 'load' (not 'networkidle0') + our explicit readiness marker: the viewer
    // only raises [data-bulletin-ready] after the issue, fonts AND every page
    // image have loaded, so we don't also pay networkidle0's trailing idle window.
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForSelector('[data-bulletin-ready="true"]', { timeout: 45_000 })
    // Belt-and-braces: ensure web fonts are fully swapped in before capture.
    await page.evaluate(() => (document as Document).fonts?.ready)

    const pdf = await page.pdf({
      printBackground: true,
      // Size each sheet to the page's OWN box, converted to physical inches, so one
      // magazine page maps to exactly one sheet at exactly the size it was designed
      // as. Naming a paper size instead (A4 in mm) makes a page's sub-pixel overflow
      // spill onto an extra blank sheet.
      //
      // These dims come from the ISSUE. They were hard-coded to 794×1123 — the
      // retired v1 template builder's A4-at-96dpi page — which mis-sized every issue
      // this builder produces: a generated page is 1275×1650 (Letter at 150 DPI) and
      // an uploaded one is whatever the extractor rasterised, so a 0.773-aspect page
      // was printed onto a 0.707-aspect sheet. Dividing by RASTER_DPI (not leaving
      // the value in px, which Chromium reads as 1/96in) is what makes the result
      // 8.5×11in rather than a correctly-shaped but 13.3-inch sheet.
      width: `${(sheet.width / RASTER_DPI).toFixed(4)}in`,
      height: `${(sheet.height / RASTER_DPI).toFixed(4)}in`,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    const buf = Buffer.from(pdf)
    if (cacheKey) cacheSet(cacheKey, buf)
    return buf
  } finally {
    await page.close().catch(() => {})
  }
}
