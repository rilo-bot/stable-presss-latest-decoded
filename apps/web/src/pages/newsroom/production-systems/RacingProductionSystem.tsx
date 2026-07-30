import { useState } from 'react';
import { Plus, Search, Eye, Flag, CalendarDays, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { Horse } from '@/types/horse';
import type { RacingEntry } from '@/types/racingEntry';
import { RacingStatusBadge } from '../components/RacingStatusBadge';
import { DeleteConfirmDialog } from '../components/DeleteConfirmDialog';
import { RecordShareDialog } from '@/components/RecordShareDialog';
import { useRacingEntryStore } from '@/stores/racingEntryStore';

interface RacingProductionSystemProps {
  racingEntries: RacingEntry[];
  horses: Horse[];
  filteredRacingEntries: RacingEntry[];
  racingSearch: string;
  setRacingSearch: (v: string) => void;
  racingHorseFilter: string;
  setRacingHorseFilter: (v: string) => void;
  onOpenRacingForm: (entry?: RacingEntry) => void;
  onRacingDelete: (entry: RacingEntry) => void;
  racingDeleteConfirm: boolean;
  racingDeleteTarget: RacingEntry | null;
  setRacingDeleteConfirm: (v: boolean) => void;
  setRacingDeleteTarget: (v: RacingEntry | null) => void;
  confirmRacingDelete: () => void;
}

export function RacingProductionSystem({
  racingEntries,
  horses,
  filteredRacingEntries,
  racingSearch,
  setRacingSearch,
  racingHorseFilter,
  setRacingHorseFilter,
  onOpenRacingForm,
  onRacingDelete,
  racingDeleteConfirm,
  racingDeleteTarget,
  setRacingDeleteConfirm,
  setRacingDeleteTarget,
  confirmRacingDelete,
}: RacingProductionSystemProps) {
  const shareEntry = useRacingEntryStore((s) => s.shareEntry);
  const unshareEntry = useRacingEntryStore((s) => s.unshareEntry);
  const [shareTargetId, setShareTargetId] = useState<string | null>(null);

  const safeEntries = racingEntries ?? [];
  const safeHorses = horses ?? [];

  // Resolved from the live list so the dialog reflects shares as they change.
  const shareTarget = safeEntries.find((e) => e.id === shareTargetId) ?? null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-end gap-4 flex-wrap">
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
          onClick={() => onOpenRacingForm()}
        >
          <Plus size={13} />
          Add Racing Record
        </Button>
      </div>

      {/* Search + Horse filter */}
      {safeEntries.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Search race, venue, subject…"
              value={racingSearch}
              onChange={(e) => setRacingSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Search racing records"
            />
          </div>
          <select
            value={racingHorseFilter}
            onChange={(e) => setRacingHorseFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
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
      {safeEntries.length === 0 ? (
        <EmptyState
          icon={Flag}
          heading="No racing records on file yet."
          description="Add race entries, results, and performance records for your thoroughbreds. Racing data surfaces on horse profiles and can be linked to jockeys and trainers."
          ctaLabel="Add Your First Racing Record"
          onCta={() => onOpenRacingForm()}
          size="lg"
        />
      ) : filteredRacingEntries.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
          <p className="text-sm font-semibold text-foreground mb-1">No racing records match your filters</p>
          <button
            onClick={() => { setRacingSearch(''); setRacingHorseFilter(''); }}
            className="text-sm text-primary hover:text-primary/80 transition-colors mt-2"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Racing Records
            </p>
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {filteredRacingEntries.length} {filteredRacingEntries.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {['Horse', 'Race', 'Venue', 'Date', 'Status', 'Position', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRacingEntries.map((entry, idx) => {
                  const horse = safeHorses.find((h) => h.id === entry.horse_id);
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        'border-b border-border/30 hover:bg-muted/10 transition-colors',
                        idx % 2 === 0 ? 'bg-card' : 'bg-background'
                      )}
                    >
                      {/* Horse */}
                      <td className="px-4 py-3 max-w-[140px]">
                        {horse ? (
                          <span className="text-sm font-semibold text-foreground block line-clamp-1">{horse.name}</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-sm">—</span>
                        )}
                      </td>

                      {/* Race name + subject */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="text-sm font-semibold text-foreground block line-clamp-1">{entry.race_name}</span>
                        {entry.subject && (
                          <span className="text-[12px] text-muted-foreground italic block line-clamp-1 mt-0.5">{entry.subject}</span>
                        )}
                        {entry.class_grade && (
                          <span
                            className="text-[11px] uppercase tracking-[0.08em] font-bold px-1.5 py-0.5 rounded-sm mt-0.5 inline-block"
                            style={{ background: 'hsl(var(--brand-accent) / 0.12)', color: 'hsl(var(--brand-accent))' }}
                          >
                            {entry.class_grade}
                          </span>
                        )}
                      </td>

                      {/* Venue */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-muted-foreground">{entry.venue}</span>
                          {entry.country && (
                            <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/60">{entry.country}</span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3">
                        {entry.race_date ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CalendarDays size={10} className="text-primary/50 flex-shrink-0" />
                            <span>
                              {new Date(entry.race_date).toLocaleDateString('en-AU', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-sm">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <RacingStatusBadge status={entry.status} />
                      </td>

                      {/* Finish position */}
                      <td className="px-4 py-3">
                        {entry.finish_position !== undefined && entry.finish_position !== null ? (
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color: entry.finish_position === 1 ? 'hsl(var(--brand-accent))' : 'hsl(var(--foreground))' }}
                          >
                            {entry.finish_position === 1 ? '🥇' : ''} {entry.finish_position}
                            {entry.margin ? <span className="text-[12px] text-muted-foreground ml-1 font-normal">({entry.margin})</span> : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-sm">—</span>
                        )}
                      </td>

                      {/* Actions — driven by the server's per-record flags. */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {entry.canEdit === false ? (
                            <span className="text-[12px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/60">
                              View only
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => onOpenRacingForm(entry)}
                                className="text-[12px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                                aria-label={`Edit ${entry.race_name}`}
                              >
                                Edit
                              </button>
                              {entry.canShare !== false && (
                                <button
                                  onClick={() => setShareTargetId(entry.id)}
                                  className="text-[12px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                                  aria-label={`Share ${entry.race_name}`}
                                >
                                  <Share2 size={11} />
                                  {(entry.sharedWith?.length ?? 0) > 0 ? entry.sharedWith!.length : 'Share'}
                                </button>
                              )}
                              <button
                                onClick={() => onRacingDelete(entry)}
                                className="text-[12px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
                                aria-label={`Remove ${entry.race_name}`}
                              >
                                Remove
                              </button>
                            </>
                          )}
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

      {/* Share */}
      <RecordShareDialog
        open={!!shareTarget}
        onClose={() => setShareTargetId(null)}
        recordLabel="racing record"
        ownerName={shareTarget?.createdByName}
        sharedWith={shareTarget?.sharedWith ?? []}
        onShare={(email) => shareEntry(shareTarget!.id, email)}
        onUnshare={(userId) => unshareEntry(shareTarget!.id, userId)}
      />

      {/* Delete confirm */}
      <DeleteConfirmDialog
        open={racingDeleteConfirm && !!racingDeleteTarget}
        title="Remove racing record"
        message={
          <>
            Remove <span className="font-semibold">{racingDeleteTarget?.race_name}</span>
            {' '}from Stable Press? This cannot be undone.
          </>
        }
        confirmLabel="Remove"
        onCancel={() => { setRacingDeleteConfirm(false); setRacingDeleteTarget(null); }}
        onConfirm={confirmRacingDelete}
      />

      {/* Info note */}
      {safeEntries.length > 0 && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
          <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Racing records added here surface on each <strong className="text-foreground">Thoroughbred Profile</strong>.
            Records with linked jockeys and trainers will also appear on their party profiles.
          </p>
        </div>
      )}
    </div>
  );
}
