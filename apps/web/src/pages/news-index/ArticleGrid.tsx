import { motion } from 'framer-motion';
import { ArticleCard } from '@/components/ArticleCard';
import type { Article } from '@/types/article';

/**
 * The /news result grid.
 *
 * ONE list. This used to render three — a "Newsletter" band, a "Bulletin" band
 * linking off to /bulletins, and then everything else under a "Published"
 * heading — because a story carried distribution `channels` and the index sorted
 * the results by which one it was on.
 *
 * That axis is gone (see `isLive` in types/article.ts). A published story is
 * news, so there is one band and it needs no heading: the reader asked for
 * stories in a category and gets stories in that category, newest first.
 */
interface ArticleGridProps {
  filteredArticles: Article[];
  activeCategory: string | null;
  activeSection: string | null;
  search: string;
  setCategory: (key: string | null) => void;
  setSearch: (value: string) => void;
}

export function ArticleGrid({
  filteredArticles,
  activeCategory,
  activeSection,
  search,
  setCategory,
  setSearch,
}: ArticleGridProps) {
  return (
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredArticles.map((article, idx) => (
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
    </div>
  );
}
