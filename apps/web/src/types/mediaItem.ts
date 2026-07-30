import type { Shareable } from './sharing';

export type MediaType = 'Article' | 'Photo' | 'Video' | 'Press Release' | 'Publication';

export const MEDIA_TYPES: MediaType[] = [
  'Article',
  'Photo',
  'Video',
  'Press Release',
  'Publication',
];

export interface MediaItem extends Shareable {
  id: string;
  createdAt: Date;

  /** Required — Horse ID this media is attached to */
  horse_id: string;

  /** Required — Brief description of the media item */
  subject: string;

  /** Required — Type of media */
  media_type: MediaType;

  /** Required — Title of the media item */
  title: string;

  /** Optional — Publication or media source name */
  source_publication?: string;

  /** Optional — ISO date string YYYY-MM-DD */
  published_date?: string;

  /** Required — at least one of url or file_name must be provided */
  url?: string;

  /** Optional — original filename of an uploaded asset (for display). */
  file_name?: string;

  /** Optional — stored URL of the uploaded asset (S3 public URL, or inline data URL in fallback mode). */
  file_url?: string;

  /** Optional — Party IDs of individuals / organisations featured in the media */
  featured_party_ids?: string[];

  /** Optional — ID of a linked Stable Press Article record */
  linked_article_id?: string;
}
