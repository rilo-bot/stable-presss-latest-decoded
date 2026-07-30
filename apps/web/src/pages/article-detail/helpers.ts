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

/* Default fallback hero when the article has no image */
export const DEFAULT_HERO =
  'https://images.pexels.com/photos/11341108/pexels-photo-11341108.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';
