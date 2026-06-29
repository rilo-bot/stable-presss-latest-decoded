// Browser-side execution of the Article Studio assistant's client tools.
//
// Every write goes through useArticleStore.updateArticle → PUT /api/articles/:id,
// which is RBAC-gated server-side, so the assistant can never edit an article the
// user couldn't. Each successful write records a one-step undo snapshot of the
// fields it changed (the article store has no history of its own). The pure
// apply* helpers are exported so the panel can reuse them for click-to-pick photo
// thumbnails and the "Undo" button.

import { useArticleStore, type ArticleUpdate } from '@/stores/articleStore';
import { useArticleStudioUi } from '@/stores/articleStudioUiStore';
import { STOCK } from '@/editor/templates/helpers';
import type { Article } from '@/types/article';

const CLIENT_TOOLS = new Set([
  'getArticle',
  'setArticleField',
  'setArticleTags',
  'suggestImageOptions',
  'setArticleImage',
  'clearField',
]);

export function isArticleClientTool(name: string): boolean {
  return CLIENT_TOOLS.has(name);
}

type ToolResult = { ok: true } | { ok: false; error: string };

function currentArticle(): Article | undefined {
  const { articleId } = useArticleStudioUi.getState();
  return articleId
    ? useArticleStore.getState().articles.find((a) => a.id === articleId)
    : undefined;
}

/** The article's CURRENT values for the given keys, shaped for a restoring PUT. */
function priorPatch(article: Article, keys: string[]): ArticleUpdate {
  const p: ArticleUpdate = {};
  for (const k of keys) {
    switch (k) {
      case 'title': p.title = article.title ?? ''; break;
      case 'summary': p.summary = article.summary ?? ''; break;
      case 'author': p.author = article.author ?? ''; break;
      case 'category': p.category = article.category ?? null; break;
      case 'readingTime': p.readingTime = article.readingTime ?? null; break;
      case 'imageUrl': p.imageUrl = article.imageUrl ?? null; break;
      case 'tags': p.tags = article.tags ?? null; break;
    }
  }
  return p;
}

/** Apply a patch and, on success, stash the pre-edit values so it can be undone. */
async function applyPatch(changeKeys: string[], patch: ArticleUpdate): Promise<ToolResult> {
  const article = currentArticle();
  if (!article) return { ok: false, error: 'No article is open.' };
  const undo = priorPatch(article, changeKeys);
  const ok = await useArticleStore.getState().updateArticle(article.id, patch);
  if (!ok) return { ok: false, error: 'The save failed — please try again.' };
  useArticleStudioUi.getState().setUndo(undo);
  return { ok: true };
}

// ── Exported apply helpers (used by tools AND the panel UI) ──────────────────

export async function applyFieldEdit(field: string, rawValue: string): Promise<ToolResult> {
  if (field === 'readingTime') {
    const n = parseInt(rawValue, 10);
    const readingTime = Number.isFinite(n) && n > 0 ? n : null;
    return applyPatch(['readingTime'], { readingTime });
  }
  const value = (rawValue ?? '').toString();
  if (field === 'title') {
    const title = value.trim();
    if (!title) return { ok: false, error: 'The headline can’t be empty.' };
    return applyPatch(['title'], { title });
  }
  if (field === 'author') return applyPatch(['author'], { author: value.trim() });
  if (field === 'category') return applyPatch(['category'], { category: value.trim() || null });
  if (field === 'summary') {
    const summary = value.trim();
    // Reading time tracks the body length automatically (~200 wpm, floored at 1).
    const words = summary.split(/\s+/).filter(Boolean).length;
    const readingTime = words > 0 ? Math.max(1, Math.round(words / 200)) : null;
    return applyPatch(['summary', 'readingTime'], { summary, readingTime });
  }
  return { ok: false, error: `Unknown field: ${field}` };
}

export async function applyTags(tags: string[]): Promise<ToolResult> {
  const clean = tags.map((t) => t.trim()).filter(Boolean);
  return applyPatch(['tags'], { tags: clean.length ? clean : null });
}

export async function applyImage(src: string): Promise<ToolResult> {
  if (!src?.trim()) return { ok: false, error: 'No image URL provided.' };
  return applyPatch(['imageUrl'], { imageUrl: src.trim() });
}

export async function clearFieldValue(field: string): Promise<ToolResult> {
  switch (field) {
    case 'title':
      return { ok: false, error: 'The headline can’t be empty.' };
    case 'summary':
      return applyPatch(['summary', 'readingTime'], { summary: '', readingTime: null });
    case 'author':
      return applyPatch(['author'], { author: '' });
    case 'category':
      return applyPatch(['category'], { category: null });
    case 'readingTime':
      return applyPatch(['readingTime'], { readingTime: null });
    case 'tags':
      return applyPatch(['tags'], { tags: null });
    case 'heroImage':
      return applyPatch(['imageUrl'], { imageUrl: null });
    default:
      return { ok: false, error: `Unknown field: ${field}` };
  }
}

/** Restore the values captured before the last AI edit. Used by the Undo button. */
export async function undoLastArticleEdit(): Promise<boolean> {
  const { articleId, undoPatch } = useArticleStudioUi.getState();
  if (!articleId || !undoPatch) return false;
  const ok = await useArticleStore.getState().updateArticle(articleId, undoPatch);
  if (ok) useArticleStudioUi.getState().clearUndo();
  return ok;
}

/** Rank the on-brand stock pool by keyword (mirror of the editor's helper). */
export function suggestImages(query?: string): { name: string; url: string }[] {
  const entries = Object.entries(STOCK) as Array<[string, string]>;
  const q = (query ?? '').toLowerCase().trim();
  const ranked = q
    ? entries
        .map(([name, url]) => ({
          name,
          url,
          score: q.split(/\s+/).filter(Boolean).reduce((s, t) => s + (name.toLowerCase().includes(t) ? 1 : 0), 0),
        }))
        .sort((a, b) => b.score - a.score)
    : entries.map(([name, url]) => ({ name, url, score: 0 }));
  const top = (ranked.some((r) => r.score > 0) ? ranked.filter((r) => r.score > 0) : ranked).slice(0, 6);
  return top.map(({ name, url }) => ({ name, url }));
}

// ── Tool dispatch ────────────────────────────────────────────────────────────

export async function executeArticleTool(name: string, input: unknown): Promise<unknown> {
  const arg = (input ?? {}) as Record<string, unknown>;

  switch (name) {
    case 'getArticle': {
      const a = currentArticle();
      if (!a) return { ok: false, error: 'No article is open.' };
      return {
        id: a.id,
        title: a.title,
        summary: a.summary,
        author: a.author,
        category: a.category ?? null,
        readingTime: a.readingTime ?? null,
        tags: a.tags ?? [],
        imageUrl: a.imageUrl ?? null,
        status: a.status,
      };
    }
    case 'setArticleField':
      return applyFieldEdit(String(arg.field ?? ''), String(arg.value ?? ''));
    case 'setArticleTags':
      return applyTags(Array.isArray(arg.tags) ? arg.tags.map(String) : []);
    case 'suggestImageOptions': {
      const candidates = suggestImages(arg.query ? String(arg.query) : undefined);
      useArticleStudioUi.getState().setImageOptions(candidates);
      return { candidates };
    }
    case 'setArticleImage':
      return applyImage(String(arg.src ?? ''));
    case 'clearField':
      return clearFieldValue(String(arg.field ?? ''));
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
