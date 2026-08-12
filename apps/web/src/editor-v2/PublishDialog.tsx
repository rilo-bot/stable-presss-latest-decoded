// Magazine Builder v2 — "Publish selected pages" picker (ported from the v1
// studio's PublishDialog). Lists every page with a checkbox bound live to its
// selectedForPublish flag (server-persisted), shows the running count, offers
// select/deselect-all, then publishes the frozen edition to the Bulletins
// newsstand with scope 'selected'. Owner-only.

import { useState } from 'react';
import { X, CheckSquare, Square, Send, AlertTriangle } from 'lucide-react';
import { useEditorStore } from './store';
import { useCan } from '@/lib/permissions';
import { ShimmerText } from './BuildProgress';
import { publishBlockers, publishBlockedReason, columnOf, COLUMN_LABEL } from './review';

export function PublishDialog({ onClose, onPublished }: { onClose: () => void; onPublished: (publishedIssueId: string) => void }) {
  const issue = useEditorStore((s) => s.issue);
  const pages = useEditorStore((s) => s.pages);
  const setPageSelected = useEditorStore((s) => s.setPageSelected);
  const publish = useEditorStore((s) => s.publish);
  const [publishing, setPublishing] = useState(false);

  const total = pages.length;
  const selectedCount = pages.filter((p) => p.selectedForPublish).length;
  const allSelected = total > 0 && selectedCount === total;
  // The approval gate, live against the ticks in this dialog. Unticking a blocking
  // page clears the block on the spot — which is what makes the message's own advice
  // ("leave them out of this edition") something you can actually act on here.
  // TWO gates, permission first: the server checks `magazine.publish` on the route
  // before it looks at approvals, so the reason shown has to be checked in the same
  // order or the dialog would blame the pages for a role problem.
  const mayPublish = useCan('magazine.publish');
  const blocked = mayPublish
    ? publishBlockedReason(issue, pages, 'selected')
    : 'Your role cannot publish magazines. Ask an administrator to take this one live.';
  const { waiting, stale } = publishBlockers(issue, pages, 'selected');
  const blockingIds = new Set([...waiting, ...stale].map((p) => p.id));

  const setAll = (sel: boolean) => {
    for (const p of pages) if (p.selectedForPublish !== sel) void setPageSelected(p.id, sel);
  };

  const doPublish = async () => {
    setPublishing(true);
    const id = await publish('selected');
    setPublishing(false);
    if (id) { onClose(); onPublished(id); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-md border border-white/10 bg-[#0d1626] text-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Send size={16} className="text-emerald-300" />
          <div className="min-w-0">
            <p className="text-sm font-bold">Publish selected pages</p>
            <p className="truncate text-[11px] text-white/40">Choose which pages go public in Bulletins</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-sm p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Count + select-all toggle */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="text-xs font-semibold text-white/70">
            {selectedCount} of {total} page{total !== 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={() => setAll(!allSelected)}
            className="ml-auto flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
          >
            {allSelected ? <Square size={12} /> : <CheckSquare size={12} />}
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        {/* Why this selection can't publish yet — stated once, above the list, with
            the blocking pages marked in it. */}
        {blocked && (
          <div className="flex items-start gap-2 border-b border-amber-400/25 bg-amber-400/10 px-4 py-2 text-[11px] text-amber-200">
            <AlertTriangle size={12} className="mt-[1px] flex-shrink-0" />
            {/* The advice is only true of the APPROVAL block. Appending it to a
                permission refusal would tell the user to go and untick pages that
                are not the problem. */}
            <span>{blocked}{mayPublish ? ' Approve them on the review board, or untick them here.' : ''}</span>
          </div>
        )}

        {/* Page list */}
        <div className="flex-1 overflow-y-auto p-2">
          {pages.map((p) => {
            const isBlocking = blockingIds.has(p.id);
            return (
              <label
                key={p.id}
                className={
                  'flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs hover:bg-white/5 ' +
                  (p.selectedForPublish ? 'text-white' : 'text-white/55')
                }
              >
                <input
                  type="checkbox"
                  checked={p.selectedForPublish}
                  onChange={(e) => void setPageSelected(p.id, e.target.checked)}
                  className="accent-emerald-500"
                />
                <span className="tabular-nums text-white/40">{String(p.index + 1).padStart(2, '0')}</span>
                <span className="truncate">
                  Page {p.index + 1} · {p.elementCount} element{p.elementCount !== 1 ? 's' : ''}
                </span>
                {isBlocking && (
                  <span className="ml-auto flex-shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                    {p.approvalStale ? 'needs re-approval' : COLUMN_LABEL[columnOf(p)]}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-sm border border-white/15 px-3 py-2 text-xs text-white/70 hover:bg-white/10">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void doPublish()}
            disabled={publishing || selectedCount === 0 || !!blocked}
            title={blocked || undefined}
            className="ml-auto flex items-center justify-center gap-1.5 rounded-sm bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <Send size={13} />
            {publishing ? <ShimmerText>Publishing…</ShimmerText> : `Publish ${selectedCount} page${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
