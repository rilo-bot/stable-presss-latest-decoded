import { Link } from 'react-router-dom';
import type { Article } from '@/types/article';

interface RelatedPanelProps {
  relatedArticles: Article[];
  category?: string;
}

export function RelatedPanel({ relatedArticles, category }: RelatedPanelProps) {
  if (relatedArticles.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex-shrink-0 w-1 h-4 rounded-full"
          style={{ background: 'hsl(var(--brand-accent))' }}
        />
        <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
          More in {category ?? 'Editorial'}
        </h3>
        <div className="flex-1 h-px bg-border/50" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {relatedArticles.map((rel) => (
          <Link
            key={rel.id}
            to={`/articles/${rel.id}`}
            className="group border border-border/60 rounded-sm bg-card overflow-hidden hover:border-primary/30 transition-colors"
          >
            {rel.imageUrl && (
              <div className="aspect-[16/9] overflow-hidden">
                <img
                  src={rel.imageUrl}
                  alt={rel.title}
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
            )}
            <div className="p-4">
              {rel.category && (
                <span
                  className="text-[9px] uppercase tracking-[0.14em] font-bold"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  {rel.category}
                </span>
              )}
              <h4 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mt-1 line-clamp-2 group-hover:opacity-80 transition-opacity">
                {rel.title}
              </h4>
              <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-[0.06em]">
                {rel.author}
                {rel.readingTime && ` · ${rel.readingTime} min read`}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
