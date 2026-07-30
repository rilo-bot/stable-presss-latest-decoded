import { AlertCircle } from 'lucide-react';

import { WORKFLOW_STAGES } from '@/components/KanbanColumn';
import { WorkflowBoardView } from '../../newsroom/views/WorkflowBoardView';
import { usePS } from '../context';

export default function WorkflowBoardScreen() {
  const s = usePS();
  const scoped = s.visibleStages.length < WORKFLOW_STAGES.length;

  return (
    <>
      {/* Scope notice — shown whenever the user cannot see the whole board. */}
      {scoped && (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: `${s.accentColor}40`, background: `${s.accentColor}08` }}
        >
          <AlertCircle size={14} style={{ color: s.accentColor }} className="mt-0.5 flex-shrink-0" />
          <span className="text-foreground/70">
            Viewing as <strong className="text-foreground">{s.roleLabel}</strong> —
            {s.isContributor
              ? ' you can create drafts and submit stories. Only your own stories are shown.'
              : ` access is scoped to: ${s.visibleStages.map((st) => st.label).join(', ')}.`}
          </span>
        </div>
      )}

      <WorkflowBoardView
        isContributor={s.isContributor}
        myStories={s.myStories}
        totalStories={s.totalStories}
        onNewInColumn={s.handleNewInColumn}
        onOpenStudio={s.handleOpenStudio}
        visibleStages={s.visibleStages}
        activeColumn={s.activeColumn}
        setActiveColumn={s.setActiveColumn}
        buckets={s.buckets}
        onAdvance={s.handleAdvance}
        onEdit={s.handleEdit}
        onDelete={s.handleDelete}
        currentUserDisplayName={s.currentUser?.displayName ?? null}
      />
    </>
  );
}
