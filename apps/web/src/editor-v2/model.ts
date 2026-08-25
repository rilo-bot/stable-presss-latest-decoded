// ---------------------------------------------------------------------------
// Magazine Builder — web-side element model.
//
// The element types are NO LONGER declared here. They come from @rilo/schema,
// the single shared contract, which the server validates every write against.
//
// This file used to hand-copy them and ask editors to "change this too". It
// drifted, and two of the gaps were live rendering bugs, not just type lies:
// `letterSpacing` and `textTransform` are written onto text elements by the
// generator (composeFromSolved.ts) and were absent here, so every tracked
// all-caps kicker the art director designed rendered as plain sentence case —
// in the editor, the public viewer and the PDF alike. See
// packages/schema/README.md.
//
// What stays here: types that are shaped by the WEB's view of the API (ids as
// `id`, not `_id`) rather than by the document model itself.
// ---------------------------------------------------------------------------

export type {
  ElementType,
  TextRole,
  ElementSource,
  ElementAutoFit,
  ElementImageFit,
  ElementTextAlign,
  ElementTextTransform,
  ElementVAlign,
  ElementFontWeight,
  ElementTextData,
  ElementImageData,
  ElementShapeData,
  ElementQrData,
  ElementIconData,
  MagazineElement,
  PageBackground,
} from '@rilo/schema';

import type { MagazineElement, PageBackground } from '@rilo/schema';

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
  background: PageBackground;
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
  background: PageBackground;
  elements: MagazineElement[];
}
