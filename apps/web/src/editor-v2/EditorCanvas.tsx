// ---------------------------------------------------------------------------
// Magazine Builder v2 — the interactive canvas.
//
// Renders the REAL read-only IssuePageCanvas as the base layer (so what you edit
// is pixel-identical to what publishes — zero drift), then overlays a
// transparent interaction layer: one hit box per element. A clean click just
// selects (Canva-style); a DOUBLE-click on a text box opens it for typing. A
// deliberate drag (past DRAG_THRESHOLD_PX) on the body moves it, same as a drag
// on the dedicated move handle below the selection. 8 resize handles sit on the
// selection. Drag converts screen-pixel deltas to page-canonical deltas via the
// measured render width. Live drag uses updateLocal (no server call); pointerup
// commits once (one undo entry).
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Move, Wand2, WandSparkles } from 'lucide-react';
import { sanitizeRichText } from '@/lib/htmlInline';
import { useEditorStore } from './store';
import { ShimmerText } from './BuildProgress';
import { IssuePageCanvas } from './IssuePageCanvas';
import { pctRect, clampRect } from './geometry';
import type { MagazineElement, MagazinePageV2 } from './model';

type Mode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: { m: Mode; cx: number; cy: number; cur: string }[] = [
  { m: 'nw', cx: 0, cy: 0, cur: 'nwse-resize' },
  { m: 'n', cx: 0.5, cy: 0, cur: 'ns-resize' },
  { m: 'ne', cx: 1, cy: 0, cur: 'nesw-resize' },
  { m: 'e', cx: 1, cy: 0.5, cur: 'ew-resize' },
  { m: 'se', cx: 1, cy: 1, cur: 'nwse-resize' },
  { m: 's', cx: 0.5, cy: 1, cur: 'ns-resize' },
  { m: 'sw', cx: 0, cy: 1, cur: 'nesw-resize' },
  { m: 'w', cx: 0, cy: 0.5, cur: 'ew-resize' },
];

// Screen-pixel movement below which a pointer gesture counts as a CLICK (select /
// open text for typing) rather than a drag — this is what lets a single click
// start editing a text box while a deliberate drag still moves it.
const DRAG_THRESHOLD_PX = 4;

/**
 * An element that carries no content yet, so the read-only renderer draws nothing
 * for it (an image with no url renders null; empty copy renders an empty box).
 *
 * These are invisible on the base layer BY DESIGN — a published page must never
 * show an empty placeholder. But an unfilled slot you can't see is one you can't
 * fill, which is exactly the state a "Reuse template" shell starts in, so the
 * EDITOR marks them here on its own overlay. The overlay is editor-only, so the
 * public viewer and the PDF export are untouched by construction.
 */
function isEmptySlot(el: MagazineElement): boolean {
  if (el.type === 'text') return !el.text?.content?.replace(/<[^>]*>/g, '').trim();
  if (el.type === 'image') return !el.image?.url;
  if (el.type === 'qr') return !el.qr?.url;
  return false; // shapes/icons are decoration — they render fine with no content
}

/** What belongs in an empty slot — its text role ("headline"), else its type. */
function slotLabel(el: MagazineElement): string {
  if (el.type === 'text') {
    const role = el.text?.role;
    return role && role !== 'other' ? role : 'text';
  }
  return el.type === 'image' ? 'photo' : el.type;
}

function applyDrag(o: MagazineElement, mode: Mode, dx: number, dy: number) {
  let { x, y, w, h } = o;
  if (mode === 'move') return { x: x + dx, y: y + dy, w, h };
  if (mode.includes('e')) w = o.w + dx;
  if (mode.includes('s')) h = o.h + dy;
  if (mode.includes('w')) { x = o.x + dx; w = o.w - dx; }
  if (mode.includes('n')) { y = o.y + dy; h = o.h - dy; }
  return { x, y, w, h };
}

// In-place text editing: an uncontrolled contentEditable positioned exactly over
// the element (the base canvas hides that element meanwhile, via hideElementId,
// so they never double up). Font size maps px = canonical size × zoom scale, so
// it's pixel-aligned with the read-only render. Live keystrokes stay local
// (updateLocal, debounced); blur commits once through the rev-guarded API (one
// undo entry) and the server refits the font to the box. Mirrors v1's EditableText.
function TextEditingOverlay({
  element,
  page,
  scale,
  onExit,
}: {
  element: MagazineElement;
  page: MagazinePageV2;
  scale: number;
  onExit: () => void;
}) {
  const commit = useEditorStore((s) => s.commit);
  const updateLocal = useEditorStore((s) => s.updateLocal);
  const ref = useRef<HTMLDivElement>(null);
  const before = useRef<MagazineElement>({ ...element });
  const debounce = useRef<number | undefined>(undefined);
  const latestHtml = useRef<string | null>(null);
  const persisted = useRef(false);
  const t = element.text!;
  const vAlign = t.vAlign ?? 'top';

  // Read the current text from the live node, or — if it has already been
  // unmounted (refs detach before the effect cleanup) — the last value captured on
  // input, so keystrokes are never lost when editing exits without a blur.
  const readHtml = () => ref.current?.innerHTML ?? latestHtml.current;

  const liveUpdate = () => {
    const cur = useEditorStore.getState().page?.elements.find((x) => x.id === element.id);
    if (!cur || cur.type !== 'text' || !cur.text) return;
    const html = readHtml();
    if (html != null) updateLocal(element.id, { text: { ...cur.text, content: html } });
  };

  // Persist the final text exactly ONCE — on blur OR on unmount, whichever fires
  // first (a programmatic exit — page switch, proposal apply, generation poll —
  // clears editingId with no blur, so relying on blur alone silently dropped edits).
  const persist = () => {
    if (persisted.current) return;
    persisted.current = true;
    const html = readHtml();
    if (html == null) return;
    const cur = useEditorStore.getState().page?.elements.find((x) => x.id === element.id);
    if (!cur || cur.type !== 'text' || !cur.text) return;
    if (sanitizeRichText(cur.text.content) !== html) void commit(element.id, { text: { ...cur.text, content: html } }, before.current);
  };

  // Seed the DOM once, focus, drop the caret at the end. Never write innerHTML
  // again while focused (that would reset the caret) — the node is uncontrolled.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = sanitizeRichText(t.content);
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    return () => { window.clearTimeout(debounce.current); persist(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const box: CSSProperties = {
    position: 'absolute',
    ...pctRect(element, page),
    zIndex: 10001,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: vAlign === 'center' ? 'center' : vAlign === 'bottom' ? 'flex-end' : 'flex-start',
    overflow: 'visible',
  };
  const textStyle: CSSProperties = {
    width: '100%',
    outline: 'none',
    cursor: 'text',
    fontFamily: t.fontFamily,
    fontWeight: t.fontWeight,
    color: t.color,
    textAlign: t.align,
    lineHeight: t.lineHeight,
    fontSize: Math.max(1, t.fontSize * scale),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  };

  return (
    // Swallow pointerdown so the overlay's "click empties selection" handler and a
    // drag never start from inside the text being edited.
    <div style={box} onPointerDown={(e) => e.stopPropagation()}>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={() => {
          latestHtml.current = ref.current?.innerHTML ?? null;
          window.clearTimeout(debounce.current);
          debounce.current = window.setTimeout(liveUpdate, 150);
        }}
        onBlur={() => {
          window.clearTimeout(debounce.current);
          persist();
          onExit();
        }}
        onKeyDown={(e) => {
          // Escape ends editing; keep every keystroke inside the field so the
          // page-level shortcuts (Delete = remove element, arrows = nudge) don't fire.
          if (e.key === 'Escape') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
          e.stopPropagation();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const txt = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, txt);
        }}
        style={textStyle}
        className="rounded-[2px] ring-2 ring-studio-select-soft"
      />
    </div>
  );
}

// The interactive editing layer for the ACTIVE page (drag/resize/select). Rendered
// inside the multi-page stack for whichever page is currently open.
function ActivePageLayer() {
  const page = useEditorStore((s) => s.page);
  const selectedId = useEditorStore((s) => s.selectedId);
  const zoomWidth = useEditorStore((s) => s.zoomWidth);
  const canManage = useEditorStore((s) => s.canManage());
  const canEdit = useEditorStore((s) => s.canEdit());
  const select = useEditorStore((s) => s.select);
  const updateLocal = useEditorStore((s) => s.updateLocal);
  const commit = useEditorStore((s) => s.commit);
  const deleteElement = useEditorStore((s) => s.deleteElement);
  const duplicateElement = useEditorStore((s) => s.duplicateElement);
  const [editingId, setEditingId] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; sx: number; sy: number; orig: MagazineElement; before: MagazineElement; moved: boolean } | null>(null);

  // Switching pages ends any in-place edit (selection changes blur the editor,
  // which commits + exits on its own).
  useEffect(() => { setEditingId(null); }, [page?.id]);

  // Keyboard: arrows nudge, Delete removes, Escape deselects, Enter/F2 edits text.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      // Never hijack typing in a field OR the in-place text editor (a contentEditable).
      if (tgt?.tagName === 'INPUT' || tgt?.tagName === 'TEXTAREA' || tgt?.isContentEditable) return;
      const cur = useEditorStore.getState().page?.elements.find((x) => x.id === selectedId);
      if (!cur) return;
      if ((e.key === 'Enter' || e.key === 'F2') && cur.type === 'text' && cur.text && canEdit) {
        e.preventDefault();
        return setEditingId(cur.id);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && canEdit) {
        e.preventDefault(); // else the browser's "bookmark" dialog steals it
        return void duplicateElement(selectedId);
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'Escape') return select(null);
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return void deleteElement(selectedId); }
      const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const d = nudge[e.key];
      if (d && page) {
        e.preventDefault();
        const r = clampRect({ x: cur.x + d[0], y: cur.y + d[1], w: cur.w, h: cur.h }, page);
        void commit(selectedId, r, cur);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, page, select, commit, deleteElement, duplicateElement, canEdit]);

  if (!page) return null;
  const scale = zoomWidth / (page.width > 0 ? page.width : zoomWidth);

  const startDrag = (e: React.PointerEvent, element: MagazineElement, mode: Mode) => {
    if (!canManage && mode !== 'move') { /* collaborators may still move/edit assigned pages */ }
    e.preventDefault();
    e.stopPropagation();
    select(element.id);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: { ...element }, before: { ...element }, moved: false };
    overlayRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Sub-threshold jitter keeps the gesture a click (→ edit/select); only real
    // movement promotes it to a drag.
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) <= DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const dw = overlayRef.current?.getBoundingClientRect().width ?? zoomWidth;
    const ratio = page.width / (dw || page.width); // page-px per screen-px (aspect preserved → same for y)
    const dx = (e.clientX - d.sx) * ratio;
    const dy = (e.clientY - d.sy) * ratio;
    const next = clampRect(applyDrag(d.orig, d.mode, dx, dy), page);
    updateLocal(d.orig.id, next);
  };

  const startEditing = (element: MagazineElement) => {
    if (!canEdit || element.type !== 'text' || !element.text) return;
    select(element.id);
    setEditingId(element.id);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    overlayRef.current?.releasePointerCapture(e.pointerId);
    // A clean click (no real movement) just selects — Canva-style, editing text
    // needs a DOUBLE-click (see onOverlayDoubleClick below).
    if (!d.moved) return;
    const final = useEditorStore.getState().page?.elements.find((x) => x.id === d.orig.id);
    if (final && (final.x !== d.before.x || final.y !== d.before.y || final.w !== d.before.w || final.h !== d.before.h)) {
      void commit(d.orig.id, { x: final.x, y: final.y, w: final.w, h: final.h }, d.before);
    }
  };

  const selected = page.elements.find((x) => x.id === selectedId) ?? null;
  const editingElement = editingId ? (page.elements.find((x) => x.id === editingId && x.type === 'text' && !!x.text) ?? null) : null;

  // A near-full-page element is a background/scrim: the user almost never means to
  // grab IT when there's content on top, so it's the last hit-test choice.
  const isFullBleed = (el: MagazineElement) => el.w * el.h >= 0.85 * page.width * page.height;

  // Hit-test the page ourselves rather than stacking a hit box per element — that
  // stack let a full-bleed image/scrim intercept every click ("drag covers full").
  // Pick the topmost, most-specific element under the point; near-full-page
  // elements sort LAST, so you click "past" a background to the content on it, yet
  // can still select the background where nothing sits on top.
  const hitTest = (e: { clientX: number; clientY: number }): MagazineElement | null => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    // Use the SAME width/height fallback as IssuePageCanvas: a page still being
    // composed can arrive with height (or width) 0, and dividing the click point by
    // 0 yields NaN — no element ever matches, so every click reads as "empty" and
    // silently deselects. Mirroring the renderer's fallback keeps the hit-test grid
    // aligned with what's actually drawn.
    const pw = page.width > 0 ? page.width : 1;
    const ph = page.height > 0 ? page.height : Math.round(pw * 1.414);
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const hits = page.elements.filter(
      (el) =>
        fx >= el.x / pw && fx <= (el.x + el.w) / pw &&
        fy >= el.y / ph && fy <= (el.y + el.h) / ph,
    );
    if (hits.length === 0) return null;
    hits.sort((a, b) => {
      const af = isFullBleed(a), bf = isFullBleed(b);
      if (af !== bf) return af ? 1 : -1; // non-full-bleed first
      return b.zIndex - a.zIndex || a.w * a.h - b.w * b.h; // then topmost, then smaller
    });
    return hits[0]!;
  };

  const onOverlayPointerDown = (e: React.PointerEvent) => {
    const target = hitTest(e);
    if (!target) return select(null);
    startDrag(e, target, 'move');
  };

  // Canva-style: a single click only selects; typing needs a deliberate double-click.
  const onOverlayDoubleClick = (e: React.MouseEvent) => {
    const target = hitTest(e);
    if (target) startEditing(target);
  };

  return (
    // `isolate` creates a stacking context so the interaction overlay's very high
    // z-index (100000, needed to sit above page elements whose z caps at 9999) stays
    // CONTAINED within this page block. Without it that z-index leaks into the app's
    // top-level stacking context and paints over popovers/modals that open across the
    // canvas — making them unclickable. The page block itself stays at normal flow
    // order, safely below those popups.
    <div style={{ width: zoomWidth }} className="relative isolate shrink-0">
      {/* Base: the real published renderer (hide the element being edited in place) */}
      <IssuePageCanvas page={page} hideElementId={editingId ?? undefined} />
        {/* Interaction overlay (same box via inset-0). An explicit high z-index is
            REQUIRED, not cosmetic: page elements carry positive zIndex values, and
            without this the transparent overlay can paint BELOW them — a click on any
            headline/photo then lands on the (handler-less) content and does nothing,
            so the whole canvas feels dead. Its own chrome (selection ring 10000,
            text-edit 10001) lives inside this stacking context, so those still layer
            correctly above the page. */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          style={{ zIndex: 100000 }}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerDown={onOverlayPointerDown}
          onDoubleClick={onOverlayDoubleClick}
        >
          {/* The text box currently being typed into. */}
          {editingElement && (
            <TextEditingOverlay key={editingElement.id} element={editingElement} page={page} scale={scale} onExit={() => setEditingId(null)} />
          )}
          {/* Empty-slot hints only (pointer-events:none) — all hit-testing is done
              by the overlay handler above, so these never intercept a click. */}
          {page.elements.map((element) =>
            isEmptySlot(element) && editingId !== element.id ? (
              <div
                key={element.id}
                className="pointer-events-none absolute border border-dashed border-studio-select-soft bg-studio-select-wash"
                style={{ ...pctRect(element, page), zIndex: element.zIndex }}
              >
                <span className="absolute inset-0 flex items-center justify-center overflow-hidden px-1 text-center text-ui-sm font-semibold uppercase tracking-wide text-studio-select">
                  {slotLabel(element)}
                </span>
              </div>
            ) : null,
          )}

          {selected && !editingId && (
            <div className="absolute" style={{ ...pctRect(selected, page), zIndex: 10000 }}>
              <div className="pointer-events-none absolute inset-0 ring-2 ring-studio-select" />
              {HANDLES.map((h) => (
                <div
                  key={h.m}
                  onPointerDown={(e) => startDrag(e, selected, h.m)}
                  style={{
                    position: 'absolute',
                    left: `${h.cx * 100}%`,
                    top: `${h.cy * 100}%`,
                    width: 10,
                    height: 10,
                    transform: 'translate(-50%, -50%)',
                    background: '#fff',
                    border: '1.5px solid var(--studio-select)',
                    borderRadius: 2,
                    cursor: h.cur,
                  }}
                />
              ))}
              {/* Canva-style move handle: a dedicated icon below the selection you can
                  grab to drag the element — the same 'move' mode the body itself
                  starts on pointerdown, just as an explicit, unambiguous affordance. */}
              <div
                onPointerDown={(e) => startDrag(e, selected, 'move')}
                title="Drag to move"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '100%',
                  marginTop: 10,
                  transform: 'translate(-50%, 0)',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff',
                  border: '1.5px solid var(--studio-select)',
                  borderRadius: '9999px',
                  cursor: 'grab',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}
              >
                <Move size={14} style={{ color: 'var(--forest-deep)' }} />
              </div>
            </div>
          )}
        </div>
    </div>
  );
}

// ── The multi-page vertical scroll stack ──────────────────────────────────────
// Renders every page top-to-bottom. The OPEN page gets the interactive editing
// layer; the rest are read-only previews, lazy-loaded when they scroll near the
// viewport (IntersectionObserver), and clickable to start editing.
export function EditorCanvas() {
  const issueId = useEditorStore((s) => s.issueId);
  const pages = useEditorStore((s) => s.pages);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const openPage = useEditorStore((s) => s.openPage);
  const zoomWidth = useEditorStore((s) => s.zoomWidth);
  const runFormat = useEditorStore((s) => s.runFormat);
  const formatBusy = useEditorStore((s) => s.formatBusy);
  const setPageSelected = useEditorStore((s) => s.setPageSelected);
  const canManage = useEditorStore((s) => s.canManage());
  // ONE page cache for the whole studio, in the store (`thumbs`), shared with the
  // page rail. This used to be a second, private copy of exactly the same documents:
  // every page was fetched twice and held twice, and only this copy lacked the
  // store's rev check and in-flight de-duplication. Two concrete bugs came out of
  // that, both fixed by deleting it:
  //   • Its only invalidation was "evict the page being edited", so when something
  //     rewrote a page the user was NOT looking at — a layout rebuild the assistant
  //     aimed at another page, a Fill pass — the rail updated and this preview kept
  //     drawing the old page until a full reload.
  //   • `cache` was in the lazy-fetch effect's dependencies, so every arriving page
  //     tore down and re-observed every placeholder, re-firing them all with nothing
  //     tracking requests already in flight: opening a long magazine turned into an
  //     O(N²) burst of getPage calls. `ensureThumb` has always de-duplicated
  //     properly; the effect below just asks it.
  const thumbs = useEditorStore((s) => s.thumbs);
  const rootRef = useRef<HTMLDivElement>(null);

  // Lazy-fetch a non-active page's full content when its placeholder nears view.
  // Deps are the things that change WHICH placeholders exist — never the cache
  // itself, or we are back to the storm described above.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !issueId) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const pid = (en.target as HTMLElement).dataset.lazy;
          // Safe to call repeatedly: it no-ops on an in-flight or current copy.
          if (pid) useEditorStore.getState().ensureThumb(pid);
        }
      },
      { root, rootMargin: '600px' },
    );
    root.querySelectorAll('[data-lazy]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [issueId, pages]);

  // Scroll-aware active page: the page nearest the viewport centre becomes the
  // ACTIVE (editable + AI-targeted) page, so the assistant acts on whatever the
  // user has scrolled to — no need to click a tab first. Settle-debounced (fires
  // after scrolling stops, not mid-scroll) and suppressed while the user is typing
  // into a field/text box, so it can never yank focus out of an edit.
  useEffect(() => {
    const content = rootRef.current;
    const scroller = content?.parentElement;
    if (!content || !scroller) return;
    let timer: number | undefined;
    const pick = () => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      const vr = scroller.getBoundingClientRect();
      const mid = vr.top + vr.height / 2;
      let bestId: string | null = null;
      let bestDist = Infinity;
      content.querySelectorAll<HTMLElement>('[data-page]').forEach((elp) => {
        const r = elp.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - mid);
        if (dist < bestDist) { bestDist = dist; bestId = elp.dataset.page ?? null; }
      });
      if (bestId && bestId !== useEditorStore.getState().currentPageId) void openPage(bestId);
    };
    const onScroll = () => { window.clearTimeout(timer); timer = window.setTimeout(pick, 120); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => { scroller.removeEventListener('scroll', onScroll); window.clearTimeout(timer); };
  }, [openPage, pages.length]);

  if (!pages.length) {
    return <div className="flex h-full items-center justify-center text-ui text-studio-ink-3">No pages.</div>;
  }

  return (
    <div ref={rootRef} className="flex flex-col items-center gap-8 py-8">
      {pages.map((sum) => {
        const active = sum.id === currentPageId;
        const preview = thumbs[sum.id];
        return (
          <div key={sum.id} data-page={sum.id} className="shrink-0" style={{ width: zoomWidth }}>
            {/* Per-page header: number · publish checkbox · Fill / Adjust (every page) */}
            <div className="mb-1.5 flex items-center gap-2 text-ui-sm text-studio-ink-3">
              <span>Page {sum.index + 1}</span>
              {canManage && (
                <label className="flex cursor-pointer items-center gap-1 text-studio-ink-3 hover:text-studio-ink-2" title="Include this page when publishing selected pages">
                  <input
                    type="checkbox"
                    checked={sum.selectedForPublish}
                    onChange={(e) => void setPageSelected(sum.id, e.target.checked)}
                    className="h-3 w-3 accent-emerald-500"
                  />
                  publish
                </label>
              )}
              <span className="ml-auto flex items-center gap-1">
                <button
                  className="flex items-center gap-1 rounded-sm border border-studio-edge px-1.5 py-0.5 text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink disabled:opacity-30"
                  disabled={formatBusy}
                  onClick={() => void runFormat('fill', sum.id)}
                  title="Fill empty boxes & tighten crowded text on this page (AI)"
                >
                  <Wand2 size={11} /> {formatBusy && active ? <ShimmerText>Filling…</ShimmerText> : 'Fill'}
                </button>
                <button
                  className="flex items-center gap-1 rounded-sm border border-studio-edge px-1.5 py-0.5 text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink disabled:opacity-30"
                  disabled={formatBusy}
                  onClick={() => void runFormat('adjust', sum.id)}
                  title="Tighten crowded text on this page (AI)"
                >
                  <WandSparkles size={11} /> Adjust
                </button>
                {active && <span className="ml-1 font-semibold" style={{ color: 'var(--gold-bright)' }}>editing</span>}
              </span>
            </div>
            {active ? (
              <ActivePageLayer />
            ) : preview ? (
              <button
                onClick={() => void openPage(sum.id)}
                className="block w-full ring-1 ring-studio-hair transition hover:ring-2 hover:ring-studio-gold"
                title="Click to edit this page"
              >
                <IssuePageCanvas page={preview} />
              </button>
            ) : (
              <button
                data-lazy={sum.id}
                onClick={() => void openPage(sum.id)}
                className="flex w-full items-center justify-center bg-studio-raise text-studio-ink-4 ring-1 ring-studio-hair hover:ring-studio-gold"
                style={{ aspectRatio: `${sum.width || 1275} / ${sum.height || 1650}` }}
              >
                <span className="text-ui-sm">Page {sum.index + 1} — click to edit</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
