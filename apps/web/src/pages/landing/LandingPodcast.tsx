import { Link } from 'react-router-dom';
import { ArrowRight, Radio, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PodcastEpisode } from '@/types/podcast';
import { fmtMinutes, fmtShortDate } from './helpers';

interface LandingPodcastProps {
  liveEpisodes: PodcastEpisode[];
}

export function LandingPodcast({ liveEpisodes }: LandingPodcastProps) {
  return (
    <div className="bg-primary rounded-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Radio
            size={13}
            style={{ color: 'hsl(var(--brand-accent))' }}
          />
          <span
            className="text-[9px] uppercase tracking-[0.2em] font-bold"
            style={{ color: 'hsl(var(--brand-accent))' }}
          >
            The Stable Press Podcast
          </span>
        </div>
        <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-primary-foreground leading-snug mb-3">
          On the Air
        </h3>
        <div className="h-px w-full bg-primary-foreground/10 mb-4" />
        {liveEpisodes.length > 0 ? (
          <div className="space-y-0">
            {liveEpisodes.map((ep, idx) => (
              <Link
                key={ep.id}
                to="/podcast"
                className={cn(
                  'group block py-3 hover:bg-primary-foreground/5 transition-colors -mx-1 px-1 rounded-sm',
                  idx < liveEpisodes.length - 1 &&
                    'border-b border-primary-foreground/10'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center border"
                    style={{ borderColor: 'hsl(var(--brand-accent) / 0.6)' }}
                  >
                    <Play
                      size={10}
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-[9px] uppercase tracking-[0.1em] mb-0.5 font-semibold"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      Ep. {ep.episodeNumber} · {fmtMinutes(ep.durationSeconds)} · {fmtShortDate(ep.publishedAt)}
                    </p>
                    <h4 className="text-[11px] font-semibold text-primary-foreground leading-snug line-clamp-2 group-hover:opacity-80 transition-opacity">
                      {ep.title}
                    </h4>
                    <p className="text-[10px] text-primary-foreground/50 mt-0.5">
                      {ep.guests[0]?.name ?? ep.host}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-primary-foreground/50 py-3">
            No episodes published yet.
          </p>
        )}
      </div>
      <div className="border-t border-primary-foreground/10 px-5 py-2.5">
        <Link
          to="/podcast"
          className="flex items-center justify-between text-[10px] text-primary-foreground/50 hover:text-primary-foreground transition-colors uppercase tracking-[0.1em] font-semibold"
        >
          <span>All episodes</span>
          <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}
