// ---------------------------------------------------------------------------
// Server-side authorization for podcast episodes.
//
// Mirrors the relevant slice of the web RBAC matrix (apps/web/src/lib/permissions.ts)
// so role checks are enforced on the server, not just hidden in the UI. The web
// matrix stays the source of truth for UI affordances; this is the gate that
// actually protects the data.
// ---------------------------------------------------------------------------

export type PodcastAction =
  | 'podcast.episode.create'
  | 'podcast.episode.edit_own'
  | 'podcast.episode.edit_any'
  | 'podcast.episode.approve'
  | 'podcast.episode.delete'
  | 'podcast.read_all'; // see drafts / unpublished episodes, not just published

const PODCAST_PERMISSIONS: Record<string, PodcastAction[]> = {
  contributor: [],
  legal_reviewer: [],
  podcast_producer: [
    'podcast.episode.create',
    'podcast.episode.edit_own',
    'podcast.episode.delete',
    'podcast.read_all',
  ],
  editor: [
    'podcast.episode.edit_any',
    'podcast.episode.approve',
    'podcast.read_all',
  ],
  publisher: [
    'podcast.episode.approve',
    'podcast.read_all',
  ],
  administrator: [
    'podcast.episode.create',
    'podcast.episode.edit_own',
    'podcast.episode.edit_any',
    'podcast.episode.approve',
    'podcast.episode.delete',
    'podcast.read_all',
  ],
};

/** True if the role is permitted the given podcast action. */
export function canPodcast(role: string | undefined | null, action: PodcastAction): boolean {
  if (!role) return false;
  return PODCAST_PERMISSIONS[role]?.includes(action) ?? false;
}
