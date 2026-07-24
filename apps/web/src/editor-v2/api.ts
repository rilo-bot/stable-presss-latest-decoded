// ---------------------------------------------------------------------------
// Magazine Builder v2 — typed client for /api/magazinesV2.
// Element writes carry the page `rev` (optimistic-concurrency token); a 409 is
// surfaced as ApiError with the server's current page attached so the store can
// reconcile. Reads use retry; writes never retry (not idempotent).
// ---------------------------------------------------------------------------

import { authFetch, authFetchRetry } from '@/lib/api';
import type { MagazineElement, MagazinePageV2, AgentProposal } from './model';

const BASE = '/api/magazinesV2';

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super((body && body.error) || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export type MagRole = 'owner' | 'editor' | 'contributor';

export interface IssueSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  origin: string;
  coverImage: string;
  pageCount: number;
  myRole: MagRole | null; // null = another admin's magazine (view-only for you)
  ownerName: string;
  /** Id of the frozen Bulletins snapshot when published (null while unpublished). */
  publishedIssueId: string | null;
  updatedAt: string;
}

export interface PageSummary {
  id: string;
  index: number;
  width: number;
  height: number;
  status: string;
  rev: number;
  selectedForPublish: boolean;
  elementCount: number;
}

export interface IssueMeta {
  id: string;
  title: string;
  slug: string;
  status: string;
  origin: string;
  coverImage: string;
  ownerId: string;
  ownerName?: string;
  myRole: MagRole | null;
  myEditablePageIds: string[] | 'all';
  /** Id of the frozen Bulletins snapshot when published (null/absent otherwise). */
  publishedIssueId?: string | null;
  /** Staff shared into this magazine (owner manages via the Share dialog). */
  collaborators?: V2Collaborator[];
  // present while generating (status 'processing')
  pagesProcessed?: number;
  pagesTotal?: number;
  stage?: string;
  processingError?: string;
}

export interface IssueBundle {
  issue: IssueMeta;
  pages: PageSummary[];
}

// ── Issues ──
export const listIssues = () => authFetchRetry(`${BASE}/issues`).then(parse<IssueSummary[]>);
export const getIssue = (id: string) => authFetchRetry(`${BASE}/issues/${id}`).then(parse<IssueBundle>);
export const createBlankIssue = (title?: string) =>
  authFetch(`${BASE}/issues/blank`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).then(parse<IssueBundle>);
export const generateIssue = (prompt: string, pageCount?: number, sourceText?: string) =>
  authFetch(`${BASE}/issues/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, pageCount, sourceText }) }).then(parse<{ issue: IssueMeta }>);
export const renameIssue = (id: string, title: string) =>
  authFetch(`${BASE}/issues/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).then(parse<IssueMeta>);
// Set the cover: an explicit image URL, '' to auto-derive from page 0, or a page
// id whose image becomes the cover. Owner only.
export const setCover = (id: string, cover: { coverImage?: string; coverPageId?: string }) =>
  authFetch(`${BASE}/issues/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cover) }).then(parse<IssueMeta>);
export const deleteIssue = (id: string) => authFetch(`${BASE}/issues/${id}`, { method: 'DELETE' }).then(parse<{ success: boolean }>);
// Publish freezes pages into the shared Bulletins collection (shown on the
// public newsstand as a magazine); unpublish hides that edition again.
// scope 'full' = every page; 'selected' = only pages with selectedForPublish.
export const publishIssue = (id: string, scope: 'full' | 'selected' = 'full') =>
  authFetch(`${BASE}/issues/${id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) }).then(
    parse<{ issue: IssueMeta; publishedIssueId: string }>,
  );
export const unpublishIssue = (id: string) =>
  authFetch(`${BASE}/issues/${id}/unpublish`, { method: 'POST' }).then(parse<{ issue: IssueMeta }>);
// Reset wipes the issue back to a single blank page (a "start over").
export const resetIssue = (id: string) =>
  authFetch(`${BASE}/issues/${id}/reset`, { method: 'POST' }).then(parse<IssueBundle>);

// ── Publish-selection + collaborators (Share) ──
export const setPageSelected = (id: string, pageId: string, selected: boolean) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/select`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected }) }).then(
    parse<{ pages: PageSummary[] }>,
  );

export interface V2Collaborator {
  userId: string;
  email: string;
  displayName: string;
  role: 'editor' | 'contributor';
  pageIds: string[] | 'all';
}
export interface StaffEntry { userId: string; displayName: string; email: string }

/** Staff picker candidates — reuses the v1 magazines directory (same app, staff-gated). */
export const staffDirectory = () => authFetchRetry('/api/magazines/staff-directory').then(parse<StaffEntry[]>);
export const addCollaborator = (id: string, body: { email: string; pageIds: string[] | 'all' }) =>
  authFetch(`${BASE}/issues/${id}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
    parse<{ issue: IssueMeta }>,
  );
export const removeCollaborator = (id: string, userId: string) =>
  authFetch(`${BASE}/issues/${id}/collaborators/${userId}`, { method: 'DELETE' }).then(parse<{ issue: IssueMeta }>);

// ── Pages ──
export const getPage = (id: string, pageId: string) =>
  authFetchRetry(`${BASE}/issues/${id}/pages/${pageId}`).then(parse<{ page: MagazinePageV2 }>).then((r) => r.page);
export const addPage = (id: string, index?: number) =>
  authFetch(`${BASE}/issues/${id}/pages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index }) }).then(parse<{ pages: PageSummary[] }>);
export const duplicatePage = (id: string, pageId: string) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/duplicate`, { method: 'POST' }).then(parse<{ pages: PageSummary[] }>);
export const deletePage = (id: string, pageId: string) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}`, { method: 'DELETE' }).then(parse<{ pages: PageSummary[] }>);
export const reorderPages = (id: string, from: number, to: number) =>
  authFetch(`${BASE}/issues/${id}/pages/reorder`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) }).then(parse<{ pages: PageSummary[] }>);
// Add on-theme AI pages (matches the issue's saved palette/fonts). Returns 202;
// the issue goes 'processing' — poll getIssue until it settles.
export const generatePages = (id: string, count: number, topic?: string, atIndex?: number) =>
  authFetch(`${BASE}/issues/${id}/pages/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count, topic, atIndex }) }).then(parse<{ issue: IssueMeta }>);

// ── Elements (rev-guarded) ──
export const addElement = (id: string, pageId: string, rev: number, element: Partial<MagazineElement>) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/elements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rev, element }) }).then(parse<{ element: MagazineElement; rev: number }>);
export const patchElement = (id: string, pageId: string, elementId: string, rev: number, patch: Partial<MagazineElement>) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/elements/${elementId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rev, patch }) }).then(parse<{ element: MagazineElement; rev: number }>);
export const deleteElement = (id: string, pageId: string, elementId: string, rev: number) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/elements/${elementId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rev }) }).then(parse<{ ok: boolean; rev: number }>);

// Per-page Fill/Adjust — returns text edits the client auto-applies (undoable).
export const formatPage = (id: string, pageId: string, mode: 'fill' | 'adjust') =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/format`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) }).then(
    parse<{ edits: { elementId: string; content: string }[]; note: string }>,
  );

// ── AI editing agent (staged proposals; applied via the element CRUD above) ──
export const chatAgent = (id: string, pageId: string, messages: { role: 'user' | 'assistant'; content: string }[], selectedElementId?: string, sourceText?: string) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, selectedElementId, sourceText }) }).then(parse<{ reply: string; proposals: AgentProposal[] }>);

// ── PDF import (upload → S3 → confirm → background extraction) ──
export interface MediaAsset {
  id: string;
  url: string;
  alt: string;
  kind: 'upload' | 'photo' | 'graphic';
  pageIndex: number | null;
  contentType: string;
  size: number;
}

/** 1) Create an 'uploading' issue and get a presigned S3 PUT for its source PDF. */
export const uploadIssue = (filename: string, contentType: string, size: number) =>
  authFetch(`${BASE}/issues/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, contentType, size }) }).then(
    parse<{ issue: IssueMeta; uploadUrl: string; key: string }>,
  );

/** 2) PUT the raw bytes straight to S3 (never through our API). Content-Type MUST
 *  match what was signed. Not authFetch — this hits S3 directly. */
export async function putToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/pdf' }, body: file });
  if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}). Check the storage bucket's CORS policy.`);
}

/** 3) Confirm the upload landed → server verifies + enqueues extraction (202). */
export const confirmUpload = (id: string, originalName: string) =>
  authFetch(`${BASE}/issues/${id}/confirm-upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originalName }) }).then(parse<{ issue: IssueMeta }>);

/** Re-extract a single failed page (owner). */
export const retryPage = (id: string, pageId: string) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/retry`, { method: 'POST' }).then(parse<{ ok: boolean }>);

/** The issue's media library (extracted photos/graphics + stock/uploads). */
export const listMedia = (id: string) => authFetchRetry(`${BASE}/issues/${id}/media`).then(parse<{ assets: MediaAsset[] }>).then((r) => r.assets);

/** Upload an image from the device into the issue's media library (presign → PUT
 *  → confirm). Returns the stored MediaAsset. */
export async function uploadMediaImage(id: string, file: File, alt?: string): Promise<MediaAsset> {
  const { uploadUrl, key } = await authFetch(`${BASE}/issues/${id}/media/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  }).then(parse<{ uploadUrl: string; key: string; contentType: string }>);
  await putToS3(uploadUrl, file);
  return authFetch(`${BASE}/issues/${id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, alt: alt ?? '' }),
  }).then(parse<{ asset: MediaAsset }>).then((r) => r.asset);
}
