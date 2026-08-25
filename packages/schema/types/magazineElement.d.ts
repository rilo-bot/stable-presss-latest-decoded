// ---------------------------------------------------------------------------
// The magazine element model — THE shared contract.
//
// Declaration-only on purpose: no runtime values live here, so every import of
// this file erases at compile time and the package needs no build, no symlink
// and no bundler alias. See ../README.md.
//
// The server (apps/server/src/lib/magazineV2/model.ts) is still the authority
// that VALIDATES writes; it imports these unions and proves at compile time that
// its runtime arrays cover them exhaustively.
// ---------------------------------------------------------------------------

export type ElementType = 'text' | 'image' | 'shape' | 'qr' | 'icon';

/** What role a text block plays — set by AI classification, editable by hand. */
export type TextRole =
  | 'headline'
  | 'subhead'
  | 'byline'
  | 'body'
  | 'caption'
  | 'pullquote'
  | 'other';

/**
 * Who last wrote this element. Lets the UI flag AI-authored/low-confidence
 * content, and lets an agent's edits be told apart from a human's without a
 * separate (weaker) write path — both go through the same validators.
 */
export type ElementSource = 'extracted' | 'manual' | 'ai-agent';

/** How text behaves when it does not fit its box. */
export type ElementAutoFit = 'shrink' | 'clip';

export type ElementImageFit = 'cover' | 'contain';

export type ElementTextAlign = 'left' | 'center' | 'right' | 'justify';

export type ElementTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

export type ElementVAlign = 'top' | 'center' | 'bottom';

/** The weights the curated web fonts are actually loaded at. */
export type ElementFontWeight = 400 | 500 | 600 | 700 | 800 | 900;

export interface ElementTextData {
  /** Sanitised inline HTML only (server: lib/magazineV2/sanitize.ts). */
  content: string;
  role: TextRole;
  fontFamily: string;
  /** px at the page's canonical dims — the CURRENT (fitted) size. */
  fontSize: number;
  /** The design's intended ceiling; refit shrinks down from here. */
  maxFontSize?: number;
  /**
   * The design's FLOOR — refit may not shrink below it (defaults to 55% of the
   * ceiling). Carried on the element because the print legibility floor has to
   * survive every later write: without it, a body slot set at an 8pt floor
   * silently drops back to 6.6pt on the next save.
   */
  minFontSize?: number;
  fontWeight: ElementFontWeight;
  /** #rrggbb */
  color: string;
  align: ElementTextAlign;
  lineHeight: number;
  autoFit: ElementAutoFit;
  vAlign?: ElementVAlign;
  /**
   * px at canonical dims (default 0). Set by the art director's `tracking`.
   * MUST be scaled by the renderer the same way fontSize is, or tracking drifts
   * relative to the type at other container widths.
   */
  letterSpacing?: number;
  /** Default 'none'. Set to 'uppercase' by the art director's `caps`. */
  textTransform?: ElementTextTransform;
}

export interface ElementImageData {
  /** MediaAsset id; '' if not (yet) backed by one. */
  assetId: string;
  url: string;
  alt: string;
  fit: ElementImageFit;
  /** 0–1, for object-position. */
  focalPoint?: { x: number; y: number };
}

export interface ElementShapeData {
  /** #rrggbb — a flat rectangle (rules / dividers / panels). */
  fill: string;
  /**
   * 0–1. <1 makes the shape a translucent overlay — a SCRIM over a photo so text
   * stays legible without hiding the picture. Absent/1 = solid.
   */
  opacity?: number;
}

export interface ElementQrData {
  /** '' until set. */
  url: string;
  /** #rrggbb */
  fg: string;
  /** #rrggbb */
  bg: string;
}

export interface ElementIconData {
  /** Curated registry glyph name. '' / unknown → renderer fallback. */
  name?: string;
  /** Uploaded custom icon URL (SVG/PNG). When set, OVERRIDES `name`. */
  src?: string;
  /** Optional hex tint — registry glyphs only (uploaded art renders as-is). */
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
  /** Degrees. */
  rotation: number;
  zIndex: number;
  locked: boolean;
  text?: ElementTextData;
  image?: ElementImageData;
  shape?: ElementShapeData;
  qr?: ElementQrData;
  icon?: ElementIconData;
  source: ElementSource;
  /** 0–1, AI extraction confidence. */
  confidence?: number;
}

/** A page's ground: a flat colour/gradient, or a full-bleed image. */
export interface PageBackground {
  type: 'image' | 'color';
  value: string;
}
