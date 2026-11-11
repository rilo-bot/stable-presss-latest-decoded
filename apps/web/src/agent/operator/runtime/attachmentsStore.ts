// ---------------------------------------------------------------------------
// The files the user attached in the Operator chat (📎 / paste), for the
// `upload` client tool — "put the photo I sent into this file input".
//
// The panel keeps this in step with the chat thread (syncOperatorAttachments on
// every messages change), so it covers every way a file arrives: picker, paste,
// and a thread restored after a reload (persistence keeps small data URLs).
//
// Order for the tool's `attachment` index: the MOST RECENT user message first,
// and within a message in the order the user attached them — index 0 is "the
// one I just sent".
// ---------------------------------------------------------------------------

export interface OperatorAttachment {
  /** File name as the user attached it ("stable.png"). */
  name: string;
  mediaType: string;
  /** data: URL (the chat sends files inline) or an http(s) URL. */
  url: string;
}

type MessageLike = { role?: string; parts?: Array<{ type: string; url?: string; mediaType?: string; filename?: string }> };

/** Oldest → newest user message, each its files. */
let groups: OperatorAttachment[][] = [];
let signature = '';

/** Replace the store from the chat thread (cheap no-op when nothing changed). */
export function syncOperatorAttachments(messages: MessageLike[]): void {
  const next: OperatorAttachment[][] = [];
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const files = (m.parts ?? [])
      .filter((p) => p.type === 'file' && typeof p.url === 'string' && p.url)
      .map((p) => ({
        name: p.filename || (p.mediaType?.startsWith('image/') ? 'image' : 'file'),
        mediaType: p.mediaType || 'application/octet-stream',
        url: p.url as string,
      }));
    if (files.length) next.push(files);
  }
  const sig = next.map((g) => g.map((f) => `${f.name}:${f.url.length}:${f.url.slice(-24)}`).join('|')).join('#');
  if (sig === signature) return;
  signature = sig;
  groups = next;
}

/** Add one message's files directly (non-panel callers / tests). */
export function addOperatorAttachments(files: OperatorAttachment[]): void {
  if (!files.length) return;
  groups = [...groups, files].slice(-20);
  signature = '';
}

/** Newest message first, in attach order within each message. */
export function listOperatorAttachments(): OperatorAttachment[] {
  const out: OperatorAttachment[] = [];
  for (let i = groups.length - 1; i >= 0; i--) out.push(...groups[i]);
  return out;
}

/** The attachment a tool call means: index (0 = newest) or file name. */
export function resolveOperatorAttachment(ref: number | string | undefined): OperatorAttachment | { error: string } {
  const all = listOperatorAttachments();
  const names = all.map((a, i) => `${i}: “${a.name}”`).join(', ');
  if (all.length === 0) {
    return {
      error:
        'The user has not attached any file in this chat. Ask them to attach the image or PDF with the 📎 button (or paste it) and send it, then call upload again.',
    };
  }
  if (ref === undefined || ref === null || ref === '') return all[0];
  if (typeof ref === 'number') {
    if (Number.isInteger(ref) && ref >= 0 && ref < all.length) return all[ref];
    return { error: `There is no attachment ${ref}. Attachments (0 = most recent): ${names}.` };
  }
  const want = ref.trim().toLowerCase();
  const exact = all.find((a) => a.name.toLowerCase() === want);
  if (exact) return exact;
  const partial = all.filter((a) => a.name.toLowerCase().includes(want));
  if (partial.length >= 1) return partial[0];
  return { error: `No attachment named “${ref}”. Attachments (0 = most recent): ${names}.` };
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
};

/** A file name whose extension matches the real bytes. Chat images are
 *  re-encoded to JPEG before sending, so "photo.png" may hold a JPEG — an
 *  upload route that trusts the extension would otherwise mislabel it. */
function nameFor(name: string, mediaType: string): string {
  const ext = EXT[mediaType];
  if (!ext) return name;
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const cur = m?.[1]?.toLowerCase();
  if (cur === ext || (ext === 'jpg' && cur === 'jpeg')) return name;
  return `${m ? name.slice(0, -m[0].length) : name}.${ext}`;
}

/** Decode a data: URL without fetch() (a strict connect-src CSP may refuse data:). */
function dataUrlToBlob(url: string): Blob {
  const comma = url.indexOf(',');
  if (comma < 0) throw new Error('That attachment could not be read.');
  const meta = url.slice(5, comma);
  const mime = meta.split(';')[0] || 'application/octet-stream';
  const body = url.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

/** The attachment as a real File, ready for a file input. */
export async function attachmentToFile(att: OperatorAttachment): Promise<File> {
  let blob: Blob;
  if (att.url.startsWith('data:')) blob = dataUrlToBlob(att.url);
  else {
    const res = await fetch(att.url);
    if (!res.ok) throw new Error(`Could not fetch the attachment “${att.name}” (HTTP ${res.status}).`);
    blob = await res.blob();
  }
  const type = blob.type || att.mediaType;
  return new File([blob], nameFor(att.name, type), { type, lastModified: Date.now() });
}
