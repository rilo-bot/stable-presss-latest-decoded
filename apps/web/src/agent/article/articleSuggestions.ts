// Instant "what to do next" chips for the open article. Purely heuristic
// (synchronous, free, always valid): empty fields get "fill it" prompts first,
// then the strongest polish prompts pad the list to exactly three. Each chip
// names the field it targets so clicking one also selects it (purple ring),
// keeping the assistant's focus aligned with the action. Mirrors the magazine
// editor's suggestForPage, scaled to an article's fixed field set.

import type { Article } from '@/types/article';
import { fieldFilled } from './articleFields';

export interface ArticleSuggestion {
  /** Chip text. */
  label: string;
  /** The message sent to the assistant when the chip is clicked. */
  prompt: string;
  /** Field to select (highlight) alongside sending the prompt. */
  fieldId?: string;
}

export function suggestForArticle(article: Article): ArticleSuggestion[] {
  const out: ArticleSuggestion[] = [];

  // 1) Fill the important empty fields first, in priority order.
  if (!fieldFilled(article, 'summary'))
    out.push({ label: 'Write the story', prompt: 'Write a full, multi-paragraph body for this article from the headline and any notes.', fieldId: 'summary' });
  if (!fieldFilled(article, 'heroImage'))
    out.push({ label: 'Add a hero photo', prompt: 'Suggest on-brand hero photo options for this article.', fieldId: 'heroImage' });
  if (!fieldFilled(article, 'category'))
    out.push({ label: 'Set a category', prompt: 'Pick and set the most fitting category for this article.', fieldId: 'category' });
  if (!fieldFilled(article, 'tags'))
    out.push({ label: 'Add tags', prompt: 'Suggest and set 3–5 relevant tags for this article.', fieldId: 'tags' });

  // 2) Pad to three with the strongest polish prompts (skip duplicates).
  const polish: ArticleSuggestion[] = [
    { label: 'Sharpen the headline', prompt: 'Rewrite the headline to be punchier while keeping its meaning.', fieldId: 'title' },
    { label: 'Tighten the intro', prompt: 'Tighten the opening paragraph of the body so it hooks the reader.', fieldId: 'summary' },
    { label: 'Proofread the body', prompt: 'Proofread the body copy and fix any grammar or style issues.', fieldId: 'summary' },
  ];
  for (const p of polish) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.label === p.label)) out.push(p);
  }

  return out.slice(0, 3);
}
