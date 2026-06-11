/**
 * Public read-only magazine viewer (/bulletins/:id). Renders a published issue's
 * pages using the exact same locked page-template components as the editor, with
 * editing disabled — so readers see the magazine with its real design.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorFonts } from '@/editor/fonts/useEditorFonts';
import { EditorProvider } from '@/editor/EditorContext';
import { PAGE_COMPONENTS } from '@/editor/templates/registry';
import { PAGE_W, PAGE_H } from '@/editor/templates/parts';
import type { MagazinePage } from '@/types/magazine';
import { ArrowLeft, BookOpen } from 'lucide-react';

function useHydrated() {
  const [hydrated, setHydrated] = useState(() => useMagazineStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsub = useMagazineStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);
  return hydrated;
}

function ReadonlyPage({ page, maxWidth }: { page: MagazinePage; maxWidth: number }) {
  const Comp = PAGE_COMPONENTS[page.pageType];
  const ctx = useMemo(() => ({ mode: 'view' as const, viewContent: page.content }), [page.content]);
  const scale = Math.min(1, maxWidth / PAGE_W);
  return (
    <div
      style={{ width: PAGE_W * scale, height: PAGE_H * scale }}
      className="shadow-[0_10px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/10"
    >
      <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <EditorProvider value={ctx}>
          <Comp />
        </EditorProvider>
      </div>
    </div>
  );
}

export default function BulletinViewer() {
  useEditorFonts();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const issue = useMagazineStore((s) => (id ? s.issues.find((i) => i.id === id) : undefined));

  const containerRef = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState(PAGE_W);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setMaxWidth(Math.min(PAGE_W, el.clientWidth - 4));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <BookOpen className="mr-2 animate-pulse" size={18} /> Loading bulletin…
      </div>
    );
  }

  if (!issue || issue.unpublishedAt) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
          This bulletin isn’t available
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          It may have been unpublished or the link is incorrect.
        </p>
        <Link to="/bulletins" className="mt-6 inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Back to Bulletins
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-black/10 bg-[#0a2342] text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <button onClick={() => navigate('/bulletins')} className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white">
            <ArrowLeft size={14} /> All bulletins
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{issue.title}</p>
            <p className="truncate text-[11px] text-white/50">
              {issue.edition} · {issue.pages.length} page{issue.pages.length !== 1 ? 's' : ''}
              {issue.scope === 'selected' ? ' · selected pages' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Pages */}
      <div ref={containerRef} className="mx-auto flex max-w-[820px] flex-col items-center gap-6 px-3 py-8">
        {issue.pages.map((p) => (
          <ReadonlyPage key={p.id} page={p} maxWidth={maxWidth} />
        ))}
      </div>
    </div>
  );
}
