// Shared types for the in-editor Studio Assistant (client side).

import type {
  RegionContent,
  RegionKind,
  ImageContent,
  QrContent,
  TextStyle,
  MagazineRole,
} from '@/types/magazine';

// ── Context blob sent to the server with each chat turn ──────────────────────
export interface CtxRegion {
  regionId: string;
  kind: RegionKind;
  filled: boolean;
  preview: string;
}
export interface CtxCurrentPage {
  pageId: string;
  pageType: string;
  label: string;
  number: number;
  editable: boolean;
  regions: CtxRegion[];
}
export interface CtxOtherPage {
  pageId: string;
  pageType: string;
  label: string;
  number: number;
  filledCount: number;
  totalRegions: number;
  editable: boolean;
}
export interface EditorContextBlob {
  magazine:
    | {
        id: string;
        title: string;
        edition: string;
        status: string;
        pageCount: number;
        myRole: MagazineRole;
        editable: 'all' | string[];
      }
    | null;
  currentPage: CtxCurrentPage | null;
  selection: { regionId: string; kind: RegionKind; filled: boolean } | null;
  otherPages: CtxOtherPage[];
  attachments?: CtxAttachment[];
}

// ── Uploaded source documents (analysed into a compact digest) ───────────────
export interface DocDigest {
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  facts: string[];
  tables?: { caption?: string; rows: string[][] }[];
}
export interface DocAttachment {
  id: string;
  name: string;
  kind: 'pdf' | 'image' | 'text';
  digest: DocDigest;
  /** Verbatim extracted text for the bulk compose/fill pass (empty for vision-only docs). */
  fullText: string;
}

/** Attachment shape sent in the editor context each turn — digest only, no heavy fullText. */
export type CtxAttachment = Omit<DocAttachment, 'fullText'>;

// ── Edit operations (preview + apply) ────────────────────────────────────────
export type EditPayload =
  | { kind: 'text'; html: string }
  | { kind: 'image'; patch: Partial<ImageContent> }
  | { kind: 'qr'; patch: Partial<QrContent> }
  | { kind: 'style'; patch: Partial<TextStyle> }
  | { kind: 'clear'; targetKind: RegionKind };

/** A change awaiting the user's Apply. */
export interface StagedEdit {
  id: string;
  magId: string;
  pageId: string;
  pageLabel: string;
  regionId: string;
  payload: EditPayload;
  before: RegionContent | null;
  afterPreview: RegionContent;
  summary: string;
  /** Groups a multi-region fill into one card. */
  batchId?: string;
}

/** Inverse of an applied edit, for undo. */
export interface UndoEntry {
  id: string;
  magId: string;
  pageId: string;
  regionId: string;
  before: RegionContent;
  summary: string;
}

export interface SuggestionChip {
  label: string;
  prompt: string;
  regionId?: string;
}
