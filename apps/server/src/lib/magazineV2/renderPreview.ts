// ---------------------------------------------------------------------------
// Magazine Builder v2 — render a composed page to a small JPEG proof, so the
// Visual Critic (visualCritic.ts) can LOOK at what the generator built.
//
// The HTML comes from previewHtml.ts (pure, mirrors the web canvas). This file is
// the browser half:
//
//   • ONE Chromium per process — borrowed from lib/pdf.ts (getSharedBrowser), never
//     launched here and never closed or reset here (a PDF render may be using it).
//   • ONE render lane and one warm, reused tab. Measured on the NZ fixture (6 pages
//     submitted together): three parallel tabs left 2 of 6 proofs over the 8s box
//     even on a warm browser (a background tab's screenshot waits for a frame that a
//     hidden tab does not paint); one lane rendered all six in ~0.5s warm, ~3.8s
//     cold including the Chromium launch. Renders queue; they are ~80ms each.
//   • Every request the proof makes is filtered: our own images are served from S3
//     with the server's credentials (so a bucket WITHOUT public-read — the live
//     bucket's state, see the layout-quality notes — still renders real photos),
//     other image URLs and Google Fonts load normally, and everything else
//     (scripts, frames, XHR) is refused.
//   • Time-boxed (default 8s for content + screenshot). A render that is late,
//     fails, or has no Chromium to run in returns null — the critic is skipped for
//     that page and generation carries on. Never throws.
// ---------------------------------------------------------------------------

import { getSharedBrowser } from '../pdf.js';
import { storage } from '../storage.js';
import { sniffImageType } from './imageBytes.js';
import { pageToPreviewHtml, previewSize, PREVIEW_WIDTH, type PreviewPage } from './previewHtml.js';

export type { PreviewPage };

// ── The slice of puppeteer used here (declared by hand — see the note in lib/pdf.ts
//    on why puppeteer's own types cannot be imported into this dual-built code) ──
interface PreviewRequest {
  url(): string;
  resourceType(): string;
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
  respond(response: { status: number; contentType: string; body: Uint8Array | string; headers?: Record<string, string> }): Promise<void>;
  isInterceptResolutionHandled?(): boolean;
}
interface PreviewTab {
  setRequestInterception(enabled: boolean): Promise<void>;
  on(event: 'request', handler: (req: PreviewRequest) => void): void;
  setViewport(viewport: { width: number; height: number; deviceScaleFactor?: number }): Promise<void>;
  setContent(html: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>;
  evaluate(expression: string): Promise<unknown>;
  screenshot(opts: Record<string, unknown>): Promise<Uint8Array>;
  close(): Promise<void>;
}
interface PreviewBrowser {
  newPage(): Promise<unknown>;
  connected: boolean;
}

/** Renders in flight at once, across every page being generated in this process. ONE
 *  by default — see the header: parallel tabs were measured slower, not faster.
 *  MAGAZINE_V2_PREVIEW_RENDERS can raise it (max 4) on a host where that changes. */
const MAX_RENDERS = Math.max(1, Math.min(4, Number(process.env.MAGAZINE_V2_PREVIEW_RENDERS) || 1));
/** Warm tabs kept between renders (one per lane). */
const MAX_IDLE_TABS = MAX_RENDERS;
/** Content + fonts + screenshot, per render. */
const DEFAULT_RENDER_MS = 8_000;
/** Bringing Chromium up the first time (a one-off per process). */
const LAUNCH_MS = 30_000;
/** How long the renderer stays switched off after Chromium could not be started. */
const UNAVAILABLE_COOLDOWN_MS = 10 * 60_000;
/** One of our images, fetched from S3 for a proof. */
const ASSET_FETCH_MS = 5_000;
/** Bytes of our own images kept between renders (a page's retry reuses its photos). */
const ASSET_CACHE_MAX_BYTES = 64 * 1024 * 1024;

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

// ── availability (log once) ──────────────────────────────────────────────────
let unavailableUntil = 0;
let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[magazineV2] ${message}`);
}

/** False while the renderer is switched off after a failed Chromium start. */
export function previewRendererAvailable(): boolean {
  return Date.now() >= unavailableUntil;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// ── our own images, served from S3 with credentials ───────────────────────────
const assetCache = new Map<string, { bytes: Buffer; contentType: string }>();
let assetCacheBytes = 0;
const assetInflight = new Map<string, Promise<{ bytes: Buffer; contentType: string } | null>>();

function cachePut(key: string, value: { bytes: Buffer; contentType: string }): void {
  if (value.bytes.length > ASSET_CACHE_MAX_BYTES / 4) return;
  const prev = assetCache.get(key);
  if (prev) assetCacheBytes -= prev.bytes.length;
  assetCache.set(key, value);
  assetCacheBytes += value.bytes.length;
  while (assetCacheBytes > ASSET_CACHE_MAX_BYTES && assetCache.size > 1) {
    const oldest = assetCache.keys().next().value as string;
    assetCacheBytes -= assetCache.get(oldest)!.bytes.length;
    assetCache.delete(oldest);
  }
}

async function ownAsset(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const hit = assetCache.get(key);
  if (hit) {
    assetCache.delete(key);
    assetCache.set(key, hit); // most-recently-used
    return hit;
  }
  let pending = assetInflight.get(key);
  if (!pending) {
    pending = withTimeout(storage.downloadObject(key), ASSET_FETCH_MS, 'asset download')
      .then((bytes) => {
        const contentType = sniffImageType(bytes);
        if (!contentType) return null;
        const value = { bytes, contentType };
        cachePut(key, value);
        return value;
      })
      .catch(() => null)
      .finally(() => assetInflight.delete(key));
    assetInflight.set(key, pending);
  }
  return pending;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Decide every request a proof makes. Exactly one of continue/abort/respond per request. */
async function handleRequest(req: PreviewRequest): Promise<void> {
  const url = req.url();
  const type = req.resourceType();
  try {
    if (url.startsWith('data:') || url === 'about:blank') return await req.continue();
    if (type === 'image') {
      const key = storage.isConfigured() ? storage.keyFromUrl(url) : null;
      if (key && storage.isPublicKey(key)) {
        const asset = await ownAsset(key);
        if (asset) return await req.respond({ status: 200, contentType: asset.contentType, body: asset.bytes });
        return await req.abort('failed');
      }
      // A relative proxy URL with no S3 to read it from cannot load anywhere.
      if (hostOf(url) === 'assets.preview.invalid') return await req.abort('failed');
      if (/^https?:\/\//i.test(url)) return await req.continue();
      return await req.abort('blockedbyclient');
    }
    if ((type === 'stylesheet' || type === 'font') && FONT_HOSTS.has(hostOf(url))) return await req.continue();
    if (type === 'document' && url === 'about:blank') return await req.continue();
    return await req.abort('blockedbyclient');
  } catch {
    // Already handled (or the tab closed under us) — nothing left to decide.
    try {
      if (!req.isInterceptResolutionHandled?.()) await req.abort('failed');
    } catch {
      /* ignore */
    }
  }
}

// ── the tab pool ─────────────────────────────────────────────────────────────
interface PooledTab {
  tab: PreviewTab;
  browser: PreviewBrowser;
}
const idleTabs: PooledTab[] = [];
let inFlight = 0;
const waiters: Array<() => void> = [];

/** A render slot, or false after `maxWaitMs` in the queue. Single-threaded JS means a
 *  waiter is either woken by releaseSlot or removed by its timer — never both. */
function acquireSlot(maxWaitMs: number): Promise<boolean> {
  if (inFlight < MAX_RENDERS) {
    inFlight++;
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      inFlight++;
      resolve(true);
    };
    const timer = setTimeout(() => {
      const i = waiters.indexOf(wake);
      if (i >= 0) waiters.splice(i, 1);
      resolve(false);
    }, maxWaitMs);
    waiters.push(wake);
  });
}
function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) next();
}

async function browser(): Promise<PreviewBrowser | null> {
  if (!previewRendererAvailable()) return null;
  try {
    return (await withTimeout(getSharedBrowser(), LAUNCH_MS, 'Chromium launch')) as unknown as PreviewBrowser;
  } catch (err) {
    unavailableUntil = Date.now() + UNAVAILABLE_COOLDOWN_MS;
    warnOnce(
      `visual critic: no headless Chromium (${err instanceof Error ? err.message : String(err)}) — page previews are skipped, so the critic is too; deterministic layout QA still runs.`,
    );
    return null;
  }
}

async function openTab(): Promise<PooledTab | null> {
  const b = await browser();
  if (!b) return null;
  while (idleTabs.length > 0) {
    const pooled = idleTabs.pop()!;
    if (pooled.browser === b && b.connected) return pooled;
    void pooled.tab.close().catch(() => {});
  }
  const tab = (await b.newPage()) as PreviewTab;
  await tab.setRequestInterception(true);
  tab.on('request', (req) => {
    void handleRequest(req);
  });
  return { tab, browser: b };
}

function closeTab(pooled: PooledTab, reusable: boolean): void {
  if (reusable && pooled.browser.connected && idleTabs.length < MAX_IDLE_TABS) {
    idleTabs.push(pooled);
    return;
  }
  void pooled.tab.close().catch(() => {});
}

/**
 * Render one page to a JPEG proof `previewWidth` px wide (default 620). Returns
 * null — never throws — when Chromium is unavailable, the render pool is saturated
 * for too long, or the render fails or overruns its time box.
 */
export async function renderPagePreview(
  page: PreviewPage,
  opts: { previewWidth?: number; timeoutMs?: number } = {},
): Promise<Buffer | null> {
  if (!previewRendererAvailable()) return null;
  const previewWidth = opts.previewWidth ?? PREVIEW_WIDTH;
  const budget = Math.max(2_000, opts.timeoutMs ?? DEFAULT_RENDER_MS);
  const size = previewSize(page.width, page.height, previewWidth);
  const html = pageToPreviewHtml(page, { previewWidth });

  // Waiting for a free render slot is bounded too, but is not part of the render's
  // own budget: six pages finishing together queue briefly, they do not fail.
  if (!(await acquireSlot(budget * 3))) return null;
  let pooled: PooledTab | null = null;
  let reusable = false;
  try {
    pooled = await openTab();
    if (!pooled) return null;
    const tab = pooled.tab;
    const started = Date.now();
    const left = () => Math.max(500, budget - (Date.now() - started));
    const shot = await withTimeout(
      (async () => {
        await tab.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 });
        // 'load' waits for the stylesheet, fonts already requested and every image. A
        // slow image must not cost the whole proof: on a timeout, shoot what is there.
        await tab.setContent(html, { waitUntil: 'load', timeout: Math.max(1_000, left() - 1_500) }).catch(() => {});
        await withTimeout(tab.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true'), Math.min(1_500, left()), 'fonts').catch(() => {});
        return tab.screenshot({ type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: size.width, height: size.height } });
      })(),
      budget,
      'page preview',
    );
    reusable = true;
    return Buffer.from(shot);
  } catch (err) {
    console.warn(`[magazineV2] page preview failed (${err instanceof Error ? err.message : String(err)}) — critic skipped for this page.`);
    return null;
  } finally {
    if (pooled) closeTab(pooled, reusable);
    releaseSlot();
  }
}
