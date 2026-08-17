/**
 * "On the Air" — the podcast, as a band across the page.
 *
 * WHY IT MOVED. This was a 19rem card in the right-hand rail, third in a stack
 * under a membership form, showing three episode titles at 13px. It is the site's
 * only audio product. Full width it can carry the episode numbers, the durations
 * and the guests at a size you can read, and it gives the page one dark band
 * between two light ones — the rhythm the old page did not have.
 *
 * GREEN IS LEGITIMATE HERE, and this is the one block on the page where that needs
 * saying. THEME-DIRECTION gives green exactly one job — "chrome and commitment, the
 * frame around the work" — and forbids it as "a content background". A band framing
 * a section is chrome, the same way the navbar and the membership band are; what is
 * forbidden is green *behind the work*, which is why the masthead is a photograph or
 * a white sheet and never this colour. On green, gold is a FILL at 5.19:1, so the
 * kickers here correctly use `--brand-accent` rather than `--brand-accent-ink`.
 *
 * RENDERS NOTHING WITH NOTHING TO PLAY. A full-width green band announcing that no
 * episodes exist would be the largest empty state on the page. Same rule as
 * LandingBlog, LandingDirectory and LandingSponsors.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Play, Radio } from 'lucide-react';
import type { PodcastEpisode } from '@/types/podcast';
import { fmtMinutes, fmtShortDate } from './helpers';

interface LandingPodcastProps {
  liveEpisodes: PodcastEpisode[];
}

export function LandingPodcast({ liveEpisodes }: LandingPodcastProps) {
  if (liveEpisodes.length === 0) return null;

  return (
    <section className="bg-primary">
      <div className="px-6 md:px-10 lg:px-16 py-14 md:py-20">

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <Radio size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
              <span
                className="text-[11px] uppercase tracking-[0.16em] font-bold"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                The Stable Press Podcast
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold leading-tight text-primary-foreground">
              On the Air
            </h2>
          </div>

          <Link
            to="/podcast"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-foreground/70 hover:text-primary-foreground transition-colors"
          >
            All episodes <ArrowRight size={14} />
          </Link>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {liveEpisodes.map((ep) => (
            <li key={ep.id}>
              <Link
                to="/podcast"
                className="group flex h-full flex-col rounded-sm border border-primary-foreground/15 p-5 transition-colors hover:bg-primary-foreground/5"
              >
                <span
                  className="mb-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border"
                  style={{ borderColor: 'hsl(var(--brand-accent) / 0.6)' }}
                  aria-hidden="true"
                >
                  <Play size={13} style={{ color: 'hsl(var(--brand-accent))' }} />
                </span>

                <p
                  className="mb-1.5 text-[11px] uppercase tracking-[0.1em] font-bold"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  Ep. {ep.episodeNumber} · {fmtMinutes(ep.durationSeconds)}
                  {fmtShortDate(ep.publishedAt) && ` · ${fmtShortDate(ep.publishedAt)}`}
                </p>

                <h3 className="font-[family-name:var(--font-display)] text-base md:text-lg font-bold leading-snug text-primary-foreground line-clamp-3 group-hover:opacity-85 transition-opacity">
                  {ep.title}
                </h3>

                {/* `/70` is above the `/62` floor that clears 4.5:1 on this green. */}
                <p className="mt-auto pt-3 text-[13px] text-primary-foreground/70">
                  {ep.guests[0]?.name ?? ep.host}
                </p>
              </Link>
            </li>
          ))}
        </ul>

      </div>
    </section>
  );
}
