// ---------------------------------------------------------------------------
// Magazine Builder v2 — a page as ONE self-contained HTML document, for the
// Visual Critic's proof render (renderPreview.ts).
//
// The pure half of the renderer: no browser, no network, no storage, so it can be
// unit-tested. It mirrors the web canvas (apps/web/src/editor-v2/IssuePageCanvas.tsx
// + geometry.ts) rule for rule — element boxes as % of the page's canonical
// width/height, every typographic length in `cqw` against a `container-type:
// inline-size` page box, the same text flex/vAlign/white-space rules, the same
// image object-fit/object-position, shapes with their scrim opacity — because a
// critic judging a page that renders differently from what the reader sees would
// be judging a different page.
//
// Two deliberate simplifications, both told to the critic in its prompt: a QR code
// is drawn as a placeholder pattern (the real one is a client-side component), and
// a registry icon as a simple ring (the real glyphs are Lucide React components).
// Neither changes a page's composition, which is what the critic is judging.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';

/** The page fields the serialiser reads (structurally a ComposedPage + its dims). */
export interface PreviewPage {
  width: number;
  height: number;
  background: { type: 'color' | 'image'; value: string };
  elements: MagazineElement[];
}

/** Proof width in CSS px. Wide enough to judge type and crops, small enough to be cheap
 *  to render and to send to a vision model (~620×877 for A4). */
export const PREVIEW_WIDTH = 620;

/**
 * Origin given to a RELATIVE image URL (the API's `/api/uploads/file/<key>` proxy
 * form). The proof is loaded with setContent (an about:blank document), where a
 * relative URL never makes a request at all; anchoring it to this reserved, never-
 * resolvable origin lets the renderer's request handler recognise the key and serve
 * the bytes itself.
 */
export const PREVIEW_ASSET_ORIGIN = 'http://assets.preview.invalid';

/** Faces every machine (or its fallback) already has — never requested from Google. */
const SYSTEM_FAMILIES = new Set(
  ['georgia', 'arial', 'helvetica', 'times new roman', 'times', 'verdana', 'tahoma', 'courier new', 'courier', 'serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy', 'inherit', 'initial'],
);
/**
 * Weights known to exist for the web fonts the generator chooses from (DISPLAY_FONTS /
 * BODY_FONTS in generate.ts; the web app loads them in apps/web/src/styles/theme.css).
 * Google's CSS2 API REJECTS a request naming a weight a family lacks, so an unknown
 * family is requested at its default weight only.
 */
const KNOWN_WEIGHTS: Record<string, string> = {
  'playfair display': '400;500;600;700;800;900',
  inter: '400;500;600;700;800;900',
  montserrat: '400;500;600;700;800;900',
  oswald: '400;500;600;700',
  'source sans 3': '400;500;600;700;800;900',
  'dm serif display': '',
};

/**
 * One Google Fonts stylesheet URL per web-font family the page's text uses (the first
 * family of each stack). One link per family, so a family Google does not serve fails
 * alone instead of taking the others with it.
 */
export function googleFontLinks(elements: ReadonlyArray<MagazineElement>): string[] {
  const families = new Map<string, string>();
  for (const el of elements) {
    const stack = el.type === 'text' ? el.text?.fontFamily : undefined;
    if (!stack) continue;
    const first = stack.split(',')[0]!.trim().replace(/^['"]|['"]$/g, '').trim();
    if (!first || !/^[A-Za-z0-9 ]{2,60}$/.test(first) || SYSTEM_FAMILIES.has(first.toLowerCase())) continue;
    families.set(first.toLowerCase(), first);
  }
  return [...families.entries()].map(([key, name]) => {
    const weights = KNOWN_WEIGHTS[key];
    const fam = name.replace(/ /g, '+') + (weights ? `:wght@${weights}` : '');
    return `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
  });
}

/** The proof's pixel size for a page of `pageW × pageH` canonical px. */
export function previewSize(pageW: number, pageH: number, previewWidth = PREVIEW_WIDTH): { width: number; height: number } {
  const w = pageW > 0 ? pageW : 1;
  const h = pageH > 0 ? pageH : Math.round(w * 1.414);
  return { width: Math.round(previewWidth), height: Math.round((previewWidth * h) / w) };
}

/** Escape for a double-quoted HTML attribute. */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function hex(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX_RE.test(v) ? v : fallback;
}
/**
 * A page background colour as the web canvas paints it (`background: value`): a hex,
 * or a CSS colour/gradient expression such as the generator's
 * `linear-gradient(135deg, #283a52 0%, #0B1F3A 45%, …)`. Only colour-expression
 * characters are allowed — no url(), quotes, semicolons or escapes — else white.
 */
export function safeCssBackground(v: unknown): string {
  if (typeof v !== 'string') return '#ffffff';
  const s = v.trim();
  if (HEX_RE.test(s)) return s;
  if (s.length <= 400 && /^[#a-zA-Z0-9%(),.\s-]+$/.test(s) && !/url|expression|image-set|var\(/i.test(s)) return s;
  return '#ffffff';
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
/** A CSS percentage with enough precision to land on the same pixel as the web canvas. */
function pct(part: number, whole: number): string {
  return `${+((part / whole) * 100).toFixed(4)}%`;
}
function cqw(px: number, pageW: number): string {
  return `${+((px / pageW) * 100).toFixed(4)}cqw`;
}

/**
 * Image src for the proof: http(s) and data: pass through; a root-relative URL is
 * anchored to PREVIEW_ASSET_ORIGIN; anything else (javascript:, blob:, junk) is dropped.
 */
export function previewSrc(url: string | undefined | null): string {
  const u = (url ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || /^data:image\//i.test(u)) return u;
  if (u.startsWith('/') && !u.startsWith('//')) return `${PREVIEW_ASSET_ORIGIN}${u}`;
  return '';
}

/**
 * Defence in depth for text content. Element HTML is already sanitised on every write
 * (writePipeline → sanitize.ts), and the renderer blocks every script/frame/XHR
 * request; this strips the few tags and handlers that could still DO something in a
 * proof document if a future write path ever skipped the sanitiser.
 */
export function stripActiveHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|form|svg|math|template|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form|svg|math|template|noscript)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '');
}

function style(parts: Array<[string, string | number | undefined | null | false]>): string {
  return parts
    .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

function boxStyle(el: MagazineElement, page: { width: number; height: number }): Array<[string, string | number | undefined]> {
  return [
    ['position', 'absolute'],
    ['left', pct(num(el.x, 0), page.width)],
    ['top', pct(num(el.y, 0), page.height)],
    ['width', pct(num(el.w, 0), page.width)],
    ['height', pct(num(el.h, 0), page.height)],
    ['transform', el.rotation ? `rotate(${num(el.rotation, 0)}deg)` : undefined],
    ['z-index', Math.round(num(el.zIndex, 0))],
    ['overflow', 'hidden'],
  ];
}

function textHtml(el: MagazineElement, page: { width: number; height: number }): string {
  const t = el.text;
  if (!t) return '';
  // Same rule as the web canvas: EXTRACTED text keeps the source PDF's line breaks and
  // may spill; generated/manual copy wraps and clips.
  const extracted = el.source === 'extracted';
  const vAlign = t.vAlign ?? 'top';
  const outer = style([
    ...boxStyle(el, page),
    ['overflow', extracted ? 'visible' : 'hidden'],
    ['display', 'flex'],
    ['flex-direction', 'column'],
    ['justify-content', vAlign === 'center' ? 'center' : vAlign === 'bottom' ? 'flex-end' : 'flex-start'],
  ]);
  const inner = style([
    ['width', '100%'],
    ['font-family', t.fontFamily || 'inherit'],
    ['font-weight', num(t.fontWeight, 400)],
    ['color', hex(t.color, '#111111')],
    ['text-align', t.align || 'left'],
    ['line-height', num(t.lineHeight, 1.3)],
    ['font-size', cqw(num(t.fontSize, 16), page.width)],
    ['letter-spacing', t.letterSpacing ? cqw(t.letterSpacing, page.width) : undefined],
    ['text-transform', t.textTransform && t.textTransform !== 'none' ? t.textTransform : undefined],
    ['white-space', extracted ? 'pre' : 'pre-wrap'],
    ['overflow-wrap', extracted ? undefined : 'break-word'],
  ]);
  return `<div style="${escapeAttr(outer)}" data-role="${escapeAttr(t.role || 'other')}"><div style="${escapeAttr(inner)}">${stripActiveHtml(t.content || '')}</div></div>`;
}

function imageHtml(el: MagazineElement, page: { width: number; height: number }): string {
  const src = previewSrc(el.image?.url);
  if (!src || !el.image) return '';
  const fp = el.image.focalPoint;
  const img = style([
    ['display', 'block'],
    ['width', '100%'],
    ['height', '100%'],
    ['object-fit', el.image.fit === 'contain' ? 'contain' : 'cover'],
    ['object-position', fp ? `${num(fp.x, 0.5) * 100}% ${num(fp.y, 0.5) * 100}%` : undefined],
  ]);
  return `<div style="${escapeAttr(style(boxStyle(el, page)))}"><img src="${escapeAttr(src)}" alt="" style="${escapeAttr(img)}"></div>`;
}

function shapeHtml(el: MagazineElement, page: { width: number; height: number }): string {
  if (!el.shape) return '';
  const opacity = typeof el.shape.opacity === 'number' && el.shape.opacity < 1 ? Math.max(0, el.shape.opacity) : 1;
  return `<div style="${escapeAttr(style([...boxStyle(el, page), ['background', hex(el.shape.fill, '#000000')], ['opacity', opacity]]))}"></div>`;
}

/** A QR-like placeholder: the real code is drawn client-side; its footprint is what matters here. */
function qrHtml(el: MagazineElement, page: { width: number; height: number }): string {
  if (!el.qr) return '';
  const fg = hex(el.qr.fg, '#000000');
  const bg = hex(el.qr.bg, '#ffffff');
  const finder = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="7" height="7" fill="${fg}"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="${bg}"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="${fg}"/>`;
  let dots = '';
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      const inFinder = (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16);
      if (!inFinder && (x * 7 + y * 13 + x * y) % 3 === 0) dots += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fg}"/>`;
    }
  }
  const svg = `<svg viewBox="-2 -2 29 29" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;background:${bg}">${finder(0, 0)}${finder(18, 0)}${finder(0, 18)}${dots}</svg>`;
  return `<div style="${escapeAttr(style([...boxStyle(el, page), ['background', bg]]))}">${svg}</div>`;
}

/** An icon: an uploaded glyph as an image, a registry glyph as a simple ring. */
function iconHtml(el: MagazineElement, page: { width: number; height: number }): string {
  if (!el.icon) return '';
  const color = hex(el.icon.color, '#111111');
  const wrap = escapeAttr(style([...boxStyle(el, page), ['display', 'flex'], ['align-items', 'center'], ['justify-content', 'center'], ['color', color]]));
  const src = previewSrc(el.icon.src);
  if (src) return `<div style="${wrap}"><img src="${escapeAttr(src)}" alt="" style="width:100%;height:100%;object-fit:contain"></div>`;
  return `<div style="${wrap}"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${color}" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/></svg></div>`;
}

function elementHtml(el: MagazineElement, page: { width: number; height: number }): string {
  switch (el.type) {
    case 'text':
      return textHtml(el, page);
    case 'image':
      return imageHtml(el, page);
    case 'shape':
      return shapeHtml(el, page);
    case 'qr':
      return qrHtml(el, page);
    case 'icon':
      return iconHtml(el, page);
    default:
      return '';
  }
}

/**
 * Serialise one page to a complete HTML document whose `#page` box is exactly
 * previewSize(...) CSS px. Elements are painted in zIndex order (a stable sort, so
 * equal z keeps document order — as the web canvas does).
 */
export function pageToPreviewHtml(page: PreviewPage, opts: { previewWidth?: number; webFonts?: boolean } = {}): string {
  const dims = { width: page.width > 0 ? page.width : 1, height: page.height > 0 ? page.height : Math.round((page.width || 1) * 1.414) };
  const size = previewSize(dims.width, dims.height, opts.previewWidth ?? PREVIEW_WIDTH);
  const sorted = [...(page.elements ?? [])].sort((a, b) => num(a.zIndex, 0) - num(b.zIndex, 0));
  const bgValue = page.background?.value ?? '';
  const bgSrc = page.background?.type === 'image' ? previewSrc(bgValue) : '';
  const background = bgSrc
    ? `<img src="${escapeAttr(bgSrc)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block">`
    : `<div style="position:absolute;inset:0;background:${escapeAttr(safeCssBackground(bgValue))}"></div>`;
  const fontLinks = opts.webFonts === false ? [] : googleFontLinks(sorted);
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    ...fontLinks.map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`),
    // A minimal copy of the Tailwind preflight the web canvas renders under — it is
    // what zeroes paragraph margins and heading sizes inside rich-text copy.
    '<style>',
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
    'html,body{background:#ffffff;-webkit-text-size-adjust:100%}',
    'h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}',
    'ol,ul{list-style:none}',
    'img{display:block;max-width:100%}',
    'b,strong{font-weight:bolder}',
    '</style></head><body>',
    `<div id="page" style="position:relative;overflow:hidden;width:${size.width}px;height:${size.height}px;container-type:inline-size;background:#ffffff">`,
    background,
    ...sorted.map((el) => elementHtml(el, dims)),
    '</div></body></html>',
  ].join('');
}
