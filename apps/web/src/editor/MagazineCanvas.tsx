/**
 * Scrollable stack of magazine pages for the editor. Each page subtree is
 * memoized and wrapped in a content-visibility container so offscreen pages
 * skip layout/paint and editing one region never re-renders the others.
 */

import { memo, useMemo, type ReactNode } from 'react';
import { useMagazineStore } from '@/stores/magazineStore';
import { EditorProvider } from './EditorContext';
import { PAGE_COMPONENTS } from './templates/registry';
import { PAGE_W, PAGE_H } from './templates/parts';
import type { PageTypeKey } from '@/types/magazine';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

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

function CanvasPage({
  magazineId,
  pageId,
  pageType,
  number,
  label,
  scale,
}: {
  magazineId: string;
  pageId: string;
  pageType: PageTypeKey;
  number: number;
  label: string;
  scale: number;
}) {
  const selected = useMagazineStore(
    (s) => s.magazines.find((m) => m.id === magazineId)?.pages.find((p) => p.id === pageId)?.selectedForPublish ?? true
  );
  const setPageSelected = useMagazineStore((s) => s.setPageSelected);

  return (
    <div className="flex flex-col items-center">
      <div
        className="mb-1.5 flex items-center gap-3 text-white/60"
        style={{ width: PAGE_W * scale }}
      >
        <span className="text-[11px] font-semibold tabular-nums">
          {String(number).padStart(2, '0')} · {label}
        </span>
        <button
          type="button"
          onClick={() => setPageSelected(magazineId, pageId, !selected)}
          className={cn(
            'ml-auto flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-semibold transition-colors',
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
      <EditPageHost magazineId={magazineId} pageId={pageId} pageType={pageType} scale={scale} />
    </div>
  );
}

export function MagazineCanvas({ magazineId, scale }: { magazineId: string; scale: number }) {
  const metas = useMagazineStore((s) => {
    const m = s.magazines.find((x) => x.id === magazineId);
    return m ? m.pages.map((p) => ({ id: p.id, pageType: p.pageType, number: p.number, label: p.label })) : [];
  });
  const select = useMagazineStore((s) => s.select);

  return (
    <div
      className="flex flex-col items-center gap-9 px-6 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) select(null);
      }}
    >
      {metas.map((m) => (
        <CanvasPage
          key={m.id}
          magazineId={magazineId}
          pageId={m.id}
          pageType={m.pageType}
          number={m.number}
          label={m.label}
          scale={scale}
        />
      ))}
    </div>
  );
}
