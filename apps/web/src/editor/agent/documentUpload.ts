// Uploads a source file to the Studio Assistant's ingest endpoint, which reads
// it ONCE and returns a compact digest the agent can place from. The file bytes
// are streamed straight to /api/agent/editor/ingest (same proxied pattern as
// /api/uploads/direct) — sources are analysed, not stored.

import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { uid } from './applyEdits';
import type { DocAttachment, DocDigest } from './types';

/** Accept attribute for the file picker (Phase 1: PDF, images, text). */
export const ATTACH_ACCEPT = '.pdf,.txt,.csv,.md,.markdown,application/pdf,text/plain,text/csv,text/markdown,image/*';

/** Resolve a usable MIME type, falling back to the extension when the browser gives none. */
function contentTypeFor(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function kindOf(contentType: string): DocAttachment['kind'] {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('image/')) return 'image';
  return 'text';
}

/** Send one file to the ingest endpoint and return the analysed attachment. */
export async function ingestFile(file: File): Promise<DocAttachment> {
  const contentType = contentTypeFor(file);
  const token = useAuthStore.getState().token;
  const res = await fetch(apiUrl(`/api/agent/editor/ingest?filename=${encodeURIComponent(file.name)}`), {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error || `Couldn't read that file (${res.status}).`);
  }
  const { digest } = (await res.json()) as { digest: DocDigest };
  return { id: uid('doc'), name: file.name, kind: kindOf(contentType), digest };
}
