import {
  Mic,
  Upload,
  Users,
  Calendar,
  Eye,
  CheckCircle,
  LoaderCircle,
  Star,
  Globe,
  Mail,
} from 'lucide-react';
import { createElement } from 'react';

import type { EpisodeStatus, DistributionChannel } from '@/types/podcast';

// ── Constants ────────────────────────────────────────────────────────────────

export const WORKFLOW_STAGES: { status: EpisodeStatus; label: string; icon: React.ReactNode; description: string }[] = [
  { status: 'draft', label: 'Draft', icon: createElement(Mic, { size: 14 }), description: 'Episode created, awaiting production.' },
  { status: 'audio_uploaded', label: 'Audio Ready', icon: createElement(Upload, { size: 14 }), description: 'Audio file attached and trimmed.' },
  { status: 'guests_added', label: 'Guests Added', icon: createElement(Users, { size: 14 }), description: 'Guest bios and credits confirmed.' },
  { status: 'description_written', label: 'Copy Done', icon: createElement(Star, { size: 14 }), description: 'Description and show notes finalised.' },
  { status: 'scheduled', label: 'Scheduled', icon: createElement(Calendar, { size: 14 }), description: 'Publish date locked in.' },
  { status: 'in_review', label: 'In Review', icon: createElement(Eye, { size: 14 }), description: 'Awaiting editorial sign-off.' },
  { status: 'published', label: 'Published', icon: createElement(CheckCircle, { size: 14 }), description: 'Live across all selected channels.' },
];

export const DISTRIBUTION_CHANNELS: { id: DistributionChannel; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'spotify', label: 'Spotify', icon: createElement(LoaderCircle, { size: 14 }), color: 'bg-[#1DB954]/15 text-[#1DB954] border-[#1DB954]/30' },
  { id: 'apple_podcasts', label: 'Apple Podcasts', icon: createElement(Mic, { size: 14 }), color: 'bg-primary/15 text-primary border-primary/30' },
  { id: 'rss_feed', label: 'RSS Feed', icon: createElement(Globe, { size: 14 }), color: 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent))/0.3]' },
  { id: 'website', label: 'Website', icon: createElement(Globe, { size: 14 }), color: 'bg-muted text-foreground border-border' },
  { id: 'newsletter', label: 'Newsletter', icon: createElement(Mail, { size: 14 }), color: 'bg-muted text-foreground border-border' },
];

export const STATUS_COLORS: Record<EpisodeStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  audio_uploaded: 'bg-primary/10 text-primary border-primary/20',
  guests_added: 'bg-primary/15 text-primary border-primary/30',
  description_written: 'bg-[hsl(var(--brand-accent)/0.12)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent))/0.25]',
  scheduled: 'bg-[hsl(var(--brand-accent)/0.18)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent))/0.35]',
  in_review: 'bg-destructive/10 text-destructive border-destructive/25',
  published: 'bg-primary text-primary-foreground border-primary',
};
