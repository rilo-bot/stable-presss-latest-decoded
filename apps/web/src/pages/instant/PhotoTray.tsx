/**
 * The captured photos.
 *
 * Each tile shows its state honestly: a photo that couldn't be read stays on
 * screen, marked, with the reason — it just isn't used in the draft. Silently
 * dropping it would leave the user wondering why their picture never appeared.
 *
 * `showCaptions` is on in the review step, where the draft has written a caption
 * per photo and the cover can be re-picked.
 */
import { AlertTriangle, Check, Loader2, Star, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { CapturedPhoto } from './types';

interface PhotoTrayProps {
  photos: CapturedPhoto[];
  coverPhotoId: string | null;
  onRemove: (id: string) => void;
  onSetCover?: (id: string) => void;
  onCaption?: (id: string, caption: string) => void;
  showCaptions?: boolean;
}

export function PhotoTray({
  photos, coverPhotoId, onRemove, onSetCover, onCaption, showCaptions,
}: PhotoTrayProps) {
  if (photos.length === 0) return null;

  return (
    <ul className={cn('grid gap-3', showCaptions ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3')}>
      {photos.map((photo) => {
        const isCover = photo.id === coverPhotoId;
        return (
          <li
            key={photo.id}
            className={cn(
              'overflow-hidden rounded-sm border bg-card',
              photo.state === 'failed' ? 'border-destructive/50' : 'border-border/60',
              showCaptions && 'flex gap-3 p-2',
            )}
          >
            <div className={cn('relative flex-shrink-0', showCaptions ? 'h-20 w-28' : 'aspect-[4/3] w-full')}>
              <img
                src={photo.previewUrl}
                alt={photo.caption || 'Captured photo'}
                className="h-full w-full rounded-sm object-cover"
              />

              {photo.state === 'working' && (
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/40">
                  <Loader2 size={18} className="animate-spin text-white" />
                </span>
              )}

              {photo.state === 'failed' && (
                <span className="absolute inset-0 flex items-center justify-center bg-destructive/30">
                  <AlertTriangle size={18} className="text-white" />
                </span>
              )}

              {isCover && photo.state !== 'failed' && (
                <span className="absolute left-1 top-1 flex items-center gap-1 rounded-sm bg-foreground/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-background">
                  <Star size={9} /> Cover
                </span>
              )}

              <button
                type="button"
                onClick={() => onRemove(photo.id)}
                aria-label="Remove this photo"
                title="Remove this photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-sm bg-foreground/70 text-background transition-colors hover:bg-destructive"
              >
                <X size={12} />
              </button>
            </div>

            {showCaptions ? (
              <div className="min-w-0 flex-1 space-y-1.5">
                {photo.state === 'failed' ? (
                  <p className="text-[12px] text-destructive">{photo.error ?? "This photo couldn't be read."}</p>
                ) : (
                  <>
                    <textarea
                      value={photo.caption}
                      onChange={(e) => onCaption?.(photo.id, e.target.value)}
                      rows={2}
                      placeholder="Caption"
                      aria-label="Photo caption"
                      className="w-full resize-none rounded-sm border border-input bg-background px-2 py-1.5 text-[12.5px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {!isCover && onSetCover && (
                      <button
                        type="button"
                        onClick={() => onSetCover(photo.id)}
                        className="flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Star size={11} /> Make this the cover
                      </button>
                    )}
                    {isCover && (
                      <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                        <Check size={11} /> Used as the cover image
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              photo.state === 'failed' && (
                <p className="px-2 py-1.5 text-[11.5px] text-destructive">{photo.error}</p>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
