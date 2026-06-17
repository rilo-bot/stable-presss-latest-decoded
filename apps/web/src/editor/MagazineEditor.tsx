/**
 * Full-screen magazine editor: top toolbar + scrolling page canvas + right
 * inspector. Launched from the Production System. No save button — edits persist live.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMagazineStore } from '@/stores/magazineStore';
import { useIssueStore } from '@/stores/issueStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { useEditorFonts } from './fonts/useEditorFonts';
import { MagazineCanvas } from './MagazineCanvas';
import { Inspector } from './inspector/Inspector';
import { ShareDialog } from './ShareDialog';
import { EditorAgentPanel } from './agent/EditorAgentPanel';
import { FloatingSuggestions } from './agent/FloatingSuggestions';
import { useCurrentPageTracker } from './agent/useCurrentPageTracker';
import { X, ZoomIn, ZoomOut, Send, CheckSquare, Square, ChevronDown, Loader2, Users, Sparkles, Undo2, Redo2 } from 'lucide-react';
import { toast } from 'sonner';

export function MagazineEditor({ magazineId, onClose }: { magazineId: string; onClose: () => void }) {
  useEditorFonts();
  const navigate = useNavigate();

  const loadMagazine = useMagazineStore((s) => s.loadMagazine);
  const flushPending = useMagazineStore((s) => s.flushPending);
  const updateMeta = useMagazineStore((s) => s.updateMagazineMeta);
  const setAllSelected = useMagazineStore((s) => s.setAllPagesSelected);
  const buildIssuePayload = useMagazineStore((s) => s.buildIssuePayload);
  const markPublished = useMagazineStore((s) => s.markPublished);
  const publishIssue = useIssueStore((s) => s.publish);
  const undo = useMagazineStore((s) => s.undo);
  const redo = useMagazineStore((s) => s.redo);
  const canUndo = useMagazineStore((s) => s.history[magazineId]?.canUndo ?? false);
  const canRedo = useMagazineStore((s) => s.history[magazineId]?.canRedo ?? false);

  const meta = useMagazineStore((s) => {
    const m = s.magazines.find((x) => x.id === magazineId);
    return m ? { title: m.title, edition: m.edition, pages: m.pages.length } : null;
  });
  const selectedCount = useMagazineStore(
    (s) => s.magazines.find((m) => m.id === magazineId)?.pages.filter((p) => p.selectedForPublish).length ?? 0
  );
  // Management (publish, settings, share) is owner-only; collaborators only edit assigned pages.
  const myRole = useMagazineStore((s) => s.access[magazineId]?.role);
  const canManage = myRole === 'owner';

  const [scale, setScale] = useState(0.62);
  const [pubOpen, setPubOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const pageCount = meta?.pages ?? 0;
  useCurrentPageTracker(canvasScrollRef, magazineId, pageCount);

  // Hide the global Stablehand launcher while the editor is open; clean up its
  // staged edits / current-page on close.
  useEffect(() => {
    const ui = useEditorAgentUi.getState();
    ui.setSuppressGlobal(true);
    return () => {
      ui.setSuppressGlobal(false);
      ui.setOpen(false);
      ui.setCurrentPage(null);
      ui.clearStaged();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    loadMagazine(magazineId).then((ok) => {
      if (active) setLoadState(ok ? 'ready' : 'notfound');
    });
    return () => {
      active = false;
    };
  }, [magazineId, loadMagazine]);

  // Persist any debounced edits when the editor unmounts.
  useEffect(() => () => flushPending(), [flushPending]);

  // Lock body scroll while the full-screen editor is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Undo/redo keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y). Blur the
  // active region first so EditableText re-syncs from the restored store value.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // leave native undo for form fields
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        if (e.shiftKey) redo(magazineId);
        else undo(magazineId);
      } else if (k === 'y') {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        redo(magazineId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [magazineId, undo, redo]);

  const handleClose = () => {
    flushPending();
    onClose();
  };

  const handleUndo = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    undo(magazineId);
  };
  const handleRedo = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    redo(magazineId);
  };

  if (loadState === 'loading' || !meta) {
    if (loadState === 'notfound') {
      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b1220] text-white/70">
          Magazine not found, or you don’t have access.
          <button onClick={onClose} className="ml-3 underline">Close</button>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b1220] text-white/60">
        <Loader2 className="mr-2 animate-spin" size={18} /> Loading magazine…
      </div>
    );
  }

  const doPublish = async (scope: 'full' | 'selected') => {
    const payload = buildIssuePayload(magazineId, scope);
    if (!payload) {
      toast.error('Select at least one page to publish.');
      return;
    }
    setPubOpen(false);
    setPublishing(true);
    const id = await publishIssue(payload);
    setPublishing(false);
    if (!id) return; // issueStore surfaced the error toast already
    markPublished(magazineId, id);
    toast.success(`Published ${scope === 'full' ? 'full edition' : 'selected pages'} to Bulletins.`, {
      action: {
        label: 'View',
        onClick: () => navigate(`/bulletins/${id}`),
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b1220]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#0d1626] px-4 py-2.5">
        <button
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close editor"
        >
          <X size={16} />
        </button>
        <div className="min-w-0">
          <input
            value={meta.title}
            onChange={(e) => updateMeta(magazineId, { title: e.target.value })}
            disabled={!canManage}
            className="w-[260px] max-w-[40vw] truncate bg-transparent text-sm font-bold text-white outline-none disabled:opacity-100"
            aria-label="Magazine title"
          />
          <input
            value={meta.edition}
            onChange={(e) => updateMeta(magazineId, { edition: e.target.value })}
            disabled={!canManage}
            className="block w-[260px] max-w-[40vw] truncate bg-transparent text-[11px] text-white/45 outline-none"
            aria-label="Magazine edition"
          />
        </div>

        {!canManage && (
          <span className="rounded-sm border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
            Shared with you · editing your assigned pages
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* undo / redo */}
          <div className="flex items-center rounded-sm border border-white/15 bg-white/5">
            <button onClick={handleUndo} disabled={!canUndo} className="px-2 py-1.5 text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
            <button onClick={handleRedo} disabled={!canRedo} className="px-2 py-1.5 text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 size={14} /></button>
          </div>

          {/* zoom */}
          <div className="flex items-center rounded-sm border border-white/15 bg-white/5">
            <button onClick={() => setScale((z) => Math.max(0.35, +(z - 0.08).toFixed(2)))} className="px-2 py-1.5 text-white/70 hover:bg-white/10" aria-label="Zoom out"><ZoomOut size={14} /></button>
            <span className="w-12 text-center text-[11px] tabular-nums text-white/70">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((z) => Math.min(1.1, +(z + 0.08).toFixed(2)))} className="px-2 py-1.5 text-white/70 hover:bg-white/10" aria-label="Zoom in"><ZoomIn size={14} /></button>
          </div>

          {/* AI Studio Assistant toggle */}
          <button
            onClick={() => setAiOpen((o) => !o)}
            aria-pressed={aiOpen}
            className={
              'flex items-center gap-1 rounded-sm border px-2 py-1.5 text-[11px] ' +
              (aiOpen ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/15 text-white/70 hover:bg-white/10')
            }
          >
            <Sparkles size={13} /> AI
          </button>

          {canManage && (
            <>
              {/* share */}
              <button onClick={() => setShareOpen(true)} className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"><Users size={13} /> Share</button>

              {/* select all / none */}
              <button onClick={() => setAllSelected(magazineId, true)} className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"><CheckSquare size={13} /> All</button>
              <button onClick={() => setAllSelected(magazineId, false)} className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"><Square size={13} /> None</button>
            </>
          )}

          {/* publish */}
          {canManage && (
          <div className="relative">
            <button
              onClick={() => setPubOpen((o) => !o)}
              disabled={publishing}
              className="flex items-center gap-1.5 rounded-sm bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              {publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {publishing ? 'Publishing…' : 'Publish'} <ChevronDown size={12} />
            </button>
            {pubOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-sm border border-white/15 bg-[#0d1626] shadow-xl">
                <button
                  onClick={() => doPublish('full')}
                  className="block w-full px-3 py-2.5 text-left text-xs text-white hover:bg-white/10"
                >
                  <span className="font-semibold">Publish full edition</span>
                  <span className="block text-[10px] text-white/40">All {meta.pages} pages</span>
                </button>
                <button
                  onClick={() => doPublish('selected')}
                  className="block w-full border-t border-white/10 px-3 py-2.5 text-left text-xs text-white hover:bg-white/10"
                >
                  <span className="font-semibold">Publish selected pages</span>
                  <span className="block text-[10px] text-white/40">{selectedCount} page{selectedCount !== 1 ? 's' : ''} selected</span>
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {aiOpen && (
          <div className="w-[340px] flex-shrink-0 overflow-hidden border-r border-white/10">
            <EditorAgentPanel />
          </div>
        )}
        <div className="relative min-w-0 flex-1">
          <div ref={canvasScrollRef} className="absolute inset-0 overflow-auto bg-[#0b1220]">
            <MagazineCanvas magazineId={magazineId} scale={scale} />
          </div>
          {/* Always-3 page-aware suggestion chips, pinned to the canvas */}
          <FloatingSuggestions magazineId={magazineId} />
        </div>
        <div className="w-[300px] flex-shrink-0 overflow-hidden border-l border-white/10 bg-[#0d1626]">
          <Inspector />
        </div>
      </div>

      {shareOpen && <ShareDialog magazineId={magazineId} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
