import mupdfDefault, { type Font, type Image, type Page, type Pixmap, type StructuredText } from 'mupdf';

// Rasterization + native text/image extraction, via MuPDF's WASM build (no
// native compilation — chosen specifically to avoid the native-canvas /
// build-toolchain headaches of alternatives like node-canvas on machines
// without a C++ toolchain). One module, no external binaries, does both jobs
// this pipeline needs: render a page to a raster image AND read its text
// layer + embedded images with real bounding boxes.
//
// Ported VERBATIM from the campaign-hq reference (apps/worker/src/lib/pdf.ts).
// This is the load-bearing fidelity layer — geometry is measured from the file,
// never from AI. Do not "simplify" the heuristics; each one fixes a real bug
// documented inline.

const mupdf = mupdfDefault;

/** Points-per-inch our canonical page pixel space is rendered at. Every
 *  element's x/y/w/h and the page's own width/height are in these pixels —
 *  NOT raw PDF points — so the background raster and every element line up
 *  exactly with no separate scale factor needed downstream. */
export const RENDER_DPI = 150;

/** Hard ceiling on the longest edge (px) of any page raster. A PDF can declare
 *  an enormous MediaBox (e.g. 14400×14400 pt) in a few KB; at full DPI that
 *  would ask MuPDF's WASM heap for a multi-GB pixmap and ABORT — an uncatchable
 *  crash that kills the whole worker process (and every job in flight), which
 *  no try/catch can save. We clamp the effective scale so the raster can never
 *  exceed this, downscaling only pathologically large pages (normal A4/A3/tabloid
 *  at 150 DPI are well under it). Override with MAGAZINE_V2_MAX_RASTER_EDGE_PX. */
const MAX_RASTER_EDGE_PX = Math.max(2000, Number(process.env.MAGAZINE_V2_MAX_RASTER_EDGE_PX) || 6000);

/** Hard ceiling on the pixel count of any SINGLE embedded image we decode to a
 *  pixmap. image.toPixmap() (this WASM build has no decode-time downscale) would
 *  otherwise allocate width×height×components bytes for whatever the PDF declares
 *  — an adversarial 20000×20000 embedded image is a multi-GB pixmap that aborts
 *  the WASM heap (same uncatchable-crash class as MAX_RASTER_EDGE_PX). Past this
 *  we DON'T extract the image as its own element; it stays baked into the page's
 *  background raster (already rendered at a bounded edge), so nothing is lost — we
 *  just don't promote a pathological image to an editable layer. Normal print
 *  photos (a few to ~20 MP) sit far below the default. Override with
 *  MAGAZINE_V2_MAX_IMAGE_DECODE_MP. */
const MAX_IMAGE_DECODE_MP = Math.max(8, Number(process.env.MAGAZINE_V2_MAX_IMAGE_DECODE_MP) || 40);

export interface RoughTextBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontFamily: string;
  fontWeight: 400 | 700;
  fontSize: number;
  color: string; // #rrggbb
  /** Measured from the block's own box (height / lines / fontSize) so a
   *  reconstructed multi-line block occupies the same vertical span as the
   *  source, instead of a guessed constant. */
  lineHeight: number;
}

export interface RoughImageBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  png: Buffer;
  /** True when the source image has an alpha channel — such images MUST be
   *  stored as PNG, not JPEG (JPEG has no alpha, so every transparent pixel
   *  becomes solid black — this is what turned a magnifying-glass lens and
   *  soft card shadows into black boxes). */
  hasAlpha: boolean;
  /** The image's separate soft mask (PDF SMask), when it has one.
   *  `image.toPixmap()` decodes the BASE image only — without compositing
   *  this mask back in as the alpha channel (done downstream with sharp),
   *  a rounded/shadowed photo renders as a hard opaque rectangle. */
  maskPng?: Buffer;
}

/** A thin vector-drawn rule/divider (see onVector below) — visually just a
 *  flat-color rectangle, so it's reconstructed as one (a "shape" element),
 *  never a raster crop/upload the way a photo or icon would need. */
export interface RoughLineBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string; // #rrggbb
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageRaster {
  pxWidth: number;
  pxHeight: number;
  backgroundPng: Buffer;
  textBlocks: RoughTextBlock[];
  imageBlocks: RoughImageBlock[];
  lineBlocks: RoughLineBlock[];
  /** Bounding boxes of QR codes drawn as vector modules — a dense square
   *  cluster of tiny rects. Collapsed to one placeholder downstream (an exact
   *  QR isn't needed), and the modules are kept out of lineBlocks so they
   *  don't litter the page as stray shape rules. */
  qrRegions: Rect[];
}

function colorToHex(c: number[] | undefined): string {
  if (!c || c.length === 0) return '#111111';
  const rgb = c.length === 1 ? [c[0]!, c[0]!, c[0]!] : c.length >= 3 ? c.slice(0, 3) : [0, 0, 0];
  const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `#${rgb.map((v) => toByte(v as number).toString(16).padStart(2, '0')).join('')}`;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

interface Glyph {
  ch: string;
  x0: number;
  x1: number;
}

// Reconstruct word spacing from glyph GEOMETRY rather than trusting MuPDF's
// own inserted space characters. For letter-spaced/tracked display type
// (mastheads, all-caps labels) MuPDF reads the wide inter-letter gaps as
// literal spaces, producing "M A G A Z I N E" or "A LO O K AT T H E". We drop
// its spaces entirely (see onChar) and re-insert them only where the gap
// between two glyphs is an outlier vs. the line's typical gap: a real word
// space is meaningfully wider than letter tracking, so it stands out; a run
// with no such outlier (one tracked word) gets no internal spaces at all.
// Verified against real files to leave already-correct body text untouched.
function reconstructLine(glyphs: Glyph[], size: number): string {
  if (glyphs.length === 0) return '';
  if (glyphs.length === 1) return glyphs[0]!.ch;
  const gaps: number[] = [];
  for (let i = 1; i < glyphs.length; i++) gaps.push(Math.max(0, glyphs[i]!.x0 - glyphs[i - 1]!.x1));
  const med = median(gaps);
  // Loop rather than Math.max(...gaps): a single MuPDF line can carry >100k
  // glyphs (machine-generated PDFs), and the spread would blow V8's argument
  // limit with a RangeError, failing an otherwise-fine page.
  let maxGap = 0;
  for (const g of gaps) if (g > maxGap) maxGap = g;
  const wordGap = Math.max(med * 1.8, 0.16 * size);
  const hasWordBreaks = maxGap > wordGap;
  const threshold = hasWordBreaks ? wordGap : Infinity;
  let out = glyphs[0]!.ch;
  for (let i = 1; i < glyphs.length; i++) {
    if (gaps[i - 1]! > threshold) out += ' ';
    out += glyphs[i]!.ch;
  }
  return out;
}

/** Fraction of the smaller box's area that must overlap the larger for two
 *  image blocks to count as "the same picture" (a photo + its soft-mask, or
 *  MuPDF surfacing base/masked/composite variants of one image). */
const IMAGE_DEDUP_OVERLAP = 0.7;
/** An image covering ~the whole page is a full-page composite/overlay layer,
 *  not a discrete picture — extracting it as an element just blankets (and
 *  hides) everything beneath it. Leave it baked in the background raster. */
const FULL_PAGE_FRACTION = 0.92;

function rectOverlap(a: RoughImageBlock, b: RoughImageBlock): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

interface PixmapStats {
  hasAlpha: boolean;
  isColor: boolean;
  /** Effect layers, not content: a scrim/glow (near-constant color with a
   *  varying alpha gradient), a flat decorative panel (constant opaque
   *  color), or a fully-transparent layer. Design-tool PDFs stack these over
   *  real photos; extracting one as an element paints a black/white box over
   *  the page (they only look right under blend modes we don't reproduce).
   *  They're already baked into the background raster — skip them. */
  isEffectLayer: boolean;
}

const STATS_MAX_SAMPLES = 20000;
const SCRIM_MAX_STDDEV = 10; // near-constant color + alpha gradient = scrim/glow
const FLAT_MAX_STDDEV = 6; // constant opaque color = decorative panel

/** Sampled per-channel pixel statistics, straight off the decoded pixmap
 *  (synchronous — sharp can't be used inside rasterizePage). */
function analyzePixmap(pm: ReturnType<InstanceType<typeof mupdf.Image>['toPixmap']>): PixmapStats {
  const hasAlpha = pm.getAlpha() === 1;
  const channels = pm.getNumberOfComponents(); // colorants + alpha
  const colorants = Math.max(1, channels - (hasAlpha ? 1 : 0));
  const width = pm.getWidth();
  const height = pm.getHeight();
  const stride = pm.getStride();
  const pixels = pm.getPixels();
  const total = width * height;
  const step = Math.max(1, Math.floor(total / STATS_MAX_SAMPLES));

  const sum = new Float64Array(colorants);
  const sumSq = new Float64Array(colorants);
  let alphaMax = hasAlpha ? 0 : 255;
  let count = 0;
  for (let p = 0; p < total; p += step) {
    const px = p % width;
    const py = Math.floor(p / width);
    const i = py * stride + px * channels;
    for (let c = 0; c < colorants; c++) {
      const v = pixels[i + c] ?? 0;
      sum[c] = sum[c]! + v;
      sumSq[c] = sumSq[c]! + v * v;
    }
    if (hasAlpha) alphaMax = Math.max(alphaMax, pixels[i + colorants] ?? 0);
    count++;
  }
  let maxStdDev = 0;
  for (let c = 0; c < colorants; c++) {
    const mean = sum[c]! / Math.max(1, count);
    const variance = Math.max(0, sumSq[c]! / Math.max(1, count) - mean * mean);
    maxStdDev = Math.max(maxStdDev, Math.sqrt(variance));
  }
  const invisible = hasAlpha && alphaMax < 16;
  const scrim = hasAlpha && maxStdDev < SCRIM_MAX_STDDEV;
  const flat = !hasAlpha && maxStdDev < FLAT_MAX_STDDEV;
  return { hasAlpha, isColor: colorants >= 3, isEffectLayer: invisible || scrim || flat };
}

/** An embedded image's native pixel count (width × height), or 0 if MuPDF can't
 *  report its dimensions — used to bound the decode before toPixmap() allocates. */
function safeImagePixels(image: Image): number {
  try {
    return Math.max(0, image.getWidth()) * Math.max(0, image.getHeight());
  } catch {
    return 0;
  }
}

// A PDF's own font name (e.g. "ABCDEF+Calibri", "TimesNewRomanPS-BoldMT") is
// real typography info we already have in hand via font.getName() — mapping
// it to the closest standard web-safe stack gets visibly closer to "the
// source document's actual font" than the old isSerif()-only guess, without
// the much bigger job of extracting/converting/hosting the actual embedded
// font program per tenant. Keys are checked longest-first so e.g.
// "helveticaneue" matches before the shorter "helvetica".
const FONT_STACKS: Record<string, string> = {
  timesnewroman: 'Times New Roman, Times, serif',
  timesroman: 'Times New Roman, Times, serif',
  times: 'Times New Roman, Times, serif',
  georgia: 'Georgia, serif',
  cambria: 'Cambria, Georgia, serif',
  garamond: 'Garamond, Georgia, serif',
  bookantiqua: 'Palatino Linotype, Book Antiqua, Palatino, serif',
  palatinolinotype: 'Palatino Linotype, Book Antiqua, Palatino, serif',
  palatino: 'Palatino Linotype, Book Antiqua, Palatino, serif',
  minionpro: 'Minion Pro, Georgia, serif',
  helveticaneue: 'Helvetica Neue, Helvetica, Arial, sans-serif',
  helvetica: 'Helvetica, Arial, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  calibri: 'Calibri, Candara, Segoe UI, Optima, sans-serif',
  candara: 'Candara, Calibri, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  tahoma: 'Tahoma, Geneva, sans-serif',
  segoeui: 'Segoe UI, Tahoma, sans-serif',
  trebuchetms: 'Trebuchet MS, sans-serif',
  centurygothic: 'Century Gothic, Arial, sans-serif',
  franklingothicmedium: 'Franklin Gothic Medium, Arial, sans-serif',
  futura: 'Futura, Century Gothic, sans-serif',
  myriadpro: 'Myriad Pro, Segoe UI, sans-serif',
  gillsans: 'Gill Sans, Calibri, sans-serif',
  comicsansms: 'Comic Sans MS, sans-serif',
  impact: 'Impact, Haettenschweiler, sans-serif',
  couriernew: 'Courier New, Courier, monospace',
  courier: 'Courier New, Courier, monospace',
  consolas: 'Consolas, Monaco, monospace',
  lucidaconsole: 'Lucida Console, Monaco, monospace',
};
const FONT_STACK_KEYS = Object.keys(FONT_STACKS).sort((a, b) => b.length - a.length);

function resolveFontFamily(font: Font): string {
  let raw = '';
  try {
    raw = font.getName();
  } catch {
    raw = '';
  }
  const normalized = raw
    .replace(/^[A-Z]{6}\+/, '') // strip the PDF subset prefix, e.g. "ABCDEF+Calibri"
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
  const key = FONT_STACK_KEYS.find((k) => normalized.startsWith(k));
  if (key) return FONT_STACKS[key]!;
  if (font.isMono()) return 'Courier New, Courier, monospace';
  return font.isSerif() ? 'Georgia, serif' : 'Arial, sans-serif';
}

/** Open a PDF buffer. Throws on a corrupted/unsupported/encrypted file —
 *  callers should catch and record `issue.processingError`, not crash the
 *  worker process. */
export function openPdf(buffer: Buffer) {
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  if (doc.needsPassword()) {
    // Free the just-allocated Document before throwing: it never reaches the
    // caller, so the caller's `finally { doc?.destroy() }` can't free it —
    // without this it leaks one fz_document per encrypted upload.
    doc.destroy();
    throw new Error("This PDF is password-protected and can't be processed.");
  }
  return doc;
}

export function countPages(doc: ReturnType<typeof openPdf>): number {
  return doc.countPages();
}

// Every vector fill/stroke on a page (table gridlines, decorative borders,
// illustrated art) comes through the same onVector callback as a genuine
// divider/rule — dense print layouts can produce hundreds to 1000+ of these
// per page, so only a narrow "thin in one dimension, long in the other"
// shape counts as an extractable rule. Everything else stays baked into the
// background raster rather than flooding a page with noise elements — a
// stamp illustration's texture isn't "a line" just because MuPDF drew it as
// many small vector ops.
const LINE_MAX_THICKNESS_PX = 6; // ~3pt at RENDER_DPI — thicker than a hairline rule
const LINE_MIN_LENGTH_PX = 16; // ~7.7pt — shorter is dust, not a meaningful divider
const MAX_LINE_BLOCKS_PER_PAGE = 80; // a page past this is a dense grid/table, not rules

// QR codes are often drawn as vector modules — dozens to hundreds of tiny
// rects. They're too short to be "rules" (below LINE_MIN_LENGTH), so they'd
// otherwise vanish from extraction and only the few longer fragments would
// leak through as stray shape dashes. Collect the small module rects
// separately and cluster them: a dense, compact, roughly square cluster is a
// QR, collapsed to one placeholder region (an exact QR isn't needed).
const QR_MODULE_MAX_PX = 44; // a QR module rect is small; larger vectors aren't candidates
const QR_MEMBER_MIN = 40; // real QRs pack ~180 module rects; this rejects sparse decorative clusters while keeping margin
const QR_CLUSTER_GAP_PX = 24; // rects nearer than this join the same cluster
const QR_MIN_SIDE_PX = 40;
const QR_MAX_SIDE_PX = 340;
const MAX_QR_CANDIDATES = 6000; // backstop against pathological dense-vector art

/** Group small vector rects into clusters by proximity, and return the
 *  bounding boxes of clusters dense/compact/square enough to be a QR code. */
function detectQrClusters(cands: Rect[]): Rect[] {
  interface C { minX: number; minY: number; maxX: number; maxY: number; n: number }
  const clusters: C[] = [];
  for (const r of cands) {
    const near = clusters.find(
      (c) =>
        r.x <= c.maxX + QR_CLUSTER_GAP_PX &&
        r.x + r.w >= c.minX - QR_CLUSTER_GAP_PX &&
        r.y <= c.maxY + QR_CLUSTER_GAP_PX &&
        r.y + r.h >= c.minY - QR_CLUSTER_GAP_PX,
    );
    if (near) {
      near.minX = Math.min(near.minX, r.x);
      near.minY = Math.min(near.minY, r.y);
      near.maxX = Math.max(near.maxX, r.x + r.w);
      near.maxY = Math.max(near.maxY, r.y + r.h);
      near.n += 1;
    } else {
      clusters.push({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h, n: 1 });
    }
  }
  const regions: Rect[] = [];
  for (const c of clusters) {
    const w = c.maxX - c.minX;
    const h = c.maxY - c.minY;
    const aspect = w / h;
    if (
      c.n >= QR_MEMBER_MIN &&
      aspect >= 0.6 &&
      aspect <= 1.6 &&
      w >= QR_MIN_SIDE_PX &&
      w <= QR_MAX_SIDE_PX &&
      h >= QR_MIN_SIDE_PX &&
      h <= QR_MAX_SIDE_PX
    ) {
      regions.push({ x: c.minX, y: c.minY, w, h });
    }
  }
  return regions;
}

function centerInside(r: Rect, box: Rect): boolean {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
}

/**
 * Rasterize one page AND walk its structured text/image layer in one pass.
 * Text is aggregated at MuPDF's own "text block" granularity (its layout
 * analysis already groups related lines — this is what lets fragmented PDF
 * text spans become one logical paragraph/headline instead of dozens of
 * one-line elements). Image blocks come back already decoded, with their
 * placement rect, ready to re-encode and upload — no separate embedded-image
 * extraction step needed.
 */
export function rasterizePage(doc: ReturnType<typeof openPdf>, index: number): PageRaster {
  // MuPDF objects live in the WASM heap and are NOT reclaimed by V8's GC — every
  // Page/Pixmap/StructuredText/Image created here must be explicitly destroy()'d
  // or it accumulates across every page of every issue until the heap aborts (an
  // uncatchable crash that kills the worker and every job in flight). The Page is
  // freed in finally below; the pixmap/stext/per-image objects are freed inside
  // extractPage. Splitting the body out keeps that guarantee without indenting
  // the whole (heavily-commented) extractor under a try.
  const page = doc.loadPage(index);
  try {
    return extractPage(page, index);
  } finally {
    page.destroy();
  }
}

function extractPage(page: Page, index: number): PageRaster {
  const bounds = page.getBounds(); // [x0, y0, x1, y1] in PDF points
  const wPt = bounds[2]! - bounds[0]!;
  const hPt = bounds[3]! - bounds[1]!;
  // Clamp the effective scale so the longest raster edge can never exceed
  // MAX_RASTER_EDGE_PX — a pathological/adversarial MediaBox would otherwise
  // allocate a multi-GB pixmap below and abort the WASM heap (see the constant).
  const maxPtEdge = Math.max(1, wPt, hPt);
  const scale = Math.min(RENDER_DPI / 72, MAX_RASTER_EDGE_PX / maxPtEdge);
  const originX = bounds[0]!;
  const originY = bounds[1]!;
  const pxWidth = Math.round(wPt * scale);
  const pxHeight = Math.round(hPt * scale);

  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
  // Copy the raster into a Node Buffer, then free the WASM pixmap — in finally so
  // an asPNG()/Buffer.from failure (encode error, or a Node OOM copying a ~100MB
  // raster) can't leak the pixmap.
  let backgroundPng: Buffer;
  try {
    backgroundPng = Buffer.from(pixmap.asPNG());
  } finally {
    pixmap.destroy();
  }

  const toPx = (x: number, y: number): [number, number] => [(x - originX) * scale, (y - originY) * scale];

  const textBlocks: RoughTextBlock[] = [];
  const imageBlocks: RoughImageBlock[] = [];
  const lineBlocks: RoughLineBlock[] = [];
  // Thin-and-long rules, and separately the small module rects that make up a
  // vector QR — resolved into lineBlocks/qrRegions after the walk.
  const rules: RoughLineBlock[] = [];
  const qrCandidates: Rect[] = [];
  let cappedVectors = false;

  // Accumulated per LOGICAL run of same-formatted lines, not per MuPDF
  // "text block" — MuPDF's own block grouping can merge visually distinct
  // lines (e.g. a small byline, a huge headline, and a subhead stacked in
  // one design-tool text frame) into ONE block, and capturing metrics only
  // once per block (from its first character) silently applies that first
  // line's small size/color to every other line in the block — this is what
  // made a genuine 97px masthead render at 16px. Splitting on any font
  // family/weight/size/color change between lines fixes that while still
  // keeping a uniformly-formatted wrapped paragraph as one block.
  interface LineMetrics {
    fontFamily: string;
    fontWeight: 400 | 700;
    fontSize: number;
    color: string;
  }
  const rawImages: (RoughImageBlock & { isColor: boolean })[] = [];
  let current: (LineMetrics & { text: string; x: number; y: number; w: number; h: number }) | null = null;
  let lineBBox: number[] | null = null;
  let lineGlyphs: Glyph[] = [];
  let lineSize = 0;
  let lineMetrics: LineMetrics | null = null;

  function sameFormat(a: LineMetrics, b: LineMetrics): boolean {
    return a.fontFamily === b.fontFamily && a.fontWeight === b.fontWeight && a.fontSize === b.fontSize && a.color === b.color;
  }
  function flushTextBlock() {
    if (current && current.text.trim()) {
      const text = current.text.trim();
      // Real leading, measured from the block's own box: box height spread
      // over its line count, relative to the font size. A single line's bbox
      // is ~1.1–1.3× its font size (ascender+descender), so this lands on the
      // source document's actual line spacing instead of a guessed constant.
      const lines = text.split('\n').length;
      const ratio = current.h / (lines * Math.max(1, current.fontSize));
      const lineHeight = Math.min(2.5, Math.max(0.9, ratio));
      textBlocks.push({ ...current, text, lineHeight });
    }
    current = null;
  }

  // "preserve-images" is required for onImageBlock to fire at all — without
  // it, MuPDF's structured text walk silently omits every embedded image
  // from the tree (they still show up fine in the page's own raster render,
  // just never as their own extractable block), so a page's photos would
  // never become separate, editable elements. "vectors" is the (undocumented
  // in the JS types, confirmed by trial) option that turns on onVector below
  // — omitting it means every rule/divider on the page silently never fires
  // it either, same failure shape as images without preserve-images.
  const stext = page.toStructuredText('preserve-whitespace,preserve-images,vectors');
  // stext owns the Image objects handed to onImageBlock; keep it alive for the
  // whole walk, then free it in finally so a throwing callback can't leak it.
  try {
  stext.walk({
    beginTextBlock() {
      // A new MuPDF block never continues the previous one's accumulated
      // run, even if formatting happens to match (e.g. two separate columns
      // of identically-styled body text shouldn't merge into one block).
      flushTextBlock();
    },
    beginLine(bbox: number[]) {
      lineBBox = bbox;
      lineGlyphs = [];
      lineSize = 0;
      lineMetrics = null;
    },
    onChar(c: string, _origin, font, size, quad: number[], color) {
      if (!lineBBox) return;
      // Drop MuPDF's own space characters — spacing is reconstructed from
      // glyph geometry in endLine (reconstructLine) so letter-spaced text
      // doesn't come out as "M A G A Z I N E". Metrics are taken from the
      // first real glyph.
      if (c.trim() === '') return;
      if (!lineMetrics) {
        lineMetrics = {
          fontFamily: resolveFontFamily(font),
          fontWeight: font.isBold() ? 700 : 400,
          fontSize: Math.round(size * scale),
          color: colorToHex(color as unknown as number[]),
        };
      }
      lineSize = size;
      lineGlyphs.push({ ch: c, x0: quad[0]!, x1: quad[2]! });
    },
    endLine() {
      const lineText = reconstructLine(lineGlyphs, lineSize);
      if (!lineBBox || !lineMetrics || !lineText.trim()) {
        lineBBox = null;
        return;
      }
      const [x, y] = toPx(lineBBox[0]!, lineBBox[1]!);
      const w = (lineBBox[2]! - lineBBox[0]!) * scale;
      const h = (lineBBox[3]! - lineBBox[1]!) * scale;
      // Geometry-aware continuation. Two same-format "lines" can really be:
      // (a) the same visual line (MuPDF splits wide-tracked display type —
      //     e.g. the digits of a big "03" — into one "line" per glyph run):
      //     high vertical overlap → join on the SAME line, no newline;
      // (b) consecutive lines of one paragraph: small vertical gap → "\n";
      // (c) unrelated runs that happen to share formatting (scattered
      //     captions down a photo column): big vertical gap → separate
      //     blocks. Without this split, their union bbox becomes a giant
      //     rectangle and the text-erase step paints over half the page.
      let mode: 'same-line' | 'next-line' | 'break' = 'break';
      if (current && sameFormat(current, lineMetrics)) {
        const vOverlap = Math.min(current.y + current.h, y + h) - Math.max(current.y, y);
        const gapY = y - (current.y + current.h);
        if (vOverlap > 0.6 * Math.min(h, current.h)) mode = 'same-line';
        else if (gapY <= 1.2 * lineMetrics.fontSize) mode = 'next-line';
      }
      if (current && mode !== 'break') {
        if (mode === 'same-line') {
          const gapX = x - (current.x + current.w);
          current.text += (gapX > 0.25 * lineMetrics.fontSize ? ' ' : '') + lineText;
        } else {
          current.text += '\n' + lineText;
        }
        const nx = Math.min(current.x, x);
        const ny = Math.min(current.y, y);
        const right = Math.max(current.x + current.w, x + w);
        const bottom = Math.max(current.y + current.h, y + h);
        current.x = nx;
        current.y = ny;
        current.w = right - nx;
        current.h = bottom - ny;
      } else {
        flushTextBlock();
        current = { text: lineText, x, y, w, h, ...lineMetrics };
      }
      lineBBox = null;
    },
    endTextBlock() {
      flushTextBlock();
    },
    onImageBlock(bbox: number[], _transform, image) {
      // `image` is owned by the StructuredText (freed when stext is destroyed) —
      // do NOT destroy it here. Only the pixmap/mask objects WE create below get
      // freed, in finally, so at most ONE image's pixmaps are alive at a time
      // (the accumulation across a page's images is what pushed the heap to OOM).
      let imgPixmap: Pixmap | null = null;
      let mask: Image | null = null;
      let maskPixmap: Pixmap | null = null;
      try {
        const [x, y] = toPx(bbox[0]!, bbox[1]!);
        const w = (bbox[2]! - bbox[0]!) * scale;
        const h = (bbox[3]! - bbox[1]!) * scale;
        // Skip slivers — hairline rules / decorative underlines rendered as
        // 1px "images" aren't meaningful editable picture elements.
        if (w < 24 || h < 24) return;
        // Skip full-page composite/overlay layers — extracting one as an
        // element would blanket (and hide) everything beneath it; it's
        // already in the background raster.
        if (w >= pxWidth * FULL_PAGE_FRACTION && h >= pxHeight * FULL_PAGE_FRACTION) return;
        // Bound the decode: a pathologically large embedded image would allocate
        // a multi-GB pixmap and abort the WASM heap. Past the budget, leave it in
        // the background raster rather than promote it to its own element.
        const nativePx = safeImagePixels(image);
        if (nativePx > MAX_IMAGE_DECODE_MP * 1_000_000) {
          console.warn(`[worker] page ${index}: skipping a ~${Math.round(nativePx / 1_000_000)}MP embedded image (> ${MAX_IMAGE_DECODE_MP}MP decode budget) — it stays baked into the background raster.`);
          return;
        }
        imgPixmap = image.toPixmap();
        const stats = analyzePixmap(imgPixmap);
        // Scrims/glows/flat panels aren't content — leave them baked in the
        // background instead of painting a black/white box over the page.
        if (stats.isEffectLayer) return;
        const png = Buffer.from(imgPixmap.asPNG());
        // A PDF SMask is a SEPARATE image: toPixmap() above decodes the base
        // only, so a rounded/shadowed photo would render as a hard opaque
        // rectangle. Capture the mask; processPage composites it back in as
        // the alpha channel with sharp.
        let maskPng: Buffer | undefined;
        if (!stats.hasAlpha) {
          try {
            mask = image.getMask();
            if (mask) {
              maskPixmap = mask.toPixmap();
              maskPng = Buffer.from(maskPixmap.asPNG());
            }
          } catch {
            // No mask (or an undecodable one) — the base image still stands alone.
          }
        }
        rawImages.push({
          x,
          y,
          w,
          h,
          png,
          hasAlpha: stats.hasAlpha || !!maskPng,
          maskPng,
          isColor: stats.isColor,
        });
      } catch {
        // A single malformed embedded image shouldn't fail the whole page.
      } finally {
        maskPixmap?.destroy();
        mask?.destroy();
        imgPixmap?.destroy();
      }
    },
    onVector(bbox: number[], _flags, color) {
      if (rules.length + qrCandidates.length >= MAX_QR_CANDIDATES) {
        if (!cappedVectors) {
          cappedVectors = true;
          console.warn(`[worker] page ${index}: hit the ${MAX_QR_CANDIDATES}-vector cap — this page is likely dense vector art, remaining vectors stay baked into the background.`);
        }
        return;
      }
      const [x, y] = toPx(bbox[0]!, bbox[1]!);
      const w = (bbox[2]! - bbox[0]!) * scale;
      const h = (bbox[3]! - bbox[1]!) * scale;
      const minDim = Math.min(w, h);
      const maxDim = Math.max(w, h);
      if (minDim <= LINE_MAX_THICKNESS_PX && maxDim >= LINE_MIN_LENGTH_PX) {
        rules.push({ x, y, w, h, color: colorToHex(color as unknown as number[]) });
      }
      // Small module rects feed QR detection only (never emitted as shapes) —
      // this is how a QR built from tiny squares gets recognized instead of
      // silently dropped for being too short to count as a rule.
      if (maxDim <= QR_MODULE_MAX_PX && minDim >= 2) {
        qrCandidates.push({ x, y, w, h });
      }
    },
  });
  } finally {
    stext.destroy();
  }

  // Resolve vector output: QR clusters first, then rules — dropping any rule
  // that falls inside a detected QR so its module fragments don't also render
  // as stray dashes. Rules are capped (a page past the cap is a dense grid).
  const qrRegions = detectQrClusters(qrCandidates);
  for (const rule of rules) {
    if (lineBlocks.length >= MAX_LINE_BLOCKS_PER_PAGE) break;
    if (qrRegions.some((q) => centerInside(rule, q))) continue;
    lineBlocks.push(rule);
  }

  // Dedup overlapping image blocks. MuPDF surfaces one visible picture as
  // several blocks — a color image plus its grayscale soft-mask/shadow, or
  // base/masked/composite variants at the same spot (the magnifying glass
  // came through as four). Keep colour over grayscale, then larger; drop any
  // block that sits almost entirely inside an already-kept one. Without this,
  // grayscale masks render as gray/black boxes stacked over the real photo.
  const ordered = [...rawImages].sort((a, b) => {
    if (a.isColor !== b.isColor) return a.isColor ? -1 : 1;
    // Prefer the alpha-masked variant over an opaque duplicate: since image
    // regions aren't erased from the background, a masked (transparent-edge)
    // overlay blends into it invisibly, whereas an opaque rectangle shows
    // hard corners over a shape the design meant to be clipped (e.g. a round
    // magnifier lens).
    if (a.hasAlpha !== b.hasAlpha) return a.hasAlpha ? -1 : 1;
    return b.w * b.h - a.w * a.h;
  });
  for (const blk of ordered) {
    const dup = imageBlocks.some((kept) => {
      const aArea = blk.w * blk.h;
      const kArea = kept.w * kept.h;
      const minArea = Math.min(aArea, kArea);
      if (minArea <= 0) return false;
      // Similar size is part of the definition of "duplicate": variants of
      // one picture (base / soft-mask / composite) share ~the same box. A
      // SMALL photo sitting INSIDE a big one (a collage, a stamp overlaid on
      // a column photo) is layered content, not a duplicate — swallowing it
      // hides it, because the big image's own pixels don't include overlays.
      const sizeSimilar = minArea / Math.max(aArea, kArea) > 0.35;
      return sizeSimilar && rectOverlap(blk, kept) / minArea > IMAGE_DEDUP_OVERLAP;
    });
    if (!dup) imageBlocks.push({ x: blk.x, y: blk.y, w: blk.w, h: blk.h, png: blk.png, hasAlpha: blk.hasAlpha, maskPng: blk.maskPng });
  }

  return { pxWidth, pxHeight, backgroundPng, textBlocks, imageBlocks, lineBlocks, qrRegions };
}
