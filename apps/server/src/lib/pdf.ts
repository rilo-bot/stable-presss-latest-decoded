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

import puppeteer, { type Browser } from 'puppeteer'

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
    browserPromise = puppeteer
      .launch({
        headless: true,
        // --no-sandbox / --disable-setuid-sandbox are required to run as root in
        // most container hosts (Render, Docker). --disable-dev-shm-usage avoids
        // crashes from the small default /dev/shm in containers.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      })
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

/**
 * Render a bulletin viewer URL to an A4 PDF, using the per-version cache.
 *
 * @param url       Absolute URL of the public viewer (e.g. http://localhost:5173/bulletins/abc).
 * @param cacheKey  Content-addressed key (issue id + version + updatedAt). When the
 *                  same key is requested again the cached buffer is returned without
 *                  re-rendering. Pass an empty string to bypass the cache.
 * @param token     Optional Bearer token — forwarded ONLY to same-app `/api/` calls so
 *                  staff can export an unpublished (preview) edition the headless,
 *                  otherwise-anonymous browser couldn't fetch on its own.
 */
export async function renderBulletinPdf(
  url: string,
  cacheKey: string,
  token?: string,
  forceRefresh = false,
): Promise<Buffer> {
  if (cacheKey && !forceRefresh) {
    const hit = cacheGet(cacheKey)
    if (hit) return hit
  }

  try {
    return await renderOnce(url, cacheKey, token)
  } catch (err) {
    // Classic long-uptime failure: the shared Chromium died in a way `.connected`
    // didn't catch, so every render against it throws. Reset and try ONCE more
    // with a fresh browser before surfacing the error.
    console.warn('[pdf] render failed, relaunching Chromium and retrying once:', err instanceof Error ? err.message : err)
    resetBrowser()
    return await renderOnce(url, cacheKey, token)
  }
}

async function renderOnce(url: string, cacheKey: string, token?: string): Promise<Buffer> {
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
      // Size each PDF sheet to the page element's EXACT pixel box rather than A4
      // millimetres. The templates are 794×1123px (web's PAGE_W/PAGE_H — keep in
      // sync); that is ~0.05mm over A4, and targeting A4-mm makes the final page's
      // sub-pixel overflow spill onto an extra blank sheet. Matching the px box
      // maps every page 1:1 to one sheet. (794px→595.5pt, 1123px→842.25pt ≈ A4.)
      width: '794px',
      height: '1123px',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    const buf = Buffer.from(pdf)
    if (cacheKey) cacheSet(cacheKey, buf)
    return buf
  } finally {
    await page.close().catch(() => {})
  }
}
