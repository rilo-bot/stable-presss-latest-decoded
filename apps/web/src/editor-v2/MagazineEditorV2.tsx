// Magazine Builder v2 — full-screen studio shell.
//
// Design/layout mirrors the v1 magazine studio (docked AI assistant on the left,
// scrolling canvas centre, inspector right, top toolbar) in the Stable brand
// palette: forest-green surfaces, gold accents, parchment text. Page management is
// a THUMBNAIL RAIL down the left of the canvas (PageRail) — it replaced a
// horizontal strip of page numbers; v2 still edits one page at a time. The AI
// assistant is the proposal-based editing agent (AiPanel).

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Undo2, Redo2, Plus, Minus, Trash2, ChevronDown, ChevronsRight, Sparkles, RotateCcw, ImageIcon, Globe, ExternalLink, Send, Users, EyeOff, ClipboardList, Lock, RefreshCw, MoreHorizontal, PanelRightOpen } from 'lucide-react';
import { useEditorStore } from './store';
import { useStudioChrome } from '@/stores/studioChromeStore';
import { useCan } from '@/lib/permissions';
import { EditorCanvas } from './EditorCanvas';
import { Inspector } from './Inspector';
import { AiPanel } from './AiPanel';
import { CoverPicker } from './CoverPicker';
import { AttachmentPreviewPane } from './AttachmentPreviewPane';
import { PublishDialog } from './PublishDialog';
import { ShareDialog } from './ShareDialog';
import { ReviewBoard } from './ReviewBoard';
import { PageRail } from './PageRail';
import { BuildProgress, BuildBanner, ShimmerText } from './BuildProgress';
import { awaitingOwner, submittablePages, publishBlockedReason, readOnlyReason } from './review';
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

// One row in a dropdown menu. Shared so the publish menu and the overflow menu
// cannot drift apart in padding or hover treatment.
const menuItem = 'flex w-full items-center gap-2 px-3 py-2 text-left text-ui-sm text-studio-ink hover:bg-studio-raise-2';

// Shared button styling on the green surface.
const ghost = 'flex items-center gap-1 rounded-sm border border-studio-edge bg-studio-raise px-2 py-1.5 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2 disabled:opacity-30 disabled:hover:bg-studio-raise';

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
  const [boardOpen, setBoardOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // THE STUDIO OPENS WITH THE ASSISTANT AND THE PAGE, NOTHING ELSE.
  //
  // Three panels open at once left the canvas ~40% of a laptop screen, and two of
  // those three were showing potential rather than content: the inspector said
  // "Nothing selected" until you selected something, and the rail is navigation you
  // need occasionally, not continuously. Both now start collapsed to their labelled
  // rails and are one click away. The assistant stays open because it is what the
  // studio is FOR — you talk to it and the page changes.
  const [rightOpen, setRightOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  // Set when the user closes the inspector THEMSELVES, which stops it reopening on
  // the next selection. A panel that comes back after you dismissed it is a panel
  // that won't take no for an answer.
  const [rightDismissed, setRightDismissed] = useState(false);
  // EVERY HOOK MUST LIVE ABOVE THE `s.loading` / `s.error` EARLY RETURNS BELOW.
  // This one was originally placed next to the publish gating it feeds, ~40 lines
  // after those returns, which crashed the whole studio: the first render (before
  // `load()` flips `loading`) ran it, the next render returned early and did not, and
  // React threw "Rendered fewer hooks than expected".
  //
  // Publishing needs the STAFF permission as well as ownership — the server checks
  // `magazine.publish` on both publish routes. Without it the button looked enabled
  // and 403'd on click, which is the silent no-op the rest of this toolbar avoids.
  // Answered from the resolved access payload, never guessed.
  const mayPublish = useCan('magazine.publish');
  const isPublished = !!s.issue?.publishedIssueId && s.issue?.status === 'published';
  // Published, then edited: the bulletin readers see is now behind the draft. There is
  // no version to reason about — the fix is one click of Republish.
  const needsRepublish = isPublished && s.needsRepublish();
  const hasLiveEdition = isPublished;

  // Selecting an element opens the inspector: every style control lives in there, and
  // with the panel collapsed by default a first-time user would click a headline and
  // find nothing anywhere on screen that changes its font.
  useEffect(() => {
    if (s.selectedId && !rightDismissed) setRightOpen(true);
  }, [s.selectedId, rightDismissed]);

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
  const divider = 'w-1 flex-shrink-0 cursor-col-resize bg-studio-raise hover:bg-[var(--gold-bright)]/60';

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

  /**
   * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.
   *
   * The store has had a full undo stack all along and it was reachable ONLY by
   * clicking the toolbar button — in a design editor, where undo is the most
   * reflexive keystroke there is. It lives here rather than in EditorCanvas because
   * that handler returns early when nothing is selected, and undo has to work when
   * nothing is selected (it usually does — you just deleted the thing).
   *
   * State is read through `getState()` so the listener binds once instead of on
   * every render.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tgt = e.target as HTMLElement | null;
      // Never steal it while typing. Inputs, textareas and the in-place text editor
      // have their own undo, and hijacking it would throw away a half-typed headline.
      if (tgt?.tagName === 'INPUT' || tgt?.tagName === 'TEXTAREA' || tgt?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      e.preventDefault();
      const st = useEditorStore.getState();
      void (k === 'y' || e.shiftKey ? st.redo() : st.undo());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Menus close on Escape and on any click outside them. The publish menu shipped
  // without this and could only be dismissed by re-clicking its own trigger.
  useEffect(() => {
    if (!moreOpen && !publishMenuOpen && !pagesAiOpen) return;
    const close = () => { setMoreOpen(false); setPublishMenuOpen(false); setPagesAiOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // `capture` so the trigger's own onClick still runs (it toggles, we then close
    // — the net effect for a second click on the trigger is still "closed").
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest('[data-menu-root]')) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [moreOpen, publishMenuOpen, pagesAiOpen]);

  const topZ = s.page ? s.page.elements.reduce((m, e) => Math.max(m, e.zIndex), 0) : 0;
  const add = (kind: ElementType) => {
    if (s.page) void s.addElement(newElement(kind, s.page, topZ));
  };

  if (s.loading) {
    // No issue document yet, so there are no counts: explicit title, the
    // 'finishing' lines, and the INDETERMINATE track. A determinate bar here
    // would be inventing a proportion out of nothing.
    return (
      <div className="fixed inset-0 z-[60] bg-studio-bg text-studio-ink">
        <BuildProgress issue={null} title="Opening the studio" />
      </div>
    );
  }
  if (s.error) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-studio-bg text-red-300">
        {s.error}
        <button onClick={() => navigate('/production-system/magazine-v2')} className="ml-3 underline">Back</button>
      </div>
    );
  }

  const zoomPct = Math.round((s.zoomWidth / 1275) * 100);
  const canEdit = s.canEdit(); // owner or collaborator; false = another admin's magazine (view-only)

  // ── Review state, all derived from data the store already holds (S5 is pure UI) ──
  const awaiting = s.canManage() ? awaitingOwner(s.issue, s.pages) : [];
  const mineToSubmit = !s.canManage() && canEdit ? submittablePages(s.issue, s.pages) : [];
  // Why Publish would be refused — computed client-side from the same rule the
  // server enforces, so the button can be disabled WITH A REASON instead of handing
  // the owner a 409 after they commit to the action.
  //
  // Two scopes, judged separately: a FULL edition includes every page whatever its
  // selection flag, so one unapproved page can block that path while "publish
  // selected" is still open. Blocking both from one number would take away the very
  // escape hatch the message recommends.
  const noPublishRight = mayPublish ? '' : 'Your role cannot publish magazines. Ask an administrator to take this one live.';
  const blockedFull = s.canManage() ? noPublishRight || publishBlockedReason(s.issue, s.pages, 'full') : '';
  const blockedSelected = s.canManage() ? noPublishRight || publishBlockedReason(s.issue, s.pages, 'selected') : '';
  const publishBlocked = blockedFull && blockedSelected ? blockedFull : '';
  const currentSummary = s.pages.find((p) => p.id === s.currentPageId);
  const lockedReason = readOnlyReason(s.issue, currentSummary);

  // Still being built by "Build with AI" / import — pages stream in live below.
  // The counts that used to live here now belong to buildStatus.ts, which is also
  // where the rule about when they may be trusted is written down.
  const building = s.generating || s.issue?.status === 'processing';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-studio-bg">
      {/* ── Toolbar: THREE ZONES, not one row of everything ──────────────────
          It was 33 controls in a single undifferentiated strip, which put Delete
          magazine four buttons from Undo — destructive, routine and rare all
          competing for the same glance. Now:

            identity (left) · the verbs you use constantly (centre) · outcomes (right)

          Two groups LEFT the header entirely, because neither acts on the magazine:
          the five insert tools and the Fill/Adjust pass act on a PAGE or an ELEMENT,
          so they live in the right-hand pane beside the thing they change. And the
          rare-but-not-dangerous items (Cover, Share, Reset) plus the one dangerous
          one (Delete) moved into an overflow, so the top row holds only what a
          person reaches for without thinking. */}
      <div className="flex items-center gap-2 border-b border-studio-hair bg-studio-panel px-3 py-2">
        {/* ZONE 1 — where you are, what this is, and what state it is in. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            onClick={() => navigate('/production-system/magazine-v2')}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink"
            aria-label="Back to library"
          >
            <ArrowLeft size={16} />
          </button>
          <input
            className="min-w-0 max-w-[30ch] flex-shrink truncate rounded-sm bg-transparent px-1 py-0.5 text-ui-lg font-bold text-studio-ink outline-none hover:bg-studio-raise focus:bg-studio-raise disabled:opacity-100"
            defaultValue={s.issue?.title ?? ''}
            // Uncontrolled input: `defaultValue` only takes on mount, so fold the
            // title into the key. When generation finishes and the poll swaps the
            // placeholder "Generating…" for the real title, the key changes and the
            // input remounts with it (otherwise it stays stuck on the mount value).
            key={`${s.issue?.id ?? ''}:${s.issue?.title ?? ''}`}
            onBlur={(e) => s.canManage() && e.target.value.trim() && void s.rename(e.target.value.trim())}
            disabled={!s.canManage()}
            aria-label="Magazine title"
            title={s.canManage() ? 'Rename this magazine' : s.issue?.title}
          />
          {/* Status, in one place. A magazine can be live AND behind — two
              different facts, so both are shown rather than collapsed into one. */}
          {isPublished && (
            <span className="flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-ui-sm text-emerald-200">
              <Globe size={10} /> Live
            </span>
          )}
          {needsRepublish && (
            <span
              className="flex flex-shrink-0 items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-ui-sm font-semibold text-amber-200"
              title="You've changed this magazine since it was published. Readers still see the previous version until you republish."
            >
              <RefreshCw size={10} /> Needs republish
            </span>
          )}
          {s.issue && !s.canManage() && (
            canEdit ? (
              <span className="flex-shrink-0 rounded-full border border-studio-gold/30 bg-studio-gold/10 px-2 py-0.5 text-ui-sm text-studio-gold">
                Shared with you
              </span>
            ) : (
              <span className="flex-shrink-0 rounded-full border border-studio-edge bg-studio-raise px-2 py-0.5 text-ui-sm text-studio-ink-2">
                View only{s.issue.ownerName ? ` · by ${s.issue.ownerName}` : ''}
              </span>
            )
          )}
        </div>

        {/* ZONE 2 — undo/redo and zoom: the two things used dozens of times an
            hour, so they sit in the middle where the cursor already is. */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <div className="flex items-center rounded-sm border border-studio-edge bg-studio-raise">
            <button onClick={() => void s.undo()} disabled={!s.undoStack.length} className="px-2 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2 disabled:opacity-30 disabled:hover:bg-transparent" title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
            <button onClick={() => void s.redo()} disabled={!s.redoStack.length} className="px-2 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2 disabled:opacity-30 disabled:hover:bg-transparent" title="Redo (Ctrl+Shift+Z)"><Redo2 size={14} /></button>
          </div>
          <div className="flex items-center rounded-sm border border-studio-edge bg-studio-raise">
            <button onClick={() => s.setZoomWidth(s.zoomWidth - 80)} className="px-2 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2" title="Zoom out"><Minus size={14} /></button>
            <span className="w-12 text-center text-ui-sm tabular-nums text-studio-ink-2">{zoomPct}%</span>
            <button onClick={() => s.setZoomWidth(s.zoomWidth + 80)} className="px-2 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2" title="Zoom in"><Plus size={14} /></button>
          </div>
        </div>

        {/* ZONE 3 — outcomes: what needs your attention, and going live. */}
        <div className="flex flex-1 items-center justify-end gap-1.5">
          {/* Shown only when there is genuinely something to act on, so it never
              becomes a button people learn to ignore. */}
          {awaiting.length > 0 && (
            <button
              onClick={() => setBoardOpen(true)}
              className="flex items-center gap-1 rounded-sm border border-studio-gold/40 bg-studio-gold/15 px-2 py-1.5 text-ui-sm font-semibold text-studio-gold hover:bg-studio-gold/25"
              title="Pages submitted for your approval"
            >
              <ClipboardList size={13} /> {awaiting.length} to review
            </button>
          )}
          {mineToSubmit.length > 0 && (
            <button
              onClick={() => setBoardOpen(true)}
              className="flex items-center gap-1 rounded-sm bg-studio-gold px-2.5 py-1.5 text-ui-sm font-semibold text-studio-bg hover:opacity-90"
              title="Send your finished pages to the owner for review"
            >
              <Send size={13} /> Submit
            </button>
          )}
          {(s.canManage() ? (s.issue?.collaborators?.length ?? 0) > 0 : canEdit) && awaiting.length === 0 && mineToSubmit.length === 0 && (
            <button onClick={() => setBoardOpen(true)} className={ghost} title="Review board">
              <ClipboardList size={13} /> Review
            </button>
          )}

          {/* Publish — the one primary action in the header. */}
          {s.canManage() && s.issue && (
            <div className="relative" data-menu-root>
              <button
                onClick={() => setPublishMenuOpen((o) => !o)}
                disabled={s.publishing || s.generating || !!publishBlocked}
                className="flex items-center gap-1.5 rounded-sm bg-emerald-500 px-3 py-1.5 text-ui-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                // Disabled WITH A REASON, never a silent no-op: the server refuses an
                // unapproved edition, so the hover has to say which pages and why.
                title={publishBlocked || 'Publish this magazine to Bulletins'}
              >
                <Send size={13} />
                {s.publishing ? <ShimmerText>Publishing…</ShimmerText> : isPublished ? 'Republish' : 'Publish'}
                <ChevronDown size={12} />
              </button>
              {publishMenuOpen && !s.publishing && (
                <div className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-studio-edge bg-studio-panel shadow-xl">
                  <button
                    onClick={() => void publishFull()}
                    disabled={!!blockedFull}
                    title={blockedFull || undefined}
                    className="block w-full px-3 py-2.5 text-left text-ui-sm text-studio-ink hover:bg-studio-raise-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
                  >
                    <span className="font-semibold">Publish full edition</span>
                    <span className="block text-ui-sm text-studio-ink-3">
                      {blockedFull || `All ${s.pages.length} page${s.pages.length === 1 ? '' : 's'} go public in Bulletins`}
                    </span>
                  </button>
                  <button
                    onClick={() => { setPublishMenuOpen(false); setPublishDialogOpen(true); }}
                    disabled={!!blockedSelected}
                    title={blockedSelected || undefined}
                    className="block w-full border-t border-studio-hair px-3 py-2.5 text-left text-ui-sm text-studio-ink hover:bg-studio-raise-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
                  >
                    <span className="font-semibold">Publish selected pages…</span>
                    <span className="block text-ui-sm text-studio-ink-3">
                      {blockedSelected || 'Choose exactly which pages go public'}
                    </span>
                  </button>
                  {isPublished && (
                    <button
                      onClick={() => { setPublishMenuOpen(false); void s.unpublish(); }}
                      disabled={!mayPublish}
                      title={noPublishRight || undefined}
                      className="block w-full border-t border-studio-hair px-3 py-2.5 text-left text-ui-sm text-red-300 hover:bg-studio-raise-2 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      {/* Unpublish is the SAME server verb as publish, so it takes
                          the same gate: a role that cannot put an edition up must
                          not be able to pull one down. */}
                      <span className="flex items-center gap-1 font-semibold"><EyeOff size={11} /> Unpublish</span>
                      <span className="block text-ui-sm text-studio-ink-3">{noPublishRight || 'Remove this edition from Bulletins'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {hasLiveEdition && s.issue?.publishedIssueId && (
            <a
              href={`/bulletins/${s.issue.publishedIssueId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-sm border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5 text-ui-sm text-emerald-200/90 hover:bg-emerald-500/20"
              title={needsRepublish ? 'What readers currently see — your unpublished changes are not in it yet' : 'View on Bulletins'}
            >
              <ExternalLink size={12} /> View
            </a>
          )}

          {/* Overflow — rare, and the one destructive action, deliberately one
              click further away than anything you do every day. */}
          {s.canManage() && (
            <div className="relative" data-menu-root>
              <button
                onClick={() => setMoreOpen((o) => !o)}
                aria-label="More magazine actions"
                aria-expanded={moreOpen}
                className="flex h-8 w-8 items-center justify-center rounded-sm border border-studio-edge text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink"
                title="More"
              >
                <MoreHorizontal size={15} />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-studio-edge bg-studio-panel py-1 shadow-xl">
                  <button onClick={() => { setMoreOpen(false); setCoverOpen(true); }} className={menuItem}>
                    <ImageIcon size={13} /> Cover image…
                  </button>
                  <button onClick={() => { setMoreOpen(false); setShareOpen(true); }} className={menuItem}>
                    <Users size={13} /> Share with staff…
                  </button>
                  <button
                    onClick={() => { setMoreOpen(false); if (window.confirm('Reset this magazine to a single blank page? This cannot be undone.')) void s.reset(); }}
                    className={menuItem}
                  >
                    <RotateCcw size={13} /> Start over…
                  </button>
                  <div className="my-1 border-t border-studio-hair" />
                  <button
                    onClick={async () => {
                      setMoreOpen(false);
                      // Says nothing about Bulletins: if the magazine is live the server
                      // refuses the first attempt and says so itself, which `remove()` then
                      // confirms through — one warning, from whoever actually knows.
                      if (!window.confirm('Delete this magazine? This removes the draft and all its pages. This cannot be undone.')) return;
                      if (await s.remove()) navigate('/production-system/magazine-v2');
                    }}
                    disabled={s.publishing}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    <Trash2 size={13} /> Delete magazine…
                  </button>
                </div>
              )}
            </div>
          )}

          {/* AI assistant toggle (editors only) */}
          {canEdit && (
            <button
              onClick={() => setAsstOpen((o) => !o)}
              aria-pressed={asstOpen}
              className={'flex items-center gap-1 rounded-sm border px-2 py-1.5 text-ui-sm ' + (asstOpen ? 'border-studio-gold bg-studio-gold text-studio-bg' : 'border-studio-edge text-studio-ink-2 hover:bg-studio-raise-2')}
              title="Studio Assistant"
            >
              <Sparkles size={13} /> AI
            </button>
          )}
        </div>
      </div>

      {/* Live-build banner — pages stream in below as the AI composes them.
          `isAdding` matters: an "add more pages" run leaves pagesProcessed and
          pagesTotal at the PREVIOUS run's values, so this used to sit at
          "8 of 8 pages" — a completed bar — for the whole time it was working.
          BuildBanner shows the indeterminate track for that case instead. */}
      {building && <BuildBanner issue={s.issue} isAdding={s.generating} arrivedPages={s.pages.length} />}

      {/* Post-generation nudge — the first pass is a short preview; offer more. */}
      {!building && s.justGenerated && s.canManage() && (
        <div className="flex items-center gap-2 border-b border-[var(--gold-bright)]/25 bg-[var(--gold-bright)]/10 px-4 py-1.5 text-ui-sm text-[var(--gold-bright)]">
          <Sparkles size={12} />
          <span className="font-medium">Here’s your preview — {s.pages.length} page{s.pages.length === 1 ? '' : 's'}. Want a fuller issue?</span>
          <button
            // The popover it opens lives in the page rail's footer, so a collapsed
            // rail would have swallowed this click entirely.
            onClick={() => { setRailOpen(true); setPagesAiOpen(true); s.clearJustGenerated(); }}
            className="rounded-sm bg-[var(--gold-bright)] px-2 py-0.5 text-ui-sm font-semibold text-studio-bg hover:opacity-90"
          >
            Add more pages
          </button>
          <button onClick={() => s.clearJustGenerated()} className="ml-auto text-studio-ink-3 hover:text-studio-ink-2">Maybe later</button>
        </div>
      )}

      {/* Body: assistant · canvas · inspector (resizable side panes) */}
      <div className="flex min-h-0 flex-1" onPointerMove={onBodyMove} onPointerUp={endDivider}>
        {asstOpen && canEdit && (
          <>
            <div style={{ width: panes.leftW }} className="flex-shrink-0 overflow-hidden border-r border-studio-hair">
              <AiPanel />
            </div>
            <div className={divider} onPointerDown={startDivider('left')} title="Drag to resize" />
          </>
        )}

        {/* Pages — thumbnails, not numbers. §1 of the redesign; see PageRail.tsx. */}
        <PageRail
          open={railOpen}
          onToggle={() => setRailOpen((v) => !v)}
          aiOpen={pagesAiOpen}
          setAiOpen={setPagesAiOpen}
        />

        {/* Canvas column */}
        <div className="relative flex min-w-0 flex-1 flex-col">

          {/* Why this page won't accept edits (§8.5). The server refuses the write
              either way and the store reverts it, but a canvas that silently swallows
              a drag is the worst possible version of this feature — say it first, and
              say what to do about it. */}
          {lockedReason && (
            <div className="flex items-center gap-2 border-b border-amber-400/25 bg-amber-400/10 px-4 py-1.5 text-ui-sm text-amber-200">
              <Lock size={12} className="flex-shrink-0" />
              <span>{lockedReason}</span>
              {!s.canManage() && (
                <button onClick={() => setBoardOpen(true)} className="ml-auto underline hover:no-underline">
                  See the board
                </button>
              )}
            </div>
          )}

          {/* Canvas */}
          <div className="min-h-0 flex-1 overflow-auto bg-studio-bg">
            {s.page ? (
              <EditorCanvas />
            ) : building ? (
              // The main event: nothing to edit yet, so this screen is what the
              // user watches. Full facts — counter, bar, one tile per page.
              <div className="h-full text-studio-ink">
                <BuildProgress
                  issue={s.issue}
                  isAdding={s.generating}
                  arrivedPages={s.pages.length}
                  hint="Pages appear here as they’re finished — you can start editing the early ones while the rest are still being built."
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-ui text-studio-ink-3">No page yet</div>
            )}
          </div>
        </div>

        {/* Inspector — collapsible, mirroring the left pane's AI toggle.
            An attachment preview force-opens it: the user just asked to look at
            something, so putting it behind a collapsed rail would swallow the click. */}
        {rightOpen || s.previewDoc ? (
          <>
            <div className={divider} onPointerDown={startDivider('right')} title="Drag to resize" />
            <div style={{ width: panes.rightW }} className="flex flex-shrink-0 flex-col border-l border-studio-hair bg-studio-panel">
              <div className="flex flex-shrink-0 items-center gap-1 border-b border-studio-hair px-2 py-1.5">
                <span className="text-ui-sm font-bold uppercase tracking-[0.12em] text-studio-ink-3">
                  {s.previewDoc ? 'Preview' : 'Page & element'}
                </span>
                <button
                  onClick={() => { s.setPreviewDoc(null); setRightOpen(false); setRightDismissed(true); }}
                  className="ml-auto rounded-sm p-1 text-studio-ink-3 hover:bg-studio-raise-2 hover:text-studio-ink"
                  title="Hide this panel"
                  aria-label="Hide the page and element panel"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {s.previewDoc ? <AttachmentPreviewPane /> : <Inspector onAdd={add} />}
              </div>
            </div>
          </>
        ) : (
          /* Collapsed: a rail, not nothing — it has to be obvious the panel exists
             and where it went, or the collapse becomes a feature people trip over. */
          <button
            onClick={() => { setRightOpen(true); setRightDismissed(false); }}
            className="flex w-9 flex-shrink-0 flex-col items-center gap-2 border-l border-studio-hair bg-studio-panel py-2 text-studio-ink-3 hover:bg-studio-raise hover:text-studio-ink"
            title="Show the page and element panel"
            aria-label="Show the page and element panel"
          >
            <PanelRightOpen size={15} />
            <span className="text-ui-sm [writing-mode:vertical-rl]">Page{s.selectedId ? ' · 1 selected' : ''}</span>
          </button>
        )}
      </div>

      {/* Dialogs */}
      <CoverPicker open={coverOpen} onClose={() => setCoverOpen(false)} />
      {publishDialogOpen && <PublishDialog onClose={() => setPublishDialogOpen(false)} onPublished={(id) => onPublished(id, 'selected')} />}
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
      {boardOpen && <ReviewBoard onClose={() => setBoardOpen(false)} />}
    </div>
  );
}
