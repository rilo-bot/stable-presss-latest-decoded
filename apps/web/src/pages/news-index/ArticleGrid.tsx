import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArticleCard } from '@/components/ArticleCard';
import { ChevronRight, Mail, BookOpen } from 'lucide-react';
import type { Article } from '@/types/article';

interface ArticleGridProps {
  filteredArticles: Article[];
  newsletterArticles: Article[];
  bulletinArticles: Article[];
  publishedOnly: Article[];
  activeCategory: string | null;
  activeSection: string | null;
  search: string;
  setCategory: (key: string | null) => void;
  setSearch: (value: string) => void;
}

export function ArticleGrid({
  filteredArticles,
  newsletterArticles,
  bulletinArticles,
  publishedOnly,
  activeCategory,
  activeSection,
  search,
  setCategory,
  setSearch,
}: ArticleGridProps) {
  return (
    /* Article grid */
    <div className="space-y-12">
      {/* Result count */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          {filteredArticles.length} {filteredArticles.length === 1 ? 'story' : 'stories'}
        </span>
        <div className="flex-1 h-px bg-border/40" />
        {(activeCategory || activeSection || search) && (
          <button
            onClick={() => { setCategory(null); setSearch(''); }}
            className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Newsletter channel band — shown when there are newsletter articles */}
      {newsletterArticles.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-sm"
              style={{ background: 'hsl(var(--chart-1) / 0.12)' }}
            >
              <Mail size={12} style={{ color: 'hsl(var(--chart-1))' }} />
              <span
                className="text-[9px] uppercase tracking-[0.18em] font-bold"
                style={{ color: 'hsl(var(--chart-1))' }}
              >
                Newsletter
              </span>
            </div>
            <div className="flex-1 h-px bg-border/40" />
            <Link
              to="/newsletter"
              className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Full newsletter <ChevronRight size={10} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {newsletterArticles.map((article, idx) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.18, ease: 'easeOut' }}
              >
                <ArticleCard article={article} variant="default" />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Bulletin channel band — links to /bulletins */}
      {bulletinArticles.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-sm"
              style={{ background: 'hsl(var(--brand-accent) / 0.12)' }}
            >
              <BookOpen size={12} style={{ color: 'hsl(var(--brand-accent))' }} />
              <span
                className="text-[9px] uppercase tracking-[0.18em] font-bold"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                Print Bulletin
              </span>
            </div>
            <div className="flex-1 h-px bg-border/40" />
            <Link
              to="/bulletins"
              className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Full bulletin <ChevronRight size={10} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {bulletinArticles.map((article, idx) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.18, ease: 'easeOut' }}
              >
                <ArticleCard article={article} variant="default" />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Published articles */}
      {publishedOnly.length > 0 && (
        <section>
          {(newsletterArticles.length > 0 || bulletinArticles.length > 0) && (
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10">
                <span className="text-[9px] uppercase tracking-[0.18em] font-bold text-primary">
                  Published
                </span>
              </div>
              <div className="flex-1 h-px bg-border/40" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {publishedOnly.map((article, idx) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.18, ease: 'easeOut' }}
              >
                <ArticleCard article={article} variant="default" />
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
