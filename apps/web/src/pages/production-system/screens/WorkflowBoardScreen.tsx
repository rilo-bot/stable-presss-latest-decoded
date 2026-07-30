import { AlertCircle } from 'lucide-react';

import { WORKFLOW_STAGES } from '@/lib/workflow';
import { WorkflowBoard } from '../workflow/WorkflowBoard';
import { usePS } from '../context';

export default function WorkflowBoardScreen() {
  const s = usePS();
  const scoped = s.visibleStages.length < WORKFLOW_STAGES.length;

  return (
    <>
      {/* Scope notice — shown whenever the user cannot see the whole board. */}
      {scoped && (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-sm border px-4 py-3 text-sm"
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

      <WorkflowBoard
        visibleStages={s.visibleStages}
        buckets={s.buckets}
        isContributor={s.isContributor}
        myStories={s.myStories}
        totalStories={s.totalStories}
        currentUserDisplayName={s.currentUser?.displayName ?? null}
        onMove={s.handleMove}
        onEdit={s.handleEdit}
        onDelete={s.handleDelete}
        onNewInColumn={s.handleNewInColumn}
        onOpenStudio={s.handleOpenStudio}
      />
    </>
  );
}
