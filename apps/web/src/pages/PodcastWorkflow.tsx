import { useState, useMemo, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mic, Plus, ChevronRight } from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import { usePodcastStore } from '@/stores/podcastStore';
import { can } from '@/lib/permissions';
import type { EpisodeStatus, PodcastEpisode } from '@/types/podcast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { WORKFLOW_STAGES } from './podcast-workflow/constants';
import { EpisodeCard } from './podcast-workflow/components';
import { CreateEpisodeDialog } from './podcast-workflow/CreateEpisodeDialog';
import { EpisodeDetailPanel } from './podcast-workflow/EpisodeDetailPanel';

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PodcastWorkflow() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchPodcastEpisodes = usePodcastStore((s) => s.fetchPodcastEpisodes);
  useEffect(() => {
    fetchPodcastEpisodes();
  }, [fetchPodcastEpisodes]);
  // === end auto fetch-on-mount ===

  const currentUser = useAuthStore((s) => s.currentUser);
  const navigate = useNavigate();
  const role = currentUser?.role;

  const episodes = usePodcastStore((s) => s.episodes);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<PodcastEpisode | null>(null);
  const [filterStatus, setFilterStatus] = useState<EpisodeStatus | 'all'>('all');

  const hasPodcastAccess =
    can(role, 'podcast.manage') ||
    can(role, 'podcast.episode.create') ||
    can(role, 'podcast.episode.approve') ||
    can(role, 'podcast.episode.edit_any');

  const canCreate = can(role, 'podcast.episode.create');

  const filteredEpisodes = useMemo(() => {
    const base =
      filterStatus === 'all'
        ? episodes
        : episodes.filter((e) => e.status === filterStatus);
    return [...base].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [episodes, filterStatus]);

  const statsByStatus = useMemo(
    () =>
      WORKFLOW_STAGES.reduce((acc, s) => {
        acc[s.status] = episodes.filter((e) => e.status === s.status).length;
        return acc;
      }, {} as Record<EpisodeStatus, number>),
    [episodes]
  );

  if (!hasPodcastAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mic size={24} className="text-primary" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-2">
            Restricted Access
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Podcast workflow management is available to Podcast Producers, Editors, and Administrators.
          </p>
          <Button variant="outline" onClick={() => navigate('/newsroom')}>
            Return to Newsroom
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* Header band */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-primary-foreground/60 mb-2">
                Podcast Production
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold">
                Publishing Workflow
              </h1>
              <div
                className="h-px w-16 mt-3 opacity-40"
                style={{ background: 'hsl(var(--brand-accent))' }}
              />
              <p className="mt-3 text-primary-foreground/70 text-sm max-w-lg">
                Manage every episode from first draft to live distribution across Spotify, Apple
                Podcasts, RSS, and beyond.
              </p>
            </div>

            {/* Macro stats */}
            <div className="flex flex-wrap items-center gap-5">
              {[
                { label: 'Total', count: episodes.length },
                {
                  label: 'In Production',
                  count: episodes.filter(
                    (e) => e.status !== 'published' && e.status !== 'draft'
                  ).length,
                },
                { label: 'Live', count: statsByStatus['published'] ?? 0 },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div
                    className="font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {s.count}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-primary-foreground/60">
                    {s.label}
                  </div>
                </div>
              ))}

              {canCreate && (
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-medium"
                >
                  <Plus size={15} className="mr-1.5" />
                  New Episode
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Workflow pipeline summary */}
      <section className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            <button
              onClick={() => setFilterStatus('all')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-medium border transition-colors',
                filterStatus === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/40'
              )}
            >
              All
              <span className="font-bold tabular-nums">{episodes.length}</span>
            </button>

            {WORKFLOW_STAGES.map((stage, i) => (
              <div key={stage.status} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight size={10} className="text-muted-foreground/40 flex-shrink-0" />
                )}
                <button
                  onClick={() => setFilterStatus(stage.status)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium border transition-colors',
                    filterStatus === stage.status
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                  )}
                >
                  {stage.icon}
                  {stage.label}
                  {(statsByStatus[stage.status] ?? 0) > 0 && (
                    <span
                      className={cn(
                        'font-bold tabular-nums text-[10px] px-1.5 py-0.5 rounded-full',
                        filterStatus === stage.status
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-primary/15 text-primary'
                      )}
                    >
                      {statsByStatus[stage.status]}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Episode grid */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {filteredEpisodes.length === 0 ? (
          <div className="text-center py-20 border border-border rounded-sm bg-card">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Mic size={24} className="text-primary" />
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground mb-2">
              {filterStatus === 'all'
                ? 'No episodes yet.'
                : `No episodes in ${WORKFLOW_STAGES.find((s) => s.status === filterStatus)?.label}.`}
            </h3>
            <div
              className="h-px w-12 mx-auto mb-3"
              style={{ background: 'hsl(var(--brand-accent))' }}
            />
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
              {filterStatus === 'all'
                ? 'Create your first episode to begin the production workflow.'
                : 'Episodes will appear here as they move through the pipeline.'}
            </p>
            {canCreate && filterStatus === 'all' && (
              <Button
                className="bg-primary text-primary-foreground"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={14} className="mr-1.5" />
                Create First Episode
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredEpisodes.map((ep) => (
                <EpisodeCard key={ep.id} episode={ep} onOpen={setSelectedEpisode} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* How it works — workflow guide */}
      <section className="border-t border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-6">
            How the Pipeline Works
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {WORKFLOW_STAGES.map((stage, i) => (
              <div key={stage.status} className="flex md:flex-col items-start gap-3 md:gap-2">
                <div className="flex md:flex-col items-center gap-2 md:w-full">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                    {stage.icon}
                  </div>
                  {i < WORKFLOW_STAGES.length - 1 && (
                    <div className="hidden md:block h-px w-full bg-border/60 mt-1 mb-1" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{stage.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    {stage.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dialogs / panels */}
      <CreateEpisodeDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <AnimatePresence>
        {selectedEpisode && (
          <EpisodeDetailPanel
            key={selectedEpisode.id}
            episode={selectedEpisode}
            onClose={() => setSelectedEpisode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
