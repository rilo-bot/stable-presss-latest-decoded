import { useMemo } from 'react';
import { CATEGORIES } from '@/pages/NewsIndex';
import type { Article, ArticleStatus } from '@/types/article';

export type SectionGroup = {
  section: string;
  cats: { catDef: (typeof CATEGORIES)[0]; items: Article[] }[];
};

export interface ArticleGroups {
  /** Filtered articles for the requested status (after category + search). */
  source: Article[];
  /** Whether any CMS articles matched (drives the "is real" link gating). */
  hasCmsArticles: boolean;
  /** Articles grouped by editorial section, then by category. */
  sections: SectionGroup[];
  /** First article in the source list, or null. */
  heroItem: Article | null;
}

/**
 * Shared filter + group logic for the Bulletins and Newsletter pages.
 * Behaviour is identical to the original inline useMemo blocks; only the
 * status filter differs between the two pages.
 */
export function useArticleGroups(
  articles: Article[] | null | undefined,
  status: ArticleStatus,
  categoryParam: string | null,
  search: string
): ArticleGroups {
  const source = useMemo(() => {
    let base = (articles ?? []).filter((a) => a.status === status);
    if (categoryParam) base = base.filter((a) => (a.category ?? '') === categoryParam);
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          (a.category ?? '').toLowerCase().includes(q)
      );
    }
    return base;
  }, [articles, status, categoryParam, search]);

  const hasCmsArticles = source.length > 0;

  const sections = useMemo(() => {
    const allSections = ['news', 'analysis', 'interviews'] as const;
    const grouped: SectionGroup[] = [];
    for (const sec of allSections) {
      const cats = CATEGORIES.filter((c) => c.section === sec);
      const secItems = cats
        .map((catDef) => ({
          catDef,
          items: source.filter((item) => (item.category ?? '') === catDef.key),
        }))
        .filter((g) => g.items.length > 0);
      if (secItems.length > 0) {
        grouped.push({ section: sec, cats: secItems });
      }
    }
    return grouped;
  }, [source]);

  const heroItem = source[0] ?? null;

  return { source, hasCmsArticles, sections, heroItem };
}
