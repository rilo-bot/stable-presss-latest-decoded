/**
 * Public read-only magazine viewer (/bulletins/:id). Fetches a published issue
 * from the server and renders its pages using the exact same locked page-template
 * components as the editor, with editing disabled — so readers everywhere see the
 * magazine with its real design. Issues are self-contained (images referenced by
 * URL inside the page content), so no access to the editor's draft store is needed.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIssueStore } from '@/stores/issueStore';
import { useEditorFonts } from '@/editor/fonts/useEditorFonts';
import { EditorProvider } from '@/editor/EditorContext';
import { PAGE_COMPONENTS } from '@/editor/templates/registry';
import { PAGE_W, PAGE_H } from '@/editor/templates/parts';
import type { MagazinePage } from '@/types/magazine';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { ArrowLeft, BookOpen, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function ReadonlyPage({ page, maxWidth }: { page: MagazinePage; maxWidth: number }) {
  const Comp = PAGE_COMPONENTS[page.pageType];
  const ctx = useMemo(() => ({ mode: 'view' as const, viewContent: page.content }), [page.content]);
  const scale = Math.min(1, maxWidth / PAGE_W);
  return (
    <div
      style={{ width: PAGE_W * scale, height: PAGE_H * scale }}
      className="bulletin-print-page shadow-[0_10px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/10"
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

  const issue = useIssueStore((s) => (id ? s.byId[id] : undefined));
  const fetchIssue = useIssueStore((s) => s.fetchIssue);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>(issue ? 'ready' : 'loading');

  useEffect(() => {
    if (!id) {
      setStatus('notfound');
      return;
    }
    let active = true;
    fetchIssue(id).then((res) => {
      if (active) setStatus(res ? 'ready' : 'notfound');
    });
    return () => {
      active = false;
    };
  }, [id, fetchIssue]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState(PAGE_W);

  // PDF export: the server renders this very route in headless Chromium and
  // streams back a real A4 PDF (see GET /api/issues/:id/pdf). We just fetch it
  // and trigger a download — no client-side rasterization, so the magazine
  // layout is reproduced exactly.
  const [exporting, setExporting] = useState(false);
  // Marker the server's renderer waits for: set once the issue, its web fonts,
  // and its images have finished loading, so nothing is captured half-painted.
  const [printReady, setPrintReady] = useState(false);

  const handleDownload = async () => {
    if (exporting || !issue || !id) return;
    setExporting(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(apiUrl(`/api/issues/${id}/pdf`), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${(issue.title || 'bulletin').replace(/[^\w-]+/g, '-').replace(/-+/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Bulletin PDF download failed', err);
      toast.error('Could not generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setMaxWidth(Math.min(PAGE_W, el.clientWidth - 4));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  // Signal print-readiness for the server-side renderer: wait for the issue to
  // be rendered, web fonts to load, and every page image to finish.
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    (async () => {
      try {
        await (document as Document).fonts?.ready;
      } catch {
        /* fonts API unavailable — proceed anyway */
      }
      const el = containerRef.current;
      if (el) {
        const imgs = Array.from(el.querySelectorAll('img'));
        await Promise.all(
          imgs
            .filter((img) => !img.complete || img.naturalWidth === 0)
            .map(
              (img) =>
                new Promise<void>((resolve) => {
                  img.addEventListener('load', () => resolve(), { once: true });
                  img.addEventListener('error', () => resolve(), { once: true });
                }),
            ),
        );
      }
      if (!cancelled) setPrintReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <BookOpen className="mr-2 animate-pulse" size={18} /> Loading bulletin…
      </div>
    );
  }

  if (status === 'notfound' || !issue) {
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
    <div className="min-h-screen bg-white" data-bulletin-ready={printReady ? 'true' : undefined}>
      {/* Print rules: render each page at natural A4 size, one per sheet, with the
          screen chrome and scaling removed. These are what the "Download PDF" button
          uses — the server prints this exact route in headless Chromium — and they
          also apply to native browser print (Ctrl+P). */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; }
          .bulletin-print-container { max-width: none !important; margin: 0 !important; padding: 0 !important; gap: 0 !important; display: block !important; }
          .bulletin-print-page { width: ${PAGE_W}px !important; height: ${PAGE_H}px !important; box-shadow: none !important; overflow: hidden !important; }
          .bulletin-print-page > div { transform: none !important; }
          .bulletin-print-page:not(:last-child) { break-after: page; page-break-after: always; }
        }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-black/10 bg-[#0a2342] text-white print:hidden">
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
          <button
            onClick={handleDownload}
            disabled={exporting}
            className="ml-auto flex flex-shrink-0 items-center gap-1.5 rounded-sm border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            title="Download this edition as a PDF"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Pages */}
      <div ref={containerRef} className="bulletin-print-container mx-auto flex max-w-[820px] flex-col items-center gap-6 px-3 py-8">
        {issue.pages.map((p) => (
          <ReadonlyPage key={p.id} page={p} maxWidth={maxWidth} />
        ))}
      </div>
    </div>
  );
}
