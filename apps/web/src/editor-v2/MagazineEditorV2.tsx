// Magazine Builder v2 — full-screen studio shell.
//
// Design/layout mirrors the v1 magazine studio (docked AI assistant on the left,
// scrolling canvas centre, inspector right, top toolbar) in the Stable brand
// palette: forest-green surfaces, gold accents, parchment text. Page management
// is a horizontal tab strip at the top of the canvas column (v2 edits one page at
// a time). The AI assistant is the proposal-based editing agent (AiPanel).

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Undo2, Redo2, Plus, Minus, Copy, Trash2, ChevronLeft, ChevronRight, ChevronDown, Sparkles, Loader2, Wand2, WandSparkles, RotateCcw, ImageIcon, Globe, ExternalLink, Send, Users, EyeOff } from 'lucide-react';
import { useEditorStore } from './store';
import { useStudioChrome } from '@/stores/studioChromeStore';
import { EditorCanvas } from './EditorCanvas';
import { Inspector } from './Inspector';
import { AiPanel } from './AiPanel';
import { CoverPicker } from './CoverPicker';
import { AttachmentPreviewPane } from './AttachmentPreviewPane';
import { PublishDialog } from './PublishDialog';
import { ShareDialog } from './ShareDialog';
import type { ElementType, MagazineElement } from './model';

function newElement(kind: ElementType, page: { width: number; height: number }, topZ: number): Partial<MagazineElement> {
  const w = kind === 'qr' ? 200 : kind === 'icon' ? 120 : kind === 'shape' ? 320 : 440;
  const h = kind === 'qr' ? 200 : kind === 'icon' ? 120 : kind === 'text' ? 90 : 240;
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
  // Start with a recognisable glyph (not the neutral fallback) so a freshly-added
  // icon reads as an icon straight away; the inspector's picker swaps it.
  if (kind === 'icon') base.icon = { name: 'Star', color: '#0a2342' };
  return base;
}

// Shared button styling on the green surface.
const ghost = 'flex items-center gap-1 rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5';

export default function MagazineEditorV2() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const s = useEditorStore();
  const [asstOpen, setAsstOpen] = useState(true);
  const [pagesAiOpen, setPagesAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState(2);
  const [aiTopic, setAiTopic] = useState('');
  const [coverOpen, setCoverOpen] = useState(false);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const isPublished = !!s.issue?.publishedIssueId && s.issue?.status === 'published';

  // Hide the global Stablehand launcher while the v2 editor is open — it has
  // its own docked assistant (AiPanel). Same pattern as the v1 MagazineEditor.
  useEffect(() => {
    useStudioChrome.getState().setSuppressGlobal(true);
    return () => useStudioChrome.getState().setSuppressGlobal(false);
  }, []);

  // Post-publish: match the v1 flow — toast with a "View" action that opens the
  // frozen edition on the public Bulletins page.
  const onPublished = (publishedIssueId: string, scope: 'full' | 'selected') => {
    toast.success(`Published ${scope === 'full' ? 'full edition' : 'selected pages'} to Bulletins.`, {
      action: { label: 'View', onClick: () => navigate(`/bulletins/${publishedIssueId}`) },
    });
  };
  const publishFull = async () => {
    setPublishMenuOpen(false);
    const id = await s.publish('full');
    if (id) onPublished(id, 'full');
  };

  // Resizable side panes (persisted). Center canvas always flexes between them.
  const [panes, setPanes] = useState<{ leftW: number; rightW: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('mag2.v2.paneWidths') || 'null');
      if (saved && typeof saved.leftW === 'number' && typeof saved.rightW === 'number') return saved;
    } catch { /* ignore */ }
    return { leftW: 340, rightW: 300 };
  });
  useEffect(() => {
    try { localStorage.setItem('mag2.v2.paneWidths', JSON.stringify(panes)); } catch { /* ignore */ }
  }, [panes]);
  const dragging = useRef<null | 'left' | 'right'>(null);
  const startDivider = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    dragging.current = side;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBodyMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const MIN = 240, MAX = 560;
    if (dragging.current === 'left') setPanes((p) => ({ ...p, leftW: Math.max(MIN, Math.min(MAX, e.clientX)) }));
    else setPanes((p) => ({ ...p, rightW: Math.max(MIN, Math.min(MAX, window.innerWidth - e.clientX)) }));
  };
  const endDivider = () => { dragging.current = null; };
  const divider = 'w-1 flex-shrink-0 cursor-col-resize bg-white/5 hover:bg-[var(--gold-bright)]/60';

  useEffect(() => {
    if (id) void s.load(id);
    return () => s.stopWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Lock body scroll while the full-screen studio is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const topZ = s.page ? s.page.elements.reduce((m, e) => Math.max(m, e.zIndex), 0) : 0;
  const add = (kind: ElementType) => {
    if (s.page) void s.addElement(newElement(kind, s.page, topZ));
  };

  if (s.loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b1220] text-white/60">
        <Loader2 className="mr-2 animate-spin" size={18} /> Loading studio…
      </div>
    );
  }
  if (s.error) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b1220] text-red-300">
        {s.error}
        <button onClick={() => navigate('/production-system/magazine-v2')} className="ml-3 underline">Back</button>
      </div>
    );
  }

  const currentIndex = s.pages.findIndex((p) => p.id === s.currentPageId);
  const zoomPct = Math.round((s.zoomWidth / 1275) * 100);
  const canEdit = s.canEdit(); // owner or collaborator; false = another admin's magazine (view-only)

  // Still being built by "Build with AI" / import — pages stream in live below.
  const building = s.generating || s.issue?.status === 'processing';
  const buildTotal = s.issue?.pagesTotal ?? 0;
  const buildDone = Math.min(s.issue?.pagesProcessed ?? s.pages.length, buildTotal || Infinity);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b1220]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#0d1626] px-4 py-2.5">
        <button
          onClick={() => navigate('/production-system/magazine-v2')}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Back to library"
        >
          <ArrowLeft size={16} />
        </button>
        <input
          className="w-[260px] max-w-[36vw] truncate bg-transparent text-sm font-bold text-white outline-none disabled:opacity-100"
          defaultValue={s.issue?.title ?? ''}
          // Uncontrolled input: `defaultValue` only takes on mount, so fold the
          // title into the key. When generation finishes and the poll swaps the
          // placeholder "Generating…" for the real title, the key changes and the
          // input remounts with it (otherwise it stays stuck on the mount value).
          key={`${s.issue?.id ?? ''}:${s.issue?.title ?? ''}`}
          onBlur={(e) => s.canManage() && e.target.value.trim() && void s.rename(e.target.value.trim())}
          disabled={!s.canManage()}
          aria-label="Magazine title"
        />
        {s.issue && !s.canManage() && (
          canEdit ? (
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] text-sky-200">
              Shared with you · editing your assigned pages
            </span>
          ) : (
            <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
              View only{s.issue.ownerName ? ` · by ${s.issue.ownerName}` : ''}
            </span>
          )
        )}
        {isPublished && (
          <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
            <Globe size={10} /> Live in Bulletins
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* undo / redo */}
          <div className="flex items-center rounded-sm border border-white/15 bg-white/5">
            <button onClick={() => void s.undo()} disabled={!s.undoStack.length} className="px-2 py-1.5 text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent" title="Undo"><Undo2 size={14} /></button>
            <button onClick={() => void s.redo()} disabled={!s.redoStack.length} className="px-2 py-1.5 text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent" title="Redo"><Redo2 size={14} /></button>
          </div>

          {/* zoom */}
          <div className="flex items-center rounded-sm border border-white/15 bg-white/5">
            <button onClick={() => s.setZoomWidth(s.zoomWidth - 80)} className="px-2 py-1.5 text-white/70 hover:bg-white/10" title="Zoom out"><Minus size={14} /></button>
            <span className="w-12 text-center text-[11px] tabular-nums text-white/70">{zoomPct}%</span>
            <button onClick={() => s.setZoomWidth(s.zoomWidth + 80)} className="px-2 py-1.5 text-white/70 hover:bg-white/10" title="Zoom in"><Plus size={14} /></button>
          </div>

          {/* Editing tools — hidden for view-only admins (another admin's magazine) */}
          {canEdit && (
            <>
              {/* add element */}
              <div className="mx-0.5 h-5 w-px bg-white/10" />
              <span className="text-[10px] uppercase tracking-wide text-white/40">Add</span>
              {(['text', 'image', 'shape', 'qr', 'icon'] as ElementType[]).map((k) => (
                <button key={k} className={ghost + ' capitalize'} onClick={() => add(k)}>{k === 'qr' ? 'QR' : k}</button>
              ))}

              {/* AI text pass — Fill (write empty + tighten) / Adjust (tighten) */}
              <div className="mx-0.5 h-5 w-px bg-white/10" />
              <button className={ghost} disabled={s.formatBusy || !s.page} onClick={() => void s.runFormat('fill')} title="Fill empty boxes & tighten crowded text (AI)">
                {s.formatBusy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Fill
              </button>
              <button className={ghost} disabled={s.formatBusy || !s.page} onClick={() => void s.runFormat('adjust')} title="Tighten crowded text so it reads at a comfortable size (AI)">
                <WandSparkles size={13} /> Adjust
              </button>
            </>
          )}

          {/* Cover — choose the Bulletins newsstand cover image (owner only) */}
          {s.canManage() && (
            <button className={ghost} onClick={() => setCoverOpen(true)} title="Set the cover image shown on Bulletins">
              <ImageIcon size={13} /> Cover
            </button>
          )}

          {/* Reset — start over from a single blank page (owner only) */}
          {s.canManage() && (
            <button
              className={ghost}
              onClick={() => { if (window.confirm('Reset this magazine to a single blank page? This cannot be undone.')) void s.reset(); }}
              title="Start over (single blank page)"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}

          {/* Share (collaborators) — owner only */}
          {s.canManage() && (
            <button className={ghost} onClick={() => setShareOpen(true)} title="Invite staff to edit this magazine">
              <Users size={13} /> Share
            </button>
          )}

          {/* Publish → Bulletins (owner only) — full edition / selected pages / unpublish */}
          {s.canManage() && s.issue && (
            <>
              <div className="mx-0.5 h-5 w-px bg-white/10" />
              {isPublished && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <Globe size={9} /> Live
                </span>
              )}
              <div className="relative">
                <button
                  onClick={() => setPublishMenuOpen((o) => !o)}
                  disabled={s.publishing || s.generating}
                  className="flex items-center gap-1.5 rounded-sm bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  title="Publish this magazine to Bulletins"
                >
                  {s.publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {s.publishing ? 'Publishing…' : isPublished ? 'Republish' : 'Publish'} <ChevronDown size={12} />
                </button>
                {publishMenuOpen && !s.publishing && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-md border border-white/15 bg-[#0d1626] shadow-xl">
                    <button onClick={() => void publishFull()} className="block w-full px-3 py-2.5 text-left text-xs text-white hover:bg-white/10">
                      <span className="font-semibold">Publish full edition</span>
                      <span className="block text-[10px] text-white/40">All {s.pages.length} page{s.pages.length === 1 ? '' : 's'} go public in Bulletins</span>
                    </button>
                    <button
                      onClick={() => { setPublishMenuOpen(false); setPublishDialogOpen(true); }}
                      className="block w-full border-t border-white/10 px-3 py-2.5 text-left text-xs text-white hover:bg-white/10"
                    >
                      <span className="font-semibold">Publish selected pages…</span>
                      <span className="block text-[10px] text-white/40">Choose exactly which pages go public</span>
                    </button>
                    {isPublished && (
                      <button
                        onClick={() => { setPublishMenuOpen(false); void s.unpublish(); }}
                        className="block w-full border-t border-white/10 px-3 py-2.5 text-left text-xs text-red-300 hover:bg-white/10"
                      >
                        <span className="flex items-center gap-1 font-semibold"><EyeOff size={11} /> Unpublish</span>
                        <span className="block text-[10px] text-white/40">Remove this edition from Bulletins</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isPublished && s.issue.publishedIssueId && (
                <a
                  href={`/bulletins/${s.issue.publishedIssueId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"
                  title="View on Bulletins"
                >
                  <ExternalLink size={12} /> View
                </a>
              )}
              <button
                onClick={async () => {
                  if (!window.confirm('Delete this magazine? This removes the draft, all pages, and any published Bulletins edition. This cannot be undone.')) return;
                  if (await s.remove()) navigate('/production-system/magazine-v2');
                }}
                disabled={s.publishing}
                className="flex items-center gap-1 rounded-sm border border-red-400/30 px-2 py-1.5 text-[11px] text-red-300/80 hover:bg-red-500/10 disabled:opacity-40"
                title="Delete this magazine"
              >
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}

          {/* AI assistant toggle (editors only) */}
          {canEdit && (
            <button
              onClick={() => setAsstOpen((o) => !o)}
              aria-pressed={asstOpen}
              className={'flex items-center gap-1 rounded-sm border px-2 py-1.5 text-[11px] ' + (asstOpen ? 'text-[#0b1220]' : 'border-white/15 text-white/70 hover:bg-white/10')}
              style={asstOpen ? { background: 'var(--gold-bright)', borderColor: 'var(--gold-bright)' } : undefined}
              title="Studio Assistant"
            >
              <Sparkles size={13} /> AI
            </button>
          )}
        </div>
      </div>

      {/* Live-build banner — pages stream in below as the AI composes them. */}
      {building && (
        <div className="flex items-center gap-2 border-b border-[var(--gold-bright)]/25 bg-[var(--gold-bright)]/10 px-4 py-1.5 text-[11px] text-[var(--gold-bright)]">
          <Loader2 size={12} className="animate-spin" />
          <span className="font-medium">{s.issue?.stage || 'Building your magazine'}{buildTotal ? ` — ${buildDone} of ${buildTotal} pages` : '…'}</span>
          <span className="text-white/45">pages appear as they’re ready — you can start editing the finished ones</span>
        </div>
      )}

      {/* Post-generation nudge — the first pass is a short preview; offer more. */}
      {!building && s.justGenerated && s.canManage() && (
        <div className="flex items-center gap-2 border-b border-[var(--gold-bright)]/25 bg-[var(--gold-bright)]/10 px-4 py-1.5 text-[11px] text-[var(--gold-bright)]">
          <Sparkles size={12} />
          <span className="font-medium">Here’s your preview — {s.pages.length} page{s.pages.length === 1 ? '' : 's'}. Want a fuller issue?</span>
          <button
            onClick={() => { setPagesAiOpen(true); s.clearJustGenerated(); }}
            className="rounded-sm bg-[var(--gold-bright)] px-2 py-0.5 text-[10px] font-semibold text-[#0b1220] hover:opacity-90"
          >
            Add more pages
          </button>
          <button onClick={() => s.clearJustGenerated()} className="ml-auto text-white/45 hover:text-white/80">Maybe later</button>
        </div>
      )}

      {/* Body: assistant · canvas · inspector (resizable side panes) */}
      <div className="flex min-h-0 flex-1" onPointerMove={onBodyMove} onPointerUp={endDivider}>
        {asstOpen && canEdit && (
          <>
            <div style={{ width: panes.leftW }} className="flex-shrink-0 overflow-hidden border-r border-white/10">
              <AiPanel />
            </div>
            <div className={divider} onPointerDown={startDivider('left')} title="Drag to resize" />
          </>
        )}

        {/* Canvas column (page tabs + scroll area) */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Page tabs */}
          <div className="relative flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#0b1220] px-3 py-1.5">
            {s.pages.map((p, i) => {
              const active = p.id === s.currentPageId;
              return (
                <div key={p.id} className="group flex items-center">
                  <button
                    onClick={() => void s.openPage(p.id)}
                    className={
                      'flex items-center gap-1 rounded-sm border px-2.5 py-1 text-[11px] ' +
                      (active ? 'border-white/25 bg-white/10 text-white' : 'border-white/15 text-white/70 hover:bg-white/10')
                    }
                  >
                    {i + 1}
                    <span className={active ? 'text-white/50' : 'text-white/35'}>({p.elementCount})</span>
                  </button>
                  {active && s.canManage() && (
                    <span className="ml-0.5 flex items-center">
                      <button className="rounded p-1 text-white/50 hover:bg-white/10 disabled:opacity-25" disabled={i === 0} onClick={() => void s.reorder(i, i - 1)} title="Move left"><ChevronLeft size={12} /></button>
                      <button className="rounded p-1 text-white/50 hover:bg-white/10 disabled:opacity-25" disabled={i === s.pages.length - 1} onClick={() => void s.reorder(i, i + 1)} title="Move right"><ChevronRight size={12} /></button>
                      <button className="rounded p-1 text-white/50 hover:bg-white/10" onClick={() => void s.duplicatePage(p.id)} title="Duplicate"><Copy size={12} /></button>
                      <button className="rounded p-1 text-red-300/70 hover:bg-white/10 disabled:opacity-25" disabled={s.pages.length <= 1} onClick={() => void s.deletePage(p.id)} title="Delete"><Trash2 size={12} /></button>
                    </span>
                  )}
                </div>
              );
            })}
            {s.canManage() && (
              <>
                <button className={ghost + ' ml-1'} onClick={() => void s.addPage()} title="Add a blank page"><Plus size={13} /></button>
                <button
                  className={'flex items-center gap-1 rounded-sm border px-2 py-1.5 text-[11px] ' + (s.generating ? 'border-white/15 text-white/40' : 'text-[#0b1220]')}
                  style={s.generating ? undefined : { background: 'var(--gold-bright)', borderColor: 'var(--gold-bright)' }}
                  disabled={s.generating}
                  onClick={() => setPagesAiOpen((v) => !v)}
                  title="Add on-theme pages with AI"
                >
                  {s.generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Pages
                </button>
              </>
            )}
            <span className="ml-auto pl-2 text-[10px] text-white/40">Page {currentIndex + 1} of {s.pages.length}</span>

            {/* AI-pages popover */}
            {pagesAiOpen && s.canManage() && !s.generating && (
              <div className="absolute right-3 top-full z-30 mt-1 w-64 rounded-md border border-white/15 bg-[#0d1626] p-2.5 shadow-xl">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-white/80">
                  <span>Add</span>
                  <select className="rounded border border-white/20 bg-[#0b1220] px-1 py-0.5 text-white" style={{ colorScheme: 'dark' }} value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))}>
                    {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n} style={{ backgroundColor: '#0d1626', color: '#fff' }}>{n}</option>)}
                  </select>
                  <span>on-theme page{aiCount === 1 ? '' : 's'}</span>
                </div>
                <input
                  className="mb-2 w-full rounded border border-white/20 bg-[#0b1220] px-1.5 py-1 text-[11px] text-white placeholder:text-white/30"
                  placeholder="Topic (optional)"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                />
                <div className="flex justify-end gap-1">
                  <button className="rounded-sm px-2 py-1 text-[11px] text-white/60 hover:bg-white/10" onClick={() => setPagesAiOpen(false)}>Cancel</button>
                  <button
                    className="inline-flex items-center gap-1 rounded-sm bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
                    onClick={() => { void s.generatePages(aiCount, aiTopic.trim()); setPagesAiOpen(false); setAiTopic(''); }}
                  >
                    <Sparkles size={12} /> Generate
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="min-h-0 flex-1 overflow-auto bg-[#0b1220]">
            {s.page ? (
              <EditorCanvas />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-white/50">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--gold-bright)' }} />
                <div className="text-sm">{building ? 'Designing your first page…' : 'No page yet'}</div>
              </div>
            )}
          </div>
        </div>

        {/* Inspector */}
        <div className={divider} onPointerDown={startDivider('right')} title="Drag to resize" />
        <div style={{ width: panes.rightW }} className="flex-shrink-0 overflow-y-auto border-l border-white/10 bg-[#0d1626]">
          {s.previewDoc ? <AttachmentPreviewPane /> : <Inspector />}
        </div>
      </div>

      {/* Dialogs */}
      <CoverPicker open={coverOpen} onClose={() => setCoverOpen(false)} />
      {publishDialogOpen && <PublishDialog onClose={() => setPublishDialogOpen(false)} onPublished={(id) => onPublished(id, 'selected')} />}
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
    </div>
  );
}
