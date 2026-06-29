// Builds the compact ArticleContext blob sent to /api/agent/article/chat each
// turn, so the assistant knows the open article, every editable field's current
// state, and which field the user has selected (its focus). Mirrors the magazine
// editor's buildEditorContext, scaled down to one article's fixed field set.

import { useArticleStore } from '@/stores/articleStore';
import { useArticleStudioUi } from '@/stores/articleStudioUiStore';
import { ARTICLE_FIELDS, fieldDef, fieldFilled, fieldPreview } from './articleFields';

export interface ArticleFieldCtx {
  field: string;
  name: string;
  kind: string;
  filled: boolean;
  preview: string;
}

export interface ArticleContext {
  article: { id: string; title: string; status: string } | null;
  fields: ArticleFieldCtx[];
  selection: { field: string; name: string; kind: string; filled: boolean } | null;
}

export function buildArticleContext(): ArticleContext {
  const { articleId, selectedFieldId } = useArticleStudioUi.getState();
  const article = articleId
    ? useArticleStore.getState().articles.find((a) => a.id === articleId)
    : undefined;

  if (!article) return { article: null, fields: [], selection: null };

  const fields: ArticleFieldCtx[] = ARTICLE_FIELDS.map((f) => ({
    field: f.fieldId,
    name: f.name,
    kind: f.kind,
    filled: fieldFilled(article, f.fieldId),
    preview: fieldPreview(article, f.fieldId),
  }));

  const sel = selectedFieldId ? fieldDef(selectedFieldId) : undefined;
  const selection = sel
    ? {
        field: sel.fieldId,
        name: sel.name,
        kind: sel.kind,
        filled: fieldFilled(article, sel.fieldId),
      }
    : null;

  return {
    article: { id: article.id, title: article.title, status: article.status },
    fields,
    selection,
  };
}
