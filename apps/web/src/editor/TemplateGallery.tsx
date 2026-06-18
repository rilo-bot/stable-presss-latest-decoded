/**
 * TemplateGallery — shown when staff click "New Magazine". Lists every starter
 * template; picking one assembles its pages and opens the builder (same flow as
 * before, just seeded from the chosen template).
 *
 * Each card shows a LIVE preview of the template's first page, rendered through
 * the exact same locked page component the editor/viewer use (read-only), so the
 * thumbnail can never drift from the real layout.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorProvider } from './EditorContext';
import { useEditorFonts } from './fonts/useEditorFonts';
import { PAGE_COMPONENTS } from './templates/registry';
import { BLUEPRINT_BY_TYPE } from './templates/blueprints';
import { PAGE_W, PAGE_H } from './templates/parts';
import { MAGAZINE_TEMPLATES, type MagazineTemplate } from './templates/galleryTemplates';
import type { PageTypeKey } from '@/types/magazine';
import { Button } from '@/components/ui/button';
import { X, Loader2, FileText, ArrowRight } from 'lucide-react';

const THUMB_W = 92; // px — one mini page; height follows the A4 ratio
const THUMB_SCALE = THUMB_W / PAGE_W;
const THUMB_H = PAGE_H * THUMB_SCALE;

/** A single mini page rendered through the real (read-only) page component. */
function PageThumb({ pageType }: { pageType: PageTypeKey }) {
  const Comp = PAGE_COMPONENTS[pageType];
  const content = BLUEPRINT_BY_TYPE[pageType]?.defaultContent ?? {};
  const ctx = useMemo(() => ({ mode: 'view' as const, viewContent: content }), [content]);

  return (
    <div
      style={{ width: THUMB_W, height: THUMB_H, contentVisibility: 'auto', containIntrinsicSize: `${THUMB_W}px ${THUMB_H}px` }}
      className="flex-shrink-0 overflow-hidden rounded-[2px] bg-white shadow-sm ring-1 ring-black/10"
      aria-hidden
    >
      {Comp && (
        <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${THUMB_SCALE})`, transformOrigin: 'top left' }}>
          <EditorProvider value={ctx}>
            <Comp />
          </EditorProvider>
        </div>
      )}
    </div>
  );
}

/** Representative pages so each template's strip looks distinct: first / middle /
 *  last (covers are identical across templates, so the cover alone can't tell them
 *  apart). Shorter templates show all their pages. */
function representativePages(types: PageTypeKey[]): PageTypeKey[] {
  if (types.length <= 3) return types;
  return [types[0], types[Math.floor(types.length / 2)], types[types.length - 1]];
}

function TemplatePreview({ pageTypes }: { pageTypes: PageTypeKey[] }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {representativePages(pageTypes).map((t, i) => (
        <PageThumb key={`${t}-${i}`} pageType={t} />
      ))}
    </div>
  );
}

export function TemplateGallery({
  onPick,
  onClose,
}: {
  onPick: (template: MagazineTemplate) => Promise<void> | void;
  onClose: () => void;
}) {
  useEditorFonts();
  const [pickingId, setPickingId] = useState<string | null>(null);
  const busy = pickingId !== null;

  // Lock background scroll + close on Escape (unless a create is in flight).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pickingId === null) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [pickingId, onClose]);

  const handlePick = async (t: MagazineTemplate) => {
    if (busy) return;
    setPickingId(t.id);
    try {
      await onPick(t);
      // On success the parent navigates away and this unmounts; if it returns
      // without navigating (e.g. create failed) we re-enable the gallery.
      setPickingId(null);
    } catch {
      setPickingId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a magazine template"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="mx-auto my-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
              Start a new magazine
            </h2>
            <p className="text-sm text-muted-foreground">
              Pick a template to begin — you can add, remove and reorder pages once you’re in the studio.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Template grid — centered wrap so a single template looks intentional
            and more templates flow in neatly once added. */}
        <div className="flex flex-wrap justify-center gap-5 overflow-y-auto px-6 py-6">
          {MAGAZINE_TEMPLATES.map((t) => {
            const isPicking = pickingId === t.id;
            return (
              <div
                key={t.id}
                className="group flex w-[340px] flex-col overflow-hidden rounded-md border border-border/70 bg-card transition-shadow hover:shadow-lg"
              >
                {/* Live preview strip — representative pages of this template */}
                <div className="relative flex justify-center border-b border-border/50 bg-muted/30 px-4 py-5">
                  <TemplatePreview pageTypes={t.pageTypes} />
                  {isPicking && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="animate-spin text-primary" size={26} />
                    </div>
                  )}
                </div>

                {/* Meta */}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
                      {t.name}
                    </h3>
                    <span className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      <FileText size={11} /> {t.pageTypes.length}p
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t.description}</p>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground/70">
                    <span className="font-semibold text-muted-foreground/90">Includes: </span>
                    {(() => {
                      const labels = t.pageTypes.map((pt) => BLUEPRINT_BY_TYPE[pt]?.label ?? pt);
                      const head = labels.slice(0, 3).join(' · ');
                      return labels.length > 3 ? `${head} · +${labels.length - 3} more` : head;
                    })()}
                  </p>
                  <Button
                    size="sm"
                    className="mt-auto w-full gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => handlePick(t)}
                    disabled={busy}
                  >
                    {isPicking ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Creating…
                      </>
                    ) : (
                      <>
                        Use this template <ArrowRight size={13} />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
