import { Link } from 'react-router-dom';
import { ChevronRight, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import type { Horse } from '@/types/horse';
import type { HorseConnections } from '@/lib/horseConnections';

interface SidebarProps {
  linkedHorses: Horse[];
  horseConn: (horse: Horse) => HorseConnections;
  relatedArticles: Article[];
}

export function Sidebar({ linkedHorses, horseConn, relatedArticles }: SidebarProps) {
  return (
    <aside className="space-y-8 lg:pt-[68px]">

      {/* Linked Thoroughbreds */}
      {linkedHorses.length > 0 && (
        <div className="border border-border/60 rounded-sm overflow-hidden">
          <div
            className="px-4 py-3 border-b border-border/60"
            style={{ background: 'hsl(var(--brand-accent) / 0.07)' }}
          >
            <h3 className="text-[9px] uppercase tracking-[0.16em] font-bold"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              Featured Thoroughbreds
            </h3>
          </div>
          <div className="divide-y divide-border/50">
            {linkedHorses.map((horse) => (
              <Link
                key={horse.id}
                to={`/horses/${horse.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
              >
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: 'hsl(var(--brand-accent) / 0.15)',
                    color: 'hsl(var(--brand-accent))',
                  }}
                >
                  {horse.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground font-[family-name:var(--font-display)] group-hover:text-primary transition-colors truncate">
                    {horse.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-[0.06em] truncate">
                    Trainer: {horseConn(horse).trainer || '—'}
                  </p>
                </div>
                <ChevronRight
                  size={12}
                  className="flex-shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-140"
                />
              </Link>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-border/40">
            <Link
              to="/horses"
              className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              All profiles <ChevronRight size={10} />
            </Link>
          </div>
        </div>
      )}

      {/* Tipping CTA */}
      <div
        className="rounded-sm border p-5 overflow-hidden"
        style={{
          borderColor: 'hsl(var(--brand-accent) / 0.3)',
          background: 'hsl(var(--brand-accent) / 0.04)',
        }}
      >
        <TrendingUp
          size={18}
          className="mb-3"
          style={{ color: 'hsl(var(--brand-accent))' }}
        />
        <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground leading-snug mb-1.5">
          Back your selections in the Tipping Ring
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          Put your form analysis to the test. Join the global leaderboard and track your tipping record across every meet.
        </p>
        <Link
          to="/tipping"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] rounded-sm transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Enter the Ring <ChevronRight size={12} />
        </Link>
      </div>

      {/* Also in this edition — real related articles (same category) */}
      {relatedArticles.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground whitespace-nowrap">
              Also in this edition
            </h3>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <div className="space-y-0">
            {relatedArticles.map((item, idx) => (
              <Link
                key={item.id}
                to={`/articles/${item.id}`}
                className={cn(
                  'group flex gap-3 py-3.5 hover:bg-muted/20 transition-colors -mx-2 px-2 rounded-sm',
                  idx < relatedArticles.length - 1 && 'border-b border-border/40'
                )}
              >
                {item.imageUrl && (
                  <div className="flex-shrink-0 w-16 h-16 overflow-hidden rounded-sm">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      crossOrigin="anonymous"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {item.category && (
                    <span
                      className="text-[8px] uppercase tracking-[0.14em] font-bold"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      {item.category}
                    </span>
                  )}
                  <h4 className="font-[family-name:var(--font-display)] text-xs font-bold text-foreground line-clamp-2 leading-snug group-hover:opacity-80 transition-opacity mt-0.5">
                    {item.title}
                  </h4>
                  {item.readingTime && (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock size={9} />
                      {item.readingTime} min read
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>

          <Link
            to="/news"
            className="mt-4 flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            All editorial <ChevronRight size={10} />
          </Link>
        </div>
      )}

      {/* Podcast promo */}
      <div className="bg-primary rounded-sm overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <p
            className="text-[9px] uppercase tracking-[0.2em] font-bold mb-2"
            style={{ color: 'hsl(var(--brand-accent))' }}
          >
            The Stable Press Podcast
          </p>
          <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-primary-foreground leading-snug mb-3">
            Go deeper on every story — listen to our analysts break it down.
          </h3>
          <Link
            to="/podcast"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] rounded-sm transition-colors"
            style={{
              background: 'hsl(var(--brand-accent))',
              color: 'hsl(var(--brand-accent-foreground))',
            }}
          >
            Listen now <ChevronRight size={10} />
          </Link>
        </div>
      </div>

    </aside>
  );
}
