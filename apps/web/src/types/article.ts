export type ArticleStatus =
  | 'draft'
  | 'submitted'
  | 'editorial_review'
  | 'revision'
  | 'legal_review'
  | 'compliance'
  | 'approved'
  | 'publisher_review'
  | 'scheduled'
  | 'published'
  | 'newsletter'
  | 'bulletin'
  | 'archived';

import type { SubscriptionTier } from '@/rbac/entitlement';

export interface Article {
  id: string;
  title: string;
  summary: string;
  author: string;
  publishedAt: Date | null;
  linkedHorseIds: string[];
  status: ArticleStatus;
  imageUrl?: string;
  category?: string;
  readingTime?: number;
  tags?: string[];
  createdAt: Date;
  /** Minimum subscription tier to read the full article. Defaults to free. */
  minTier?: SubscriptionTier;
}
