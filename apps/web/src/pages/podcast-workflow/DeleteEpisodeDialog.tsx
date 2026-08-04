/**
 * Confirm before deleting an episode.
 *
 * Deleting used to be one click on a text button at the foot of the drawer's
 * Overview tab, with no confirmation at all — and unlike a story, an episode can
 * carry an audio master someone uploaded over a slow connection. The stored audio
 * object is NOT removed here (see scripts/sweep-orphan-objects.ts), but the
 * record and everything on it — guests, show notes, review notes, channels — go.
 *
 * One dialog for both surfaces (the card on the Podcast screen and the drawer) so
 * the wording and the busy state cannot drift apart.
 */
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { PodcastEpisode } from '@/types/podcast';

export function DeleteEpisodeDialog({
  episode,
  deleting,
  onCancel,
  onConfirm,
}: {
  /** The episode awaiting confirmation, or null when the dialog is closed. */
  episode: PodcastEpisode | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={episode !== null}
      onOpenChange={(open) => {
        // Not dismissable mid-request: the optimistic removal is already on
        // screen and the rollback still has to land somewhere.
        if (!open && !deleting) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this episode?</DialogTitle>
          <DialogDescription>
            {episode ? (
              <>
                “<span className="font-semibold text-foreground">{episode.title}</span>”
                {episode.season != null && episode.episodeNumber != null
                  ? ` (S${episode.season} · Ep ${episode.episodeNumber})`
                  : ''}{' '}
                and everything on it — guests, show notes, review notes and channel
                selections — will be removed. This cannot be undone.
                {episode.audioUrl
                  ? ' The uploaded audio file itself is kept in storage.'
                  : ''}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete episode'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
