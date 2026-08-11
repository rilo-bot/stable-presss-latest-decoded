/**
 * The Overview.
 *
 * This screen used to be a thin adapter over `newsroom/views/OverviewView.tsx`,
 * which in turn mounted `components/newsroom/NewsroomDashboard.tsx` — nine
 * stacked blocks between them, with the story totals printed twice and three
 * separate navigation grids that between them re-listed the sidebar and pointed
 * five links at screens that had been deleted. Both files are gone; see
 * `../overview/sections.tsx` for what replaced them and `../overview/navTargets.ts`
 * for the dead links.
 *
 * The layout owns the "File a Story" button in the top bar for this screen
 * (STORY_SCREENS in ProductionSystemLayout), so filing is deliberately NOT
 * repeated here. "Start something" holds only the entry points the top bar
 * doesn't already cover.
 */
import { BookOpen, PenLine, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/EmptyState';
import { can, canAny, canEditArticle, visibleWorkflowStages } from '@/lib/permissions';
import { WORKFLOW_STAGES } from '@/lib/workflow';
import type { StageMeta } from '@/lib/workflow';
import { useAgentUi } from '@/stores/agentUiStore';

import { usePS } from '../context';
import { resolveWhere } from '../overview/navTargets';
import { useOverviewSummary } from '../overview/useOverviewSummary';
import {
  AttentionPanel, OverviewMasthead, PipelinePanel, RecentStoriesPanel, StartRow,
} from '../overview/sections';
import type { AttentionRow, LedgerEntry, StartTile } from '../overview/sections';

export default function OverviewScreen() {
  const s = usePS();
  const navigate = useNavigate();
  const askAgent = useAgentUi((a) => a.ask);
  const { summary, brief, loading, error, briefLoading, reload, reloadBrief } =
    useOverviewSummary();

  const displayTotal = s.isContributor ? s.myStories : s.totalStories;

  // Figures come from the SAME buckets the pipeline strip counts, not from the
  // server summary, so the band and the strip can never disagree by a story.
  const figures = [
    {
      label: s.isContributor ? 'My stories' : 'Total stories',
      value: displayTotal,
      hint: s.isContributor ? 'Filed by you' : 'In the system',
    },
    { label: 'Awaiting action', value: s.pendingReview, hint: 'Submitted for review' },
    { label: 'Scheduled', value: s.scheduledCount, hint: 'Queued to go live' },
    { label: 'Published', value: s.publishedCount, hint: 'Live on the site' },
  ];

  // The register ledger — one line where six stat cards used to be. Each entry is
  // dropped when the count is zero (sections.tsx) or when this role has no such
  // screen to send them to.
  const snap = summary?.snapshot;
  const ledger: LedgerEntry[] = snap
    ? [
        { label: 'horses', value: snap.horses, to: resolveWhere('horses') },
        { label: 'people', value: snap.parties, to: resolveWhere('parties') },
        {
          label: 'upcoming races',
          value: snap.upcomingRaces,
          to: resolveWhere('racing-production-system'),
        },
        { label: 'bulletins', value: snap.issues, to: resolveWhere('magazine-v2') },
      ]
    : [];

  // Every queue link resolved and availability-checked; anything this role can't
  // open is dropped rather than rendered as a link back to this page.
  const attentionRows: AttentionRow[] = (summary?.needsAttention ?? [])
    .map((n) => {
      const to = resolveWhere(n.where);
      return to ? { id: n.id, label: n.label, count: n.count, to } : null;
    })
    .filter((r): r is AttentionRow => r !== null);

  // Contributors see only the stages their role is ticked for, the same axis the
  // board uses.
  const stages = s.isContributor
    ? WORKFLOW_STAGES.filter((st) => visibleWorkflowStages().includes(st.status))
    : WORKFLOW_STAGES;
  const stageCounts = Object.fromEntries(
    WORKFLOW_STAGES.map((st) => [st.status, s.buckets[st.status]?.length ?? 0]),
  );
  const boardPath = resolveWhere('workflow');

  const openStage = (stage: StageMeta) => {
    if (!boardPath) return;
    s.setActiveColumn(stage.status);
    navigate(boardPath);
  };

  const instantPath = resolveWhere('instant');
  const blogsPath = resolveWhere('blogs');
  const magazinePath = resolveWhere('magazine');
  const startTiles: StartTile[] = ([
    instantPath && canAny(['stories.create', 'blogs.create'])
      ? {
          key: 'instant',
          icon: <Zap size={16} />,
          title: 'Instant capture',
          meta: 'Snap a photo or talk it through, then review the draft it writes',
          badge: 'New',
          to: instantPath,
        }
      : null,
    blogsPath && can('blogs.create')
      ? {
          key: 'blogs',
          icon: <PenLine size={16} />,
          title: 'Write a blog post',
          meta: 'Longform posts, with the Blog Studio on hand to draft or revise',
          to: blogsPath,
        }
      : null,
    // Magazines have a permission now — this tile used to render for every staff
    // member because there was nothing to check.
    magazinePath && can('magazine.create')
      ? {
          key: 'magazine',
          icon: <BookOpen size={16} />,
          title: 'Build a bulletin',
          meta: 'Start from a brief, an uploaded PDF, or another edition’s layout',
          to: magazinePath,
        }
      : null,
  ] as Array<StartTile | null>).filter((t): t is StartTile => t !== null);

  return (
    <div className="space-y-6">
      <OverviewMasthead
        name={s.currentUser?.name ?? 'there'}
        roleLabel={s.roleLabel}
        isContributor={s.isContributor}
        brief={brief}
        briefLoading={briefLoading}
        onRefreshBrief={() => void reloadBrief()}
        onAskAgent={() =>
          askAgent(
            'I’m on the Campaign Engine overview. Tell me what needs my attention today and offer to help with the first thing.',
          )
        }
        figures={figures}
        ledger={ledger}
      />

      <AttentionPanel
        rows={attentionRows}
        loading={loading && !summary}
        error={error}
        onRetry={() => void reload()}
      />

      {/* A role can be ticked for no kanban stages at all, in which case there is
          no pipeline to show — not a strip of empty segments. */}
      {displayTotal > 0 && stages.length > 0 && (
        <PipelinePanel
          stages={stages}
          counts={stageCounts}
          boardPath={boardPath}
          onOpenStage={openStage}
        />
      )}

      <StartRow tiles={startTiles} />

      {displayTotal === 0 ? (
        <EmptyState
          icon={PenLine}
          heading="No stories in the queue. The press is ready when you are."
          description="File your first story to begin building the newsroom record."
          ctaLabel="File a Story"
          onCta={() => s.handleNewInColumn('draft')}
          secondaryCtaLabel="Story Studio AI"
          onSecondaryCta={s.handleOpenStudio}
        />
      ) : (
        <RecentStoriesPanel
          title={s.isContributor ? 'My recent stories' : 'Recent activity'}
          articles={s.filteredArticles.slice(0, 8)}
          allStoriesPath={resolveWhere('all-stories')}
          canEdit={(a) => canEditArticle(a.author, s.currentUser?.name)}
          onEdit={s.handleEdit}
        />
      )}
    </div>
  );
}
