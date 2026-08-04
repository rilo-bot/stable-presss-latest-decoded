import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {publishedIssues.map((issue) => (
            <Link
              key={issue.id}
              to={`/bulletins/${issue.id}`}
              className="relative border border-border/60 rounded-sm overflow-hidden group hover:border-primary/40 transition-colors block"
              aria-label={`Read bulletin: ${issue.title}`}
            >
              {/* Cover */}
              <div className="relative h-48 bg-primary overflow-hidden">
                {issue.coverImageUrl && (
                  <img
                    src={issue.coverImageUrl}
                    alt=""
                    crossOrigin="anonymous"
                    className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity"
                  />
                )}
                <div className="relative z-10 p-5 h-full flex flex-col justify-between">
                  <div>
                    <div
                      className="inline-block text-[11px] uppercase tracking-[0.12em] font-bold px-2 py-0.5 mb-2"
                      style={{
                        background: 'hsl(var(--brand-accent))',
                        color: 'hsl(var(--brand-accent-foreground))',
                      }}
                    >
                      Print Edition
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.1em] text-primary-foreground/70">
                      {issue.edition}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-primary-foreground leading-snug line-clamp-2">
                      {issue.title}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-muted-foreground">
                    {new Date(issue.publishedAt).toLocaleDateString('en-AU', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {issue.pageCount} pages
                  </span>
                </div>
                <span className="text-[12px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1">
                  Read full bulletin <ChevronRight size={10} />
                </span>
              </div>
            </Link>
          ))}
        </div>
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
          Removed with the other two — see the note in LandingSidebar.tsx. */}
    </section>
  );
}
