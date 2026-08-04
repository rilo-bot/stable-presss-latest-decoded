// ── Helpers ──────────────────────────────────────────────────────────────────

import { can, canEditEpisode } from '@/lib/permissions';
import type { PodcastEpisode } from '@/types/podcast';

/**
 * May this account delete this episode?
 *
 * Mirrors the three clauses of `DELETE /api/podcastEpisodes/:id`: the delete
 * power (or the umbrella), the episode not being live, and it being theirs to
 * touch. Lives here because two surfaces ask — the card on the Podcast screen and
 * the drawer's Overview tab — and a copy in each is how one of them ends up
 * offering a button that 403s.
 *
 * Still only an affordance. The server re-checks all three.
 */
export function canDeleteEpisode(
  episode: Pick<PodcastEpisode, 'status' | 'producedBy'>,
  currentUserDisplayName: string | null | undefined,
): boolean {
  const mayDelete = can('podcast.episode.delete') || can('podcast.manage');
  if (!mayDelete) return false;
  // A published episode has to come down before it can be removed — the route
  // refuses outright rather than unpublishing on your behalf.
  if (episode.status === 'published') return false;
  return (
    can('podcast.manage') ||
    can('podcast.episode.edit_any') ||
    canEditEpisode(episode.producedBy, currentUserDisplayName)
  );
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
