import { cn } from '@/lib/utils';
import type { Article, ArticleStatus } from '@/types/article';
import {
  Clock, ChevronRight, Shield, Eye, Send, FileEdit, AlertTriangle,
  CheckCircle, BookOpen, Newspaper, Scale, ClipboardCheck, TrendingDown, Lock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { canEditArticle, can } from '@/lib/permissions';
import type { UserRole } from '@/stores/authStore';

export type KanbanStatus =
  | 'draft'
  | 'submitted'
  | 'editorial_review'
  | 'revision'
  | 'legal_review'
  | 'compliance'
  | 'approved'
  | 'publisher_review'
  | 'scheduled'
  | 'published'
  | 'newsletter'
  | 'bulletin';

export const WORKFLOW_STAGES: {
  status: KanbanStatus;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  accent: string;
  role: string;
  branch?: 'yes' | 'no';
}[] = [
  {
    status: 'draft',
    label: 'Draft',
    sublabel: 'Contributor writing',
    icon: <FileEdit size={13} />,
    accent: 'hsl(var(--muted-foreground))',
    role: 'contributor',
  },
  {
    status: 'submitted',
    label: 'Submitted',
    sublabel: 'Awaiting editorial',
    icon: <Send size={13} />,
    accent: 'hsl(var(--chart-1))',
    role: 'contributor',
  },
  {
    status: 'editorial_review',
    label: 'Editor Review',
    sublabel: 'Editorial sign-off',
    icon: <Eye size={13} />,
    accent: 'hsl(var(--chart-2))',
    role: 'editor',
  },
  {
    status: 'revision',
    label: 'Revision Required',
    sublabel: 'Back to contributor',
    icon: <AlertTriangle size={13} />,
    accent: '#e8a020',
    role: 'contributor',
  },
  {
    status: 'legal_review',
    label: 'Legal Review',
    sublabel: 'Legal sign-off',
    icon: <Scale size={13} />,
    accent: 'hsl(var(--chart-3))',
    role: 'legal',
  },
  {
    status: 'compliance',
    label: 'Compliance Check',
    sublabel: 'Regulatory clearance',
    icon: <ClipboardCheck size={13} />,
    accent: 'hsl(var(--chart-4))',
    role: 'legal',
  },
  {
    status: 'approved',
    label: 'Approved',
    sublabel: 'Ready for publisher',
    icon: <CheckCircle size={13} />,
    accent: '#5da854',
    role: 'editor',
  },
  {
    status: 'publisher_review',
    label: 'Publisher Review',
    sublabel: 'Final publisher sign-off',
    icon: <BookOpen size={13} />,
    accent: 'hsl(var(--brand-accent))',
    role: 'publisher',
  },
  {
    status: 'scheduled',
    label: 'Schedule Publish',
    sublabel: 'Queued for release',
    icon: <Clock size={13} />,
    accent: 'hsl(var(--primary))',
    role: 'publisher',
  },
  {
    status: 'published',
    label: 'Published',
    sublabel: 'Website + App live',
    icon: <TrendingDown size={13} />,
    accent: 'hsl(var(--brand-accent))',
    role: 'publisher',
  },
  {
    status: 'newsletter',
    label: 'Newsletter + Podcast',
    sublabel: 'Distributed to subscribers',
    icon: <Send size={13} />,
    accent: 'hsl(var(--chart-1))',
    role: 'publisher',
  },
  {
    status: 'bulletin',
    label: 'Bulletin Inclusion',
    sublabel: 'Included in bulletin',
    icon: <Newspaper size={13} />,
    accent: 'hsl(var(--primary))',
    role: 'publisher',
  },
];

// The canonical forward-path order (no revision branch)
export const WORKFLOW_FORWARD: KanbanStatus[] = [
  'draft',
  'submitted',
  'editorial_review',
  'legal_review',
  'compliance',
  'approved',
  'publisher_review',
  'scheduled',
  'published',
  'newsletter',
  'bulletin',
];

// Allowed transitions: what each status can advance to
export const ADVANCE_MAP: Record<KanbanStatus, KanbanStatus | null> = {
  draft: 'submitted',
  submitted: 'editorial_review',
  editorial_review: 'legal_review',
  revision: 'editorial_review',
  legal_review: 'compliance',
  compliance: 'approved',
  approved: 'publisher_review',
  publisher_review: 'scheduled',
  scheduled: 'published',
  published: 'newsletter',
  newsletter: 'bulletin',
  bulletin: null,
};

// Revision branch: editorial_review can also send to revision
export const REVISION_STATUSES: KanbanStatus[] = ['editorial_review'];

// Legacy export for Newsroom compatibility
export const KANBAN_COLUMNS = WORKFLOW_STAGES;

interface KanbanCardProps {
  article: Article;
  isActive: boolean;
  columnAccent: string;
  columnStatus: KanbanStatus;
  onAdvance: () => void;
  onSendRevision: () => void;
  onEdit: () => void;
  canAdvance: boolean;
  canRevision: boolean;
  // Permission context
  userRole: UserRole | null;
  currentUserDisplayName: string | null;
}

function KanbanCard({
  article,
  isActive,
  columnAccent,
  columnStatus,
  onAdvance,
  onSendRevision,
  onEdit,
  canAdvance,
  canRevision,
  userRole,
  currentUserDisplayName,
}: KanbanCardProps) {
  const navigate = useNavigate();
  const nextStatus = ADVANCE_MAP[columnStatus];
  const nextStage = nextStatus
    ? WORKFLOW_STAGES.find((s) => s.status === nextStatus)
    : null;

  // Permission checks
  const canEdit = canEditArticle(userRole, article.author, currentUserDisplayName);

  // Contributors can only advance their own articles from draft→submitted or revision→editorial_review
  const isContributor = userRole === 'contributor';
  const isOwnArticle = article.author === currentUserDisplayName;

  // Legacy/seed articles may lack linkedHorseIds entirely — guard the read.
  const linkedCount = article.linkedHorseIds?.length ?? 0;
  const contributorCanAdvance =
    !isContributor ||
    (isOwnArticle &&
      (columnStatus === 'draft' || columnStatus === 'revision'));

  const showAdvance = canAdvance && nextStage && contributorCanAdvance;

  // Only editors/admins can send to revision
  const showRevision =
    canRevision &&
    can(userRole, 'content.send_revision');

  return (
    <div
      className={cn(
        'group bg-card border border-border/60 rounded-sm p-3',
        'transition-all duration-150',
        'hover:border-primary/40 hover:shadow-sm',
        'focus-within:ring-1 focus-within:ring-ring',
        isActive && 'ring-1 ring-primary/30'
      )}
    >
      {/* Category & reading time */}
      <div className="flex items-center justify-between mb-2">
        {article.category ? (
          <span
            className="text-[10px] uppercase tracking-[0.14em] font-bold"
            style={{ color: columnAccent }}
          >
            {article.category}
          </span>
        ) : (
          <span />
        )}
        {article.readingTime && (
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Clock size={8} />
            {article.readingTime}m
          </span>
        )}
      </div>

      {/* Title */}
      <button
        className="w-full text-left mb-2 focus-visible:outline-none"
        onClick={() => navigate(`/articles/${article.id}`)}
        aria-label={`Read article: ${article.title}`}
      >
        <h3 className="font-[family-name:var(--font-display)] text-[13px] font-bold leading-snug text-foreground hover:opacity-75 transition-opacity line-clamp-3">
          {article.title}
        </h3>
      </button>

      {/* Author */}
      <p className="text-[12px] text-muted-foreground mb-2 truncate">
        {article.author}
        {isContributor && !isOwnArticle && (
          <span className="ml-1.5 text-[11px] text-muted-foreground/50 italic">(not yours)</span>
        )}
      </p>

      {/* Linked horses */}
      {linkedCount > 0 && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground border border-border/50 rounded-sm px-1.5 py-0.5">
            {linkedCount} horse
            {linkedCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/40 flex-wrap">
        {canEdit ? (
          <button
            onClick={onEdit}
            className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors font-semibold focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label="Edit article"
          >
            Edit
          </button>
        ) : (
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground/40">
            <Lock size={9} />
            <span className="uppercase tracking-[0.08em]">Read-only</span>
          </span>
        )}

        {/* Revision branch — editor/admin only */}
        {showRevision && (
          <button
            onClick={onSendRevision}
            className="text-[12px] uppercase tracking-[0.08em] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            style={{ color: '#e8a020' }}
            aria-label="Send back for revision"
          >
            Revise
          </button>
        )}

        {/* Forward advance */}
        {showAdvance && nextStage && (
          <button
            onClick={onAdvance}
            className="ml-auto flex items-center gap-0.5 text-[12px] uppercase tracking-[0.08em] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            style={{ color: columnAccent }}
            aria-label={`Advance to ${nextStage.label}`}
          >
            {nextStage.label.length > 12 ? 'Advance' : nextStage.label}
            <ChevronRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  status: KanbanStatus;
  label: string;
  articles: Article[];
  isActiveColumn: boolean;
  onAdvance: (articleId: string, toStatus: KanbanStatus) => void;
  onEdit: (article: Article) => void;
  // Permission context
  userRole?: UserRole | null;
  currentUserDisplayName?: string | null;
}

export function KanbanColumn({
  status,
  label,
  articles,
  isActiveColumn,
  onAdvance,
  onEdit,
  userRole = null,
  currentUserDisplayName = null,
}: KanbanColumnProps) {
  const colConfig = WORKFLOW_STAGES.find((c) => c.status === status)!;
  const canRevision = REVISION_STATUSES.includes(status);
  const nextStatus = ADVANCE_MAP[status];

  const emptyMessages: Record<string, string> = {
    draft: 'No stories being drafted.',
    submitted: 'No stories submitted yet.',
    editorial_review: 'No stories awaiting editorial review.',
    revision: 'No stories sent back for revision.',
    legal_review: 'No stories awaiting legal sign-off.',
    compliance: 'No stories in compliance review.',
    approved: 'No approved stories waiting.',
    publisher_review: 'No stories with the publisher.',
    scheduled: 'Nothing queued for publishing.',
    published: 'Nothing live yet.',
    newsletter: 'No stories distributed yet.',
    bulletin: 'No bulletin inclusions yet.',
  };

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div
        className={cn(
          'flex items-start justify-between px-3 py-3 rounded-t-sm border border-b-0 border-border/60',
          isActiveColumn ? 'bg-primary/5' : 'bg-muted/40'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn('opacity-60 flex-shrink-0', isActiveColumn && 'opacity-100')}
            style={{ color: isActiveColumn ? colConfig.accent : undefined }}
          >
            {colConfig.icon}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                'text-[12px] uppercase tracking-[0.12em] font-bold leading-tight',
                isActiveColumn ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {label}
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
              {colConfig.sublabel}
            </p>
            <p
              className="text-[10px] uppercase tracking-wider mt-0.5 font-semibold"
              style={{ color: colConfig.accent, opacity: 0.7 }}
            >
              {colConfig.role}
            </p>
          </div>
        </div>
        {/* Count */}
        <span
          className={cn(
            'text-[13px] font-bold tabular-nums rounded-sm px-1.5 py-0.5 mt-0.5 flex-shrink-0',
            isActiveColumn
              ? 'bg-primary/15 text-primary'
              : 'bg-border/60 text-muted-foreground'
          )}
        >
          {articles.length}
        </span>
      </div>

      {/* Accent stripe */}
      <div
        className="h-[2px] w-full flex-shrink-0"
        style={{
          background: isActiveColumn
            ? colConfig.accent
            : 'hsl(var(--border) / 0.6)',
        }}
      />

      {/* Cards area */}
      <div className="flex-1 border border-t-0 border-border/60 rounded-b-sm p-3 space-y-2.5 bg-background/30 min-h-[180px]">
        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="font-[family-name:var(--font-display)] italic text-[13px] text-muted-foreground/60">
              {emptyMessages[status] ?? 'No stories here.'}
            </p>
          </div>
        ) : (
          articles.map((article) => {
            const canAdvance = nextStatus !== null;
            return (
              <KanbanCard
                key={article.id}
                article={article}
                isActive={isActiveColumn}
                columnAccent={colConfig.accent}
                columnStatus={status}
                canAdvance={canAdvance}
                canRevision={canRevision}
                userRole={userRole}
                currentUserDisplayName={currentUserDisplayName}
                onAdvance={() => nextStatus && onAdvance(article.id, nextStatus)}
                onSendRevision={() => onAdvance(article.id, 'revision')}
                onEdit={() => onEdit(article)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
