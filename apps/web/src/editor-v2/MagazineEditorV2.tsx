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
import { ArrowLeft, Undo2, Redo2, Plus, Minus, Trash2, ChevronDown, ChevronsRight, Sparkles, RotateCcw, ImageIcon, Globe, ExternalLink, Send, Users, EyeOff, ClipboardList, Lock, RefreshCw, MoreHorizontal, PanelRightOpen, X } from 'lucide-react';
import { useEditorStore } from './store';
import { useStudioChrome } from '@/stores/studioChromeStore';
import { useCan } from '@/lib/permissions';
import { useEditorFonts } from '@/lib/fonts/useEditorFonts';
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
import { SourceTrouble, readingSummary, useSourceReading } from './SourceReadingPanel';
import { awaitingOwner, submittablePages, publishBlockedReason, readOnlyReason } from './review';
import type { ElementType, MagazineElement } from './model';
import { useMagazineEditorActions } from './operator/useMagazineEditorActions';
import { useMagazineDangerActions } from './operator/useMagazineDangerActions';

// Shared by the resize drag AND the saved-width restore below.
const PANE_MIN = 240, PANE_MAX = 560;

/**
 * PHONE LAYOUT (< 768px — Tailwind's `md`, so this agrees exactly with the
 * `max-md:` classes used below). Tablet and desktop are untouched.
 *
 * Three side-by-side columns cannot share a 390px screen: the assistant alone took
 * all of it and the page was never visible. On a phone the studio therefore opens
 * on the PAGE, fitted to the width; the assistant and the page/element panel open
 * as bottom sheets over it, and the pages rail as an overlay. The toolbar keeps
 * Back, the title, Publish and AI; undo/redo, zoom and the review board fold into
 * the More menu (same anchors, so the Operator still finds them — its actions
 * open More first when an anchor is not on screen).
 */
const WIDE_QUERY = '(min-width: 768px)';
const isPhoneNow = () => typeof window !== 'undefined' && !window.matchMedia(WIDE_QUERY).matches;
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(isPhoneNow);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setPhone(!mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

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
  // The editor draws real pages, so it needs the same faces the public viewer and
  // the PDF renderer load (BulletinViewer does this too). Without it the font picker
  // offers the curated registry while the canvas silently substitutes a fallback —
  // the editor would disagree with what the reader and the print file actually get.
  useEditorFonts();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  /**
   * FIELD-BY-FIELD subscriptions, assembled into `s` for the ~100 readers below.
   *
   * This was `useEditorStore()` — no selector, which subscribes to the whole state
   * object and therefore re-renders on every `set()` the store makes. Dragging an
   * element calls `updateLocal` on every pointermove, so this component (and with it
   * the canvas, the inspector, the assistant and the rail — its whole subtree) was
   * re-rendering around sixty times a second for the length of every drag. PageRail
   * already subscribes narrowly and says why; the shell never got the same
   * treatment, and being the root it was the expensive one.
   *
   * The assembled object is new on each render, which is fine — nothing memoises on
   * its identity. What matters is that a render now happens only when one of these
   * values actually changes.
   */
  // Derived predicates: the selector CALLS them, so the subscription is to their
  // boolean result. Subscribing to the function itself would be a stable reference
  // that never re-renders — the toolbar would go stale on a role or publish change.
  const isOwner = useEditorStore((st) => st.canManage());
  const mayEdit = useEditorStore((st) => st.canEdit());
  const republishNeeded = useEditorStore((st) => st.needsRepublish());
  const s = {
    issue: useEditorStore((st) => st.issue),
    pages: useEditorStore((st) => st.pages),
    /**
     * WHETHER there is an open page — never the page itself.
     *
     * `page` is the single most volatile thing in the store: `updateLocal` replaces it
     * on every pointermove of a drag. Subscribing to it here would keep re-rendering
     * the whole studio sixty times a second even with everything else narrowed, which
     * was the entire point of narrowing. The shell only ever asks two things of it —
     * "is one open?" (this) and "what are its dimensions and top z-index?" at the
     * instant Add is clicked (read from getState in `add` below, where it is a fact
     * about that click rather than a subscription).
     */
    hasPage: useEditorStore((st) => !!st.page),
    currentPageId: useEditorStore((st) => st.currentPageId),
    selectedId: useEditorStore((st) => st.selectedId),
    zoomWidth: useEditorStore((st) => st.zoomWidth),
    loading: useEditorStore((st) => st.loading),
    error: useEditorStore((st) => st.error),
    generating: useEditorStore((st) => st.generating),
    adding: useEditorStore((st) => st.adding),
    justGenerated: useEditorStore((st) => st.justGenerated),
    publishing: useEditorStore((st) => st.publishing),
    previewDoc: useEditorStore((st) => st.previewDoc),
    undoStack: useEditorStore((st) => st.undoStack),
    redoStack: useEditorStore((st) => st.redoStack),
    // Actions are stable references — subscribing to them never causes a render.
    load: useEditorStore((st) => st.load),
    rename: useEditorStore((st) => st.rename),
    reset: useEditorStore((st) => st.reset),
    remove: useEditorStore((st) => st.remove),
    publish: useEditorStore((st) => st.publish),
    unpublish: useEditorStore((st) => st.unpublish),
    undo: useEditorStore((st) => st.undo),
    redo: useEditorStore((st) => st.redo),
    addElement: useEditorStore((st) => st.addElement),
    setZoomWidth: useEditorStore((st) => st.setZoomWidth),
    setPreviewDoc: useEditorStore((st) => st.setPreviewDoc),
    stopWatching: useEditorStore((st) => st.stopWatching),
    clearJustGenerated: useEditorStore((st) => st.clearJustGenerated),
    // Callable, so the ~20 existing `s.canManage()` reads below stay as they are —
    // they now return the subscribed value rather than re-deriving it.
    canManage: () => isOwner,
    canEdit: () => mayEdit,
    needsRepublish: () => republishNeeded,
  };
  const isPhone = useIsPhone();
  // Open by default everywhere except a phone, where it would cover the page.
  const [asstOpen, setAsstOpen] = useState(() => !isPhoneNow());
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
  // DELETE /issues/:id is gated on `magazine.delete`, so an owner whose role lacks it
  // is not offered a Delete that would only 403.
  const mayDelete = useCan('magazine.delete');
  const isPublished = !!s.issue?.publishedIssueId && s.issue?.status === 'published';
  // Published, then edited: the bulletin readers see is now behind the draft. There is
  // no version to reason about — the fix is one click of Republish.
  const needsRepublish = isPublished && s.needsRepublish();
  const hasLiveEdition = isPublished;

  // Selecting an element opens the inspector: every style control lives in there, and
  // with the panel collapsed by default a first-time user would click a headline and
  // find nothing anywhere on screen that changes its font.
  //
  // OWNER ONLY. Everyone else who reaches the studio — a collaborator the magazine
  // was shared with, or a staff member whose role grants the Magazine Builder — makes
  // their changes through the assistant on the left, which can do everything the
  // inspector can. So for them the panel is not merely collapsed, it does not exist:
  // clicking an element selects it (the assistant reads the selection) and nothing
  // slides in from the right.
  //
  // Not on a phone: there the panel is a bottom sheet over the page, and popping it
  // up on every tap would cover the very element you just tapped to move it. The
  // collapsed tab says "1 selected" and opens it.
  useEffect(() => {
    if (isOwner && s.selectedId && !rightDismissed && !isPhone) setRightOpen(true);
  }, [isOwner, s.selectedId, rightDismissed, isPhone]);

  // Phone: fit the page to the canvas width — on open, and when the screen width
  // changes (rotation). Only on a WIDTH change, so a manual zoom from the More menu
  // survives the address bar sliding in and out (a height-only resize).
  const canvasRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isPhone) return;
    let lastW = 0;
    const fit = () => {
      const w = canvasRef.current?.clientWidth ?? 0;
      if (!w || w === lastW) return;
      lastW = w;
      useEditorStore.getState().setZoomWidth(w - 24);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [isPhone, s.loading]);

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
      if (saved && typeof saved.leftW === 'number' && typeof saved.rightW === 'number') {
        return {
          leftW: Math.max(PANE_MIN, Math.min(PANE_MAX, saved.leftW)),
          rightW: Math.max(PANE_MIN, Math.min(PANE_MAX, saved.rightW)),
        };
      }
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
    if (dragging.current === 'left') setPanes((p) => ({ ...p, leftW: Math.max(PANE_MIN, Math.min(PANE_MAX, e.clientX)) }));
    else setPanes((p) => ({ ...p, rightW: Math.max(PANE_MIN, Math.min(PANE_MAX, window.innerWidth - e.clientX)) }));
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

  const add = (kind: ElementType) => {
    // Read the page at CLICK time rather than subscribing to it — see `hasPage`.
    const page = useEditorStore.getState().page;
    if (!page) return;
    const topZ = page.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    void s.addElement(newElement(kind, page, topZ));
  };

  // Still being built by "Build with AI" / import — pages stream in live below.
  // The counts that used to live here now belong to buildStatus.ts, which is also
  // where the rule about when they may be trusted is written down.
  const building = s.generating || s.issue?.status === 'processing';

  // ONE poll for the source documents, shared by the two things that report on them:
  // the build display (live progress, in the middle of the canvas) and the trouble
  // strip (a failed or truncated document). Polling in each would be two requests
  // every four seconds for the same rows. Empty id while not building = no poll.
  //
  // ABOVE THE EARLY RETURNS, and this is the whole reason `building` is computed up
  // here rather than beside the JSX that uses it. There are two bail-outs below —
  // loading and error — and a hook after them runs on some renders and not others,
  // which React reports as "Rendered fewer hooks than expected" and which neither
  // tsc nor the production build can see.
  const sources = useSourceReading(building && s.issue?.id ? s.issue.id : '');
  const reading = readingSummary(sources);

  // Stablehand Operator: the named actions the studio offers (see ./operator).
  // A hook, so it lives above the early returns like everything else here.
  useMagazineEditorActions({ isOwner, canEdit: mayEdit, mayPublish });
  useMagazineDangerActions({ isOwner, mayDelete });

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
  // The plain "Review" button: there is a board (someone else is on the magazine)
  // but nothing on it is waiting for you right now.
  const showPlainReview = (s.canManage() ? (s.issue?.collaborators?.length ?? 0) > 0 : canEdit) && awaiting.length === 0 && mineToSubmit.length === 0;
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

  // The right-hand pane: a column on tablet/desktop, a bottom sheet on a phone.
  // Same header (with the same hide anchor) and the same content in both.
  const inspectorShown = (isOwner && rightOpen) || !!s.previewDoc;
  const inspectorPane = (
    <>
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-studio-hair px-2 py-1.5">
        <span className="text-ui-sm font-bold uppercase tracking-[0.12em] text-studio-ink-3">
          {s.previewDoc ? 'Preview' : 'Page & element'}
        </span>
        <button
          onClick={() => { s.setPreviewDoc(null); setRightOpen(false); setRightDismissed(true); }}
          data-agent-id="mag.inspector-hide"
          className="ml-auto rounded-sm p-1 text-studio-ink-3 hover:bg-studio-raise-2 hover:text-studio-ink"
          title="Hide this panel"
          aria-label="Hide the page and element panel"
        >
          {isPhone ? <X size={18} /> : <ChevronsRight size={14} />}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {s.previewDoc ? <AttachmentPreviewPane /> : <Inspector onAdd={add} />}
      </div>
    </>
  );
  const phoneSheet = 'absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-xl border-t border-studio-edge shadow-[0_-12px_32px_rgba(0,0,0,0.45)]';

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
            data-agent-id="mag.back"
            className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-sm px-2 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink"
            aria-label="Back to library"
            title="Back to library"
          >
            <ArrowLeft size={16} /> <span className="max-md:hidden">Back</span>
          </button>
          <input
            data-agent-id="mag.title-input"
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
              <Globe size={10} /> <span className="max-md:hidden">Live</span>
            </span>
          )}
          {needsRepublish && (
            <span
              className="flex flex-shrink-0 items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-ui-sm font-semibold text-amber-200"
              title="You've changed this magazine since it was published. Readers still see the previous version until you republish."
            >
              <RefreshCw size={10} /> <span className="max-md:hidden">Needs republish</span>
            </span>
          )}
          {s.issue && !s.canManage() && (
            canEdit ? (
              <span className="flex-shrink-0 rounded-full border border-studio-gold/30 bg-studio-gold/10 px-2 py-0.5 text-ui-sm text-studio-gold max-md:hidden">
                Shared with you
              </span>
            ) : (
              <span className="flex-shrink-0 rounded-full border border-studio-edge bg-studio-raise px-2 py-0.5 text-ui-sm text-studio-ink-2">
                View only{s.issue.ownerName ? <span className="max-md:hidden">{` · by ${s.issue.ownerName}`}</span> : ''}
              </span>
            )
          )}
        </div>

        {/* ZONE 2 — undo/redo and zoom: the two things used dozens of times an
            hour, so they sit in the middle where the cursor already is.
            On a phone they live in the More menu instead (see the phone block in it). */}
        {!isPhone && <div className="flex flex-shrink-0 items-center gap-1.5">
          <div className="flex items-center rounded-sm border border-studio-edge bg-studio-raise">
            {/* The tooltip NAMES what's next on the stack ("Undo the assistant's
                changes"), because one entry can now be a whole AI turn — a dozen
                writes — and "Undo" alone doesn't say how much is coming back. */}
            <button data-agent-id="mag.undo" onClick={() => void s.undo()} disabled={!s.undoStack.length} className="flex items-center gap-1 px-2 py-1.5 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2 disabled:opacity-30 disabled:hover:bg-transparent" title={`Undo${s.undoStack.length ? ` ${s.undoStack[s.undoStack.length - 1]!.label}` : ''} (Ctrl+Z)`}><Undo2 size={14} /> Undo</button>
            <button data-agent-id="mag.redo" onClick={() => void s.redo()} disabled={!s.redoStack.length} className="flex items-center gap-1 px-2 py-1.5 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2 disabled:opacity-30 disabled:hover:bg-transparent" title={`Redo${s.redoStack.length ? ` ${s.redoStack[s.redoStack.length - 1]!.label}` : ''} (Ctrl+Shift+Z)`}><Redo2 size={14} /> Redo</button>
          </div>
          <div className="flex items-center rounded-sm border border-studio-edge bg-studio-raise">
            <button onClick={() => s.setZoomWidth(s.zoomWidth - 80)} data-agent-id="mag.zoom-out" aria-label="Zoom out" className="px-2 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2" title="Zoom out"><Minus size={14} /></button>
            <span data-agent-id="mag.zoom-level" data-agent-label={`Zoom ${zoomPct}%`} className="w-12 text-center text-ui-sm tabular-nums text-studio-ink-2">{zoomPct}%</span>
            <button onClick={() => s.setZoomWidth(s.zoomWidth + 80)} data-agent-id="mag.zoom-in" aria-label="Zoom in" className="px-2 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2" title="Zoom in"><Plus size={14} /></button>
          </div>
        </div>}

        {/* ZONE 3 — outcomes: what needs your attention, and going live. */}
        <div className="flex flex-1 items-center justify-end gap-1.5 max-md:flex-none">
          {/* Shown only when there is genuinely something to act on, so it never
              becomes a button people learn to ignore. (Phone: in the More menu.) */}
          {!isPhone && awaiting.length > 0 && (
            <button
              onClick={() => setBoardOpen(true)}
              data-agent-id="mag.review-board"
              data-agent-label="Open the review board (pages to review)"
              className="flex items-center gap-1 rounded-sm border border-studio-gold/40 bg-studio-gold/15 px-2 py-1.5 text-ui-sm font-semibold text-studio-gold hover:bg-studio-gold/25"
              title="Pages submitted for your approval"
            >
              <ClipboardList size={13} /> {awaiting.length} to review
            </button>
          )}
          {mineToSubmit.length > 0 && (
            <button
              onClick={() => setBoardOpen(true)}
              data-agent-id="mag.review-board"
              data-agent-label="Open the review board (submit pages)"
              className="flex items-center gap-1 rounded-sm bg-studio-gold px-2.5 py-1.5 text-ui-sm font-semibold text-studio-bg hover:opacity-90"
              title="Send your finished pages to the owner for review"
            >
              <Send size={13} /> Submit
            </button>
          )}
          {!isPhone && showPlainReview && (
            <button onClick={() => setBoardOpen(true)} data-agent-id="mag.review-board" data-agent-label="Open the review board" className={ghost} title="Review board">
              <ClipboardList size={13} /> Review
            </button>
          )}

          {/* Publish — the one primary action in the header. */}
          {s.canManage() && s.issue && (
            <div className="relative" data-menu-root>
              <button
                onClick={() => setPublishMenuOpen((o) => !o)}
                data-agent-id="mag.publish-button"
                data-agent-label={isPublished ? 'Republish' : 'Publish'}
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
                    data-agent-id="mag.publish-full"
                    data-agent-label="Publish full edition"
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
                    data-agent-id="mag.publish-selected"
                    data-agent-label="Publish selected pages…"
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
                      data-agent-id="mag.unpublish"
                      data-agent-label="Unpublish"
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

          {!isPhone && hasLiveEdition && s.issue?.publishedIssueId && (
            <a
              href={`/bulletins/${s.issue.publishedIssueId}`}
              target="_blank"
              rel="noreferrer"
              data-agent-id="mag.view-live"
              className="flex items-center gap-1 rounded-sm border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5 text-ui-sm text-emerald-200/90 hover:bg-emerald-500/20"
              title={needsRepublish ? 'What readers currently see — your unpublished changes are not in it yet' : 'View on Bulletins'}
            >
              <ExternalLink size={12} /> View
            </a>
          )}

          {/* Overflow — rare, and the one destructive action, deliberately one
              click further away than anything you do every day.
              On a phone it is offered to EVERYONE, because it also carries the
              toolbar controls that do not fit there (undo/redo, zoom, review, view). */}
          {(s.canManage() || isPhone) && (
            <div className="relative" data-menu-root>
              <button
                onClick={() => setMoreOpen((o) => !o)}
                data-agent-id="mag.more-button"
                aria-label="More magazine actions"
                aria-expanded={moreOpen}
                className="flex h-8 flex-shrink-0 items-center gap-1 rounded-sm border border-studio-edge px-2 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink"
                title="More actions"
              >
                <MoreHorizontal size={15} /> <span className="max-md:hidden">More</span>
                {/* Phone: the "N to review" button is in this menu, so flag it here. */}
                {isPhone && awaiting.length > 0 && <span aria-hidden className="h-2 w-2 rounded-full bg-studio-gold" />}
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-studio-edge bg-studio-panel py-1 shadow-xl">
                  {/* PHONE ONLY — the toolbar's middle zone and review/view buttons,
                      same anchors. Undo/redo and zoom leave the menu OPEN, because
                      they are pressed several times in a row. */}
                  {isPhone && (
                    <>
                      <div className="flex items-center">
                        <button data-agent-id="mag.undo" onClick={() => void s.undo()} disabled={!s.undoStack.length} className={menuItem + ' flex-1 disabled:opacity-30 disabled:hover:bg-transparent'} title={`Undo${s.undoStack.length ? ` ${s.undoStack[s.undoStack.length - 1]!.label}` : ''}`}>
                          <Undo2 size={13} /> Undo
                        </button>
                        <button data-agent-id="mag.redo" onClick={() => void s.redo()} disabled={!s.redoStack.length} className={menuItem + ' flex-1 disabled:opacity-30 disabled:hover:bg-transparent'} title={`Redo${s.redoStack.length ? ` ${s.redoStack[s.redoStack.length - 1]!.label}` : ''}`}>
                          <Redo2 size={13} /> Redo
                        </button>
                      </div>
                      <div className="flex items-center gap-1 px-3 py-1 text-ui-sm text-studio-ink-2">
                        <span className="flex-1">Zoom</span>
                        <button onClick={() => s.setZoomWidth(s.zoomWidth - 80)} data-agent-id="mag.zoom-out" aria-label="Zoom out" className="rounded-sm border border-studio-edge p-1.5 hover:bg-studio-raise-2" title="Zoom out"><Minus size={14} /></button>
                        <span data-agent-id="mag.zoom-level" data-agent-label={`Zoom ${zoomPct}%`} className="w-12 text-center tabular-nums">{zoomPct}%</span>
                        <button onClick={() => s.setZoomWidth(s.zoomWidth + 80)} data-agent-id="mag.zoom-in" aria-label="Zoom in" className="rounded-sm border border-studio-edge p-1.5 hover:bg-studio-raise-2" title="Zoom in"><Plus size={14} /></button>
                      </div>
                      {(awaiting.length > 0 || showPlainReview) && (
                        <button
                          onClick={() => { setMoreOpen(false); setBoardOpen(true); }}
                          data-agent-id="mag.review-board"
                          data-agent-label={awaiting.length > 0 ? 'Open the review board (pages to review)' : 'Open the review board'}
                          className={menuItem + (awaiting.length > 0 ? ' font-semibold text-studio-gold' : '')}
                        >
                          <ClipboardList size={13} /> {awaiting.length > 0 ? `Review board · ${awaiting.length} to review` : 'Review board'}
                        </button>
                      )}
                      {hasLiveEdition && s.issue?.publishedIssueId && (
                        <a
                          href={`/bulletins/${s.issue.publishedIssueId}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setMoreOpen(false)}
                          data-agent-id="mag.view-live"
                          className={menuItem}
                        >
                          <ExternalLink size={13} /> View on Bulletins
                        </a>
                      )}
                      {s.canManage() && <div className="my-1 border-t border-studio-hair" />}
                    </>
                  )}
                  {s.canManage() && <>
                  <button onClick={() => { setMoreOpen(false); setCoverOpen(true); }} data-agent-id="mag.cover-button" data-agent-label="Cover image…" className={menuItem}>
                    <ImageIcon size={13} /> Cover image…
                  </button>
                  <button onClick={() => { setMoreOpen(false); setShareOpen(true); }} data-agent-id="mag.share-button" className={menuItem}>
                    <Users size={13} /> Share with staff…
                  </button>
                  <button
                    onClick={() => { setMoreOpen(false); if (window.confirm('Reset this magazine to a single blank page? This cannot be undone.')) void s.reset(); }}
                    data-agent-id="mag.start-over"
                    className={menuItem}
                  >
                    <RotateCcw size={13} /> Start over…
                  </button>
                  {mayDelete && <div className="my-1 border-t border-studio-hair" />}
                  {mayDelete && <button
                    onClick={async () => {
                      setMoreOpen(false);
                      // Says nothing about Bulletins: if the magazine is live the server
                      // refuses the first attempt and says so itself, which `remove()` then
                      // confirms through — one warning, from whoever actually knows.
                      if (!window.confirm('Delete this magazine? This removes the draft and all its pages. This cannot be undone.')) return;
                      if (await s.remove()) navigate('/production-system/magazine-v2');
                    }}
                    disabled={s.publishing}
                    data-agent-id="mag.delete-magazine"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    <Trash2 size={13} /> Delete magazine…
                  </button>}
                  </>}
                </div>
              )}
            </div>
          )}

          {/* AI assistant toggle (editors only) */}
          {canEdit && (
            <button
              onClick={() => {
                // Phone: one bottom sheet at a time — the assistant replaces the
                // page panel rather than stacking on top of it.
                if (isPhone && !asstOpen) setRightOpen(false);
                setAsstOpen((o) => !o);
              }}
              data-agent-id="mag.ai-toggle"
              data-agent-label="Magazine AI Studio panel"
              aria-pressed={asstOpen}
              className={'flex items-center gap-1 rounded-sm border px-2 py-1.5 text-ui-sm ' + (asstOpen ? 'border-studio-gold bg-studio-gold text-studio-bg' : 'border-studio-edge text-studio-ink-2 hover:bg-studio-raise-2')}
              title="Design Helper"
            >
              <Sparkles size={13} /> AI
            </button>
          )}
        </div>
      </div>

      {/* Live-build banner — pages stream in below as the AI composes them.
          `isAdding` is s.adding, NOT s.generating: `generating` is true for the
          INITIAL build too (watchGeneration sets it), and passing it here forced
          the indeterminate "Adding your new pages" state onto every from-scratch
          build — hiding the real "N of M pages" counter the banner exists for.

          ONCE THERE IS A PAGE, and not before. That is what the banner is for by its
          own description — one line high so it can sit over a magazine somebody is
          already editing. While the canvas is still empty the full build display is
          in the middle of it, and the banner was a second progress bar three inches
          above the first, saying the same phase in different words. */}
      {building && s.hasPage && <BuildBanner issue={s.issue} isAdding={s.adding} arrivedPages={s.pages.length} />}

      {/* A document that FAILED or was cut short — the only part of a read that gets
          a strip of its own, because it explains a thin magazine long after the
          build screen is gone. Live progress is not here any more: it belongs to the
          one progress display in the middle of the canvas (see BuildProgress), and
          having it in both places meant two bars saying different things while a
          third, the gold banner, said "Planning your issue" during a read where
          nothing was being planned. Renders nothing when there is no trouble. */}
      <SourceTrouble sources={sources} />

      {/* Post-generation nudge — the first pass is a short preview; offer more. */}
      {!building && s.justGenerated && s.canManage() && (
        <div className="flex items-center gap-2 border-b border-[var(--gold-bright)]/25 bg-[var(--gold-bright)]/10 px-4 py-1.5 text-ui-sm text-[var(--gold-bright)]">
          <Sparkles size={12} />
          <span className="font-medium">Here’s your preview — {s.pages.length} page{s.pages.length === 1 ? '' : 's'}. Want a fuller issue?</span>
          <button
            // The popover it opens lives in the page rail's footer, so a collapsed
            // rail would have swallowed this click entirely.
            onClick={() => { setRailOpen(true); setPagesAiOpen(true); s.clearJustGenerated(); }}
            data-agent-id="mag.add-more-pages"
            data-agent-label="Add more pages (AI)"
            className="rounded-sm bg-[var(--gold-bright)] px-2 py-0.5 text-ui-sm font-semibold text-studio-bg hover:opacity-90"
          >
            Add more pages
          </button>
          <button onClick={() => s.clearJustGenerated()} data-agent-id="mag.add-more-pages-dismiss" className="ml-auto text-studio-ink-3 hover:text-studio-ink-2">Maybe later</button>
        </div>
      )}

      {/* Body: assistant · canvas · inspector (resizable side panes). On a phone the
          two panes are bottom sheets instead (rendered after this row) and the
          rail is an overlay — see the PHONE LAYOUT note at the top. `relative` is
          the anchor for the rail overlay; it changes nothing on wider screens. */}
      <div className="relative flex min-h-0 flex-1" onPointerMove={onBodyMove} onPointerUp={endDivider}>
        {asstOpen && canEdit && !isPhone && (
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
          overlay={isPhone}
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
                <button onClick={() => setBoardOpen(true)} data-agent-id="mag.locked-see-board" data-agent-label="See the review board" className="ml-auto underline hover:no-underline">
                  See the board
                </button>
              )}
            </div>
          )}

          {/* Canvas */}
          <div ref={canvasRef} className="min-h-0 flex-1 overflow-auto bg-studio-bg">
            {s.hasPage ? (
              <EditorCanvas />
            ) : building ? (
              // The main event: nothing to edit yet, so this screen is what the
              // user watches. Full facts — counter, bar, one tile per page.
              <div className="h-full text-studio-ink">
                <BuildProgress
                  issue={s.issue}
                  isAdding={s.adding}
                  arrivedPages={s.pages.length}
                  reading={reading}
                  hint="Pages appear here as they’re finished — you can start editing the early ones while the rest are still being built."
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-ui text-studio-ink-3">No page yet</div>
            )}
          </div>
        </div>

        {/* Inspector — collapsible, mirroring the left pane's AI toggle, and shown to
            the magazine's OWNER only (see the selection effect above). An attachment
            preview force-opens the pane for anyone: it comes from the assistant's own
            chat, so the user just asked to look at something and putting it behind a
            collapsed rail would swallow the click.
            Phone: the collapsed tab stays in the row and the panel opens as a bottom
            sheet (below), so the canvas keeps its width either way. */}
        {inspectorShown && !isPhone ? (
          <>
            <div className={divider} onPointerDown={startDivider('right')} title="Drag to resize" />
            <div style={{ width: panes.rightW }} className="flex flex-shrink-0 flex-col border-l border-studio-hair bg-studio-panel">
              {inspectorPane}
            </div>
          </>
        ) : !isOwner ? null : (
          /* Collapsed: a rail, not nothing — it has to be obvious the panel exists
             and where it went, or the collapse becomes a feature people trip over. */
          <button
            // Phone: one bottom sheet at a time (see the AI toggle).
            onClick={() => { setRightOpen(true); setRightDismissed(false); if (isPhone) setAsstOpen(false); }}
            data-agent-id="mag.inspector-show"
            className="flex w-9 flex-shrink-0 flex-col items-center gap-2 border-l border-studio-hair bg-studio-panel py-2 text-studio-ink-3 hover:bg-studio-raise hover:text-studio-ink"
            title="Show the page and element panel"
            aria-label="Show the page and element panel"
          >
            <PanelRightOpen size={15} />
            <span className="text-ui-sm [writing-mode:vertical-rl]">Page{s.selectedId ? ' · 1 selected' : ''}</span>
          </button>
        )}
      </div>

      {/* PHONE bottom sheets — over the page, not beside it, and with no backdrop:
          the part of the page above a sheet stays visible and editable. Each has a
          close button in its header. The page panel sits above the assistant
          because an attachment preview opened FROM the chat has to cover it. */}
      {isPhone && asstOpen && canEdit && (
        <div className={phoneSheet + ' z-40 h-[72%]'} role="dialog" aria-label="Magazine AI Studio">
          <AiPanel onClose={() => setAsstOpen(false)} />
        </div>
      )}
      {isPhone && inspectorShown && (
        <div className={phoneSheet + ' z-[45] h-[62%] bg-studio-panel'} role="dialog" aria-label={s.previewDoc ? 'Preview' : 'Page and element panel'}>
          {inspectorPane}
        </div>
      )}

      {/* Dialogs */}
      <CoverPicker open={coverOpen} onClose={() => setCoverOpen(false)} />
      {publishDialogOpen && <PublishDialog onClose={() => setPublishDialogOpen(false)} onPublished={(id) => onPublished(id, 'selected')} />}
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
      {boardOpen && <ReviewBoard onClose={() => setBoardOpen(false)} />}
    </div>
  );
}
