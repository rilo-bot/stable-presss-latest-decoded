import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

function Shimmer({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-sm bg-muted/60 motion-reduce:animate-none',
        className
      )}
    />
  );
}

/**
 * Article card skeleton — matches ArticleCard "default" variant layout.
 * Stagger delay is applied by the parent via animationDelay inline style.
 */
export function ArticleSkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'border border-border/50 rounded-sm overflow-hidden bg-card',
        className
      )}
    >
      {/* Image placeholder */}
      <Shimmer className="w-full h-44" />
      <div className="p-4 space-y-2.5">
        {/* Category tag */}
        <Shimmer className="h-3 w-20" />
        {/* Title — two lines */}
        <Shimmer className="h-5 w-full" />
        <Shimmer className="h-5 w-4/5" />
        {/* Byline */}
        <div className="flex items-center gap-3 pt-1">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

/**
 * Horse card skeleton — matches the new photo-first HorseCard layout.
 */
export function HorseSkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'border border-border/50 rounded-sm bg-card overflow-hidden',
        className
      )}
    >
      {/* Photo hero placeholder */}
      <Shimmer className="w-full h-44 rounded-none" />

      <div className="p-4 space-y-3">
        {/* Accent stripe + name */}
        <div className="flex items-start gap-2.5">
          <Shimmer className="w-[3px] h-6 flex-shrink-0 rounded-full" />
          <Shimmer className="h-6 w-2/3" />
        </div>

        {/* Divider */}
        <div className="h-px bg-border/40" />

        {/* 2-col meta grid */}
        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <Shimmer className="h-2.5 w-10" />
              <Shimmer className="h-3.5 w-20" />
            </div>
          ))}
        </div>

        {/* CTA row */}
        <div className="flex justify-end pt-1">
          <Shimmer className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact sidebar article skeleton — matches ArticleCard "compact" variant.
 */
export function CompactArticleSkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 py-3 border-b border-border/40',
        className
      )}
    >
      <Shimmer className="flex-shrink-0 w-16 h-14 rounded-sm" />
      <div className="flex-1 space-y-1.5">
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-4 w-full" />
        <Shimmer className="h-4 w-3/4" />
        <Shimmer className="h-3 w-20" />
      </div>
    </div>
  );
}

/**
 * Leaderboard row skeleton — matches LeaderboardTable row layout.
 */
export function LeaderboardSkeletonRow({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-border/40',
        className
      )}
    >
      <Shimmer className="w-6 h-4 rounded-sm" />
      <Shimmer className="flex-1 h-4" />
      <Shimmer className="w-16 h-4 rounded-sm" />
    </div>
  );
}

/**
 * Race card skeleton — matches RaceCard layout with horse runners.
 */
export function RaceSkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'border border-border/50 rounded-sm bg-card overflow-hidden',
        className
      )}
    >
      {/* Header band */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
        <div className="space-y-1.5">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="h-5 w-48" />
        </div>
        <Shimmer className="h-6 w-16 rounded-sm" />
      </div>
      {/* Runners */}
      <div className="p-4 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <Shimmer className="w-5 h-4 rounded-sm" />
            <Shimmer className="flex-1 h-4" />
            <Shimmer className="w-12 h-4 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Podcast episode row skeleton.
 */
export function PodcastSkeletonRow({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 border-b border-border/40',
        className
      )}
    >
      {/* Play button */}
      <Shimmer className="flex-shrink-0 w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-4 w-full" />
        <Shimmer className="h-3 w-32" />
      </div>
      <Shimmer className="w-12 h-3 rounded-sm" />
    </div>
  );
}

/**
 * Generic content block skeleton — useful for detail pages.
 */
export function ContentBlockSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <Shimmer className="h-6 w-3/4" />
      <Shimmer className="h-4 w-full" />
      <Shimmer className="h-4 w-full" />
      <Shimmer className="h-4 w-2/3" />
    </div>
  );
}
