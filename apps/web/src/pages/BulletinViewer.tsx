/**
 * Public read-only magazine viewer (/bulletins/:id).
 *
 * Renders a published issue with `IssuePageCanvas` — the SAME canvas the Magazine
 * Builder editor and the Puppeteer PDF export use, so what a reader sees, what the
 * designer built, and what prints are one renderer with no drift.
 *
 * An issue is self-contained: every image is referenced by URL inside the frozen
 * element payload, so the reader needs no access to the draft.
 *
 * A second renderer used to live here for v1 template issues — a
 * `PAGE_COMPONENTS[page.pageType]` lookup inside an `EditorProvider`, chosen off
 * the issue's `builder` discriminator. The v1 template builder is gone, and so is
 * that branch.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIssueStore } from '@/stores/issueStore';
import { useEditorFonts } from '@/lib/fonts/useEditorFonts';
import { IssuePageCanvas } from '@/editor-v2/IssuePageCanvas';
import type { IssuePageData } from '@/editor-v2/model';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useReactionStore } from '@/stores/reactionStore';
import { ReactionBar } from '@/components/ReactionBar';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { ArrowLeft, BookOpen, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Fallback page dims when an issue somehow carries none — the canonical generated
 * page (**A4 portrait at 150 DPI**), matching PAGE_W/PAGE_H in the server's
 * magazineV2 config. Uploaded pages, and pages generated before the switch to A4,
 * carry whatever size they were made at, so NOTHING here may assume a fixed sheet:
 * every page is measured from its own box (see pageBox / pageInches).
 */
const FALLBACK_W = 1240;
const FALLBACK_H = 1754;

/**
 * DPI the page pixels are measured at. Generated pages are A4 at 150 DPI
 * (1240×1754), and the PDF extractor rasterises uploads at the same 150
 * (`RENDER_DPI` in apps/worker/src/lib/pdf.ts), so one constant converts either
 * kind of page to a physical size — including older Letter-sized pages, which is
 * why this is a DPI and not a sheet.
 *
 * This matters because a browser treats a bare `px` as a CSS pixel — 1/96 inch —
 * so printing a 1240px-wide box lands on a 12.9-inch sheet. Divide by 150 instead
 * and it lands on the 8.27 inches the page was designed as.
 */
const RASTER_DPI = 150;

/** A page's own pixel box, defaulting only if the snapshot is missing dims. */
function pageBox(page: IssuePageData | undefined): { w: number; h: number } {
  return {
    w: Number(page?.width) > 0 ? Number(page!.width) : FALLBACK_W,
    h: Number(page?.height) > 0 ? Number(page!.height) : FALLBACK_H,
  };
}

/** The page's PHYSICAL size, for `@page` and the print box. */
function pageInches(page: IssuePageData | undefined): { w: string; h: string } {
  const box = pageBox(page);
  return { w: `${(box.w / RASTER_DPI).toFixed(4)}in`, h: `${(box.h / RASTER_DPI).toFixed(4)}in` };
}

// Pages are free-form: absolutely-positioned elements in the page's own canonical
// dims. The canvas is width-responsive via container queries, so on screen the
// wrapper only needs a width and its height resolves from the page's aspect.
//
// In PRINT it needs both, from THIS page — see the @media print block below for
// why a shared constant was wrong.
function ReadonlyPage({ page, maxWidth }: { page: IssuePageData; maxWidth: number }) {
  const inches = pageInches(page);
  return (
    <div
      className="bulletin-print-page shadow-[0_10px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/10"
      // `--page-w/h` are consumed only inside @media print; on screen the explicit
      // width governs and the canvas resolves its own height from the page aspect.
      style={{ width: maxWidth, ['--page-w' as string]: inches.w, ['--page-h' as string]: inches.h }}
    >
      <IssuePageCanvas page={page} />
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

  // Reader reactions on the edition. Re-runs when the signed-in account changes,
  // because `mine` — which pick is yours — belongs to the account, not the
  // browser.
  const viewerId = useAuthStore((s) => s.currentUser?.id);
  const loadReactions = useReactionStore((s) => s.load);
  const issueLive = Boolean(issue && !issue.unpublishedAt);
  useEffect(() => {
    if (id && issueLive) void loadReactions('bulletin', id);
  }, [id, issueLive, viewerId, loadReactions]);

  const containerRef = useRef<HTMLDivElement>(null);
  // Never scale a page UP past its own canonical width — that would enlarge the
  // raster of an uploaded page. Seeded from the fallback and clamped to the real
  // first page once the issue arrives.
  const [maxWidth, setMaxWidth] = useState(FALLBACK_W);

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
    const cap = pageBox(issue?.pages?.[0]).w;
    const measure = () => setMaxWidth(Math.min(cap, el.clientWidth - 4));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // `cap` comes from the first page, so re-measure when the issue itself arrives
    // — not only on a status change, which is when this last read a constant.
  }, [status, issue?.pages]);

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
      {/*
        Print sizing comes from EACH PAGE's own box, in INCHES (the `--page-w/h`
        custom properties set by ReadonlyPage), with `@page` sized to match.

        Two bugs were fixed here, and they compounded:

        1. WRONG ASPECT. This was a pair of hard-coded constants — 794×1123, the v1
           template builder's A4-at-96dpi page — applied to every page of every
           issue, beside `@page { size: A4 portrait }`. Exactly right for v1, wrong
           for everything this builder makes: a generated page is 1275×1650 (US
           Letter at 150 DPI, aspect 0.773) and an uploaded page is whatever the
           extractor rasterised. Forcing 0.773 into 0.707 left dead sheet under
           every page, and `overflow: hidden` clipped whatever an upload put there.

        2. WRONG PHYSICAL SIZE. Sizing the box in `px` is not the fix on its own: a
           browser reads bare px as CSS px (1/96in), so a 1275px page prints on a
           13.3-inch sheet — right shape, unusable paper. Dividing by the 150 DPI
           the pixels were measured at gives the 8.5×11in the page was designed as.

        The element positions inside the canvas are percentages and its font sizes
        are `cqw`, so both scale with the container — sizing it in inches rescales
        the whole page cleanly rather than reflowing it.
      */}
      <style>{`
        @media print {
          @page { size: var(--page-w, 8.5in) var(--page-h, 11in); margin: 0; }
          html, body { background: #fff !important; }
          .bulletin-print-container { max-width: none !important; margin: 0 !important; padding: 0 !important; gap: 0 !important; display: block !important; }
          .bulletin-print-page { width: var(--page-w) !important; height: var(--page-h) !important; box-shadow: none !important; overflow: hidden !important; }
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

      {/* Pages — one renderer, shared with the editor and the PDF export. */}
      <div ref={containerRef} className="bulletin-print-container mx-auto flex max-w-[820px] flex-col items-center gap-6 px-3 py-8">
        {issue.pages.map((p) => (
          <ReadonlyPage key={p.index} page={p} maxWidth={maxWidth} />
        ))}
      </div>

      {/* The reader's verdict on the edition as a whole — an issue is one thing
          you finish, not a set of pages you rate.

          `print:hidden`, like the header: the server prints this very route to
          produce the downloadable PDF, and a row of reaction tiles bound at the
          back of a magazine would be in every copy. */}
      {/* Not on a PULLED edition. Staff can still open one here, but the server
          refuses to record against it, so offering the scale would look broken
          rather than closed. */}
      {!issue.unpublishedAt && (
        <div className="mx-auto max-w-[820px] px-4 pb-14 print:hidden">
          <ReactionBar
            targetType="bulletin"
            targetId={issue.id}
            idPrefix="bulletin-reactions"
            heading="How did this edition sit with you?"
            note="One reaction per reader, on the issue as a whole. You can change it any time."
          />
          {/* Inside the same `print:hidden` wrapper as the bar, and that matters
              here more than anywhere: the server prints this very route to produce
              the downloadable PDF, so a comment thread would be bound into the
              back of every copy of the magazine. */}
          <CommentsSection
            targetType="bulletin"
            targetId={issue.id}
            idPrefix="bulletin-comments"
            heading="What readers made of this edition"
            noun="edition"
          />
        </div>
      )}
    </div>
  );
}
