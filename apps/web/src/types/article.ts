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
}
