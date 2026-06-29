// The fixed "regions" of an article — the data boxes the user can select and the
// Article Studio assistant can edit. Shared by the context builder (what's sent
// to the model), the selectable wrappers on the detail page, and the tool
// executor. `fieldId` values must match the ids the server prompt/tools use.

import type { Article } from '@/types/article';

export type ArticleFieldKind = 'text' | 'number' | 'tags' | 'image';

export interface ArticleFieldDef {
  fieldId: string;
  /** Short human label shown on the purple selection tag and in AI context. */
  name: string;
  kind: ArticleFieldKind;
}

export const ARTICLE_FIELDS: ArticleFieldDef[] = [
  { fieldId: 'title', name: 'Headline', kind: 'text' },
  { fieldId: 'summary', name: 'Body', kind: 'text' },
  { fieldId: 'author', name: 'Byline', kind: 'text' },
  { fieldId: 'category', name: 'Category', kind: 'text' },
  { fieldId: 'readingTime', name: 'Reading time', kind: 'number' },
  { fieldId: 'tags', name: 'Tags', kind: 'tags' },
  { fieldId: 'heroImage', name: 'Hero image', kind: 'image' },
];

export function fieldDef(fieldId: string): ArticleFieldDef | undefined {
  return ARTICLE_FIELDS.find((f) => f.fieldId === fieldId);
}

/** Is this field currently populated on the article? */
export function fieldFilled(article: Article, fieldId: string): boolean {
  switch (fieldId) {
    case 'title':
      return !!article.title?.trim();
    case 'summary':
      return !!article.summary?.trim();
    case 'author':
      return !!article.author?.trim();
    case 'category':
      return !!article.category?.trim();
    case 'readingTime':
      return typeof article.readingTime === 'number' && article.readingTime > 0;
    case 'tags':
      return !!article.tags && article.tags.length > 0;
    case 'heroImage':
      return !!article.imageUrl?.trim();
    default:
      return false;
  }
}

/** A short, single-line preview of the field's value for the AI context. */
export function fieldPreview(article: Article, fieldId: string, max = 90): string {
  const clip = (s: string) => (s.length > max ? s.slice(0, max) + '…' : s);
  switch (fieldId) {
    case 'title':
      return article.title ? clip(article.title) : '(empty)';
    case 'summary':
      return article.summary?.trim() ? clip(article.summary.trim()) : '(empty)';
    case 'author':
      return article.author ? clip(article.author) : '(empty)';
    case 'category':
      return article.category ? clip(article.category) : '(empty)';
    case 'readingTime':
      return article.readingTime ? `${article.readingTime} min` : '(empty)';
    case 'tags':
      return article.tags && article.tags.length > 0 ? clip(article.tags.join(', ')) : '(empty)';
    case 'heroImage':
      return article.imageUrl ? 'photo set' : '(empty)';
    default:
      return '(empty)';
  }
}
