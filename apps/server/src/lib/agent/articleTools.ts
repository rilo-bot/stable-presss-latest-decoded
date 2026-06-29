// ---------------------------------------------------------------------------
// Tools for the "Article Studio" assistant.
//
// All tools are CLIENT-EXECUTED (declared WITHOUT `execute`): the browser runs
// them via onToolCall (apps/web/src/agent/article/articleToolExecutor.ts), where
// they mutate the open article through the article store — which PUTs to the
// RBAC-gated /api/articles/:id endpoint, so the model can never bypass edit
// permissions. The model addresses fields by their stable ids (title, summary,
// author, category, readingTime, tags, heroImage) described in ArticleContext.
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

// Text/number fields the model may set with setArticleField. `summary` is the
// full body copy; `readingTime` is normally auto-derived but settable.
const TEXT_FIELDS = ['title', 'summary', 'author', 'category', 'readingTime'] as const
// Every clearable field (adds the non-text ones).
const CLEARABLE_FIELDS = ['title', 'summary', 'author', 'category', 'readingTime', 'tags', 'heroImage'] as const

export function buildArticleTools(): ToolSet {
  return {
    getArticle: tool({
      description:
        'Return the open article\'s current fields and their values so you can read the copy before editing. Returns { id, title, summary, author, category, readingTime, tags, imageUrl, status }.',
      inputSchema: z.object({}),
    }),
    setArticleField: tool({
      description:
        'Set one text/number field on the open article, applied immediately. Use `summary` for the full body copy (paragraphs separated by blank lines). Changing `summary` recalculates reading time automatically. Returns { ok }.',
      inputSchema: z.object({
        field: z.enum(TEXT_FIELDS).describe('Which field to set.'),
        value: z.string().describe('The new value. For readingTime, a whole number of minutes as a string.'),
      }),
    }),
    setArticleTags: tool({
      description:
        'Replace the article\'s entire tag list. Pass the full set of tags you want (short, lower-case topic labels). Returns { ok }.',
      inputSchema: z.object({
        tags: z.array(z.string()).describe('The complete new tag list (may be empty to remove all tags).'),
      }),
    }),
    suggestImageOptions: tool({
      description:
        'Get a few on-brand stock photo candidates (name + url) matching a keyword, for the hero image. Describe them to the user, then call setArticleImage with one of the returned URLs. Never invent image URLs.',
      inputSchema: z.object({ query: z.string().optional().describe('A keyword like "race finish" or "paddock".') }),
    }),
    setArticleImage: tool({
      description:
        'Set the article\'s hero photo to a known/approved image URL (e.g. one returned by suggestImageOptions). Applied immediately. Never invent URLs. Returns { ok }.',
      inputSchema: z.object({
        src: z.string().describe('The image URL, from suggestImageOptions.'),
        alt: z.string().optional().describe('Optional alt text describing the photo.'),
      }),
    }),
    clearField: tool({
      description:
        'Empty a field on the open article (e.g. remove the category, tags, hero photo or reading time). Applied immediately. Returns { ok }.',
      inputSchema: z.object({
        field: z.enum(CLEARABLE_FIELDS).describe('Which field to clear.'),
      }),
    }),
  }
}
