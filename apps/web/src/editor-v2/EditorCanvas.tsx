// ---------------------------------------------------------------------------
// Magazine Builder v2 — the interactive canvas.
//
// Renders the REAL read-only IssuePageCanvas as the base layer (so what you edit
// is pixel-identical to what publishes — zero drift), then overlays a
// transparent interaction layer: one hit box per element (click to select, drag
// to move) plus 8 resize handles on the selection. Drag converts screen-pixel
// deltas to page-canonical deltas via the measured render width. Live drag uses
// updateLocal (no server call); pointerup commits once (one undo entry).
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Wand2, WandSparkles, Loader2 } from 'lucide-react';
import { sanitizeRichText } from '@/editor/lib/sanitize';
import { useEditorStore } from './store';
import { IssuePageCanvas } from './IssuePageCanvas';
import { pctRect, clampRect } from './geometry';
import * as api from './api';
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
  const t = element.text!;
  const vAlign = t.vAlign ?? 'top';

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
    return () => window.clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = (persist: boolean) => {
    const el = ref.current;
    if (!el) return;
    const cur = useEditorStore.getState().page?.elements.find((x) => x.id === element.id);
    if (!cur || cur.type !== 'text' || !cur.text) return;
    const html = el.innerHTML;
    const patch = { text: { ...cur.text, content: html } };
    if (!persist) return updateLocal(element.id, patch);
    if (sanitizeRichText(cur.text.content) !== html) void commit(element.id, patch, before.current);
  };

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
          window.clearTimeout(debounce.current);
          debounce.current = window.setTimeout(() => flush(false), 150);
        }}
        onBlur={() => {
          window.clearTimeout(debounce.current);
          flush(true);
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
        className="rounded-[2px] ring-2 ring-[#7c3aed]/70"
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; sx: number; sy: number; orig: MagazineElement; before: MagazineElement } | null>(null);

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
  }, [selectedId, page, select, commit, deleteElement, canEdit]);

  if (!page) return null;
  const scale = zoomWidth / (page.width > 0 ? page.width : zoomWidth);

  const startDrag = (e: React.PointerEvent, element: MagazineElement, mode: Mode) => {
    if (!canManage && mode !== 'move') { /* collaborators may still move/edit assigned pages */ }
    e.preventDefault();
    e.stopPropagation();
    select(element.id);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: { ...element }, before: { ...element } };
    overlayRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dw = overlayRef.current?.getBoundingClientRect().width ?? zoomWidth;
    const ratio = page.width / (dw || page.width); // page-px per screen-px (aspect preserved → same for y)
    const dx = (e.clientX - d.sx) * ratio;
    const dy = (e.clientY - d.sy) * ratio;
    const next = clampRect(applyDrag(d.orig, d.mode, dx, dy), page);
    updateLocal(d.orig.id, next);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    overlayRef.current?.releasePointerCapture(e.pointerId);
    const final = useEditorStore.getState().page?.elements.find((x) => x.id === d.orig.id);
    if (final && (final.x !== d.before.x || final.y !== d.before.y || final.w !== d.before.w || final.h !== d.before.h)) {
      void commit(d.orig.id, { x: final.x, y: final.y, w: final.w, h: final.h }, d.before);
    }
  };

  const selected = page.elements.find((x) => x.id === selectedId) ?? null;

  const startEditing = (element: MagazineElement) => {
    if (!canEdit || element.type !== 'text' || !element.text) return;
    select(element.id);
    setEditingId(element.id);
  };

  return (
    <div style={{ width: zoomWidth }} className="relative shrink-0">
      {/* Base: the real published renderer (hide the element being edited in place) */}
      <IssuePageCanvas page={page} hideElementId={editingId ?? undefined} />
        {/* Interaction overlay (same box via inset-0) */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerDown={() => select(null)}
        >
          {page.elements.map((element) =>
            editingId === element.id && element.type === 'text' && element.text ? (
              <TextEditingOverlay key={element.id} element={element} page={page} scale={scale} onExit={() => setEditingId(null)} />
            ) : (
              <div
                key={element.id}
                className={`absolute cursor-move ${isEmptySlot(element) ? 'border border-dashed border-[#7c3aed]/50 bg-[#7c3aed]/[0.06]' : ''}`}
                style={{ ...pctRect(element, page), zIndex: element.zIndex }}
                onPointerDown={(e) => startDrag(e, element, 'move')}
                onDoubleClick={(e) => { if (element.type === 'text') { e.stopPropagation(); startEditing(element); } }}
                title={isEmptySlot(element) ? `Empty ${slotLabel(element)} — ${element.type === 'text' ? 'double-click to write' : 'use the Inspector to fill it'}` : element.type === 'text' ? 'Double-click to edit text' : undefined}
              >
                {isEmptySlot(element) && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden px-1 text-center text-[9px] font-semibold uppercase tracking-wide text-[#7c3aed]/70">
                    {slotLabel(element)}
                  </span>
                )}
              </div>
            ),
          )}

          {selected && !editingId && (
            <div className="absolute" style={{ ...pctRect(selected, page), zIndex: 10000 }}>
              <div className="pointer-events-none absolute inset-0 ring-2 ring-[#7c3aed]" />
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
                    border: '1.5px solid #7c3aed',
                    borderRadius: 2,
                    cursor: h.cur,
                  }}
                />
              ))}
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
  const [cache, setCache] = useState<Record<string, MagazinePageV2>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  // Evict the page being edited from the preview cache, so when it later returns
  // to a preview it re-fetches the freshly-edited content (never a stale copy).
  useEffect(() => {
    if (!currentPageId) return;
    setCache((c) => {
      if (!c[currentPageId]) return c;
      const next = { ...c };
      delete next[currentPageId];
      return next;
    });
  }, [currentPageId]);

  // Lazy-fetch a non-active page's full content when its placeholder nears view.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !issueId) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const pid = (en.target as HTMLElement).dataset.lazy;
          if (pid && !cache[pid]) {
            api.getPage(issueId, pid).then((p) => setCache((c) => ({ ...c, [pid]: p }))).catch(() => {});
          }
        }
      },
      { root, rootMargin: '600px' },
    );
    root.querySelectorAll('[data-lazy]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [issueId, pages, cache, currentPageId]);

  if (!pages.length) {
    return <div className="flex h-full items-center justify-center text-sm text-white/40">No pages.</div>;
  }

  return (
    <div ref={rootRef} className="flex flex-col items-center gap-8 py-8">
      {pages.map((sum) => {
        const active = sum.id === currentPageId;
        const preview = cache[sum.id];
        return (
          <div key={sum.id} className="shrink-0" style={{ width: zoomWidth }}>
            {/* Per-page header: number · publish checkbox · Fill / Adjust (every page) */}
            <div className="mb-1.5 flex items-center gap-2 text-[11px] text-white/40">
              <span>Page {sum.index + 1}</span>
              {canManage && (
                <label className="flex cursor-pointer items-center gap-1 text-white/45 hover:text-white/70" title="Include this page when publishing selected pages">
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
                  className="flex items-center gap-1 rounded-sm border border-white/15 px-1.5 py-0.5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
                  disabled={formatBusy}
                  onClick={() => void runFormat('fill', sum.id)}
                  title="Fill empty boxes & tighten crowded text on this page (AI)"
                >
                  {formatBusy && active ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Fill
                </button>
                <button
                  className="flex items-center gap-1 rounded-sm border border-white/15 px-1.5 py-0.5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
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
                className="block w-full ring-1 ring-white/10 transition hover:ring-2 hover:ring-[#7c3aed]"
                title="Click to edit this page"
              >
                <IssuePageCanvas page={preview} />
              </button>
            ) : (
              <button
                data-lazy={sum.id}
                onClick={() => void openPage(sum.id)}
                className="flex w-full items-center justify-center bg-white/[0.04] text-white/30 ring-1 ring-white/10 hover:ring-[#7c3aed]"
                style={{ aspectRatio: `${sum.width || 1275} / ${sum.height || 1650}` }}
              >
                <span className="text-xs">Page {sum.index + 1} — click to edit</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
