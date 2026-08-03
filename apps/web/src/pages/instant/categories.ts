/**
 * The category keys Instant may assign, derived from the ONE taxonomy in
 * `pages/news-index/constants.tsx` rather than re-typed here.
 *
 * The server keeps its own copy of the keys (lib/newsCategories.ts) because the
 * model needs them as a closed enum, and a model handed a free string invents a
 * taxonomy that matches no category tab on the public site.
 */
import { CATEGORIES } from '@/pages/news-index/constants';

export type CategoryKey = string;

export interface CategoryOption {
  key: CategoryKey;
  label: string;
}

export const CATEGORY_OPTIONS: CategoryOption[] = CATEGORIES.map((c) => ({ key: c.key, label: c.label }));

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
