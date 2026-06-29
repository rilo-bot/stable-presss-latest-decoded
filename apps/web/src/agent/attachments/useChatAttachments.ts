// Shared composer-attachment state for the chat surfaces. Manages the files a
// user has staged (via the 📎 picker or a clipboard paste), reads + validates
// them off the main thread, and exposes a paste handler the composer's textarea
// can wire up. The owning panel sends them with
// `sendMessage({ text, files: attachmentsToFileParts(attachments) })` and then
// calls `clear()`.

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fileToAttachment, isAttachable, MAX_ATTACHMENTS, type ChatAttachment } from './attachments';

export interface ChatAttachmentsApi {
  /** Files staged in the composer, ready to send. */
  attachments: ChatAttachment[];
  /** True while files are being read/compressed. */
  busy: boolean;
  hasAttachments: boolean;
  /** Stage files from a picker, drop, or paste (validated; errors toast). */
  addFiles: (files: FileList | File[] | null | undefined) => Promise<void>;
  remove: (id: string) => void;
  clear: () => void;
  /** Attach images/PDFs pasted into a textarea (no-op for plain text). */
  onPaste: (e: React.ClipboardEvent) => void;
}

export function useChatAttachments(): ChatAttachmentsApi {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  // Authoritative live count (state lags behind inside the async loop).
  const countRef = useRef(0);

  const addFiles = useCallback(async (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    try {
      for (const file of list) {
        if (countRef.current >= MAX_ATTACHMENTS) {
          toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
          break;
        }
        if (!isAttachable(file)) {
          toast.error(`${file.name || 'That file'} isn’t supported — attach an image or PDF.`);
          continue;
        }
        try {
          const att = await fileToAttachment(file);
          countRef.current += 1;
          setAttachments((prev) => [...prev, att]);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : `Couldn’t attach ${file.name}.`);
        }
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback((id: string) => {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.id !== id);
      countRef.current = next.length;
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    countRef.current = 0;
    setAttachments([]);
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter(isAttachable);
      if (files.length === 0) return; // plain text — let the textarea handle it
      e.preventDefault();
      void addFiles(files);
    },
    [addFiles],
  );

  return {
    attachments,
    busy,
    hasAttachments: attachments.length > 0,
    addFiles,
    remove,
    clear,
    onPaste,
  };
}
