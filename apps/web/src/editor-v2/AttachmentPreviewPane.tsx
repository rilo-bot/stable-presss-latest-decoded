// Magazine Builder v2 — docked attachment preview.
//
// When a chat attachment is clicked, the editor's RIGHT pane swaps the Inspector
// for this preview. Closing it restores the Inspector, so the editing controls
// come straight back — mirrors the reference builder's useAttachmentPreview
// behaviour (spec §6.5).
//
// Three render modes:
//   • image  → the image itself.
//   • PDF    → the REAL document (the browser's native viewer), with its extracted
//              text one click away. The text view is not redundant: it is exactly
//              what generation consumes, so it's how you check what the AI can
//              actually read out of a file (a scanned PDF, for instance, only has
//              text at all because OCR produced it).
//   • other  → extracted text only (Word/txt can't render in-browser).

import { useEffect, useState } from 'react';
import { X, FileText, ExternalLink } from 'lucide-react';
import { useEditorStore } from './store';

export function AttachmentPreviewPane() {
  const doc = useEditorStore((s) => s.previewDoc);
  const close = useEditorStore((s) => s.setPreviewDoc);
  const [mode, setMode] = useState<'doc' | 'text'>('doc');

  // Show each newly-opened document from the top, in its default mode.
  const docKey = doc ? `${doc.name}::${doc.docUrl ?? ''}` : '';
  useEffect(() => { setMode('doc'); }, [docKey]);

  if (!doc) return null;

  const canRenderDoc = !doc.isImage && !!doc.docUrl;
  const hasText = !!doc.text;
  const showingDoc = canRenderDoc && mode === 'doc';

  return (
    <div className="flex h-full flex-col">
      {/* Header — name, open-externally (a PDF is cramped in a side pane), close */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-studio-hair px-3 py-2.5">
        <FileText size={14} className="flex-shrink-0 text-studio-ink-2" />
        <p className="min-w-0 flex-1 truncate text-ui-sm font-bold text-studio-ink" title={doc.name}>{doc.name}</p>
        {canRenderDoc && (
          <a
            href={doc.docUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-6 w-6 items-center justify-center rounded text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink"
            title="Open in a new tab (full size)"
            aria-label="Open in a new tab"
          >
            <ExternalLink size={13} />
          </a>
        )}
        <button
          onClick={() => close(null)}
          className="flex h-6 w-6 items-center justify-center rounded text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink"
          title="Close preview (back to editing)"
          aria-label="Close preview"
        >
          <X size={14} />
        </button>
      </div>

      {/* Document / extracted-text switch — only when both views exist */}
      {canRenderDoc && hasText && (
        <div className="flex flex-shrink-0 gap-1 border-b border-studio-hair px-3 py-2">
          {([['doc', 'Document'], ['text', 'Extracted text']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-2 py-1 text-ui-sm font-bold uppercase tracking-wide transition ${
                mode === m ? 'bg-studio-raise-2 text-studio-ink' : 'text-studio-ink-3 hover:bg-studio-raise hover:text-studio-ink-2'
              }`}
              title={m === 'doc' ? 'The file as it looks' : 'The text the AI reads from this file'}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Body — the doc viewer fills the pane; text/image scroll inside padding. */}
      <div className={`min-h-0 flex-1 bg-black/20 ${showingDoc ? '' : 'overflow-auto p-3'}`}>
        {doc.isImage && doc.imageUrl ? (
          <img src={doc.imageUrl} alt={doc.name} className="mx-auto max-w-full rounded" />
        ) : showingDoc ? (
          <iframe src={doc.docUrl} title={doc.name} className="h-full w-full border-0 bg-white" />
        ) : hasText ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-ui-sm leading-relaxed text-studio-ink-2">{doc.text}</pre>
        ) : (
          <p className="text-center text-ui-sm text-studio-ink-3">No preview available for this file.</p>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-studio-hair px-3 py-2 text-center text-ui-sm text-studio-ink-4">
        Close to return to the element editor.
      </div>
    </div>
  );
}
