import { motion } from 'framer-motion';
import { Users, Calendar, ChevronRight, Clock, Trash2 } from 'lucide-react';

import type { EpisodeStatus, DistributionChannel, PodcastEpisode } from '@/types/podcast';
import { cn } from '@/lib/utils';

import { WORKFLOW_STAGES, DISTRIBUTION_CHANNELS, STATUS_COLORS } from './constants';
import { formatDuration, formatDate } from './helpers';

// ── Sub-components ───────────────────────────────────────────────────────────

export function DistributionBadges({ channels }: { channels: DistributionChannel[] }) {
  const safeChannels = channels ?? [];
  return (
    <div className="flex flex-wrap gap-1">
      {DISTRIBUTION_CHANNELS.map((ch) => {
        const active = safeChannels.includes(ch.id);
        return (
          <span
            key={ch.id}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium border',
              active ? ch.color : 'opacity-30 bg-muted text-muted-foreground border-border'
            )}
          >
            {ch.icon}
            {ch.label}
          </span>
        );
      })}
    </div>
  );
}

export function StatusPill({ status }: { status: EpisodeStatus }) {
  const stage = WORKFLOW_STAGES.find((s) => s.status === status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wide border',
        STATUS_COLORS[status]
      )}
    >
      {stage?.icon}
      {stage?.label}
    </span>
  );
}

// ── Episode Card ─────────────────────────────────────────────────────────────

export function EpisodeCard({
  episode,
  onOpen,
  onDelete,
}: {
  episode: PodcastEpisode;
  onOpen: (ep: PodcastEpisode) => void;
  /**
   * Omitted when this account cannot delete this episode — the button is absent
   * rather than disabled, because "you produced it and it isn't live yet" is not
   * something a tooltip usefully explains. See `canDeleteEpisode`.
   */
  onDelete?: (ep: PodcastEpisode) => void;
}) {
  const guests = episode.guests ?? [];
  const distributionChannels = episode.distributionChannels ?? [];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="bg-card border border-border rounded-sm hover:border-primary/40 transition-colors cursor-pointer group"
      onClick={() => onOpen(episode)}
    >
      {episode.coverUrl && (
        <div className="relative h-24 overflow-hidden rounded-t-sm">
          <img
            src={episode.coverUrl}
            alt={episode.title}
            crossOrigin="anonymous"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
          <div className="absolute bottom-2 left-3">
            <StatusPill status={episode.status} />
          </div>
        </div>
      )}

      <div className="p-3">
        {!episode.coverUrl && (
          <div className="mb-2">
            <StatusPill status={episode.status} />
          </div>
        )}

        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1">
          S{episode.season} · Ep {episode.episodeNumber}
        </p>
        <h4 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground leading-snug line-clamp-2 mb-2">
          {episode.title}
        </h4>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {formatDuration(episode.durationSeconds ?? 0)}
          </span>
          {guests.length > 0 && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              {guests.length} guest{guests.length !== 1 ? 's' : ''}
            </span>
          )}
          {episode.scheduledFor && episode.status !== 'published' && (
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(episode.scheduledFor)}
            </span>
          )}
        </div>

        {distributionChannels.length > 0 && (
          <div className="mt-2">
            <DistributionBadges channels={distributionChannels} />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="truncate text-[10px] text-muted-foreground">{episode.host}</span>
          <div className="flex flex-shrink-0 items-center gap-0.5">
            {onDelete && (
              <button
                type="button"
                aria-label={`Delete ${episode.title || 'this episode'}`}
                title="Delete episode"
                // The whole card opens the drawer, so this has to stop the click
                // from reaching it — otherwise deleting also opens what you just
                // asked to delete.
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(episode);
                }}
                className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={12} />
              </button>
            )}
            <ChevronRight size={12} className="text-muted-foreground transition-colors group-hover:text-primary" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
