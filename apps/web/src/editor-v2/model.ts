// ---------------------------------------------------------------------------
// Magazine Builder v2 — web-side element model (types only).
//
// Mirrors the server model at apps/server/src/lib/magazineV2/model.ts (the
// authority that validates/normalises on every write). Kept as a plain type
// mirror for now; a shared package can extract these once more of the web side
// exists (Phase 3+). If you change the server model, change this too.
// ---------------------------------------------------------------------------

export type ElementType = 'text' | 'image' | 'shape' | 'qr';

export type TextRole = 'headline' | 'subhead' | 'byline' | 'body' | 'caption' | 'pullquote' | 'other';
export type ElementSource = 'extracted' | 'manual' | 'ai-agent';
export type ElementAutoFit = 'shrink' | 'clip';
export type ElementImageFit = 'cover' | 'contain';
export type ElementTextAlign = 'left' | 'center' | 'right';
export type ElementVAlign = 'top' | 'center' | 'bottom';

export interface ElementTextData {
  content: string; // sanitised inline HTML
  role: TextRole;
  fontFamily: string;
  fontSize: number; // px at the page's canonical dims
  maxFontSize?: number;
  fontWeight: 400 | 500 | 600 | 700 | 800;
  color: string; // #rrggbb
  align: ElementTextAlign;
  lineHeight: number;
  autoFit: ElementAutoFit;
  vAlign?: ElementVAlign;
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
  source: ElementSource;
  confidence?: number;
}

/** One staged edit from the AI editing agent (applied via the element/page CRUD). */
export interface AgentProposal {
  id: string;
  kind: 'update' | 'add' | 'delete' | 'add-page' | 'remove-page' | 'reorder-page' | 'generate-pages';
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
