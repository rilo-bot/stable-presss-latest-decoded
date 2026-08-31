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

/** Owner or not. `'editor'` used to be a third value that granted nothing — see
 *  the note on V2Collaborator. Publishing is a STAFF permission
 *  (`magazine.publish`), enforced on the publish routes, not a magazine role. */
export type MagRole = 'owner' | 'collaborator';

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
  /** When the magazine was started. '' on rows written before this was returned. */
  createdAt: string;
  /** Newest of the magazine's own stamp and its newest PAGE's — an element write
   *  bumps only the page, so the magazine stamp alone is not a record of editing.
   *  The server folds the two together; see the /issues list route. */
  updatedAt: string;
}

export interface PageSummary {
  id: string;
  index: number;
  width: number;
  height: number;
  /** EXTRACTION state (pending/extracted/reviewed/failed) — not human review. */
  status: string;
  rev: number;
  selectedForPublish: boolean;
  elementCount: number;
  /** The human REVIEW axis. Absent from older servers, hence optional. */
  review?: 'in_progress' | 'submitted' | 'approved';
  /** Times sent back. > 0 with review 'in_progress' is the board's "Needs changes". */
  reviewRound?: number;
  /** Approved, but edited since — the approval can no longer be trusted. */
  approvalStale?: boolean;
  /** Touched since the live edition was frozen, so a republish would change it. */
  editedSincePublish?: boolean;
  /** The collaborator's own words when they submitted. */
  submitNote?: string;
  /** The owner's last feedback. Cleared when the page is approved. */
  reviewNote?: string;
  /** userId — resolve the name against `IssueMeta.collaborators`. */
  submittedBy?: string | null;
  submittedAt?: string | null;
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
  /**
   * The draft has changed since the live edition was frozen, so a republish would
   * change what readers see. Derived server-side from timestamps; only meaningful on
   * a response that carried the pages (GET /issues/:id).
   */
  needsRepublish?: boolean;
  publishedAt?: string;
  updatedAt?: string;
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
export const generateIssue = (
  prompt: string,
  pageCount?: number,
  sourceText?: string,
  /** Stored documents to build FROM, cited by id. The real path: an id can be
   *  re-read by every later pass, where `sourceText` dies with this request. */
  docIds?: string[],
  /** A prepared issue to build INTO — see prepareIssue. */
  issueId?: string,
) =>
  authFetch(`${BASE}/issues/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, pageCount, sourceText, docIds, issueId }),
  }).then(parse<{ issue: IssueMeta }>);

/**
 * Reserve an issue to upload documents against, before generating.
 *
 * The order matters and it is the whole point. Reading the documents first meant
 * the browser waited for the read, which is why reads were capped at six pages.
 * With an issue in hand, the files go straight to S3 and the studio opens while the
 * worker reads — so there is nothing left for a page cap to protect.
 */
export const prepareIssue = () =>
  authFetch(`${BASE}/issues/prepare`, { method: 'POST' }).then(parse<{ issue: { id: string } }>);

/** A source document attached to an issue, as the reading panel sees it. */
export interface SourceDocSummary {
  id: string;
  originalName: string;
  contentType: string;
  size: number;
  status: 'queued' | 'reading' | 'partial' | 'ready' | 'failed';
  kind: string;
  coverage?: { pagesRead: number; pagesTotal: number; truncated: boolean; reason: string };
  pagesRead: number;
  pagesTotal: number;
  estimate?: {
    pagesTotal: number;
    pagesSeen: number;
    ocrPages: number;
    ocrPagesExpected: number;
    usd: number;
    projected: boolean;
  } | null;
  error?: string;
  createdAt?: string;
}

/** This issue's source documents, with read progress. Polled while they are read. */
export const listSources = (id: string) =>
  authFetchRetry(`${BASE}/issues/${id}/sources`)
    .then(parse<{ sources: SourceDocSummary[] }>)
    .then((r) => r.sources);

/**
 * Upload one source document: presign → PUT straight to S3 → register the row,
 * which queues the read. Returns the docId to cite in generateIssue.
 *
 * The bytes never pass through our API. That is not only faster — it is what lets
 * the file be larger than anything an API request could carry.
 */
export async function uploadSourceDoc(
  id: string,
  file: File,
  onProgress?: (fraction: number) => void,
  /**
   * Pass true when a generate call follows immediately.
   *
   * Generation enqueues its own read per document — it must, because that read
   * carries the continuation that starts the build — so letting the upload start one
   * too gets the document read by two jobs. Harmless on a small file, and twice the
   * downloads on a long one once reads are batched.
   */
  deferRead?: boolean,
): Promise<string> {
  const { uploadUrl, key } = await authFetch(`${BASE}/issues/${id}/sources/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  }).then(parse<{ uploadUrl: string; key: string }>);
  if (onProgress) await putToS3WithProgress(uploadUrl, file, onProgress);
  else await putToS3(uploadUrl, file);
  const { source } = await authFetch(`${BASE}/issues/${id}/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, originalName: file.name, defer: deferRead === true }),
  }).then(parse<{ source: { id: string } }>);
  return source.id;
}
/** Start a NEW magazine from an existing one's LAYOUT — same pages, boxes, fonts
 *  and decoration, with all copy/photos stripped. The source is never modified,
 *  so any staff member can reuse any magazine's design. */
export const reuseIssueTemplate = (id: string, title?: string) =>
  authFetch(`${BASE}/issues/${id}/reuse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).then(parse<IssueBundle>);
export const renameIssue = (id: string, title: string) =>
  authFetch(`${BASE}/issues/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).then(parse<IssueMeta>);
// Set the cover: an explicit image URL, '' to auto-derive from page 0, or a page
// id whose image becomes the cover. Owner only.
export const setCover = (id: string, cover: { coverImage?: string; coverPageId?: string }) =>
  authFetch(`${BASE}/issues/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cover) }).then(parse<IssueMeta>);
/** Deleting a magazine that is LIVE on Bulletins is refused with a 409 carrying
 *  `reason: 'is-live'`, because it takes the bulletin down too; `confirm` retries. */
export const deleteIssue = (id: string, confirm = false) =>
  authFetch(`${BASE}/issues/${id}${confirm ? '?confirm=1' : ''}`, { method: 'DELETE' }).then(
    parse<{ success: boolean }>,
  );
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
  /** The ONLY thing a share decides. There is no per-magazine role: the `role`
   *  field ('editor' | 'contributor') was removed because it gated nothing and
   *  only ever rendered a capability the holder didn't have. */
  pageIds: string[] | 'all';
}
/** A row of /api/staff/directory. The field is `name` — NOT `displayName`, which
 *  is what V2Collaborator above carries. Reading the wrong one silently renders
 *  every candidate as their raw email address. */
export interface StaffEntry { userId: string; name: string; email: string }

/** Staff picker candidates. Staff-gated (not `team.view`) — a contributor must be
 *  able to share their own magazine. The old `/api/magazines/staff-directory`
 *  path died with the v1 magazines router. */
export const staffDirectory = () => authFetchRetry('/api/staff/directory').then(parse<StaffEntry[]>);
/** `emailed` reports whether the deep-link share email actually went out;
 *  `emailError` carries the concrete reason when it didn't. */
export const addCollaborator = (id: string, body: { email: string; pageIds: string[] | 'all' }) =>
  authFetch(`${BASE}/issues/${id}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
    parse<{ issue: IssueMeta; emailed?: boolean; emailError?: string }>,
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
/** A page a collaborator has SUBMITTED is refused with a 409 carrying
 *  `reason: 'page-submitted'` and who submitted it; `confirm` retries through it. */
export const deletePage = (id: string, pageId: string, confirm = false) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}${confirm ? '?confirm=1' : ''}`, { method: 'DELETE' }).then(
    parse<{ pages: PageSummary[] }>,
  );

// ── Submissions & approval (per-page review axis) ──
// A submission is an EVENT over a set of pages, so every call takes pageIds[].
export interface ReviewResult {
  pages: PageSummary[];
  skipped: number;
  /** "pages 4, 5 and 6" — already phrased, so a toast can name what moved. */
  label: string;
  emailed?: boolean | number;
  emailError?: string;
  emailErrors?: string[];
}
export const submitPages = (id: string, pageIds: string[], note?: string) =>
  authFetch(`${BASE}/issues/${id}/pages/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageIds, note }),
  }).then(parse<ReviewResult & { submitted: number }>);
export const approvePages = (id: string, pageIds: string[], note?: string) =>
  authFetch(`${BASE}/issues/${id}/pages/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageIds, note }),
  }).then(parse<ReviewResult & { approved: number }>);
/** `note` is REQUIRED by the server — sending work back without saying why. */
export const requestPageChanges = (id: string, pageIds: string[], note: string) =>
  authFetch(`${BASE}/issues/${id}/pages/request-changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageIds, note }),
  }).then(parse<ReviewResult & { returned: number }>);

export interface ReviewEntry {
  id: string;
  pageId: string;
  pageNumber: number | null;
  action: 'submit' | 'approve' | 'request-changes' | 'page-removed' | string;
  from: string | null;
  to: string | null;
  actorName: string;
  note: string;
  at: string;
}
/** The audit trail, NEWEST first. `before` is an ISO cursor for older rows. */
export const getReviews = (id: string, opts?: { limit?: number; before?: string }) => {
  const q = new URLSearchParams();
  if (opts?.limit) q.set('limit', String(opts.limit));
  if (opts?.before) q.set('before', opts.before);
  const qs = q.toString();
  return authFetchRetry(`${BASE}/issues/${id}/reviews${qs ? `?${qs}` : ''}`).then(
    parse<{ reviews: ReviewEntry[]; hasMore: boolean; oldestAt: string | null }>,
  );
};
export const reorderPages = (id: string, from: number, to: number) =>
  authFetch(`${BASE}/issues/${id}/pages/reorder`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) }).then(parse<{ pages: PageSummary[] }>);
// Add on-theme AI pages (matches the issue's saved palette/fonts). Returns 202;
// the issue goes 'processing' — poll getIssue until it settles.
export const generatePages = (id: string, count: number, topic?: string, atIndex?: number) =>
  authFetch(`${BASE}/issues/${id}/pages/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count, topic, atIndex }) }).then(parse<{ issue: IssueMeta }>);

// ── Elements (rev-guarded) ──
/** `restore` re-creates a deleted element with its ORIGINAL id and source — the
 *  undo path. A normal add always gets a fresh server id and source 'manual'. */
export const addElement = (id: string, pageId: string, rev: number, element: Partial<MagazineElement>, restore?: boolean) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/elements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rev, element, restore: restore === true ? true : undefined }) }).then(parse<{ element: MagazineElement; rev: number }>);
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
/** An image the user attached to the chat, already stored in the issue's media
 *  library — the agent can place it by this exact URL. */
export interface AttachedImage {
  url: string;
  name: string;
}
/**
 * Send one turn.
 *
 * `messages` is the NEW turn only — the server reads the rest of the thread's
 * history itself. It used to be the client's whole transcript, which is how turns
 * about other pages (and other people's turns) reached the model.
 *
 * `threadId` may be omitted; the server then starts a thread and returns its id,
 * so a fresh panel doesn't need a round trip before the first message.
 */
export const chatAgent = (
  id: string,
  pageId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  selectedElementId?: string,
  sourceText?: string,
  attachedImages?: AttachedImage[],
  threadId?: string,
) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, selectedElementId, sourceText, attachedImages, threadId }) }).then(
    parse<{ reply: string; proposals: AgentProposal[]; threadId: string }>,
  );

// ── Chat threads ──
// One conversation per thread, listed newest-activity-first. A contributor sees
// their own; the magazine owner sees everyone's.
export interface ChatThread {
  id: string;
  title: string;
  userId: string;
  userName: string;
  /** Started by you — the only threads you can write to, rename or delete. */
  mine: boolean;
  startedOnPageIndex: number | null;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  /** The pre-threads flat log, surfaced as one unattributable read-only chat. */
  legacy: boolean;
  readOnly: boolean;
}
export interface ChatMsgDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pageIndex: number | null;
  attachments?: { name: string; isImage: boolean; url?: string }[];
  createdAt: string;
}
export const listThreads = (id: string) =>
  authFetchRetry(`${BASE}/issues/${id}/threads`).then(parse<{ threads: ChatThread[] }>).then((r) => r.threads);
export const renameThread = (id: string, threadId: string, title: string) =>
  authFetch(`${BASE}/issues/${id}/threads/${threadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).then(
    parse<{ thread: ChatThread }>,
  ).then((r) => r.thread);
export const deleteThread = (id: string, threadId: string) =>
  authFetch(`${BASE}/issues/${id}/threads/${threadId}`, { method: 'DELETE' }).then(parse<{ ok: boolean }>);
/** One thread's transcript. `before` (ISO cursor) loads the batch OLDER than it,
 *  for lazy "load earlier" upward. */
export const listThreadMessages = (id: string, threadId: string, opts?: { before?: string; limit?: number }) => {
  const p = new URLSearchParams();
  if (opts?.before) p.set('before', opts.before);
  if (opts?.limit) p.set('limit', String(opts.limit));
  const qs = p.toString();
  return authFetchRetry(`${BASE}/issues/${id}/threads/${threadId}/messages${qs ? `?${qs}` : ''}`).then(
    parse<{ messages: ChatMsgDto[]; hasMore: boolean; oldestCreatedAt: string | null }>,
  );
};

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

/**
 * PUT the bytes to S3 with a REAL progress callback.
 *
 * XHR and not fetch, for one reason: `fetch` cannot report upload progress. There
 * is no request-progress event and no upload stream in any shipping browser, so a
 * fetch-based upload can only show a spinner. That was tolerable while documents
 * were read through the API in seconds; with the caps gone a source file can be
 * hundreds of megabytes, and a spinner over a four-minute upload is indistinguishable
 * from a hang — users cancel and retry, which makes it worse.
 *
 * Falls back to `putToS3` when no callback is given, so nothing else has to change.
 */
export function putToS3WithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');
    xhr.upload.onprogress = (e) => {
      // `lengthComputable` is false for a chunked body; report nothing rather than
      // a made-up number, and the caller keeps its indeterminate state.
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      reject(new Error(`Upload failed (HTTP ${xhr.status}). Check the storage bucket's CORS policy.`));
    };
    // A CORS-blocked PUT lands here with no status, exactly as it rejects in fetch.
    // Same explanation for the same reason — see putToS3 below.
    xhr.onerror = () =>
      reject(
        new Error(
          'Upload could not reach storage. ' +
            `If this is a new host, check the bucket's CORS policy allows ${window.location.origin}.`,
        ),
      );
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(file);
  });
}

/** 2) PUT the raw bytes straight to S3 (never through our API). Content-Type MUST
 *  match what was signed. Not authFetch — this hits S3 directly. */
export async function putToS3(uploadUrl: string, file: File): Promise<void> {
  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/pdf' }, body: file });
  } catch (e) {
    // A CORS-BLOCKED PUT REJECTS HERE, IT DOES NOT RETURN A RESPONSE — so the `!res.ok`
    // branch below never sees it and the caller got a bare "Failed to fetch". This is
    // the browser talking straight to S3, so the API server logs nothing either: with
    // both ends silent, the commonest deployment mistake there is (an origin missing
    // from the bucket's CORS rules — a new dev host, a preview URL) presented as an
    // unexplained failure. The one thing we can state for certain is that the request
    // never got an answer, and where to look.
    throw new Error(
      `Upload could not reach storage (${e instanceof Error ? e.message : 'network error'}). ` +
        `If this is a new host, check the bucket's CORS policy allows ${window.location.origin}.`,
    );
  }
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
 *  → confirm). Returns the stored MediaAsset.
 *
 *  `kind: 'reference'` stores a LAYOUT REFERENCE — read by the AI, and deliberately
 *  hidden from the photo picker so nobody can place someone else's page into their
 *  own magazine. */
export async function uploadMediaImage(id: string, file: File, alt?: string, kind?: 'upload' | 'reference'): Promise<MediaAsset> {
  const { uploadUrl, key } = await authFetch(`${BASE}/issues/${id}/media/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  }).then(parse<{ uploadUrl: string; key: string; contentType: string }>);
  await putToS3(uploadUrl, file);
  return authFetch(`${BASE}/issues/${id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, alt: alt ?? '', kind: kind ?? 'upload' }),
  }).then(parse<{ asset: MediaAsset }>).then((r) => r.asset);
}

// ── Reference layouts: "take this layout" ──
// Mirrors apps/server/src/lib/magazineV2/layoutReading.ts. Boxes are FRACTIONS of
// the reference (0–1), never pixels — that is what lets the preview draw them over
// any page and, later, lets us measure the built page against them.
export interface ReadRegion {
  role: string;
  box: { x: number; y: number; w: number; h: number };
  z?: number;
  emphasis?: 'dominant' | 'normal' | 'quiet';
  colorRef?: string;
  align?: string;
  note?: string;
}
export interface LayoutReading {
  aspect: number;
  background: 'light' | 'dark' | 'photo';
  margin: string;
  columns?: number;
  regions: ReadRegion[];
  palette?: { primary: string; secondary: string; accent: string };
  confidence: number;
  notes?: string;
}
/**
 * Read a layout out of an image ALREADY in the magazine's media library.
 *
 * Takes an assetId, not a URL — the server proves the image belongs to this
 * magazine before spending a vision call on it. Reads only: nothing is built and
 * nothing is written, so the user sees what we understood first. A 422 carries the
 * reason the image could not be read, which is a sentence worth showing verbatim.
 */
/**
 * WHERE A READING COMES FROM, and the two are not equally good.
 *
 * `assetId` is a picture: a vision model looks at pixels and ESTIMATES every number.
 * `docId` + `pageNo` is a PDF: the file states where its words and pictures are, so
 * the layout is MEASURED and nothing is guessed. Same endpoint and same
 * `LayoutReading` out — the difference is only how much you should trust it, which
 * is why the panel labels them rather than hiding the distinction.
 */
export const readLayoutReference = (
  id: string,
  body: { assetId?: string; docId?: string; pageNo?: number; pageId?: string; hint?: string },
) =>
  authFetch(`${BASE}/issues/${id}/layout-reference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(parse<{ reading: LayoutReading; warning: string; asset: { id: string; url: string } }>);

/**
 * Put this page into the layout that was read (P2).
 *
 * REPLACES the page's elements, so it carries the page `rev` like every other page
 * write — a 409 means the page moved on and the reflow would be working from content
 * that has changed. `leftOver` reports what had nowhere to go: surplus photos can't
 * be merged into a slot, so the user is told rather than left to notice.
 */
export interface LayoutFidelity {
  /** 0–1, area-weighted: getting the hero photo right counts for more than a caption. */
  score: number;
  verdict: 'matched' | 'adapted' | 'loose';
  /** One sentence, already phrased. Never claims more than `score` supports. */
  summary: string;
  /** Reference boxes that never reached the page (nothing to put in them). */
  missing: number;
}
/**
 * How faithfully the reference is reproduced.
 *
 * 'exact'  — every region lands on the box it was read from. An unfillable slot
 *            leaves a HOLE and nothing else moves. This is "same layout".
 * 'adapt'  — the reference is re-composed through its frame tree, so empty slots
 *            are pruned and their siblings grow to take the space. Right when the
 *            reference is a different shape from the page, or the page carries far
 *            more copy than the reference had.
 *
 * The server defaults to 'adapt' for callers that say nothing; this client always
 * states which job it is (see the store's applyLayout).
 */
export type LayoutFit = 'adapt' | 'exact';

export const applyLayoutToPage = (
  id: string,
  pageId: string,
  body: { rev: number; reading: LayoutReading; fit: LayoutFit },
) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/apply-layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(parse<{
    page: MagazinePageV2;
    leftOver: { text: number; images: number };
    fidelity: LayoutFidelity;
    /** Slots holding more copy than fits at a readable size. The page is still built —
     *  this used to be a 422 that refused the whole layout. */
    tight: { role: string; holds: number; has: number }[];
    /** The same thing as one sentence, already worded for a toast. */
    tightSummary: string;
    warning: string;
  }>);

// ── Document uploads (the magazine's browsable "Uploads": PDFs/Word/text) ──
/** A document uploaded to the magazine's Uploads library. */
export interface MagazineUpload {
  id: string;
  url: string;
  originalName: string;
  contentType: string;
  size: number;
  hasText: boolean;
  createdAt?: string;
}

/**
 * COPY one page of an attached PDF onto one page of this magazine — words and all.
 *
 * The other half of the pair, and deliberately a different endpoint from
 * apply-layout rather than a flag on it: that one takes a reference's ARRANGEMENT
 * and writes this magazine's own copy into it, while this takes the PAGE — its real
 * text, at its measured size, in its own colours, over its own artwork.
 *
 * 202 and a background job, so the caller polls the page rather than awaiting a
 * rebuild. The target page also takes the SOURCE page's dimensions: a page
 * reproduced at another aspect is not a copy.
 */
export const copyDocumentPage = (id: string, pageId: string, body: { docId: string; sourcePage: number }) =>
  authFetch(`${BASE}/issues/${id}/pages/${pageId}/copy-document-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(parse<{ ok: true; from: { name: string; sourcePage: number; pageCount: number } }>);

/** The magazine's uploaded documents (PDF/Word/text), newest first. */
export const listUploads = (id: string) =>
  authFetchRetry(`${BASE}/issues/${id}/uploads`).then(parse<{ uploads: MagazineUpload[] }>).then((r) => r.uploads);

/** Store an attached DOCUMENT in the magazine's Uploads library (presign → PUT →
 *  confirm), passing its already-extracted text so pages can be filled from it
 *  later without re-reading. Returns the stored upload. */
export async function uploadMediaDoc(
  id: string,
  file: File,
  extra?: { digest?: string; sourceText?: string },
): Promise<MagazineUpload> {
  const { uploadUrl, key } = await authFetch(`${BASE}/issues/${id}/uploads/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  }).then(parse<{ uploadUrl: string; key: string; contentType: string }>);
  await putToS3(uploadUrl, file);
  return authFetch(`${BASE}/issues/${id}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, originalName: file.name, digest: extra?.digest ?? '', sourceText: extra?.sourceText ?? '' }),
  }).then(parse<{ upload: MagazineUpload }>).then((r) => r.upload);
}

/** Fetch one uploaded document's stored text (for preview / fill-from-this). */
export const getUploadText = (id: string, uploadId: string) =>
  authFetchRetry(`${BASE}/issues/${id}/uploads/${uploadId}`).then(
    parse<{ id: string; originalName: string; url: string; contentType: string; sourceText: string; digest: string }>,
  );
