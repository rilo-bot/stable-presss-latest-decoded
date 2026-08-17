/**
 * "Print Bulletins" — the newsstand's two most recent editions.
 *
 * THE COVER IS NOW VISIBLE. It was painted at `opacity-20` over a green field, with
 * the edition line and the title set on top of it: a print magazine's cover, the one
 * thing a bulletin has to sell itself with, rendered as a 20% ghost behind its own
 * headline. The fix is not a higher opacity — it is to stop overlaying type on the
 * cover at all. The cover sits in its own panel at full strength and the words sit
 * beside it, so nothing needs a scrim and nothing is dimmed.
 *
 * NO SUBSTITUTE COVER. An edition with no cover image gets a frame that says so, the
 * same rule the horse cards and the party cards follow — a stand-in cover would
 * misrepresent the edition it is standing in for.
 *
 * These were half-width cards in the 2/3 column; the block runs full width now, which
 * is what allows a cover-beside-detail layout to fit two across.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronRight } from 'lucide-react';
import type { IssueSummary } from '@/types/magazine';
import { SectionHead } from './SectionHead';

interface LandingBulletinsProps {
  publishedIssues: IssueSummary[];
}

export function LandingBulletins({ publishedIssues }: LandingBulletinsProps) {
  return (
    <section id="bulletins">
      <SectionHead title="Print Bulletins" to="/bulletins" linkLabel="All bulletins" />

      {publishedIssues.length > 0 ? (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {publishedIssues.map((issue) => (
            <li key={issue.id}>
              <Link
                to={`/bulletins/${issue.id}`}
                className="group flex h-full overflow-hidden rounded-sm border border-border bg-card transition-colors hover:border-primary/40"
                aria-label={`Read bulletin: ${issue.title}`}
              >
                {/* ── The cover, at full strength ── */}
                <div className="relative w-32 flex-shrink-0 overflow-hidden bg-muted/40 sm:w-40">
                  {issue.coverImageUrl ? (
                    <img
                      src={issue.coverImageUrl}
                      alt={`Cover of ${issue.title}`}
                      crossOrigin="anonymous"
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
                    />
                  ) : (
                    <span
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-muted-foreground/40"
                      aria-hidden="true"
                    >
                      <BookOpen size={20} strokeWidth={1.5} />
                      <span className="text-[11px] leading-tight tracking-[0.06em]">
                        No cover on record
                      </span>
                    </span>
                  )}
                </div>

                {/* ── The edition ── */}
                <div className="flex min-w-0 flex-1 flex-col p-5">
                  <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span
                      className="inline-block px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{
                        background: 'hsl(var(--brand-accent))',
                        color: 'hsl(var(--brand-accent-foreground))',
                      }}
                    >
                      Print Edition
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      {issue.edition}
                    </span>
                  </div>

                  <h3 className="font-[family-name:var(--font-display)] text-lg md:text-xl font-bold leading-snug text-foreground line-clamp-3 group-hover:text-primary transition-colors">
                    {issue.title}
                  </h3>

                  <p className="mt-2 text-[13px] text-muted-foreground">
                    {new Date(issue.publishedAt).toLocaleDateString('en-AU', {
                      month: 'long',
                      year: 'numeric',
                    })}
                    {' · '}
                    {issue.pageCount} page{issue.pageCount === 1 ? '' : 's'}
                  </p>

                  <span className="mt-auto flex items-center gap-1 pt-4 text-[13px] font-semibold text-primary">
                    Read full bulletin <ChevronRight size={13} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-10 text-center border border-dashed border-border/60 rounded-sm">
          <p className="font-[family-name:var(--font-display)] text-sm text-muted-foreground italic">
            No bulletins have been published yet.
          </p>
          <Link
            to="/bulletins"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Browse bulletins <ArrowRight size={11} />
          </Link>
        </div>
      )}

      {/* A dashed "The Print Bulletin — delivered to subscribers" prompt sat here,
          with Browse Editorial / Browse Bulletins buttons. Both destinations are in
          the nav, in the footer, AND in this section's own header link three rows
          up, and it was the third subscribe-shaped card on a page that had six.
          Removed with the other two — see the note in LandingSidebar.tsx.

          "Delivered to subscribers" was also untrue: nothing is posted. The FAQ in
          LandingMembership.tsx now says so in as many words. */}
    </section>
  );
}
