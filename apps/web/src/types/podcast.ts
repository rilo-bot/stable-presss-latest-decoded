export type EpisodeStatus =
  | 'draft'
  | 'audio_uploaded'
  | 'guests_added'
  | 'description_written'
  | 'scheduled'
  | 'in_review'
  | 'published';

export type DistributionChannel =
  | 'spotify'
  | 'apple_podcasts'
  | 'rss_feed'
  | 'website'
  | 'newsletter';

export interface EpisodeGuest {
  id: string;
  name: string;
  title: string;
  bio?: string;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  host: string;
  durationSeconds: number; // raw seconds for formatting
  audioUrl: string; // HTML5 audio src
  publishedAt: string; // ISO string
  relatedArticleIds: string[];
  coverUrl?: string;
  season: number;
  episodeNumber: number;
  createdAt: string;

  // Workflow fields
  status: EpisodeStatus;
  guests: EpisodeGuest[];
  scheduledFor?: string; // ISO string — when the episode is slated to go live
  distributionChannels: DistributionChannel[];
  reviewNotes?: string;
  producedBy?: string; // displayName of creating producer
}
