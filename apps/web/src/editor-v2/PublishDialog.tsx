// Magazine Builder v2 — publish picker (owner only), mirroring the v1 flow:
// choose exactly which pages go public, then publish the frozen edition to the
// Bulletins newsstand. Selection is local until you hit Publish, which persists
// each page's `selectedForPublish` and freezes the snapshot in one call.

import { useEffect, useState } from 'react';
import { X, CheckSquare, Square, Send, Loader2 } from 'lucide-react';
import { useEditorStore } from './store';

export function PublishDialog({ open, onClose, onPublished }: { open: boolean; onClose: () => void; onPublished: (publishedIssueId: string) => void }) {
  const s = useEditorStore();
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Seed the selection from each page's current flag whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSel(new Set(s.pages.filter((p) => p.selectedForPublish).map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const total = s.pages.length;
  const selectedCount = s.pages.filter((p) => sel.has(p.id)).length;
  const allSelected = total > 0 && selectedCount === total;

  const toggle = (id: string, on: boolean) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  const setAll = (on: boolean) => setSel(on ? new Set(s.pages.map((p) => p.id)) : new Set());

  const doPublish = async () => {
    const id = await s.publish(s.pages.filter((p) => sel.has(p.id)).map((p) => p.id));
    if (id) { onClose(); onPublished(id); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-md border border-white/10 bg-[#0d1626] text-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Send size={16} className="text-emerald-300" />
          <div className="min-w-0">
            <p className="text-sm font-bold">Publish to Bulletins</p>
            <p className="truncate text-[11px] text-white/40">Choose which pages go public</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-sm p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Count + select-all toggle */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="text-xs font-semibold text-white/70">
            {selectedCount} of {total} page{total !== 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={() => setAll(!allSelected)}
            className="ml-auto flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
          >
            {allSelected ? <Square size={12} /> : <CheckSquare size={12} />}
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        {/* Page list */}
        <div className="flex-1 overflow-y-auto p-2">
          {s.pages.map((p, i) => (
            <label
              key={p.id}
              className={
                'flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs hover:bg-white/5 ' +
                (sel.has(p.id) ? 'text-white' : 'text-white/55')
              }
            >
              <input
                type="checkbox"
                checked={sel.has(p.id)}
                onChange={(e) => toggle(p.id, e.target.checked)}
                className="accent-emerald-500"
              />
              <span className="tabular-nums text-white/40">{String(i + 1).padStart(2, '0')}</span>
              <span className="truncate">Page {i + 1} · {p.elementCount} element{p.elementCount === 1 ? '' : 's'}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-white/15 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void doPublish()}
            disabled={s.publishing || selectedCount === 0}
            className="ml-auto flex items-center justify-center gap-1.5 rounded-sm bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {s.publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {s.publishing ? 'Publishing…' : `Publish ${selectedCount} page${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
