// ---------------------------------------------------------------------------
// Shared chat-attachment core — lets a user hand the AI chat agent an image or
// PDF (pick a file OR paste from the clipboard). Files become Vercel-AI-SDK
// `file` parts (data URLs) on the outgoing message; `convertToModelMessages` on
// the server turns them into Claude vision/PDF content via OpenRouter.
//
// Used by every chat surface (concierge, Stable Studio, Story Studio, editor)
// so they never drift. Images are downscaled client-side (Claude's sweet spot is
// ~1568px) to keep payloads — and the model bill — small; PDFs ride along as-is
// within a size cap. Anything else is rejected with a friendly message.
// ---------------------------------------------------------------------------

import { compressImageToBlob } from '@/lib/upload';
import type { FileUIPart, UIMessage } from 'ai';

/** Most files the assistant can usefully read in one message. */
export const MAX_ATTACHMENTS = 5;

// Original-file caps. Images are downscaled afterwards, so the cap is generous;
// PDFs are sent whole, so keep the cap inside the server's 30 MB body budget
// (a PDF base64-encodes to ~1.37×, and the whole conversation is re-sent each turn).
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/i;

/** `accept` attribute for the file picker — images + PDF (what Claude reads). */
export const CHAT_ATTACH_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf';

export type AttachmentKind = 'image' | 'pdf';

/** A file staged in the composer, ready to send as a `file` part. */
export interface ChatAttachment {
  id: string;
  name: string;
  mediaType: string;
  kind: AttachmentKind;
  /** Data URL of the (possibly compressed) bytes. */
  url: string;
  /** Byte size of the payload actually sent. */
  size: number;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `att_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** True when this file is an image or PDF we can hand to the assistant. */
export function isAttachable(file: File): boolean {
  return IMAGE_TYPES.test(file.type) || isPdf(file);
}

const MB = 1024 * 1024;

/** Read + validate one file into a staged attachment (throws a friendly Error). */
export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (IMAGE_TYPES.test(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`${file.name || 'That image'} is too large (max ${Math.round(MAX_IMAGE_BYTES / MB)} MB).`);
    }
    // Downscale so the data URL — re-sent on every turn — stays small.
    const blob = await compressImageToBlob(file, { maxDim: 1568, quality: 0.8 });
    const url = await blobToDataUrl(blob);
    return { id: nextId(), name: file.name || 'image.jpg', mediaType: 'image/jpeg', kind: 'image', url, size: blob.size };
  }
  if (isPdf(file)) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`${file.name || 'That PDF'} is too large (max ${Math.round(MAX_PDF_BYTES / MB)} MB).`);
    }
    const url = await blobToDataUrl(file);
    return { id: nextId(), name: file.name || 'document.pdf', mediaType: 'application/pdf', kind: 'pdf', url, size: file.size };
  }
  throw new Error(`${file.name || 'That file'} isn’t supported — attach an image or a PDF.`);
}

/** Map staged attachments to AI-SDK `file` parts for `sendMessage({ files })`. */
export function attachmentsToFileParts(atts: ChatAttachment[]): FileUIPart[] {
  return atts.map((a) => ({ type: 'file', mediaType: a.mediaType, filename: a.name, url: a.url }));
}

/** A `file` part read back off a sent message, for rendering on the bubble. */
export interface MessageFile {
  name: string;
  mediaType: string;
  url: string;
  kind: AttachmentKind;
}

/** Extract the `file` parts from a UI message (images + PDFs the user attached). */
export function messageFiles(m: UIMessage): MessageFile[] {
  return (m.parts ?? [])
    .filter((p): p is FileUIPart => p.type === 'file')
    .map((p) => ({
      name: p.filename || (p.mediaType.startsWith('image/') ? 'image' : 'file'),
      mediaType: p.mediaType,
      url: p.url,
      kind: p.mediaType.startsWith('image/') ? 'image' : 'pdf',
    }));
}
