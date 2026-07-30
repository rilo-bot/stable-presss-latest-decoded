/**
 * The editorial workflow — stages, legal moves, and who may make them.
 *
 * One definition, mirrored on the server by `apps/server/src/lib/workflow.ts`.
 * Previously the stage table lived in `components/KanbanColumn.tsx` (a UI file),
 * the transitions lived in an `ADVANCE_MAP` beside it, and nothing checked
 * permissions at all — `handleAdvance` moved a story on click and the server
 * accepted whatever status it was sent.
 */
import type { ReactNode } from 'react';
import { CheckCircle2, Clock, FileEdit, Newspaper, Send } from 'lucide-react';

import type { PermissionAction } from '@/lib/permissions';
import { ARTICLE_STATUSES } from '@/types/article';
import type { ArticleStatus } from '@/types/article';

export interface StageMeta {
  status: ArticleStatus;
  /** Column heading. */
  label: string;
  /** One line under the heading, saying whose court the story is in. */
  sublabel: string;
  icon: ReactNode;
  /** CSS colour for the filled column header, rules and counts. */
  accent: string;
  /**
   * Text colour to use ON `accent`. Explicit per stage rather than a blanket
   * white: the Submitted gold is light enough that white text on it lands around
   * 1.9:1, well under the 4.5:1 minimum.
   */
  onAccent: string;
}

export const WORKFLOW_STAGES: StageMeta[] = [
  {
    status: 'draft',
    label: 'Draft',
    sublabel: 'Being written',
    icon: <FileEdit size={14} />,
    accent: 'hsl(var(--muted-foreground))',
    onAccent: 'hsl(var(--card))',
  },
  {
    status: 'submitted',
    label: 'Submitted',
    sublabel: 'Awaiting approval',
    icon: <Send size={14} />,
    accent: 'hsl(var(--brand-accent))',
    onAccent: 'hsl(var(--brand-accent-foreground))',
  },
  {
    status: 'approved',
    label: 'Approved',
    sublabel: 'Cleared to run',
    icon: <CheckCircle2 size={14} />,
    accent: 'hsl(var(--chart-1))',
    onAccent: 'hsl(var(--card))',
  },
  {
    status: 'scheduled',
    label: 'Schedule Publish',
    sublabel: 'Queued to go live',
    icon: <Clock size={14} />,
    accent: 'hsl(var(--chart-4))',
    onAccent: 'hsl(var(--card))',
  },
  {
    status: 'published',
    label: 'Published',
    sublabel: 'Live',
    icon: <Newspaper size={14} />,
    accent: 'hsl(var(--primary))',
    onAccent: 'hsl(var(--primary-foreground))',
  },
];

export function stageMeta(status: ArticleStatus): StageMeta {
  return WORKFLOW_STAGES.find((s) => s.status === status) ?? WORKFLOW_STAGES[0];
}

/** A move a story can make, and what the mover must be allowed to do. */
export interface Move {
  to: ArticleStatus;
  /** Button label — an action, not a state ("Approve", not "Approved"). */
  label: string;
  permission: PermissionAction;
  /** Sends the story backwards, so it reads as a rejection in the UI. */
  back?: boolean;
}

/**
 * The one move that carries a story forward from each stage. Rendered as the
 * card's primary button.
 */
export const FORWARD_MOVE: Record<ArticleStatus, Move | null> = {
  draft: { to: 'submitted', label: 'Submit', permission: 'content.submit' },
  submitted: { to: 'approved', label: 'Approve', permission: 'content.approve' },
  approved: { to: 'scheduled', label: 'Schedule', permission: 'content.schedule' },
  scheduled: { to: 'published', label: 'Publish', permission: 'content.publish' },
  published: null,
};

/**
 * Everything else a story may do from a given stage: sending it back, and
 * publishing straight from Approved without booking a slot first.
 */
export const OTHER_MOVES: Record<ArticleStatus, Move[]> = {
  draft: [],
  submitted: [
    { to: 'draft', label: 'Request changes', permission: 'content.send_revision', back: true },
  ],
  approved: [
    { to: 'published', label: 'Publish now', permission: 'content.publish' },
    { to: 'submitted', label: 'Send back', permission: 'content.send_revision', back: true },
  ],
  scheduled: [
    { to: 'approved', label: 'Unschedule', permission: 'content.schedule', back: true },
  ],
  published: [],
};

/** Every legal move out of a stage, forward one first. */
export function movesFrom(status: ArticleStatus): Move[] {
  const forward = FORWARD_MOVE[status];
  return [...(forward ? [forward] : []), ...OTHER_MOVES[status]];
}

/** Is `from → to` a legal transition at all (ignoring permissions)? */
export function isLegalMove(from: ArticleStatus, to: ArticleStatus): boolean {
  return movesFrom(from).some((m) => m.to === to);
}

/** The move descriptor for a transition, or undefined if it isn't legal. */
export function findMove(from: ArticleStatus, to: ArticleStatus): Move | undefined {
  return movesFrom(from).find((m) => m.to === to);
}

/**
 * The permission that authorises putting a story INTO a stage, regardless of
 * where it came from. Mirrors `enterPermission` on the server, which enforces it
 * on create. `draft` is null: `content.draft.create` already covers that.
 */
export function enterPermission(to: ArticleStatus): PermissionAction | null {
  switch (to) {
    case 'draft': return null;
    case 'submitted': return 'content.submit';
    case 'approved': return 'content.approve';
    case 'scheduled': return 'content.schedule';
    case 'published': return 'content.publish';
  }
}

/** Stage order, for progress bars and sorting. */
export const STAGE_ORDER: readonly ArticleStatus[] = ARTICLE_STATUSES;

export function stageIndex(status: ArticleStatus): number {
  return STAGE_ORDER.indexOf(status);
}
