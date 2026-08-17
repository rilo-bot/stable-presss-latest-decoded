import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import { Clock } from 'lucide-react';
// The stored value is the filter KEY ('race-reports'), not a label. Printing it raw
// put 'RACE-REPORTS' on every card here, on the front page and on /news alike.
import { categoryLabel } from '@/pages/news-index/constants';

interface ArticleCardProps {
  article: Article;
  variant?: 'default' | 'featured' | 'compact';
  className?: string;
}

export function ArticleCard({ article, variant = 'default', className }: ArticleCardProps) {
  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  if (variant === 'compact') {
    return (
      <Link
        to={`/articles/${article.id}`}
        className={cn(
          'group flex gap-4 py-4 border-b border-border/50 last:border-b-0',
          'hover:bg-muted/30 transition-colors duration-140 px-2 -mx-2 rounded-sm',
          className
        )}
        aria-label={`Read: ${article.title}`}
      >
        {article.imageUrl && (
          <div className="flex-shrink-0 w-20 h-20 overflow-hidden rounded-sm">
            <img
              src={article.imageUrl}
              alt={article.title}
              crossOrigin="anonymous"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}
        <div className="flex flex-col justify-center min-w-0">
          {article.category && (
            <span className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--brand-accent))] font-semibold mb-1">
              {categoryLabel(article.category)}
            </span>
          )}
          <h3 className="font-[family-name:var(--font-display)] text-sm font-semibold leading-snug text-foreground group-hover:opacity-80 transition-opacity duration-140 line-clamp-2">
            {article.title}
          </h3>
          {formattedDate && (
            <p className="text-[11px] text-muted-foreground mt-1">{formattedDate}</p>
          )}
        </div>
      </Link>
    );
  }

  if (variant === 'featured') {
    return (
      <Link
        to={`/articles/${article.id}`}
        className={cn(
          'group relative overflow-hidden rounded-sm block',
          'border border-border/60 hover:border-primary/30 transition-colors',
          className
        )}
        aria-label={`Read: ${article.title}`}
      >
        {article.imageUrl && (
          <div className="aspect-[16/9] overflow-hidden">
            <img
              src={article.imageUrl}
              alt={article.title}
              crossOrigin="anonymous"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-103"
            />
          </div>
        )}
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            {article.category && (
              <span className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--brand-accent))] font-semibold">
                {categoryLabel(article.category)}
              </span>
            )}
            {formattedDate && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">
                {formattedDate}
              </span>
            )}
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight text-foreground group-hover:opacity-85 transition-opacity duration-140 mb-2">
            {article.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-3">
            {article.summary}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-[0.08em]">
              {article.author}
            </span>
            {article.readingTime && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={11} />
                {article.readingTime} min read
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // default
  return (
    <Link
      to={`/articles/${article.id}`}
      className={cn(
        'group block border border-border/60 rounded-sm bg-card overflow-hidden',
        'transition-all duration-200 hover:shadow-sm hover:border-primary/30',
        className
      )}
      aria-label={`Read: ${article.title}`}
    >
      {article.imageUrl && (
        <div className="aspect-[3/2] overflow-hidden">
          <img
            src={article.imageUrl}
            alt={article.title}
            crossOrigin="anonymous"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-103"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {article.category && (
            <span className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--brand-accent))] font-semibold">
              {categoryLabel(article.category)}
            </span>
          )}
          {article.readingTime && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock size={10} />
              {article.readingTime} min
            </span>
          )}
        </div>
        <h3 className="font-[family-name:var(--font-display)] text-base font-bold leading-snug text-foreground group-hover:opacity-85 transition-opacity duration-140 mb-1.5 line-clamp-2">
          {article.title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
          {article.summary}
        </p>
        <hr className="border-border/50 mb-3" />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
            {article.author}
          </span>
          {formattedDate && (
            <span className="text-[11px] text-muted-foreground">{formattedDate}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
