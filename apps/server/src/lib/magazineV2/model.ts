// ---------------------------------------------------------------------------
// Magazine Builder v2 — the free-form canvas element model.
//
// Unlike the v1 template builder (layout is code, content is a named-region
// map), a v2 page's layout is NOT known ahead of time — it comes from whatever
// an uploaded PDF contained, or from a generation template compiled to raw
// elements. So the model is a generic list of absolutely-positioned elements
// per page (x/y/w/h in the page's OWN canonical width/height), not named
// regions. The renderer converts px → % / cqw at draw time so a page scales
// responsively (that conversion is the single source of pixel fidelity across
// editor, public viewer, and PDF).
//
// Server-safe: no React, no DOM. Rich-text HTML sanitisation is separate
// (./sanitize, DOM/Node only). Ported + extended from the campaign-hq reference
// (packages/blocks/src/magazine.ts), adding shape/qr element kinds.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { safeUrl, safePublicImageUrl } from './url.js';
import { isKnownIcon, FALLBACK_ICON_NAME } from './icons.js';

export const ELEMENT_TYPES = ['text', 'image', 'shape', 'qr', 'icon'] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

/** What role a text block plays — set by AI classification, editable by hand. */
export const TEXT_ROLES = [
  'headline',
  'subhead',
  'byline',
  'body',
  'caption',
  'pullquote',
  'other',
] as const;
export type TextRole = (typeof TEXT_ROLES)[number];

/** Who last wrote this element — lets the UI flag AI-authored/low-confidence
 *  content, and lets an AI agent's edits be told apart from a human's without a
 *  separate (weaker) write path: both go through the validators in this file. */
export const ELEMENT_SOURCES = ['extracted', 'manual', 'ai-agent'] as const;
export type ElementSource = (typeof ELEMENT_SOURCES)[number];

export type ElementAutoFit = 'shrink' | 'clip';
export type ElementImageFit = 'cover' | 'contain';
export type ElementTextAlign = 'left' | 'center' | 'right' | 'justify';
export type ElementTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type ElementVAlign = 'top' | 'center' | 'bottom';

export interface ElementTextData {
  content: string; // sanitised inline HTML only (see ./sanitize)
  role: TextRole;
  fontFamily: string;
  fontSize: number; // px at the page's canonical dims — the CURRENT (fit) size
  maxFontSize?: number; // design's intended ceiling; refit shrinks from here
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  color: string; // #rrggbb
  align: ElementTextAlign;
  lineHeight: number;
  autoFit: ElementAutoFit;
  vAlign?: ElementVAlign;
  letterSpacing?: number; // px at canonical dims (default 0)
  textTransform?: ElementTextTransform; // default 'none'
}

export interface ElementImageData {
  assetId: string; // MediaAsset id, '' if not (yet) backed by one
  url: string;
  alt: string;
  fit: ElementImageFit;
  focalPoint?: { x: number; y: number }; // 0–1, for object-position
}

export interface ElementShapeData {
  fill: string; // #rrggbb — a flat rectangle (rules / dividers / panels)
  /** 0–1. <1 makes the shape a translucent overlay — a SCRIM over a photo so
   *  text stays legible without hiding the picture. Absent/1 = solid. */
  opacity?: number;
}

export interface ElementQrData {
  url: string; // '' until set
  fg: string; // #rrggbb
  bg: string; // #rrggbb
}

export interface ElementIconData {
  /** Curated registry glyph name (see ./icons). '' / unknown → renderer fallback. */
  name?: string;
  /** Uploaded custom icon URL (SVG/PNG). When set, OVERRIDES `name`. */
  src?: string;
  /** Optional hex tint — applies to registry glyphs only (uploaded art renders as-is). */
  color?: string;
}

/** One positioned block on a magazine page. */
export interface MagazineElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees
  zIndex: number;
  locked: boolean;
  text?: ElementTextData;
  image?: ElementImageData;
  shape?: ElementShapeData;
  qr?: ElementQrData;
  icon?: ElementIconData;
  source: ElementSource;
  confidence?: number; // 0–1, AI extraction confidence
}

export const MAX_ELEMENTS_PER_PAGE = 400;
const MAX_TEXT_HTML = 8000;
const MAX_FONT_FAMILY = 80;
const MAX_ALT = 300;
const MAX_QR_URL = 2000;
export const MIN_SIZE = 2;

const TEXT_ROLE_SET = new Set<string>(TEXT_ROLES);
const ELEMENT_SOURCE_SET = new Set<string>(ELEMENT_SOURCES);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function hex(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX_RE.test(v) ? v : fallback;
}
function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `el_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function coerceText(o: Record<string, unknown>): ElementTextData {
  const t = (o.text && typeof o.text === 'object' ? o.text : {}) as Record<string, unknown>;
  const role = typeof t.role === 'string' && TEXT_ROLE_SET.has(t.role) ? (t.role as TextRole) : 'other';
  const weight = [400, 500, 600, 700, 800, 900].includes(t.fontWeight as number)
    ? (t.fontWeight as ElementTextData['fontWeight'])
    : 400;
  const align: ElementTextAlign =
    t.align === 'center' || t.align === 'right' || t.align === 'justify' ? t.align : 'left';
  const autoFit: ElementAutoFit = t.autoFit === 'clip' ? 'clip' : 'shrink';
  const out: ElementTextData = {
    content: str(t.content, MAX_TEXT_HTML),
    role,
    fontFamily: str(t.fontFamily, MAX_FONT_FAMILY) || 'inherit',
    fontSize: clampNum(t.fontSize, 6, 400, 16),
    fontWeight: weight,
    color: hex(t.color, '#111111'),
    align,
    lineHeight: clampNum(t.lineHeight, 0.8, 3, 1.3),
    autoFit,
  };
  if (typeof t.maxFontSize === 'number' && Number.isFinite(t.maxFontSize)) {
    out.maxFontSize = clampNum(t.maxFontSize, 6, 400, out.fontSize);
  }
  if (t.vAlign === 'center' || t.vAlign === 'bottom') out.vAlign = t.vAlign;
  if (typeof t.letterSpacing === 'number' && Number.isFinite(t.letterSpacing)) {
    out.letterSpacing = clampNum(t.letterSpacing, -20, 100, 0);
  }
  if (t.textTransform === 'uppercase' || t.textTransform === 'lowercase' || t.textTransform === 'capitalize') {
    out.textTransform = t.textTransform;
  }
  return out;
}

function coerceImage(o: Record<string, unknown>): ElementImageData {
  const im = (o.image && typeof o.image === 'object' ? o.image : {}) as Record<string, unknown>;
  const fit: ElementImageFit = im.fit === 'contain' ? 'contain' : 'cover';
  const out: ElementImageData = {
    assetId: str(im.assetId, 64),
    // Image element URLs are rendered SERVER-SIDE by the Puppeteer PDF export, so
    // they must never point at an internal host — validate through the public-host
    // allowlist (blocks loopback / RFC-1918 / link-local / cloud-metadata), not the
    // host-agnostic safeUrl. (Closes the review's element-image SSRF gap.)
    url: safePublicImageUrl(im.url),
    alt: str(im.alt, MAX_ALT),
    fit,
  };
  const fp = im.focalPoint;
  if (fp && typeof fp === 'object') {
    const p = fp as Record<string, unknown>;
    if (typeof p.x === 'number' && typeof p.y === 'number') {
      out.focalPoint = { x: clampNum(p.x, 0, 1, 0.5), y: clampNum(p.y, 0, 1, 0.5) };
    }
  }
  return out;
}

function coerceShape(o: Record<string, unknown>): ElementShapeData {
  const s = (o.shape && typeof o.shape === 'object' ? o.shape : {}) as Record<string, unknown>;
  const out: ElementShapeData = { fill: hex(s.fill, '#000000') };
  if (typeof s.opacity === 'number' && Number.isFinite(s.opacity) && s.opacity < 1) {
    out.opacity = Math.max(0, s.opacity);
  }
  return out;
}

function coerceQr(o: Record<string, unknown>): ElementQrData {
  const q = (o.qr && typeof o.qr === 'object' ? o.qr : {}) as Record<string, unknown>;
  return {
    // QR destinations are ENCODED into the code, not fetched server-side, so the
    // broader safeUrl (http(s)/mailto/tel/relative) is correct here.
    url: safeUrl(typeof q.url === 'string' ? q.url.slice(0, MAX_QR_URL) : ''),
    fg: hex(q.fg, '#000000'),
    bg: hex(q.bg, '#ffffff'),
  };
}

function coerceIcon(o: Record<string, unknown>): ElementIconData {
  const ic = (o.icon && typeof o.icon === 'object' ? o.icon : {}) as Record<string, unknown>;
  const out: ElementIconData = {};
  if (isKnownIcon(ic.name)) out.name = ic.name as string;
  // Uploaded custom icon is rendered server-side (PDF) → public-host allowlist.
  const src = safePublicImageUrl(ic.src);
  if (src) out.src = src;
  if (typeof ic.color === 'string' && HEX_RE.test(ic.color)) out.color = ic.color;
  // Guarantee a renderable icon: fall back to the default glyph when neither a
  // known name nor an uploaded source is present.
  if (!out.name && !out.src) out.name = FALLBACK_ICON_NAME;
  return out;
}

/**
 * Validate + normalise one page's element list from untrusted input, bounding
 * every value against the page's own width/height. Invalid elements are DROPPED
 * rather than throwing — one bad element (from a flaky extraction) must never
 * fail an entire page.
 */
export function validateElements(
  raw: unknown,
  page: { width: number; height: number },
): MagazineElement[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: MagazineElement[] = [];
  for (const item of arr.slice(0, MAX_ELEMENTS_PER_PAGE)) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const type = ELEMENT_TYPES.includes(o.type as ElementType) ? (o.type as ElementType) : null;
    if (!type) continue; // unknown element kind — drop, don't fail the page
    const el: MagazineElement = {
      id: typeof o.id === 'string' && o.id ? o.id.slice(0, 64) : genId(),
      type,
      x: clampNum(o.x, 0, page.width, 0),
      y: clampNum(o.y, 0, page.height, 0),
      w: clampNum(o.w, MIN_SIZE, page.width, Math.min(200, page.width)),
      h: clampNum(o.h, MIN_SIZE, page.height, Math.min(80, page.height)),
      rotation: clampNum(o.rotation, -180, 180, 0),
      zIndex: Math.round(clampNum(o.zIndex, 0, 9999, 0)),
      locked: o.locked === true,
      source: ELEMENT_SOURCE_SET.has(o.source as string) ? (o.source as ElementSource) : 'manual',
    };
    if (typeof o.confidence === 'number' && Number.isFinite(o.confidence)) {
      el.confidence = clampNum(o.confidence, 0, 1, 0);
    }
    if (type === 'text') el.text = coerceText(o);
    if (type === 'image') el.image = coerceImage(o);
    if (type === 'shape') el.shape = coerceShape(o);
    if (type === 'qr') el.qr = coerceQr(o);
    if (type === 'icon') el.icon = coerceIcon(o);
    out.push(el);
  }
  return out;
}

/**
 * Bounds-check a single element against the page. Returns a fully-formed element
 * (or {} if the input was unusable). The PATCH endpoint MUST deep-merge the
 * client's partial onto the stored element BEFORE calling this — otherwise
 * x/y/w/h/type get defaulted away (validateElements treats each item as whole).
 */
export function validateElementPatch(
  raw: unknown,
  page: { width: number; height: number },
): Partial<MagazineElement> {
  const [validated] = validateElements([raw], page);
  return validated ?? {};
}
