// Magazine Builder v2 — full-screen editor shell: toolbar + pages rail +
// interactive canvas + inspector. Full editor UX (inline text, resizable panes,
// media picker, AI panel) lands in later phases; this is the clickable core.

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Undo2, Redo2, Plus, Minus, Copy, Trash2, ChevronUp, ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { useEditorStore } from './store';
import { EditorCanvas } from './EditorCanvas';
import { Inspector } from './Inspector';
import type { ElementType, MagazineElement } from './model';

function newElement(kind: ElementType, page: { width: number; height: number }, topZ: number): Partial<MagazineElement> {
  const w = kind === 'qr' ? 200 : kind === 'shape' ? 320 : 440;
  const h = kind === 'qr' ? 200 : kind === 'text' ? 90 : 240;
  const base: Partial<MagazineElement> = {
    type: kind,
    x: Math.round(page.width / 2 - w / 2),
    y: Math.round(page.height / 3),
    w,
    h,
    rotation: 0,
    zIndex: topZ + 1,
    locked: false,
    source: 'manual',
  };
  if (kind === 'text') base.text = { content: 'New text', role: 'body', fontFamily: 'Georgia, serif', fontSize: 44, maxFontSize: 44, fontWeight: 400, color: '#111111', align: 'left', lineHeight: 1.3, autoFit: 'shrink' };
  if (kind === 'shape') base.shape = { fill: '#0a2342' };
  if (kind === 'image') base.image = { assetId: '', url: '', alt: '', fit: 'cover' };
  if (kind === 'qr') base.qr = { url: '', fg: '#000000', bg: '#ffffff' };
  return base;
}

export default function MagazineEditorV2() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const s = useEditorStore();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState(2);
  const [aiTopic, setAiTopic] = useState('');

  useEffect(() => {
    if (id) void s.load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const topZ = s.page ? s.page.elements.reduce((m, e) => Math.max(m, e.zIndex), 0) : 0;
  const add = (kind: ElementType) => {
    if (s.page) void s.addElement(newElement(kind, s.page, topZ));
  };

  if (s.loading) return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (s.error) return <div className="flex h-screen items-center justify-center text-sm text-red-600">{s.error}</div>;

  const currentIndex = s.pages.findIndex((p) => p.id === s.currentPageId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 text-sm">
        <button className="rounded p-1 hover:bg-muted" onClick={() => navigate('/newsroom')} title="Back">
          <ArrowLeft size={18} />
        </button>
        <input
          className="w-56 rounded border border-transparent bg-transparent px-1.5 py-1 font-medium hover:border-border"
          defaultValue={s.issue?.title ?? ''}
          key={s.issue?.id}
          onBlur={(e) => s.canManage() && e.target.value.trim() && void s.rename(e.target.value.trim())}
          disabled={!s.canManage()}
        />
        <div className="mx-2 h-5 w-px bg-border" />
        <button className="rounded p-1 disabled:opacity-30 hover:bg-muted" disabled={!s.undoStack.length} onClick={() => void s.undo()} title="Undo"><Undo2 size={16} /></button>
        <button className="rounded p-1 disabled:opacity-30 hover:bg-muted" disabled={!s.redoStack.length} onClick={() => void s.redo()} title="Redo"><Redo2 size={16} /></button>
        <div className="mx-2 h-5 w-px bg-border" />
        <span className="text-xs text-muted-foreground">Add:</span>
        {(['text', 'image', 'shape', 'qr'] as ElementType[]).map((k) => (
          <button key={k} className="rounded border border-border px-2 py-1 text-xs capitalize hover:bg-muted" onClick={() => add(k)}>{k}</button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button className="rounded p-1 hover:bg-muted" onClick={() => s.setZoomWidth(s.zoomWidth - 80)} title="Zoom out"><Minus size={16} /></button>
          <span className="w-10 text-center text-xs text-muted-foreground">{Math.round((s.zoomWidth / 1275) * 100)}%</span>
          <button className="rounded p-1 hover:bg-muted" onClick={() => s.setZoomWidth(s.zoomWidth + 80)} title="Zoom in"><Plus size={16} /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Pages rail */}
        <div className="w-44 shrink-0 overflow-y-auto border-r border-border p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Pages</span>
            {s.canManage() && (
              <span className="flex items-center gap-0.5">
                <button className="rounded p-1 text-[#7c3aed] hover:bg-muted disabled:opacity-40" disabled={s.generating} onClick={() => setAiOpen((v) => !v)} title="Add pages with AI">
                  {s.generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                </button>
                <button className="rounded p-1 hover:bg-muted" onClick={() => void s.addPage()} title="Add blank page"><Plus size={14} /></button>
              </span>
            )}
          </div>
          {s.canManage() && aiOpen && !s.generating && (
            <div className="mb-2 grid gap-1.5 rounded border border-[#7c3aed]/40 bg-[#7c3aed]/5 p-2">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">Add</span>
                <select className="rounded border border-border bg-background px-1 py-0.5" value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))}>
                  {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-muted-foreground">on-theme page{aiCount === 1 ? '' : 's'}</span>
              </div>
              <input
                className="rounded border border-border bg-background px-1.5 py-1 text-[11px]"
                placeholder="Topic (optional)"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
              />
              <div className="flex justify-end gap-1">
                <button className="rounded px-2 py-1 text-[11px] hover:bg-muted" onClick={() => setAiOpen(false)}>Cancel</button>
                <button
                  className="inline-flex items-center gap-1 rounded bg-[#7c3aed] px-2 py-1 text-[11px] font-medium text-white"
                  onClick={() => { void s.generatePages(aiCount, aiTopic.trim()); setAiOpen(false); setAiTopic(''); }}
                >
                  <Sparkles size={12} /> Generate
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            {s.pages.map((p, i) => (
              <div key={p.id} className={`group flex items-center gap-1 rounded border px-2 py-1.5 text-xs ${p.id === s.currentPageId ? 'border-[#7c3aed] bg-[#7c3aed]/5' : 'border-border hover:bg-muted'}`}>
                <button className="flex-1 text-left" onClick={() => void s.openPage(p.id)}>Page {i + 1}<span className="ml-1 text-[10px] text-muted-foreground">({p.elementCount})</span></button>
                {s.canManage() && (
                  <span className="hidden gap-0.5 group-hover:flex">
                    <button className="rounded p-0.5 hover:bg-background" disabled={i === 0} onClick={() => void s.reorder(i, i - 1)} title="Up"><ChevronUp size={12} /></button>
                    <button className="rounded p-0.5 hover:bg-background" disabled={i === s.pages.length - 1} onClick={() => void s.reorder(i, i + 1)} title="Down"><ChevronDown size={12} /></button>
                    <button className="rounded p-0.5 hover:bg-background" onClick={() => void s.duplicatePage(p.id)} title="Duplicate"><Copy size={12} /></button>
                    <button className="rounded p-0.5 text-red-600 hover:bg-background disabled:opacity-30" disabled={s.pages.length <= 1} onClick={() => void s.deletePage(p.id)} title="Delete"><Trash2 size={12} /></button>
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">Page {currentIndex + 1} of {s.pages.length}</div>
        </div>

        {/* Canvas */}
        <div className="min-w-0 flex-1 overflow-auto bg-muted/40">
          <EditorCanvas />
        </div>

        {/* Inspector */}
        <div className="w-64 shrink-0 overflow-y-auto border-l border-border">
          <Inspector />
        </div>
      </div>
    </div>
  );
}
