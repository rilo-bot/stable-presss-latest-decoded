export interface Sponsor {
  id: string;
  /** Required — partner / sponsor name */
  name: string;
  /** Tier or relationship label, e.g. "Principal Partner" */
  category: string;
  /** Short descriptive line shown under the name */
  tagline: string;
  /** Optional — external link */
  websiteUrl?: string;
  /** Manual display order (ascending) */
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}
