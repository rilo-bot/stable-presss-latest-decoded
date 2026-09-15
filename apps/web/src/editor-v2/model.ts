// ---------------------------------------------------------------------------
// Magazine Builder v2 — web-side element model (types only).
//
// Mirrors the server model at apps/server/src/lib/magazineV2/model.ts (the
// authority that validates/normalises on every write). Kept as a plain type
// mirror for now; a shared package can extract these once more of the web side
// exists (Phase 3+). If you change the server model, change this too.
// ---------------------------------------------------------------------------

export type ElementType = 'text' | 'image' | 'shape' | 'qr' | 'icon';

export type TextRole = 'headline' | 'subhead' | 'byline' | 'body' | 'caption' | 'pullquote' | 'other';
export type ElementSource = 'extracted' | 'manual' | 'ai-agent';
export type ElementAutoFit = 'shrink' | 'clip';
export type ElementImageFit = 'cover' | 'contain';
export type ElementTextAlign = 'left' | 'center' | 'right' | 'justify';
export type ElementTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type ElementVAlign = 'top' | 'center' | 'bottom';
/** Mirrors the server's ElementTextData['fontWeight'] (lib/magazineV2/model.ts). */
export type ElementTextWeight = 400 | 500 | 600 | 700 | 800 | 900;

export interface ElementTextData {
  content: string; // sanitised inline HTML
  role: TextRole;
  fontFamily: string;
  fontSize: number; // px at the page's canonical dims — the CURRENT (fit) size
  maxFontSize?: number; // the design's intended ceiling; refit shrinks from here
  minFontSize?: number; // the design's floor; refit may not shrink below it
  fontWeight: ElementTextWeight;
  color: string; // #rrggbb
  align: ElementTextAlign;
  lineHeight: number;
  autoFit: ElementAutoFit;
  vAlign?: ElementVAlign;
  letterSpacing?: number; // px at canonical dims (default 0)
  textTransform?: ElementTextTransform; // default 'none'
}

export interface ElementImageData {
  assetId: string;
  url: string;
  alt: string;
  fit: ElementImageFit;
  focalPoint?: { x: number; y: number }; // 0–1
}

export interface ElementShapeData {
  fill: string; // #rrggbb
  /** 0–1; <1 = translucent scrim (photo shows through, text stays legible). */
  opacity?: number;
}

export interface ElementQrData {
  url: string;
  fg: string; // #rrggbb
  bg: string; // #rrggbb
}

export interface ElementIconData {
  name?: string; // curated Lucide registry glyph name (see editor/templates/iconRegistry)
  src?: string; // uploaded custom icon URL — overrides `name`
  color?: string; // #rrggbb tint (registry glyphs only)
}

export interface MagazineElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  text?: ElementTextData;
  image?: ElementImageData;
  shape?: ElementShapeData;
  qr?: ElementQrData;
  icon?: ElementIconData;
  source: ElementSource;
  confidence?: number;
}

/** One staged edit from the AI editing agent (applied via the element/page CRUD). */
export interface AgentProposal {
  id: string;
  kind: 'update' | 'add' | 'delete' | 'add-page' | 'remove-page' | 'reorder-page' | 'generate-pages' | 'apply-layout';
  summary: string;
  elementId?: string; // update/delete — a real id, or a tempId of an earlier 'add'
  tempId?: string; // add — placeholder id remapped to the server id on apply
  patch?: Partial<MagazineElement>; // update
  element?: Partial<MagazineElement>; // add
  // page-structure proposals:
  atIndex?: number; // add-page / generate-pages
  targetIndex?: number; // remove-page
  from?: number; // reorder-page
  to?: number; // reorder-page
  count?: number; // generate-pages
  topic?: string; // generate-pages
  /** apply-layout: the layout read from a reference image the user attached. It
   *  travels with the proposal so applying it costs no second vision call — and so
   *  what the user approves is exactly what the assistant described. Typed loosely
   *  here to avoid a circular import; the server re-normalises it on apply anyway. */
  layoutReading?: unknown;
  /** apply-layout: which page, when the user named one ("do page 2 like this"). An ID,
   *  resolved server-side from the ordinal — page order can change between the
   *  assistant's answer and the user pressing Apply, and an index would then point
   *  somewhere else. Absent = the page on screen, which is all this could ever do
   *  before. */
  pageId?: string;
  /** apply-layout: the ordinal as the user said it, for the confirm. Set with pageId. */
  pageNumber?: number;
}

/** A fully-loaded page (elements included) as returned by GET …/pages/:pageId. */
export interface MagazinePageV2 {
  id: string;
  magazineId: string;
  index: number;
  width: number;
  height: number;
  background: { type: 'image' | 'color'; value: string };
  elements: MagazineElement[];
  status: 'pending' | 'extracted' | 'failed' | 'reviewed';
  selectedForPublish: boolean;
  rev: number;
}

/** The minimal shape the renderer needs (a page or a frozen-issue snapshot page). */
export interface IssuePageData {
  index: number;
  width: number;
  height: number;
  background: { type: 'image' | 'color'; value: string };
  elements: MagazineElement[];
}
