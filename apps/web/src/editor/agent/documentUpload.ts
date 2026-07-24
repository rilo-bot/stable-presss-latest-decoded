// Uploads a source file to the Studio Assistant's ingest endpoint, which reads
// it ONCE and returns a compact digest the agent can place from. The file bytes
// are streamed straight to /api/agent/editor/ingest (same proxied pattern as
// /api/uploads/direct) — sources are analysed, not stored.

import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { uid } from './applyEdits';
import type { DocAttachment, DocDigest } from './types';

/** Accept attribute for the file picker (PDF, Word docs, images, text). */
export const ATTACH_ACCEPT =
  '.pdf,.docx,.txt,.csv,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,text/markdown,image/*';

/** Resolve a usable MIME type, falling back to the extension when the browser gives none. */
function contentTypeFor(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function kindOf(contentType: string): DocAttachment['kind'] {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('image/')) return 'image';
  // A .docx is read to verbatim text server-side, so it behaves like a text doc.
  return 'text';
}

/** Hard ceiling so the composer's "Reading…" chip can never spin forever.
 *  Image-based PDFs are OCR'd page-by-page server-side (several model waves), so
 *  allow generous headroom — the server bounds the real work per page. */
const INGEST_TIMEOUT_MS = 210_000;

/** Send one file to the ingest endpoint and return the analysed attachment. */
export async function ingestFile(file: File): Promise<DocAttachment> {
  const contentType = contentTypeFor(file);
  const token = useAuthStore.getState().token;
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/agent/editor/ingest?filename=${encodeURIComponent(file.name)}`), {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
      signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new Error('Reading that file took too long — try a smaller or text-based file.');
    }
    throw new Error("Couldn't reach the assistant to read that file. Please try again.");
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error || `Couldn't read that file (${res.status}).`);
  }
  const { digest, fullText } = (await res.json()) as { digest: DocDigest; fullText?: string };
  return { id: uid('doc'), name: file.name, kind: kindOf(contentType), digest, fullText: fullText ?? '' };
}

/** The text an attachment contributes to generation / the chat agent. Prefers
 *  the verbatim fullText (PDF/DOCX/text), and falls back to a flattened digest
 *  for vision-only sources (images), whose content lives ONLY in the digest —
 *  so an attached photo/screenshot actually feeds generation instead of being
 *  silently dropped. */
export function attachmentSourceText(att: DocAttachment): string {
  if (att.fullText && att.fullText.trim()) return att.fullText;
  const d = att.digest;
  if (!d) return '';
  const parts: string[] = [];
  if (d.summary) parts.push(d.summary);
  for (const s of d.sections ?? []) parts.push([s.heading, s.body].filter(Boolean).join('\n'));
  for (const t of d.tables ?? []) {
    const rows = (t.rows ?? []).map((r) => r.join(' | ')).join('\n');
    if (rows) parts.push([t.caption, rows].filter(Boolean).join('\n'));
  }
  if (d.facts?.length) parts.push(d.facts.join('\n'));
  return parts.filter(Boolean).join('\n\n').trim();
}
