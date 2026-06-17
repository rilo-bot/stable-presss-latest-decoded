import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IssueSummary } from '@/types/magazine';

interface LandingBulletinsProps {
  publishedIssues: IssueSummary[];
}

export function LandingBulletins({ publishedIssues }: LandingBulletinsProps) {
  return (
    <section id="bulletins">
      <div className="flex items-center gap-4 mb-6">
        <div
          className="flex-shrink-0 w-1 h-5 rounded-full"
          style={{ background: 'hsl(var(--brand-accent))' }}
        />
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
          Print Bulletins
        </h2>
        <div className="flex-1 h-px bg-border/50" />
        <Link
          to="/bulletins"
          className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          All bulletins <ChevronRight size={11} />
        </Link>
      </div>

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
                      className="inline-block text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 mb-2"
                      style={{
                        background: 'hsl(var(--brand-accent))',
                        color: 'hsl(var(--brand-accent-foreground))',
                      }}
                    >
                      Print Edition
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-primary-foreground/60">
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
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(issue.publishedAt).toLocaleDateString('en-AU', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {issue.pageCount} pages
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1">
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
            className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Browse bulletins <ArrowRight size={11} />
          </Link>
        </div>
      )}

      {/* Newsletter/Subscription prompt */}
      <div
        className="mt-5 border border-dashed rounded-sm p-4 flex flex-col sm:flex-row items-center gap-4"
        style={{ borderColor: 'hsl(var(--brand-accent) / 0.4)' }}
      >
        <Mail
          size={20}
          style={{ color: 'hsl(var(--brand-accent))' }}
          className="flex-shrink-0"
        />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-foreground">
            Newsletter &amp; Print Bulletin — delivered to subscribers.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Weekly editorial dispatches and the fortnightly print bulletin, organised by category.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            asChild
            className="text-xs"
          >
            <Link to="/newsletter">Browse Newsletter</Link>
          </Button>
          <Button
            size="sm"
            asChild
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
          >
            <Link to="/bulletins">Browse Bulletins</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
