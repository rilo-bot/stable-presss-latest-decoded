import type { Horse } from '@/types/horse';
import type { Party } from '@/types/party';
import type { MediaItem } from '@/types/mediaItem';
import type { RacingEntry } from '@/types/racingEntry';
import type { SideNavItem } from '../constants';

interface NewsroomPageHeaderProps {
  activeNav: string;
  visibleNav: SideNavItem[];
  publishedCount: number;
  pendingReview: number;
  horses: Horse[];
  safeParties: Party[];
  mediaItems: MediaItem[];
  racingEntries: RacingEntry[];
}

export function NewsroomPageHeader({
  activeNav,
  visibleNav,
  publishedCount,
  pendingReview,
  horses,
  safeParties,
  mediaItems,
  racingEntries,
}: NewsroomPageHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
          {visibleNav.find((n) => n.id === activeNav)?.label ?? 'Dashboard'}
        </h1>
        {publishedCount > 0 && (activeNav === 'workflow' || activeNav === 'overview') && (
          <span className="flex items-baseline gap-1">
            <span
              className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              {publishedCount}
            </span>
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">in print</span>
          </span>
        )}
        {activeNav === 'editor-hub' && pendingReview > 0 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}
          >
            {pendingReview} stories need attention
          </span>
        )}
        {activeNav === 'horses' && (horses ?? []).length > 0 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(var(--brand-accent) / 0.12)', color: 'hsl(var(--brand-accent))' }}
          >
            {(horses ?? []).length} in the stables
          </span>
        )}
        {activeNav === 'parties' && safeParties.length > 0 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}
          >
            {safeParties.length} {safeParties.length === 1 ? 'party' : 'parties'} registered
          </span>
        )}
        {activeNav === 'media-production-system' && (mediaItems ?? []).length > 0 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(var(--chart-3) / 0.12)', color: 'hsl(var(--chart-3))' }}
          >
            {(mediaItems ?? []).length} media {(mediaItems ?? []).length === 1 ? 'record' : 'records'}
          </span>
        )}
        {activeNav === 'racing-production-system' && (racingEntries ?? []).length > 0 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(var(--chart-1) / 0.12)', color: 'hsl(var(--chart-1))' }}
          >
            {(racingEntries ?? []).length} racing {(racingEntries ?? []).length === 1 ? 'record' : 'records'}
          </span>
        )}
      </div>
      <div className="mt-2 h-px bg-border/50" />
    </div>
  );
}
