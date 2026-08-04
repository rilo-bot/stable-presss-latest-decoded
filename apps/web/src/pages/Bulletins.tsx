import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useIssueStore } from '@/stores/issueStore';
import { BookOpen, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * /bulletins — the newsstand.
 *
 * This page is MAGAZINES, and only magazines. A published issue is a frozen
 * snapshot of selected magazine pages in the `issues` collection, and both
 * builders — v1 (`magazines`) and v2 (`magazinesV2`) — freeze into it, so one
 * grid covers both.
 *
 * It used to be two pages wearing one URL. Below the newsstand sat a full second
 * implementation — category filter bar, search box, hero story, sections grouped
 * by editorial section — that listed *articles* carrying a `bulletin`
 * distribution channel, rendered only when `publishedIssues.length === 0`. So
 * roughly 200 lines of this file were reachable only before the first issue was
 * ever published, and dead forever after.
 *
 * The `channels` axis is gone (a published story is news), so that half went with
 * it, and with it the category bar and search — neither of which ever filtered
 * the issues they sat above. An empty newsstand now says so, rather than falling
 * through to a different page.
 */
export default function Bulletins() {
  // The list endpoint already returns non-unpublished issues, newest first.
  const publishedIssues = useIssueStore((s) => s.issues);
  const fetchIssues = useIssueStore((s) => s.fetchIssues);
  // Real fetch state — so an empty newsstand reads as "none yet" rather than
  // flashing the empty state while the request is still in flight.
  const loading = useIssueStore((s) => !s.loaded && !s.error);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Broadsheet masthead ──────────────────────── */}
      <div
        className="relative w-full overflow-hidden"
        style={{ background: 'hsl(150 34% 9%)' }}
      >
        {/* A hotlinked Pexels crowd photo sat here at 40% opacity behind a scrim —
            third-party stock, inline in the JSX, presented as this publication's
            own masthead imagery. At 40% under a 0.92→0.28 gradient it contributed
            almost nothing but the request. The broadsheet column rules below are
            the masthead's texture; they are ours and they cost nothing. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, hsl(150 36% 7% / 0.92) 0%, hsl(150 36% 7% / 0.60) 55%, hsl(150 36% 7% / 0.28) 100%)',
          }}
        />

        {/* Broadsheet column rules overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.05 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-primary-foreground"
              style={{ left: `${(i / 6) * 100}%` }}
            />
          ))}
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-16">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-primary-foreground/50 mb-6">
            <Link to="/" className="hover:text-primary-foreground/80 transition-colors">
              Home
            </Link>
            <ChevronRight size={10} />
            <span className="text-primary-foreground/80">Print Bulletin</span>
          </nav>

          {/* Masthead rule */}
          <div className="mb-6">
            <div
              className="h-[2px] w-full mb-4"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, hsl(var(--brand-accent)) 30%, hsl(var(--brand-accent)) 70%, transparent 100%)',
              }}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-end">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] font-bold px-2.5 py-1"
                    style={{
                      background: 'hsl(var(--brand-accent))',
                      color: 'hsl(var(--brand-accent-foreground))',
                    }}
                  >
                    <BookOpen size={10} />
                    Stable Press
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-primary-foreground/50">
                    Print Bulletin
                  </span>
                </div>

                <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-6xl font-bold text-primary-foreground leading-[1.02] mb-3 italic">
                  The Bulletin
                </h1>
                <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-lg">
                  Longform, curated thoroughbred racing intelligence — published in print and
                  distributed to members of the Stable Press community.
                </p>
              </div>

              {/* Edition stats.
                  Both figures are LIVE counts off the published issues. This tile
                  used to read "Fortnightly / Bi-Weekly" beside a piece count taken
                  from the bulletin-channel article list — a cadence nothing
                  schedules, next to a number that counted the wrong thing. (A
                  fabricated "Vol. 47" was removed before that.) */}
              <div className="flex flex-wrap gap-6 lg:justify-end">
                {[
                  {
                    label: 'Editions',
                    value: String(publishedIssues.length),
                  },
                  {
                    label: 'Pages in print',
                    value: String(
                      publishedIssues.reduce((n, i) => n + (i.pageCount ?? 0), 0),
                    ),
                  },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <span
                      className="block font-[family-name:var(--font-display)] text-2xl font-bold italic"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      {s.value}
                    </span>
                    <span className="block text-[9px] uppercase tracking-[0.14em] text-primary-foreground/50 mt-0.5">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div
              className="h-[2px] w-full mt-6"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, hsl(var(--brand-accent)) 30%, hsl(var(--brand-accent)) 70%, transparent 100%)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── The newsstand ────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-shrink-0 w-1 h-5 rounded-full" style={{ background: 'hsl(var(--brand-accent))' }} />
          <h2 className="font-[family-name:var(--font-display)] text-xl md:text-2xl font-bold text-foreground">
            Bulletin Editions
          </h2>
          {publishedIssues.length > 0 && (
            <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {publishedIssues.length} issue{publishedIssues.length !== 1 ? 's' : ''}
            </span>
          )}
          <div className="flex-1 h-px bg-border/50" />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-sm overflow-hidden border border-border/60 bg-card animate-pulse">
                <div className="aspect-[3/4] bg-muted" />
                <div className="p-3 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-2 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : publishedIssues.length === 0 ? (
          /* No issues yet. Says so plainly — this used to fall through to a
             second, article-driven page instead. */
          <div className="rounded-sm border border-border/60 bg-card px-6 py-14 text-center">
            <BookOpen size={28} className="mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground mb-1.5">
              No editions published yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              The first Bulletin edition will appear here as soon as it goes to press. In the
              meantime, the newsroom publishes daily to the editorial desk.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-5 text-xs">
              <Link to="/news">Browse editorial</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {publishedIssues.map((issue) => {
              const cover = issue.coverImageUrl;
              return (
                <Link
                  key={issue.id}
                  to={`/bulletins/${issue.id}`}
                  className="group block rounded-sm overflow-hidden border border-border/60 bg-card hover:border-primary/40 transition-colors"
                >
                  <div className="aspect-[3/4] overflow-hidden bg-muted relative">
                    {cover ? (
                      <img
                        src={cover}
                        alt={issue.title}
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <BookOpen size={32} />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-sm text-white" style={{ background: 'hsl(var(--brand-accent))' }}>
                      {issue.pageCount} pages
                    </span>
                  </div>
                  <div className="p-3">
                    <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {issue.title}
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{issue.edition}</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-primary">
                      Read edition <ChevronRight size={11} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* A "Race Venues" band sat here: five hardcoded racecourses (Flemington,
          Randwick, Eagle Farm, Morphettville, Ascot) under the label "Featured in
          this edition", on a page that knows nothing about which venues an edition
          covers. Deleted along with pages/bulletins/ — that directory held only
          the venue constant plus a SECTION_ICONS / SECTION_IMAGES pair (three more
          hotlinked Pexels URLs) left dead when the article-driven half of this
          page was removed. A venue strip here has to be built from the venues an
          issue actually names. */}

      {/* ── Subscribe band ───────────────────────────── */}
      <div
        className="border-t border-border/50 mt-8"
        style={{ background: 'hsl(var(--primary))' }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <div
              className="w-8 h-[2px] mb-4"
              style={{ background: 'hsl(var(--brand-accent))' }}
            />
            {/* "fortnightly" dropped from both lines: nothing schedules an edition,
                so the cadence was a promise the product could not keep. */}
            <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold italic text-primary-foreground leading-tight mb-2">
              Receive the Bulletin in print.
            </h2>
            <p className="text-sm text-primary-foreground/70 leading-relaxed">
              Every edition of the Stable Press print bulletin, delivered to members — longform
              intelligence for the serious thoroughbred follower.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              asChild
              size="lg"
              className="flex-1 text-sm font-semibold"
              style={{
                background: 'hsl(var(--brand-accent))',
                color: 'hsl(var(--brand-accent-foreground))',
              }}
            >
              <Link to="/signup">Become a Member</Link>
            </Button>
            {/* Was "Newsletter Edition" → /newsletter, a page that no longer
                exists. Editorial is the real second destination. */}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="flex-1 text-sm border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
            >
              <Link to="/news">Browse Editorial</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
