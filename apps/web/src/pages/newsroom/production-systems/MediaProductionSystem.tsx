import { Plus, Search, Eye, File, CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { Horse } from '@/types/horse';
import type { MediaItem, MediaType } from '@/types/mediaItem';
import { MEDIA_TYPE_ICONS, MEDIA_TYPE_COLORS } from '../constants';

interface MediaProductionSystemProps {
  mediaItems: MediaItem[];
  horses: Horse[];
  filteredMediaItems: MediaItem[];
  mediaSearch: string;
  setMediaSearch: (v: string) => void;
  mediaHorseFilter: string;
  setMediaHorseFilter: (v: string) => void;
  mediaTypeFilter: MediaType | '';
  setMediaTypeFilter: (v: MediaType | '') => void;
  onOpenMediaForm: (item?: MediaItem) => void;
  onMediaDelete: (item: MediaItem) => void;
  mediaDeleteConfirm: boolean;
  mediaDeleteTarget: MediaItem | null;
  setMediaDeleteConfirm: (v: boolean) => void;
  setMediaDeleteTarget: (v: MediaItem | null) => void;
  confirmMediaDelete: () => void;
}

export function MediaProductionSystem({
  mediaItems,
  horses,
  filteredMediaItems,
  mediaSearch,
  setMediaSearch,
  mediaHorseFilter,
  setMediaHorseFilter,
  mediaTypeFilter,
  setMediaTypeFilter,
  onOpenMediaForm,
  onMediaDelete,
  mediaDeleteConfirm,
  mediaDeleteTarget,
  setMediaDeleteConfirm,
  setMediaDeleteTarget,
  confirmMediaDelete,
}: MediaProductionSystemProps) {
  const safeMedia = mediaItems ?? [];
  const safeHorses = horses ?? [];

  const mediaTypeCounts: Partial<Record<MediaType, number>> = {};
  for (const m of safeMedia) {
    mediaTypeCounts[m.media_type] = (mediaTypeCounts[m.media_type] ?? 0) + 1;
  }

  return (
    <div className="space-y-5">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
            Stable Press Production System
          </p>
          <p className="text-sm text-muted-foreground">
            {safeMedia.length === 0
              ? 'No media records on file yet.'
              : `${safeMedia.length} media record${safeMedia.length !== 1 ? 's' : ''} across all horses`}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
          onClick={() => onOpenMediaForm()}
        >
          <Plus size={13} />
          Add Media Record
        </Button>
      </div>

      {/* Stat pills */}
      {safeMedia.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(Object.entries(mediaTypeCounts) as [MediaType, number][]).map(([type, count]) => (
            <button
              key={type}
              onClick={() => setMediaTypeFilter(mediaTypeFilter === type ? '' : type)}
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border transition-colors',
                mediaTypeFilter === type
                  ? MEDIA_TYPE_COLORS[type]
                  : 'border-border/50 text-muted-foreground hover:text-foreground bg-card'
              )}
            >
              {MEDIA_TYPE_ICONS[type]}
              {type}
              <span className="tabular-nums font-bold">{count}</span>
            </button>
          ))}
          {mediaTypeFilter && (
            <button
              onClick={() => setMediaTypeFilter('')}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X size={10} /> Clear filter
            </button>
          )}
        </div>
      )}

      {/* Search + Horse filter row */}
      {safeMedia.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Search title, subject, publication…"
              value={mediaSearch}
              onChange={(e) => setMediaSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Search media records"
            />
          </div>
          <select
            value={mediaHorseFilter}
            onChange={(e) => setMediaHorseFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            aria-label="Filter by horse"
          >
            <option value="">All Horses</option>
            {safeHorses.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Empty state */}
      {safeMedia.length === 0 ? (
        <EmptyState
          icon={File}
          heading="No media records on file yet."
          description="Add articles, photos, videos, press releases, and publications linked to your thoroughbreds. Media records surface on horse profiles and across all featured parties."
          ctaLabel="Add Your First Media Record"
          onCta={() => onOpenMediaForm()}
          size="lg"
        />
      ) : filteredMediaItems.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
          <p className="text-sm font-semibold text-foreground mb-1">No media records match your filters</p>
          <button
            onClick={() => { setMediaSearch(''); setMediaHorseFilter(''); setMediaTypeFilter(''); }}
            className="text-xs text-primary hover:text-primary/80 transition-colors mt-2"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        /* Media table */
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Media Records
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {filteredMediaItems.length} {filteredMediaItems.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {['Title', 'Type', 'Horse', 'Source', 'Published', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMediaItems.map((item, idx) => {
                  const horse = safeHorses.find((h) => h.id === item.horse_id);
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        'border-b border-border/30 hover:bg-muted/10 transition-colors',
                        idx % 2 === 0 ? 'bg-card' : 'bg-background'
                      )}
                    >
                      {/* Title + subject */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <span className="text-xs font-semibold text-foreground block line-clamp-1">
                          {item.title}
                        </span>
                        {item.subject && (
                          <span className="text-[10px] text-muted-foreground line-clamp-1 block italic mt-0.5">
                            {item.subject}
                          </span>
                        )}
                        {(item.url || item.file_name) && (
                          <span className="text-[9px] text-primary/70 mt-0.5 block truncate">
                            {item.url ? '🔗 URL' : '📎 File'}: {item.url ?? item.file_name}
                          </span>
                        )}
                      </td>

                      {/* Type badge */}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] font-bold px-2 py-0.5 rounded-full border',
                            MEDIA_TYPE_COLORS[item.media_type]
                          )}
                        >
                          {MEDIA_TYPE_ICONS[item.media_type]}
                          {item.media_type}
                        </span>
                      </td>

                      {/* Horse */}
                      <td className="px-4 py-3">
                        {horse ? (
                          <span className="text-xs text-foreground font-medium">{horse.name}</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* Source publication */}
                      <td className="px-4 py-3">
                        {item.source_publication ? (
                          <span className="text-[10px] text-muted-foreground truncate block max-w-[120px]">
                            {item.source_publication}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* Published date */}
                      <td className="px-4 py-3">
                        {item.published_date ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays size={10} className="text-primary/50 flex-shrink-0" />
                            <span>
                              {new Date(item.published_date).toLocaleDateString('en-AU', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => onOpenMediaForm(item)}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                            aria-label={`Edit ${item.title}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onMediaDelete(item)}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
                            aria-label={`Remove ${item.title}`}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {mediaDeleteConfirm && mediaDeleteTarget && (
        <div className="border border-destructive/30 rounded-sm bg-destructive/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-foreground">
            Remove{' '}
            <span className="font-semibold">{mediaDeleteTarget.title}</span>
            {' '}from Stable Press? This cannot be undone.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => { setMediaDeleteConfirm(false); setMediaDeleteTarget(null); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs"
              onClick={confirmMediaDelete}
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Info note */}
      {safeMedia.length > 0 && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
          <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Media records added here are linked to their horse and surface on the <strong className="text-foreground">Thoroughbred Profile</strong> page.
            Featured parties will also see the media item on their own records.
          </p>
        </div>
      )}
    </div>
  );
}
