// ---------------------------------------------------------------------------
// The Stable Hand Operator — ANALYTICS (/production-system/analytics) and
// PIPELINE MAP (/production-system/pipeline). Both read-only.
//
//   analytics.readStoryTiles  the four story tiles the Analytics screen shows,
//                             from the same props AnalyticsView renders.
//   pipeline.readStages       each workflow stage on the Pipeline Map: its count
//                             (the same `buckets` the map renders) and the moves
//                             out of it.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/community.ts.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { useAgentAction } from '@/agent/operator/runtime/registry';
import { can } from '@/lib/permissions';
import { WORKFLOW_STAGES, movesFrom } from '@/lib/workflow';
import type { Article, ArticleStatus } from '@/types/article';

import { useLive } from '../operator-team/opUtils';

export interface AnalyticsTiles {
  publishedCount: number;
  scheduledCount: number;
  totalStories: number;
  pendingReview: number;
}

export function useAnalyticsOperatorActions(tiles: AnalyticsTiles): void {
  const live = useLive(tiles);
  useAgentAction(
    {
      name: 'analytics.readStoryTiles',
      description: 'Read the Analytics tiles: Total Published, Scheduled, Total Stories, In Pipeline (awaiting review).',
      args: z.object({}),
      run: async () => {
        const t = live.current;
        return {
          tiles: [
            { label: 'Total Published', value: t.publishedCount, meaning: 'Stories live on the site' },
            { label: 'Scheduled', value: t.scheduledCount, meaning: 'Stories queued to go live' },
            { label: 'Total Stories', value: t.totalStories, meaning: 'Every story in the system, any stage' },
            { label: 'In Pipeline', value: t.pendingReview, meaning: 'Stories in the Submitted stage, awaiting review' },
          ],
          note:
            'This screen has no traffic analytics (no views or referrers are tracked). Reader reactions are on Emoji Analytics (/production-system/emoji-analytics).',
        };
      },
    },
    can('analytics.view'),
  );
}

export function usePipelineOperatorActions(buckets: Record<ArticleStatus, Article[]>): void {
  const live = useLive(buckets);
  useAgentAction(
    {
      name: 'pipeline.readStages',
      description: 'Read the Pipeline Map: every workflow stage in order with its story count and the moves out of it.',
      args: z.object({}),
      run: async () => {
        const count = (s: ArticleStatus) => live.current?.[s]?.length ?? 0;
        const stages = WORKFLOW_STAGES.map((st, i) => ({
          order: i + 1,
          status: st.status,
          label: st.label,
          sublabel: st.sublabel,
          count: count(st.status),
          movesOut: movesFrom(st.status).map((m) => ({
            label: m.label,
            to: WORKFLOW_STAGES.find((x) => x.status === m.to)?.label ?? m.to,
            backwards: m.back || undefined,
          })),
        }));
        return { stages, total: stages.reduce((n, s) => n + s.count, 0) };
      },
    },
    can('pipeline.view'),
  );
}
