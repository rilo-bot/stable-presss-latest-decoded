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

import React, { useEffect, useRef } from 'react';
import { useEditorStore } from './store';
import { IssuePageCanvas } from './IssuePageCanvas';
import { pctRect, screenToPage, clampRect } from './geometry';
import type { MagazineElement } from './model';

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

function applyDrag(o: MagazineElement, mode: Mode, dx: number, dy: number) {
  let { x, y, w, h } = o;
  if (mode === 'move') return { x: x + dx, y: y + dy, w, h };
  if (mode.includes('e')) w = o.w + dx;
  if (mode.includes('s')) h = o.h + dy;
  if (mode.includes('w')) { x = o.x + dx; w = o.w - dx; }
  if (mode.includes('n')) { y = o.y + dy; h = o.h - dy; }
  return { x, y, w, h };
}

export function EditorCanvas() {
  const page = useEditorStore((s) => s.page);
  const selectedId = useEditorStore((s) => s.selectedId);
  const zoomWidth = useEditorStore((s) => s.zoomWidth);
  const canManage = useEditorStore((s) => s.canManage());
  const select = useEditorStore((s) => s.select);
  const updateLocal = useEditorStore((s) => s.updateLocal);
  const commit = useEditorStore((s) => s.commit);
  const deleteElement = useEditorStore((s) => s.deleteElement);

  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; sx: number; sy: number; orig: MagazineElement; before: MagazineElement } | null>(null);

  // Keyboard: arrows nudge, Delete removes, Escape deselects.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const cur = useEditorStore.getState().page?.elements.find((x) => x.id === selectedId);
      if (!cur) return;
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
  }, [selectedId, page, select, commit, deleteElement]);

  if (!page) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No page loaded.</div>;
  }

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

  return (
    <div className="flex justify-center py-8">
      <div style={{ width: zoomWidth }} className="relative shrink-0">
        {/* Base: the real published renderer */}
        <IssuePageCanvas page={page} />
        {/* Interaction overlay (same box via inset-0) */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerDown={() => select(null)}
        >
          {page.elements.map((element) => (
            <div
              key={element.id}
              className="absolute cursor-move"
              style={{ ...pctRect(element, page), zIndex: element.zIndex }}
              onPointerDown={(e) => startDrag(e, element, 'move')}
            />
          ))}

          {selected && (
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
    </div>
  );
}
