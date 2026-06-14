/**
 * Full-screen magazine editor: top toolbar + scrolling page canvas + right
 * inspector. Launched from the CMS. No save button — edits persist live.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMagazineStore } from '@/stores/magazineStore';
import { useIssueStore } from '@/stores/issueStore';
import { useEditorFonts } from './fonts/useEditorFonts';
import { MagazineCanvas } from './MagazineCanvas';
import { Inspector } from './inspector/Inspector';
import { X, ZoomIn, ZoomOut, Send, CheckSquare, Square, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function MagazineEditor({ magazineId, onClose }: { magazineId: string; onClose: () => void }) {
  useEditorFonts();
  const navigate = useNavigate();

  const loadMagazine = useMagazineStore((s) => s.loadMagazine);
  const updateMeta = useMagazineStore((s) => s.updateMagazineMeta);
  const setAllSelected = useMagazineStore((s) => s.setAllPagesSelected);
  const buildIssuePayload = useMagazineStore((s) => s.buildIssuePayload);
  const markPublished = useMagazineStore((s) => s.markPublished);
  const publishIssue = useIssueStore((s) => s.publish);

  const meta = useMagazineStore((s) => {
    const m = s.magazines.find((x) => x.id === magazineId);
    return m ? { title: m.title, edition: m.edition, pages: m.pages.length } : null;
  });
  const selectedCount = useMagazineStore(
    (s) => s.magazines.find((m) => m.id === magazineId)?.pages.filter((p) => p.selectedForPublish).length ?? 0
  );

  const [scale, setScale] = useState(0.62);
  const [pubOpen, setPubOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    loadMagazine(magazineId);
  }, [magazineId, loadMagazine]);

  // Lock body scroll while the full-screen editor is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!meta) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b1220] text-white/70">
        Magazine not found.
        <button onClick={onClose} className="ml-3 underline">Close</button>
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
        onClick: () => {
          onClose();
          navigate(`/bulletins/${id}`);
        },
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b1220]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#0d1626] px-4 py-2.5">
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close editor"
        >
          <X size={16} />
        </button>
        <div className="min-w-0">
          <input
            value={meta.title}
            onChange={(e) => updateMeta(magazineId, { title: e.target.value })}
            className="w-[260px] max-w-[40vw] truncate bg-transparent text-sm font-bold text-white outline-none"
            aria-label="Magazine title"
          />
          <input
            value={meta.edition}
            onChange={(e) => updateMeta(magazineId, { edition: e.target.value })}
            className="block w-[260px] max-w-[40vw] truncate bg-transparent text-[11px] text-white/45 outline-none"
            aria-label="Magazine edition"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* zoom */}
          <div className="flex items-center rounded-sm border border-white/15 bg-white/5">
            <button onClick={() => setScale((z) => Math.max(0.35, +(z - 0.08).toFixed(2)))} className="px-2 py-1.5 text-white/70 hover:bg-white/10" aria-label="Zoom out"><ZoomOut size={14} /></button>
            <span className="w-12 text-center text-[11px] tabular-nums text-white/70">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((z) => Math.min(1.1, +(z + 0.08).toFixed(2)))} className="px-2 py-1.5 text-white/70 hover:bg-white/10" aria-label="Zoom in"><ZoomIn size={14} /></button>
          </div>

          {/* select all / none */}
          <button onClick={() => setAllSelected(magazineId, true)} className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"><CheckSquare size={13} /> All</button>
          <button onClick={() => setAllSelected(magazineId, false)} className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"><Square size={13} /> None</button>

          {/* publish */}
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
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto bg-[#0b1220]">
          <MagazineCanvas magazineId={magazineId} scale={scale} />
        </div>
        <div className="w-[300px] flex-shrink-0 overflow-hidden border-l border-white/10 bg-[#0d1626]">
          <Inspector />
        </div>
      </div>
    </div>
  );
}
