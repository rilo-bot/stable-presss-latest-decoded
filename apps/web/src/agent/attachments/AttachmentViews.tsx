// Shared attachment UI for the chat surfaces:
//   <AttachmentBar>        — staged-file chips above the composer (with remove)
//   <MessageAttachments>   — read-only previews on a sent user bubble
// Both take a `tone` so they read correctly on the light concierge panel and the
// dark studio panels.

import { FileText, X, Loader2 } from 'lucide-react';
import type { UIMessage } from 'ai';
import { messageFiles, type ChatAttachment } from './attachments';

type Tone = 'light' | 'dark';

const chipClass = (tone: Tone) =>
  tone === 'light'
    ? 'border-border bg-muted text-foreground'
    : 'border-white/15 bg-white/10 text-white/90';

const thumbBorder = (tone: Tone) => (tone === 'light' ? 'border-border' : 'border-white/15');

/** Staged attachments shown above the composer, each removable. */
export function AttachmentBar({
  attachments,
  onRemove,
  busy = false,
  tone = 'dark',
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
  busy?: boolean;
  tone?: Tone;
}) {
  if (attachments.length === 0 && !busy) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2">
      {attachments.map((a) =>
        a.kind === 'image' ? (
          <div key={a.id} className="group relative">
            <img
              src={a.url}
              alt={a.name}
              title={a.name}
              className={`h-12 w-12 rounded-md border object-cover ${thumbBorder(tone)}`}
            />
            {/* Always-visible filename label pinned to the top-right corner */}
            <span
              title={a.name}
              className="pointer-events-none absolute right-0.5 top-0.5 max-w-[calc(100%-4px)] truncate rounded bg-black/70 px-1 py-px text-[8px] leading-tight text-white"
            >
              {a.name}
            </span>
            {/* Remove control moved to top-left so it doesn't clash with the label */}
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              aria-label={`Remove ${a.name}`}
              className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-90 hover:bg-black"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <span
            key={a.id}
            title={a.name}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${chipClass(tone)}`}
          >
            <FileText size={12} className="flex-shrink-0" />
            <span className="max-w-[140px] truncate">{a.name}</span>
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              aria-label={`Remove ${a.name}`}
              className="opacity-60 hover:opacity-100"
            >
              <X size={11} />
            </button>
          </span>
        ),
      )}
      {busy && (
        <span className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${chipClass(tone)}`}>
          <Loader2 size={12} className="animate-spin" /> Reading…
        </span>
      )}
    </div>
  );
}

/** Read-only attachment previews rendered inside a sent user message bubble. */
export function MessageAttachments({ message, tone = 'dark' }: { message: UIMessage; tone?: Tone }) {
  const files = messageFiles(message);
  if (files.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {files.map((f, i) =>
        f.kind === 'image' ? (
          <a key={i} href={f.url} target="_blank" rel="noreferrer" title={f.name} className="relative block">
            <img
              src={f.url}
              alt={f.name}
              className={`h-16 w-16 rounded-md border object-cover ${thumbBorder(tone)}`}
            />
            {/* Always-visible filename label pinned to the top-right corner */}
            <span
              title={f.name}
              className="pointer-events-none absolute right-0.5 top-0.5 max-w-[calc(100%-4px)] truncate rounded bg-black/70 px-1 py-px text-[8px] leading-tight text-white"
            >
              {f.name}
            </span>
          </a>
        ) : (
          <span
            key={i}
            title={f.name}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${chipClass(tone)}`}
          >
            <FileText size={12} className="flex-shrink-0" />
            <span className="max-w-[150px] truncate">{f.name}</span>
          </span>
        ),
      )}
    </div>
  );
}
