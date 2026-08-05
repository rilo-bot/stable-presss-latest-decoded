/**
 * Podcast — /production-system/podcast
 *
 * Episode production, from first draft to live distribution. Cards for every
 * episode, a stage strip that doubles as the filter, and a right-hand drawer per
 * episode (see podcast-workflow/EpisodeDetailPanel).
 *
 * This was `/podcast/workflow`, a standalone page wearing the PUBLIC site's
 * header and its own full-width green hero band — the last staff surface outside
 * the Campaign Engine, reachable only from a link in the account dropdown. The
 * band and the macro stat tiles are gone: the top bar already names the screen,
 * and the stage strip below already counts every stage including Published, so
 * the tiles were the same numbers twice.
 *
 * The module gate lives in ProductionSystemLayout, which redirects away from a
 * screen whose module the role lacks. The check below is the second gate: the
 * module says "you get the surface", the permissions say "you can do something
 * with it", and a role can hold the first without the second (the row has one
 * `requiresPermission` and this screen needs any of four powers).
 */
import { useState, useMemo, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Mic, Plus, ChevronRight } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { usePodcastStore } from '@/stores/podcastStore';
import { useAuthStore } from '@/stores/authStore';
import { can } from '@/lib/permissions';
import type { EpisodeStatus, PodcastEpisode } from '@/types/podcast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { WORKFLOW_STAGES } from '@/pages/podcast-workflow/constants';
import { canDeleteEpisode } from '@/pages/podcast-workflow/helpers';
import { EpisodeCard } from '@/pages/podcast-workflow/components';
import { CreateEpisodeDialog } from '@/pages/podcast-workflow/CreateEpisodeDialog';
import { DeleteEpisodeDialog } from '@/pages/podcast-workflow/DeleteEpisodeDialog';
import { EpisodeDetailPanel } from '@/pages/podcast-workflow/EpisodeDetailPanel';

export default function PodcastScreen() {
  const fetchPodcastEpisodes = usePodcastStore((s) => s.fetchPodcastEpisodes);
  useEffect(() => {
    fetchPodcastEpisodes();
  }, [fetchPodcastEpisodes]);

  const episodes = usePodcastStore((s) => s.episodes);
  const deleteEpisode = usePodcastStore((s) => s.deleteEpisode);
  const displayName = useAuthStore((s) => s.currentUser?.name);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<PodcastEpisode | null>(null);
  const [filterStatus, setFilterStatus] = useState<EpisodeStatus | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<PodcastEpisode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hasPodcastAccess =
    can('podcast.manage') ||
    can('podcast.episode.create') ||
    can('podcast.episode.approve') ||
    can('podcast.episode.edit_any');

  const canCreate = can('podcast.episode.create');

  const filteredEpisodes = useMemo(() => {
    const base =
      filterStatus === 'all' ? episodes : episodes.filter((e) => e.status === filterStatus);
    return [...base].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [episodes, filterStatus]);

  const statsByStatus = useMemo(
    () =>
      WORKFLOW_STAGES.reduce((acc, s) => {
        acc[s.status] = episodes.filter((e) => e.status === s.status).length;
        return acc;
      }, {} as Record<EpisodeStatus, number>),
    [episodes],
  );

  // The store rolls the optimistic removal back and reports the server's own
  // refusal, so success is announced only when it actually happened.
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteEpisode(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) return;
    toast.success(`“${deleteTarget.title}” deleted.`);
    // The drawer may be open on the episode that just went.
    if (selectedEpisode?.id === deleteTarget.id) setSelectedEpisode(null);
  };

  if (!hasPodcastAccess) {
    return (
      <div className="px-1 py-1">
        <EmptyState
          icon={Mic}
          heading="No podcast permissions"
          description="This screen needs a role with podcast permissions — producing, approving or editing episodes. Ask an administrator to grant you one."
        />
      </div>
    );
  }

  const activeStage = WORKFLOW_STAGES.find((s) => s.status === filterStatus);

  return (
    <div className="px-1 py-1">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
            Podcast
          </h1>
          <p className="text-xs text-muted-foreground">
            Every episode from first draft to live distribution.
            {episodes.length > 0 && ` ${episodes.length} total.`}
          </p>
        </div>
        {canCreate && (
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            New episode
          </Button>
        )}
      </div>

      {/* Stage strip — the pipeline and the filter are the same control. Scrolls
          inside its own container so it never widens the page. */}
      <div className="mb-4 overflow-x-auto border-b border-border/50 pb-3">
        <div className="flex min-w-max items-center gap-1">
          <button
            onClick={() => setFilterStatus('all')}
            className={cn(
              'flex items-center gap-2 rounded-sm border px-3 py-2 text-xs font-medium transition-colors',
              filterStatus === 'all'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40',
            )}
          >
            All
            <span className="font-bold tabular-nums">{episodes.length}</span>
          </button>

          {WORKFLOW_STAGES.map((stage, i) => (
            <div key={stage.status} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={10} className="flex-shrink-0 text-muted-foreground/40" />}
              <button
                onClick={() => setFilterStatus(stage.status)}
                title={stage.description}
                className={cn(
                  'flex items-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-medium transition-colors',
                  filterStatus === stage.status
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                )}
              >
                {stage.icon}
                {stage.label}
                {(statsByStatus[stage.status] ?? 0) > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                      filterStatus === stage.status
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-primary/15 text-primary',
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

      {filteredEpisodes.length === 0 ? (
        <EmptyState
          icon={Mic}
          heading={filterStatus === 'all' ? 'No episodes yet' : `Nothing in ${activeStage?.label}`}
          description={
            filterStatus === 'all'
              ? 'Create the first episode to begin the production workflow.'
              : activeStage?.description ?? 'Episodes appear here as they move through the pipeline.'
          }
          ctaLabel={canCreate && filterStatus === 'all' ? 'Create the first episode' : undefined}
          onCta={canCreate && filterStatus === 'all' ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filteredEpisodes.map((ep) => (
              <EpisodeCard
                key={ep.id}
                episode={ep}
                onOpen={setSelectedEpisode}
                onDelete={canDeleteEpisode(ep, displayName) ? setDeleteTarget : undefined}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <CreateEpisodeDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <DeleteEpisodeDialog
        episode={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

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
