// ---------------------------------------------------------------------------
// Magazine Builder v2 — the page rail (§1 of the studio redesign).
//
// It replaces a horizontal strip of NUMBERS: `1 (12)  2 (9)  3 (14)`. A page
// number and an element count is everything the strip knew, and nobody
// recognises page 6 of their own magazine as "6 (11)" — so navigating a
// magazine meant clicking through it. This draws the actual pages, with the
// same renderer the canvas, the public bulletin and the PDF use, so a
// thumbnail cannot show something the page doesn't.
//
// Reorder was ◀ ▶ on the ACTIVE page only: moving page 7 to slot 2 was a click
// to select it and then five more. Tiles drag, which is the gesture a stack of
// pages already suggests. Alt+↑/↓ does the same thing from the keyboard, because
// drag-and-drop is the one interaction that has no keyboard equivalent by default.
//
// Thumbnails are fetched LAZILY (store.ensureThumb, one IntersectionObserver per
// tile) — a PageSummary carries only an element count, and a 40-page magazine
// must not fire 40 requests to draw a strip nobody has scrolled yet.
// ---------------------------------------------------------------------------

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronUp, ChevronDown, Copy, Trash2, Plus, Sparkles, PanelLeftOpen, Lock, EyeOff, AlertTriangle } from 'lucide-react';
import { useEditorStore } from './store';
import type { PageSummary } from './api';
import type { IssuePageData } from './model';
import { IssuePageCanvas } from './IssuePageCanvas';
import { columnOf, COLUMN_LABEL, COLUMN_TONE } from './review';
import { ShimmerText } from './BuildProgress';

/** The hover title — every per-page fact the tile itself can't show. Same text the
 *  old numbered tab carried, so nothing was lost in the move to thumbnails. */
function tileTitle(p: PageSummary, n: number): string {
  const col = columnOf(p);
  return (
    `Page ${n} — ${COLUMN_LABEL[col]}` +
    ((p.reviewRound ?? 0) > 0 && col === 'needs_changes' ? ` (round ${p.reviewRound})` : '') +
    (p.approvalStale ? ' — edited after approval, needs approving again' : '') +
    (p.editedSincePublish ? '\nEdited since the bulletin was published' : '') +
    (p.selectedForPublish === false ? '\nLeft out of a "selected pages" publish' : '') +
    (p.reviewNote ? `\n“${p.reviewNote}”` : '')
  );
}

/**
 * The drawn page, memoised on the page object.
 *
 * This is the expensive part of the rail — every element of every page. Guarding it
 * on object identity means a tile can re-render (hover, selection, a drag indicator)
 * without redrawing the page inside it, and a magazine-wide store update redraws
 * only the pages that actually changed.
 */
const Thumb = memo(function Thumb({ page }: { page: IssuePageData }) {
  return <IssuePageCanvas page={page} lazyImages />;
});

/** A 2px gold line where the dragged page would land. */
function DropLine({ show }: { show: boolean }) {
  return (
    <div
      aria-hidden
      className={'mx-1 h-0.5 rounded-full transition-colors ' + (show ? 'bg-[var(--gold-bright)]' : 'bg-transparent')}
    />
  );
}

function Tile({
  page,
  n,
  total,
  active,
  canManage,
  editable,
  dragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMove,
}: {
  page: PageSummary;
  n: number;
  total: number;
  active: boolean;
  canManage: boolean;
  editable: boolean;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // NARROW subscriptions, deliberately. A tile that subscribed to the whole store
  // would re-render on every optimistic element update — that is one per pointer
  // move while dragging on the canvas, times every page in the magazine.
  const cached = useEditorStore((st) => st.thumbs[page.id]);
  // The open page is the one changing under the user's hands. Watching its REV (and
  // reading the document only when the rev moves) means the thumbnail refreshes once
  // per SERVER-CONFIRMED write instead of once per pointer move.
  const liveRev = useEditorStore((st) => (active ? st.page?.rev ?? -1 : -1));
  const thumb = useMemo(() => {
    const live = active ? useEditorStore.getState().page : null;
    return (live && live.id === page.id ? live : cached) ?? null;
    // liveRev is the trigger, not a value: it is what makes `live` worth re-reading.
  }, [active, cached, liveRev, page.id]);
  const pending = page.status === 'pending';
  const failed = page.status === 'failed';
  // AI proposals survive a page change (store.ts) so nothing is lost by scrolling
  // away — but that also means they can sit waiting with zero sign they exist. A
  // small badge here is the only place a non-active page can say "come back and
  // decide on this" instead of the Review & Apply tray, which only ever shows for
  // the page you're currently on.
  const hasPendingReview = useEditorStore((st) => st.proposalsPageId === page.id && st.proposals.length > 0);

  // Ask for the thumbnail the first time this tile is anywhere near the viewport.
  // The observer accounts for the rail's own scroll clipping, so an unscrolled
  // 40-page magazine fetches the handful you can actually see.
  useEffect(() => {
    const node = ref.current;
    if (!node || thumb || pending) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          useEditorStore.getState().ensureThumb(page.id);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [page.id, thumb, pending]);

  const col = columnOf(page);
  const tone = COLUMN_TONE[col];
  const showDot = col !== 'in_progress' || page.approvalStale === true;
  const ratio = page.width > 0 && page.height > 0 ? page.height / page.width : 1.414;

  return (
    <div
      ref={ref}
      // Not a <button>: the tile carries its own duplicate/delete buttons, and a
      // button inside a button is invalid and unreachable by keyboard.
      role="button"
      tabIndex={0}
      aria-current={active ? 'page' : undefined}
      aria-label={`Page ${n} of ${total}`}
      title={tileTitle(page, n) + (hasPendingReview ? '\n\nThe Design Helper made changes here waiting for your review' : '') + (canManage ? '\n\nDrag to reorder · Alt+↑/↓ to move' : '')}
      draggable={canManage}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onClick={() => void useEditorStore.getState().goToPage(page.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void useEditorStore.getState().goToPage(page.id); return; }
        // Alt+arrow is the keyboard half of drag-to-reorder. Plain arrows are left
        // alone — they belong to the browser's own focus movement.
        if (!canManage || !e.altKey) return;
        if (e.key === 'ArrowUp') { e.preventDefault(); onMove(-1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); onMove(1); }
      }}
      className={
        'group relative flex cursor-pointer items-start gap-1 rounded-sm px-1 py-1 outline-none ' +
        'focus-visible:ring-1 focus-visible:ring-[var(--gold-bright)] ' +
        (active ? 'bg-studio-raise-2 ' : 'hover:bg-studio-raise ') +
        (dragging ? 'opacity-40' : '')
      }
    >
      {/* min-w, not w: a 100-page magazine must widen the gutter rather than clip it.
          For editors this doubles as a non-drag, always-visible reorder control —
          dragging asks for sustained pointer precision that not everyone has, and the
          keyboard equivalent (Alt+↑/↓) was previously invisible on screen. */}
      {canManage ? (
        <div className="flex flex-shrink-0 flex-col items-center gap-0.5 pt-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onMove(-1); }}
            disabled={n <= 1}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-studio-ink-3 hover:bg-studio-raise-2 hover:text-studio-ink disabled:opacity-20 disabled:hover:bg-transparent"
            title={`Move page ${n} up`}
            aria-label={`Move page ${n} up`}
          >
            <ChevronUp size={12} />
          </button>
          <span className={'text-center text-ui-sm tabular-nums ' + (active ? 'text-studio-ink' : 'text-studio-ink-3')}>{n}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onMove(1); }}
            disabled={n >= total}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-studio-ink-3 hover:bg-studio-raise-2 hover:text-studio-ink disabled:opacity-20 disabled:hover:bg-transparent"
            title={`Move page ${n} down`}
            aria-label={`Move page ${n} down`}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      ) : (
        <span className={'min-w-3.5 flex-shrink-0 pt-1 text-right text-ui-sm tabular-nums ' + (active ? 'text-studio-ink' : 'text-studio-ink-3')}>
          {n}
        </span>
      )}

      <div
        className={
          'relative min-w-0 flex-1 overflow-hidden rounded-sm border bg-white ' +
          (active ? 'border-[var(--gold-bright)] shadow-[0_0_0_1px_var(--gold-bright)]' : 'border-studio-edge group-hover:border-studio-edge-strong')
        }
      >
        {/* The page itself, inert. Live pages contain real links (QR blocks, rich
            text), and a click on one inside a thumbnail would navigate away instead
            of opening the page. */}
        <div className="pointer-events-none select-none" aria-hidden>
          {thumb ? (
            <Thumb page={thumb} />
          ) : (
            <div style={{ paddingBottom: `${ratio * 100}%` }} className="relative w-full">
              <div className="absolute inset-0 flex items-center justify-center">
                {failed ? (
                  <AlertTriangle size={14} className="text-amber-500" />
                ) : (
                  <span className="text-ui-sm text-studio-bg/30">{pending ? '…' : n}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Badges over the page: the review state, and the two exceptions worth
            knowing without opening the page. The band renders ONLY when it has
            something to say — a permanent strip would cover the foot of every page,
            and the whole point of a thumbnail is that you can see the page. The
            element count that the old numbered tab carried is gone with it: you can
            now see how full a page is. */}
        {(showDot || page.selectedForPublish === false || !editable || hasPendingReview) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-studio-bg/70 px-1 py-0.5">
            {showDot && <span className={'h-1.5 w-1.5 flex-shrink-0 rounded-full ' + (page.approvalStale ? 'bg-amber-400' : tone.dot)} />}
            {hasPendingReview && <Sparkles size={9} className="flex-shrink-0 text-[var(--gold-bright)]" />}
            {page.selectedForPublish === false && <EyeOff size={9} className="flex-shrink-0 text-studio-ink-3" />}
            {!editable && <Lock size={9} className="flex-shrink-0 text-studio-ink-3" />}
          </div>
        )}

        {/* Per-page actions. ALWAYS visible, not hover-only — a control that only
            appears when the mouse happens to pass over it is a control that a
            first-time or imprecise-pointer user may never discover exists. They used
            to appear only on the ACTIVE page too, which meant duplicating page 9
            started by navigating to it. */}
        {canManage && (
          <div className="absolute right-0.5 top-0.5 flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); void useEditorStore.getState().duplicatePage(page.id); }}
              className="rounded-sm bg-studio-bg/90 p-1 text-studio-ink-2 hover:bg-studio-bg hover:text-studio-ink"
              title={`Duplicate page ${n}`}
              aria-label={`Duplicate page ${n}`}
            >
              <Copy size={13} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Now that this button is always visible rather than hover-only, a slip
                // lands on it far more easily — and deletion prunes the page's own
                // entries out of the undo stack (store.ts, withoutPage), so Ctrl+Z
                // cannot bring it back the way it can for almost everything else here.
                //
                // A SUBMITTED page skips this generic confirm: store.deletePage already
                // raises its own — naming who submitted it and that they'll be emailed —
                // when the server refuses with page-submitted. That one is strictly more
                // informative, and asking twice in a row for the same click would bury it
                // behind a confirm that has nothing useful to say.
                if (col === 'submitted' || window.confirm(`Delete page ${n}? This cannot be undone.`)) {
                  void useEditorStore.getState().deletePage(page.id);
                }
              }}
              disabled={total <= 1}
              className="rounded-sm bg-studio-bg/90 p-1 text-red-300/90 hover:bg-studio-bg hover:text-red-300 disabled:opacity-30"
              title={total <= 1 ? 'A magazine needs at least one page' : `Delete page ${n}`}
              aria-label={`Delete page ${n}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PageRail({
  open,
  onToggle,
  aiOpen,
  setAiOpen,
}: {
  open: boolean;
  onToggle: () => void;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
}) {
  // Per-field subscriptions, not the whole store: the rail must not re-render while
  // an element is being dragged on the canvas (that changes `page`, which the rail
  // has no use for — see the note in Tile).
  const pages = useEditorStore((st) => st.pages);
  const currentPageId = useEditorStore((st) => st.currentPageId);
  const issue = useEditorStore((st) => st.issue);
  const generating = useEditorStore((st) => st.generating);
  const [drag, setDrag] = useState<{ from: number; at: number } | null>(null);
  const [aiCount, setAiCount] = useState(2);
  const [aiTopic, setAiTopic] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the open page in view. A 30-page magazine scrolls, and pages get opened from
  // places other than this rail — the review board, a chat proposal, deleting the page
  // you were on. `block: 'nearest'` scrolls only when it actually has to.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [currentPageId]);

  const canManage = issue?.myRole === 'owner';
  // Structural writes are refused server-side while a generation run is in flight
  // (the background reindex must not interleave), so the two buttons that make pages
  // are disabled rather than left to 409.
  const busy = generating || issue?.status === 'processing';
  const editablePages = issue?.myEditablePageIds ?? [];
  const isEditable = (id: string) => editablePages === 'all' || (Array.isArray(editablePages) && editablePages.includes(id));
  const currentIndex = pages.findIndex((p) => p.id === currentPageId);

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="flex w-9 flex-shrink-0 flex-col items-center gap-2 border-r border-studio-hair bg-studio-panel py-2 text-studio-ink-3 hover:bg-studio-raise hover:text-studio-ink"
        title="Show the pages"
        aria-label="Show the pages"
      >
        <PanelLeftOpen size={15} />
        <span className="text-ui-sm [writing-mode:vertical-rl]">Pages · {pages.length}</span>
      </button>
    );
  }

  // splice semantics, matching the server: the page is lifted OUT first, so every
  // gap after it shifts down by one. Dropping below where you started therefore
  // lands one index earlier than the gap you were hovering.
  const commitDrop = () => {
    if (!drag) return;
    const { from, at } = drag;
    setDrag(null);
    const to = at > from ? at - 1 : at;
    if (to !== from) void useEditorStore.getState().reorder(from, to);
  };

  const move = (from: number, delta: -1 | 1) => {
    const to = from + delta;
    if (to < 0 || to >= pages.length) return;
    void useEditorStore.getState().reorder(from, to);
  };

  return (
    <aside aria-label="Pages" className="flex w-[136px] flex-shrink-0 flex-col border-r border-studio-hair bg-studio-panel">
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-studio-hair px-2 py-1.5">
        <span className="text-ui-sm font-bold uppercase tracking-[0.12em] text-studio-ink-3">Pages</span>
        <span className="ml-auto text-ui-sm tabular-nums text-studio-ink-4">
          {currentIndex >= 0 ? `${currentIndex + 1}/${pages.length}` : pages.length}
        </span>
        <button
          onClick={onToggle}
          className="rounded-sm p-0.5 text-studio-ink-3 hover:bg-studio-raise-2 hover:text-studio-ink"
          title="Hide the pages"
          aria-label="Hide the pages"
        >
          <ChevronsLeft size={14} />
        </button>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-1 py-1"
        onDrop={(e) => { e.preventDefault(); commitDrop(); }}
        onDragOver={(e) => { if (drag) e.preventDefault(); }}
      >
        {pages.map((p, i) => (
          <div key={p.id}>
            <DropLine show={drag?.at === i} />
            <Tile
              page={p}
              n={i + 1}
              total={pages.length}
              active={p.id === currentPageId}
              canManage={canManage}
              editable={isEditable(p.id)}
              dragging={drag?.from === i}
              onDragStart={(e) => {
                // Firefox refuses to start a drag unless dataTransfer carries
                // something, so the page number goes along for the ride even though
                // the reorder is driven by React state, not the payload.
                e.dataTransfer.setData('text/plain', `page ${i + 1}`);
                e.dataTransfer.effectAllowed = 'move';
                setDrag({ from: i, at: i });
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const r = e.currentTarget.getBoundingClientRect();
                const at = e.clientY > r.top + r.height / 2 ? i + 1 : i;
                if (at !== drag.at) setDrag({ from: drag.from, at });
              }}
              onDragEnd={() => setDrag(null)}
              onMove={(d) => move(i, d)}
            />
          </div>
        ))}
        <DropLine show={drag?.at === pages.length} />
      </div>

      {canManage && (
        <div data-menu-root className="relative flex flex-shrink-0 gap-1 border-t border-studio-hair px-1.5 py-1.5">
          <button
            onClick={() => void useEditorStore.getState().addPage()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-studio-edge bg-studio-raise py-1 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2 disabled:opacity-30"
            title={busy ? 'Wait for the current build to finish' : 'Add a blank page'}
          >
            <Plus size={12} /> Blank
          </button>
          <button
            onClick={() => setAiOpen(!aiOpen)}
            disabled={busy}
            className={
              'flex flex-1 items-center justify-center gap-1 rounded-sm py-1 text-ui-sm font-semibold ' +
              (busy ? 'border border-studio-edge text-studio-ink-3' : 'text-studio-bg')
            }
            style={busy ? undefined : { background: 'var(--gold-bright)' }}
            title="Add on-theme pages with AI"
          >
            {busy ? <ShimmerText>Building</ShimmerText> : <><Sparkles size={12} /> AI</>}
          </button>

          {aiOpen && !busy && (
            <div className="absolute bottom-full left-1.5 z-30 mb-1 w-64 rounded-md border border-studio-edge bg-studio-panel p-2.5 shadow-xl">
              <div className="mb-1.5 flex items-center gap-1.5 text-ui-sm text-studio-ink-2">
                <span>Add</span>
                <select
                  className="rounded border border-studio-edge bg-studio-bg px-1 py-0.5 text-studio-ink"
                  style={{ colorScheme: 'dark' }}
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 6].map((n) => (
                    <option key={n} value={n} style={{ backgroundColor: 'var(--studio-panel)', color: '#fff' }}>{n}</option>
                  ))}
                </select>
                <span>on-theme page{aiCount === 1 ? '' : 's'}</span>
              </div>
              <input
                className="mb-2 w-full rounded border border-studio-edge bg-studio-bg px-1.5 py-1 text-ui-sm text-studio-ink placeholder:text-studio-ink-4"
                placeholder="Topic (optional)"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
              />
              <div className="flex justify-end gap-1">
                <button className="rounded-sm px-2 py-1 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2" onClick={() => setAiOpen(false)}>Cancel</button>
                <button
                  className="inline-flex items-center gap-1 rounded-sm bg-emerald-500 px-2 py-1 text-ui-sm font-semibold text-studio-ink hover:bg-emerald-600"
                  onClick={() => { void useEditorStore.getState().generatePages(aiCount, aiTopic.trim()); setAiOpen(false); setAiTopic(''); }}
                >
                  <Sparkles size={12} /> Generate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
