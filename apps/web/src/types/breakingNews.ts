export interface BreakingNewsItem {
  id: string;
  /** Required — the headline shown in the ticker */
  text: string;
  /** Only `active` items are shown on the landing page */
  active: boolean;
  /** Manual display order (ascending) */
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}
