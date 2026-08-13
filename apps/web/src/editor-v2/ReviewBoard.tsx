// Magazine Builder v2 — the review board (docs/MAGAZINE-V2-SUBMISSIONS-PLAN.md §8.2).
//
// PAGES, NOT MAGAZINES. Four columns derived from three stored states, using the
// story kanban's visual language (cards, small radii, horizontal scroll) rather
// than inventing a second board idiom for the same job.
//
// One board serves both roles, because the shape of the work is identical — a set
// of pages, a note, one action:
//   • owner        → select pages, Approve or Send back (note required)
//   • collaborator → select their own in-progress pages, Submit for review
//
// The cards deliberately carry WHY, not just what: the last note, the round
// number, and an amber strip when an approval went stale. "Approved" with no
// explanation of what changed since is the failure mode of every workflow board.

import { useMemo, useState } from 'react';
import { X, ClipboardList, Check, Undo2, Send, AlertTriangle, User } from 'lucide-react';
import { useEditorStore } from './store';
import { ShimmerText } from './BuildProgress';
import {
  columnOf,
  COLUMN_ORDER,
  COLUMN_LABEL,
  COLUMN_TONE,
  inReviewScope,
  assigneeNames,
  submittablePages,
  type ReviewColumn,
} from './review';
import type { PageSummary } from './api';

/** "2h ago" / "3d ago" — enough to judge staleness without a date library. */
function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function ReviewBoard({ onClose }: { onClose: () => void }) {
  const issue = useEditorStore((s) => s.issue);
  const pages = useEditorStore((s) => s.pages);
  const reviewBusy = useEditorStore((s) => s.reviewBusy);
  const approvePages = useEditorStore((s) => s.approvePages);
  const requestChanges = useEditorStore((s) => s.requestChanges);
  const submitPages = useEditorStore((s) => s.submitPages);
  const goToPage = useEditorStore((s) => s.goToPage);

  const isOwner = issue?.myRole === 'owner';
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);

  const columns = useMemo(() => {
    const out: Record<ReviewColumn, PageSummary[]> = { in_progress: [], needs_changes: [], submitted: [], approved: [] };
    for (const p of pages) out[columnOf(p)].push(p);
    return out;
  }, [pages]);

  const mineToSubmit = useMemo(() => submittablePages(issue, pages), [issue, pages]);
  const submittableIds = useMemo(() => new Set(mineToSubmit.map((p) => p.id)), [mineToSubmit]);

  /** Which pages this user can act on at all — everything else is read-only here. */
  const actionable = (p: PageSummary): boolean =>
    isOwner ? columnOf(p) === 'submitted' || p.approvalStale === true : submittableIds.has(p.id);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickedIds = [...picked].filter((id) => pages.some((p) => p.id === id && actionable(p)));
  const run = async (action: 'approve' | 'changes' | 'submit') => {
    if (pickedIds.length === 0) return;
    if (action === 'changes' && !note.trim()) {
      // Required by the server too — but saying so here beats a round trip, and
      // sending work back without saying why is how a review flow gets resented.
      setNoteError(true);
      return;
    }
    const ok =
      action === 'approve'
        ? await approvePages(pickedIds, note.trim() || undefined)
        : action === 'changes'
          ? await requestChanges(pickedIds, note)
          : await submitPages(pickedIds, note.trim() || undefined);
    if (ok) {
      setPicked(new Set());
      setNote('');
      setNoteError(false);
    }
  };

  const nothingToReview = isOwner && columns.submitted.length === 0 && !pages.some((p) => p.approvalStale);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-studio-hair bg-studio-panel text-studio-ink shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-studio-hair px-4 py-3">
          <ClipboardList size={16} className="text-[var(--gold-bright)]" />
          <div className="min-w-0">
            <p className="text-ui font-bold">Review board</p>
            <p className="truncate text-ui-sm text-studio-ink-3">
              {isOwner
                ? 'Approve pages, or send them back with a note'
                : 'Send your pages to the owner when they’re ready'}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-sm p-1 text-studio-ink-3 hover:bg-studio-raise-2 hover:text-studio-ink" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* The solo-owner case: say so plainly rather than showing four empty columns
            and implying the owner has forgotten to do something. */}
        {isOwner && (issue?.collaborators?.length ?? 0) === 0 && (
          <div className="border-b border-studio-hair bg-studio-raise px-4 py-2 text-ui-sm text-studio-ink-3">
            Nobody else is working on this magazine, so no page needs approving — you can publish whenever you like.
            Review only applies to pages you’ve shared with someone.
          </div>
        )}

        {/* Columns */}
        <div className="flex flex-1 gap-3 overflow-x-auto p-3">
          {COLUMN_ORDER.map((col) => {
            const tone = COLUMN_TONE[col];
            const list = columns[col];
            return (
              <div key={col} className="flex w-56 flex-shrink-0 flex-col">
                <div className="mb-2 flex items-center gap-1.5 px-0.5">
                  <span className={'h-2 w-2 rounded-full ' + tone.dot} />
                  <span className={'text-ui-sm font-semibold ' + tone.text}>{COLUMN_LABEL[col]}</span>
                  <span className="text-ui-sm text-studio-ink-4">({list.length})</span>
                </div>
                <div className="flex flex-col gap-2">
                  {list.length === 0 && <p className="px-0.5 text-ui-sm text-studio-ink-4">Nothing here</p>}
                  {list.map((p) => {
                    const who = assigneeNames(issue, p.id);
                    const canAct = actionable(p);
                    const scoped = inReviewScope(issue, p.id);
                    return (
                      <div
                        key={p.id}
                        className={
                          'rounded-sm border px-2.5 py-2 text-ui-sm ' +
                          (picked.has(p.id) ? 'border-[var(--gold-bright)]/60 bg-[var(--gold-bright)]/10' : 'border-studio-hair bg-studio-raise')
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          {canAct ? (
                            <input
                              type="checkbox"
                              checked={picked.has(p.id)}
                              onChange={() => toggle(p.id)}
                              className="accent-amber-400"
                              aria-label={`Select page ${p.index + 1}`}
                            />
                          ) : (
                            <span className="w-3" />
                          )}
                          <button
                            onClick={() => { void goToPage(p.id); onClose(); }}
                            className="font-semibold text-studio-ink hover:underline"
                            title="Open this page"
                          >
                            Page {p.index + 1}
                          </button>
                          <span className="ml-auto text-studio-ink-4">{p.elementCount} el</span>
                        </div>

                        {/* Who it belongs to — or that it belongs to nobody but the owner,
                            which is why it will publish without approval. */}
                        <p className="mt-1 flex items-center gap-1 text-studio-ink-3">
                          <User size={9} />
                          {who.length > 0 ? who.join(', ') : scoped ? 'shared' : 'yours only'}
                        </p>

                        {col === 'submitted' && p.submittedAt && (
                          <p className="mt-0.5 text-studio-ink-4">submitted {ago(p.submittedAt)}</p>
                        )}
                        {col === 'needs_changes' && (p.reviewRound ?? 0) > 0 && (
                          <p className="mt-0.5 text-amber-200/70">round {p.reviewRound}</p>
                        )}
                        {/* Approved and untouched since the last edition — one item of
                            real work, not eight, which is the point of saying so. */}
                        {col === 'approved' && !p.approvalStale && (
                          <p className="mt-0.5 text-emerald-200/60">approved — nothing changed since</p>
                        )}
                        {p.approvalStale && (
                          <p className="mt-1 flex items-start gap-1 rounded-sm border border-amber-400/30 bg-amber-400/10 px-1.5 py-1 text-amber-200">
                            <AlertTriangle size={10} className="mt-[1px] flex-shrink-0" />
                            <span>edited after approval — needs approving again</span>
                          </p>
                        )}
                        {p.submitNote && <p className="mt-1 italic text-studio-ink-3">“{p.submitNote}”</p>}
                        {p.reviewNote && (
                          <p className="mt-1 border-l-2 border-studio-edge pl-1.5 italic text-studio-ink-3">
                            {p.reviewNote}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action bar — one note field, shared by all three actions */}
        <div className="border-t border-studio-hair px-4 py-3">
          {nothingToReview && (
            <p className="mb-2 text-ui-sm text-studio-ink-3">Nothing is waiting on you right now.</p>
          )}
          {!isOwner && mineToSubmit.length === 0 && (
            <p className="mb-2 text-ui-sm text-studio-ink-3">
              None of your pages are ready to send — they’re either already submitted or approved.
            </p>
          )}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <textarea
                value={note}
                onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setNoteError(false); }}
                rows={2}
                placeholder={isOwner ? 'Note (required when sending pages back)' : 'Anything the owner should know? (optional)'}
                className={
                  'w-full resize-none rounded-sm border bg-studio-raise px-2 py-1.5 text-ui-sm text-studio-ink placeholder:text-studio-ink-4 focus:outline-none ' +
                  (noteError ? 'border-amber-400' : 'border-studio-edge')
                }
              />
              {noteError && <p className="mt-1 text-ui-sm text-amber-300">Say what needs changing — the note goes to whoever worked on it.</p>}
            </div>
            <div className="flex flex-shrink-0 flex-col gap-1.5">
              {isOwner ? (
                <>
                  <button
                    onClick={() => void run('approve')}
                    disabled={reviewBusy || pickedIds.length === 0}
                    className="flex items-center justify-center gap-1.5 rounded-sm bg-emerald-500 px-3 py-1.5 text-ui-sm font-semibold text-studio-ink hover:bg-emerald-600 disabled:opacity-40"
                  >
                    <Check size={12} />
                    {reviewBusy ? <ShimmerText>Approving…</ShimmerText> : `Approve${pickedIds.length > 0 ? ` ${pickedIds.length}` : ''}`}
                  </button>
                  <button
                    onClick={() => void run('changes')}
                    disabled={reviewBusy || pickedIds.length === 0}
                    className="flex items-center justify-center gap-1.5 rounded-sm border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-ui-sm font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-40"
                  >
                    <Undo2 size={12} /> Send back
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void run('submit')}
                  disabled={reviewBusy || pickedIds.length === 0}
                  className="flex items-center justify-center gap-1.5 rounded-sm bg-studio-gold px-3 py-1.5 text-ui-sm font-semibold text-studio-ink hover:bg-studio-gold disabled:opacity-40"
                >
                  <Send size={12} />
                  {reviewBusy ? <ShimmerText>Submitting…</ShimmerText> : `Submit${pickedIds.length > 0 ? ` ${pickedIds.length}` : ''}`}
                </button>
              )}
              {pickedIds.length === 0 && (
                <p className="max-w-[9rem] text-ui-sm leading-tight text-studio-ink-4">
                  {isOwner ? 'Tick the pages you’ve reviewed' : 'Tick the pages you’re done with'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
