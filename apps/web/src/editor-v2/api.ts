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
  myRole: MagRole | null;
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
export const deleteIssue = (id: string) => authFetch(`${BASE}/issues/${id}`, { method: 'DELETE' }).then(parse<{ success: boolean }>);

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

// ── AI editing agent (staged proposals; applied via the element CRUD above) ──
export const chatAgent = (id: string, pageId: string, messages: { role: 'user' | 'assistant'; content: string }[], selectedElementId?: string, sourceText?: string) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, selectedElementId, sourceText }) }).then(parse<{ reply: string; proposals: AgentProposal[] }>);
