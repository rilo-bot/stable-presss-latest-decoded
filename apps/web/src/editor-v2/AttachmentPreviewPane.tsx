// Magazine Builder v2 — docked attachment preview.
//
// When a chat attachment is clicked, the editor's RIGHT pane swaps the Inspector
// for this preview (image or extracted text). Closing it restores the Inspector,
// so the editing controls come straight back — mirrors the reference builder's
// useAttachmentPreview behaviour (spec §6.5).

import { X, FileText } from 'lucide-react';
import { useEditorStore } from './store';

export function AttachmentPreviewPane() {
  const doc = useEditorStore((s) => s.previewDoc);
  const close = useEditorStore((s) => s.setPreviewDoc);
  if (!doc) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Header — name + close (returns to the Inspector) */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <FileText size={14} className="flex-shrink-0 text-white/60" />
        <p className="min-w-0 flex-1 truncate text-xs font-bold text-white" title={doc.name}>{doc.name}</p>
        <button
          onClick={() => close(null)}
          className="flex h-6 w-6 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white"
          title="Close preview (back to editing)"
          aria-label="Close preview"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto bg-black/20 p-3">
        {doc.isImage && doc.imageUrl ? (
          <img src={doc.imageUrl} alt={doc.name} className="mx-auto max-w-full rounded" />
        ) : doc.text ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-white/70">{doc.text}</pre>
        ) : (
          <p className="text-center text-xs text-white/40">No preview available for this file.</p>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-white/10 px-3 py-2 text-center text-[10px] text-white/35">
        Close to return to the element editor.
      </div>
    </div>
  );
}
