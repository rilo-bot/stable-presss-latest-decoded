import { useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePodcastStore } from '@/stores/podcastStore';
import { PodcastPlayer } from '@/components/PodcastPlayer';
import {Mic, LoaderCircle} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PodcastHub() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchPodcastEpisodes = usePodcastStore((s) => s.fetchPodcastEpisodes);
  useEffect(() => {
    fetchPodcastEpisodes();
  }, [fetchPodcastEpisodes]);
  // === end auto fetch-on-mount ===

  const episodes = usePodcastStore((s) => s.episodes);
  const activeEpisodeId = usePodcastStore((s) => s.activeEpisodeId);
  const setActiveEpisode = usePodcastStore((s) => s.setActiveEpisode);

  // Only show published episodes on the public hub
  const publishedEpisodes = useMemo(
    () =>
      (episodes ?? [])
        .filter((ep) => ep?.status === 'published')
        .sort(
          (a, b) =>
            new Date(b.publishedAt ?? 0).getTime() -
            new Date(a.publishedAt ?? 0).getTime()
        ),
    [episodes]
  );

  const latestEpisode = publishedEpisodes[0] ?? null;

  const totalDurationSeconds = useMemo(
    () => publishedEpisodes.reduce((sum, ep) => sum + (ep.durationSeconds ?? 0), 0),
    [publishedEpisodes]
  );

  const totalHours = Math.floor(totalDurationSeconds / 3600);

  // Unique seasons from published episodes
  const seasons = useMemo(
    () =>
      Array.from(new Set(publishedEpisodes.map((e) => e.season).filter((s) => s != null))).sort(
        (a, b) => b - a
      ),
    [publishedEpisodes]
  );

  // Unique hosts from published episodes
  const hosts = useMemo(
    () =>
      Array.from(new Set(publishedEpisodes.map((e) => e.host).filter(Boolean))),
    [publishedEpisodes]
  );

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* Hero band */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-primary-foreground/60 mb-2">
                Audio Archive
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-bold leading-tight">
                The Gallop Podcast
              </h1>
              <div
                className="h-px w-20 mt-3 mb-4 opacity-40"
                style={{ background: 'hsl(var(--brand-accent))' }}
              />
              <p className="text-primary-foreground/80 text-sm md:text-base max-w-xl leading-relaxed">
                Long-form conversations with trainers, jockeys, analysts, and the
                custodians of racing history. Press play and settle in.
              </p>
            </div>

            {/* Live stats — only shown when there are published episodes */}
            {publishedEpisodes.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div
                    className="font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {publishedEpisodes.length}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-primary-foreground/60">
                    Episodes
                  </div>
                </div>
                {totalHours > 0 ? (
                  <>
                    <div className="h-8 w-px bg-primary-foreground/20" />
                    <div className="text-center">
                      <div
                        className="font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums"
                        style={{ color: 'hsl(var(--brand-accent))' }}
                      >
                        {totalHours}h
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.1em] text-primary-foreground/60">
                        Total Audio
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Featured / latest episode — only when one exists */}
      {latestEpisode ? (
        <section
          className="border-b border-border"
          style={{ background: 'hsl(var(--brand-accent) / 0.04)' }}
        >
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
            <div className="flex items-center gap-2 mb-4">
              <LoaderCircle size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Latest Episode
              </span>
            </div>
            <PodcastPlayer
              episode={latestEpisode}
              isActive={activeEpisodeId === latestEpisode.id}
              onActivate={() => setActiveEpisode(latestEpisode.id)}
            />
          </div>
        </section>
      ) : null}

      {/* Main content grid */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Episode list — 2/3 */}
          <div className="lg:col-span-2">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-2">
              All Episodes
            </h2>
            <div className="h-px bg-border/60 mb-6" />

            {publishedEpisodes.length === 0 ? (
              /* ── Empty state ── */
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="text-center py-20 border border-border rounded-sm bg-card"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Mic size={28} className="text-primary" />
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground mb-2">
                  The microphones are live.
                </h3>
                <div
                  className="h-px w-12 mx-auto mb-3"
                  style={{ background: 'hsl(var(--brand-accent))' }}
                />
                <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed mb-5">
                  No episodes have been published yet. Head to the Podcast Workflow to
                  create and publish your first episode.
                </p>
                <Link
                  to="/podcast/workflow"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-5 py-2.5 rounded-sm hover:bg-primary/90 transition-colors"
                >
                  <Mic size={14} />
                  Go to Podcast Workflow
                </Link>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {publishedEpisodes.map((episode, i) => (
                  <motion.div
                    key={episode.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.18, ease: 'easeOut' }}
                  >
                    <PodcastPlayer
                      episode={episode}
                      isActive={activeEpisodeId === episode.id}
                      onActivate={() => setActiveEpisode(episode.id)}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar — about + season guide + hosts */}
          <aside className="space-y-6">
            <div className="sticky top-24 space-y-6">
              {/* About the show */}
              <div className="border border-border rounded-sm bg-card p-5">
                <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
                  About the Show
                </p>
                <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground mb-2">
                  The Gallop Podcast
                </h3>
                <div className="h-px bg-border/60 mb-3" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A weekly long-form audio programme from the editors of The Gallop
                  Racing Journal. We go beyond the results — into the stables, the
                  salerooms, and the minds of those who shape the sport.
                </p>
                <div
                  className="mt-4 border-l-2 pl-3 py-1 italic text-sm font-[family-name:var(--font-display)] text-foreground leading-relaxed"
                  style={{ borderColor: 'hsl(var(--brand-accent))' }}
                >
                  "The camera catches the finish. The microphone catches everything
                  that comes before it."
                </div>
              </div>

              {/* Season breakdown — only if there are seasons */}
              {seasons.length > 0 ? (
                <div className="border border-border rounded-sm bg-card p-5">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
                    Season Guide
                  </p>
                  {seasons.map((season) => {
                    const seasonEps = publishedEpisodes.filter(
                      (e) => e.season === season
                    );
                    const seasonDuration = seasonEps.reduce(
                      (sum, e) => sum + (e.durationSeconds ?? 0),
                      0
                    );
                    const sH = Math.floor(seasonDuration / 3600);
                    const sM = Math.floor((seasonDuration % 3600) / 60);
                    return (
                      <div
                        key={season}
                        className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                      >
                        <div>
                          <span className="font-[family-name:var(--font-display)] font-bold text-sm text-foreground">
                            Season {season}
                          </span>
                          <div className="text-[11px] text-muted-foreground">
                            {seasonEps.length}{' '}
                            {seasonEps.length === 1 ? 'episode' : 'episodes'}
                          </div>
                        </div>
                        <span
                          className="font-[family-name:var(--font-display)] font-bold text-sm tabular-nums"
                          style={{ color: 'hsl(var(--brand-accent))' }}
                        >
                          {sH > 0 ? `${sH}h ` : ''}{sM}m
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Hosts — only if there are hosts */}
              {hosts.length > 0 ? (
                <div className="border border-border rounded-sm bg-card p-5">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
                    Regular Hosts
                  </p>
                  {hosts.map((host) => {
                    const count = publishedEpisodes.filter(
                      (e) => e.host === host
                    ).length;
                    return (
                      <div
                        key={host}
                        className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center">
                            <Mic size={10} className="text-primary" />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {host}
                          </span>
                        </div>
                        <span
                          className="font-[family-name:var(--font-display)] text-sm font-bold tabular-nums"
                          style={{ color: 'hsl(var(--brand-accent))' }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}