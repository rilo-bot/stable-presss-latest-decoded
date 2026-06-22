/**
 * Scrollable stack of magazine pages for the editor. Each page subtree is
 * memoized and wrapped in a content-visibility container so offscreen pages
 * skip layout/paint and editing one region never re-renders the others.
 *
 * Per-user access (collaboration): the owner (and collaborators granted all
 * pages) see every page and edit it interactively. A collaborator assigned a
 * specific set of pages only sees those pages — pages outside their assignment
 * are hidden from their canvas entirely. The "include in publish" toggle and
 * structural controls are shown only to the owner.
 */

import { memo, useMemo, useState, type ReactNode } from 'react';
import { useMagazineStore } from '@/stores/magazineStore';
import { EditorProvider } from './EditorContext';
import { PAGE_COMPONENTS } from './templates/registry';
import { PAGE_TYPE_OPTIONS } from './templates/blueprints';
import { PAGE_W, PAGE_H } from './templates/parts';
import type { PageTypeKey } from '@/types/magazine';
import { cn } from '@/lib/utils';
import { Check, Lock, ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';

/** Dropdown that lets the owner pick a page type to insert. */
function PageTypePicker({
  label,
  onPick,
  align = 'right',
}: {
  label: string;
  onPick: (t: PageTypeKey) => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/60 hover:bg-white/10 hover:text-white/90"
      >
        <Plus size={11} /> {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute top-full z-50 mt-1 max-h-72 w-60 overflow-auto rounded-sm border border-white/15 bg-[#0d1626] py-1 shadow-xl',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            {PAGE_TYPE_OPTIONS.map((o) => (
              <button
                key={o.pageType}
                type="button"
                onClick={() => {
                  onPick(o.pageType);
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/10"
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ScaledFrame({ scale, children }: { scale: number; children: ReactNode }) {
  return (
    <div
      style={{
        width: PAGE_W * scale,
        height: PAGE_H * scale,
        contentVisibility: 'auto',
        containIntrinsicSize: `${PAGE_W * scale}px ${PAGE_H * scale}px`,
      }}
      className="shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-black/10"
    >
      <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

const EditPageHost = memo(function EditPageHost({
  magazineId,
  pageId,
  pageType,
  scale,
}: {
  magazineId: string;
  pageId: string;
  pageType: PageTypeKey;
  scale: number;
}) {
  const Comp = PAGE_COMPONENTS[pageType];
  const ctx = useMemo(() => ({ mode: 'edit' as const, magazineId, pageId }), [magazineId, pageId]);
  return (
    <ScaledFrame scale={scale}>
      <EditorProvider value={ctx}>
        <Comp />
      </EditorProvider>
    </ScaledFrame>
  );
});

// Read-only host for pages outside the user's assignment. Subscribes to the
// page content so it reflects the latest loaded state, but renders in view mode.
const ViewPageHost = memo(function ViewPageHost({
  magazineId,
  pageId,
  pageType,
  scale,
}: {
  magazineId: string;
  pageId: string;
  pageType: PageTypeKey;
  scale: number;
}) {
  const Comp = PAGE_COMPONENTS[pageType];
  const content = useMagazineStore(
    (s) => s.magazines.find((m) => m.id === magazineId)?.pages.find((p) => p.id === pageId)?.content
  );
  const ctx = useMemo(() => ({ mode: 'view' as const, viewContent: content ?? {} }), [content]);
  return (
    <ScaledFrame scale={scale}>
      <EditorProvider value={ctx}>
        <Comp />
      </EditorProvider>
    </ScaledFrame>
  );
});

function CanvasPage({
  magazineId,
  pageId,
  pageType,
  number,
  label,
  scale,
  editable,
  canManage,
  index,
  total,
}: {
  magazineId: string;
  pageId: string;
  pageType: PageTypeKey;
  number: number;
  label: string;
  scale: number;
  editable: boolean;
  canManage: boolean;
  index: number;
  total: number;
}) {
  const selected = useMagazineStore(
    (s) => s.magazines.find((m) => m.id === magazineId)?.pages.find((p) => p.id === pageId)?.selectedForPublish ?? true
  );
  const setPageSelected = useMagazineStore((s) => s.setPageSelected);
  const addPage = useMagazineStore((s) => s.addPage);
  const deletePage = useMagazineStore((s) => s.deletePage);
  const movePage = useMagazineStore((s) => s.movePage);

  return (
    <div className="flex flex-col items-center" data-page-id={pageId}>
      <div
        className="mb-1.5 flex items-center gap-2 text-white/60"
        style={{ width: PAGE_W * scale }}
      >
        <span className="text-[11px] font-semibold tabular-nums">
          {String(number).padStart(2, '0')} · {label}
        </span>
        {!editable && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/35">
            <Lock size={10} /> Read-only
          </span>
        )}
        {canManage && (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => movePage(magazineId, pageId, -1)}
                className="rounded-sm border border-white/15 p-1 text-white/60 hover:bg-white/10 hover:text-white/90 disabled:opacity-25"
                aria-label="Move page up"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                disabled={index === total - 1}
                onClick={() => movePage(magazineId, pageId, 1)}
                className="rounded-sm border border-white/15 p-1 text-white/60 hover:bg-white/10 hover:text-white/90 disabled:opacity-25"
                aria-label="Move page down"
              >
                <ChevronDown size={12} />
              </button>
              <PageTypePicker label="Insert below" onPick={(t) => addPage(magazineId, t, index + 1)} />
              <button
                type="button"
                disabled={total <= 1}
                onClick={() => deletePage(magazineId, pageId)}
                className="rounded-sm border border-white/15 p-1 text-white/50 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-25"
                aria-label="Delete page"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPageSelected(magazineId, pageId, !selected)}
              className={cn(
                'flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                selected
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/15 text-white/40 hover:text-white/70'
              )}
            >
              <span
                className={cn(
                  'flex h-3 w-3 items-center justify-center rounded-[3px] border',
                  selected ? 'border-emerald-400 bg-emerald-500' : 'border-white/30'
                )}
              >
                {selected && <Check size={9} className="text-white" />}
              </span>
              Include in publish
            </button>
          </div>
        )}
      </div>
      {editable ? (
        <EditPageHost magazineId={magazineId} pageId={pageId} pageType={pageType} scale={scale} />
      ) : (
        <ViewPageHost magazineId={magazineId} pageId={pageId} pageType={pageType} scale={scale} />
      )}
    </div>
  );
}

export function MagazineCanvas({ magazineId, scale }: { magazineId: string; scale: number }) {
  const metas = useMagazineStore((s) => {
    const m = s.magazines.find((x) => x.id === magazineId);
    return m ? m.pages.map((p) => ({ id: p.id, pageType: p.pageType, number: p.number, label: p.label })) : [];
  });
  const access = useMagazineStore((s) => s.access[magazineId]);
  const select = useMagazineStore((s) => s.select);
  const addPage = useMagazineStore((s) => s.addPage);

  const editableIds = access?.editablePageIds ?? 'all';
  const canManage = access?.role === 'owner'; // structural ops + publish-selection are owner-only
  const isEditable = (pageId: string) => editableIds === 'all' || editableIds.includes(pageId);

  // Collaborators scoped to specific pages only see those pages; the owner and
  // anyone granted all pages see the whole magazine.
  const visibleMetas = editableIds === 'all' ? metas : metas.filter((m) => editableIds.includes(m.id));

  return (
    <div
      className="flex flex-col items-center gap-9 px-6 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) select(null);
      }}
    >
      {visibleMetas.map((m, i) => (
        <CanvasPage
          key={m.id}
          magazineId={magazineId}
          pageId={m.id}
          pageType={m.pageType}
          number={m.number}
          label={m.label}
          scale={scale}
          editable={isEditable(m.id)}
          canManage={canManage}
          index={i}
          total={visibleMetas.length}
        />
      ))}
      {canManage && (
        <div style={{ width: PAGE_W * scale }} className="flex justify-center">
          <div className="flex items-center gap-2 rounded-sm border border-dashed border-white/20 px-4 py-3">
            <span className="text-[11px] text-white/40">Add a page to the end</span>
            <PageTypePicker label="Add page" align="left" onPick={(t) => addPage(magazineId, t)} />
          </div>
        </div>
      )}
    </div>
  );
}
