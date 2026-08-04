import type { ArticleStatus } from '@/types/article';

export const STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: 'Draft — not yet published',
  submitted: 'Submitted — awaiting approval',
  approved: 'Approved — cleared to run',
  scheduled: 'Scheduled for publication',
  published: 'Published',
};

/* Split body copy into readable paragraphs */
export function splitIntoParagraphs(text: string): string[] {
  if (!text) return [];
  // If already has newlines, respect them
  const byNewline = text.split(/\n{2,}/);
  if (byNewline.length > 1) return byNewline.filter(Boolean);
  // Otherwise split by sentences into groups of ~2–3
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    groups.push(sentences.slice(i, i + 3).join(' ').trim());
  }
  return groups.filter(Boolean);
}

/* Removed: DEFAULT_HERO, a hotlinked Pexels photograph shown above any story
 * with no image of its own — third-party stock presented as this story's
 * picture, at the very top of the page, on the reader's first impression.
 *
 * A story without a photograph now gets the green masthead surface instead. The
 * headline is the thing that matters and it reads better on flat green than over
 * a stranger's photo. See the `heroImage` branch in ArticleDetail.tsx. */
