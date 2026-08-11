// Magazine Builder v2 — Share dialog.
//
// TWO decisions: which staff member, and WHICH PAGES they get. The page scope is
// not decoration — it is the input to the whole review workflow. A page counts as
// "in review scope" only when somebody is assigned to it (server:
// access.isInReviewScope), and the publish gate demands approval for exactly
// those pages. Share everything with everyone and every page needs approving; a
// solo owner with no collaborators needs none.
//
// A share grants ONE capability: edit these pages, and submit them for approval.
// There is no per-magazine role to choose — publishing is a staff permission
// (`magazine.publish`, enforced on the publish routes) and belongs to the owner,
// not to a share. Owner-only.

import { useEffect, useMemo, useState } from 'react';
import { X, Users, Pencil, Trash2, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useEditorStore } from './store';
import { ShimmerText } from './BuildProgress';
import * as api from './api';
import type { StaffEntry, PageSummary, V2Collaborator } from './api';

/** "page 4" · "pages 4 and 5" · "pages 4, 5 and 9". Mirrors the server's
 *  lib/pageLabels.ts so the dialog names pages the way the emails do. */
function pageListLabel(numbers: number[]): string {
  const n = Array.from(new Set(numbers)).sort((a, b) => a - b);
  if (n.length === 0) return 'no pages';
  if (n.length === 1) return `page ${n[0]}`;
  return `pages ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/** A page-number chip grid, used for both a new share and an existing one. */
function PagePicker({
  pages,
  picked,
  onToggle,
  onAll,
  onNone,
}: {
  pages: PageSummary[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] text-white/40">
        <span>
          {picked.size} of {pages.length} selected
        </span>
        <button type="button" onClick={onAll} className="ml-auto rounded-sm px-1 py-0.5 hover:bg-white/10 hover:text-white/70">
          Select all
        </button>
        <button type="button" onClick={onNone} className="rounded-sm px-1 py-0.5 hover:bg-white/10 hover:text-white/70">
          Clear
        </button>
      </div>
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-sm border border-white/10 bg-black/20 p-1.5">
        {pages.map((p) => {
          const on = picked.has(p.id);
          // A page already in review carries a dot, so narrowing a scope can't
          // silently strip somebody off work that is mid-flight.
          const dot =
            p.review === 'approved' ? 'bg-emerald-400' : p.review === 'submitted' ? 'bg-amber-400' : '';
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              aria-pressed={on}
              className={
                'relative rounded-sm border px-2 py-1 text-[11px] tabular-nums ' +
                (on ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/15 text-white/55 hover:bg-white/10')
              }
            >
              {p.index + 1}
              {dot && <span className={`absolute right-0.5 top-0.5 h-1 w-1 rounded-full ${dot}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const issue = useEditorStore((s) => s.issue);
  const issueId = useEditorStore((s) => s.issueId);
  const pages = useEditorStore((s) => s.pages);
  const refreshIssue = useEditorStore((s) => s.refreshIssue);

  const [directory, setDirectory] = useState<StaffEntry[]>([]);
  // The picker used to swallow its fetch error and fall through to "everyone
  // already has access" — a lie whenever the request simply failed (and it had
  // been failing: the endpoint it called died with the v1 magazines router).
  // Load state is tracked so an empty list can say WHY it's empty.
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [pageMode, setPageMode] = useState<'all' | 'pick'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Which existing collaborator's scope is being edited, and the draft of it.
  const [editing, setEditing] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'all' | 'pick'>('all');
  const [editPicked, setEditPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    api
      .staffDirectory()
      .then((list) => {
        if (cancelled) return;
        setDirectory(Array.isArray(list) ? list : []);
        setLoadState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load the staff list.');
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const collaborators = issue?.collaborators ?? [];

  // Staff who aren't already the owner or a collaborator — the owner already has
  // the magazine, and collaborators are listed above with a Remove button.
  const candidates = useMemo(
    () => directory.filter((o) => o.userId !== issue?.ownerId && !collaborators.some((c) => c.userId === o.userId)),
    [directory, issue?.ownerId, collaborators],
  );

  const numberOf = useMemo(() => new Map(pages.map((p) => [p.id, p.index + 1])), [pages]);
  const toggleIn = (set: (fn: (prev: Set<string>) => Set<string>) => void) => (id: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const scopeLabel = (c: V2Collaborator) =>
    c.pageIds === 'all'
      ? 'all pages'
      : pageListLabel(c.pageIds.map((id) => numberOf.get(String(id))).filter((n): n is number => !!n));

  /** Pages this person has in review that a narrowed scope would take away from
   *  them. Worth naming BEFORE the save, not apologising for after it. */
  const strandedBy = (userId: string, keep: Set<string> | 'all') => {
    if (keep === 'all') return [];
    return pages
      .filter((p) => !keep.has(p.id) && p.submittedBy === userId && (p.review === 'submitted' || p.review === 'approved'))
      .map((p) => p.index + 1);
  };

  const share = async () => {
    if (!issueId || !selectedEmail) return;
    if (pageMode === 'pick' && picked.size === 0) {
      toast.error('Pick at least one page to share.');
      return;
    }
    const pageIds: string[] | 'all' = pageMode === 'all' ? 'all' : Array.from(picked);
    setBusy(true);
    try {
      const { emailed, emailError } = await api.addCollaborator(issueId, { email: selectedEmail, pageIds });
      await refreshIssue();
      const shared = selectedEmail;
      const what = pageIds === 'all' ? 'this magazine' : pageListLabel(Array.from(picked).map((id) => numberOf.get(id) ?? 0));
      setSelectedEmail('');
      setPicked(new Set());
      setPageMode('all');
      // The share is done either way — be explicit when no link was sent, and show
      // WHY (provider rejection / not configured) so it's fixable, not a mystery.
      if (emailed === false) {
        toast.warning(`${shared} now has ${what}, but the email didn't send${emailError ? `: ${emailError}` : '.'}`, { duration: 8000 });
      } else {
        toast.success(`${shared} now has ${what} and was emailed a link.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not share this magazine.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c: V2Collaborator) => {
    setEditing(c.userId);
    setEditMode(c.pageIds === 'all' ? 'all' : 'pick');
    setEditPicked(new Set(c.pageIds === 'all' ? [] : c.pageIds.map(String)));
  };

  /** Re-sharing the same person is an UPSERT server-side, and the share email
   *  only goes out the first time — so this changes the scope without spamming. */
  const saveScope = async (c: V2Collaborator) => {
    if (!issueId) return;
    if (editMode === 'pick' && editPicked.size === 0) {
      toast.error('Pick at least one page, or remove their access instead.');
      return;
    }
    const pageIds: string[] | 'all' = editMode === 'all' ? 'all' : Array.from(editPicked);
    setBusy(true);
    try {
      await api.addCollaborator(issueId, { email: c.email, pageIds });
      await refreshIssue();
      setEditing(null);
      const who = c.displayName || c.email;
      toast.success(`${who} now has ${pageIds === 'all' ? 'all pages' : pageListLabel(Array.from(editPicked).map((id) => numberOf.get(id) ?? 0))}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change their pages.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string, name: string) => {
    if (!issueId) return;
    try {
      await api.removeCollaborator(issueId, userId);
      await refreshIssue();
      toast.success(`Removed ${name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove access.');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-md border border-white/10 bg-[#0d1626] text-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Users size={16} className="text-sky-300" />
          <div className="min-w-0">
            <p className="text-sm font-bold">Share this magazine</p>
            <p className="truncate text-[11px] text-white/40">Choose who, and which pages they may edit</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-sm p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Current collaborators */}
          {collaborators.length > 0 && (
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">People with access</p>
              {collaborators.map((c) => {
                const isEditing = editing === c.userId;
                const stranded = isEditing ? strandedBy(c.userId, editMode === 'all' ? 'all' : editPicked) : [];
                return (
                  <div key={c.userId} className="rounded-sm">
                    <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-white/5">
                      {/* One icon, because there is one kind of collaborator. The
                          shield-vs-pencil "Editor / Contributor" split was removed:
                          it gated nothing anywhere, so it promised powers that did
                          not exist. What a share actually decides is the PAGES. */}
                      <Pencil size={13} className="flex-shrink-0 text-sky-300" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{c.displayName || c.email}</span>
                        <span className="text-white/40"> · can edit {scopeLabel(c)}</span>
                      </span>
                      <button
                        onClick={() => (isEditing ? setEditing(null) : startEdit(c))}
                        className="flex-shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-white/50 hover:bg-white/10 hover:text-white"
                      >
                        {isEditing ? 'Cancel' : 'Change pages'}
                      </button>
                      <button
                        onClick={() => void remove(c.userId, c.displayName || c.email)}
                        aria-label={`Remove ${c.displayName || c.email}`}
                        className="flex-shrink-0 rounded p-1 text-white/40 hover:bg-white/10 hover:text-red-300"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {isEditing && (
                      <div className="mb-1 ml-5 border-l border-white/10 pl-3 pt-1">
                        <div className="mb-2 flex items-center gap-3 text-xs text-white/70">
                          <label className="flex cursor-pointer items-center gap-1.5">
                            <input type="radio" checked={editMode === 'all'} onChange={() => setEditMode('all')} className="accent-sky-400" /> All pages
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5">
                            <input type="radio" checked={editMode === 'pick'} onChange={() => setEditMode('pick')} className="accent-sky-400" /> Specific pages
                          </label>
                        </div>
                        {editMode === 'pick' && (
                          <PagePicker
                            pages={pages}
                            picked={editPicked}
                            onToggle={toggleIn(setEditPicked)}
                            onAll={() => setEditPicked(new Set(pages.map((p) => p.id)))}
                            onNone={() => setEditPicked(new Set())}
                          />
                        )}
                        {stranded.length > 0 && (
                          <p className="mb-2 flex items-start gap-1.5 rounded-sm bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200">
                            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                            <span>
                              They have work in review on {pageListLabel(stranded)}. Taking {stranded.length > 1 ? 'those' : 'that'} away
                              leaves it with you to approve.
                            </span>
                          </p>
                        )}
                        <button
                          onClick={() => void saveScope(c)}
                          disabled={busy}
                          className="flex items-center gap-1.5 rounded-sm bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                        >
                          <Check size={12} /> {busy ? <ShimmerText>Saving…</ShimmerText> : 'Save pages'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add a staff member */}
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Add a staff member</p>
          {loadState === 'loading' ? (
            <p className="flex items-center gap-1.5 text-xs text-white/45">
              <ShimmerText>Loading the staff list</ShimmerText>
            </p>
          ) : loadState === 'error' ? (
            <div className="text-xs text-white/60">
              <p className="text-red-300">Couldn&apos;t load the staff list{loadError ? ` — ${loadError}` : '.'}</p>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-1.5 rounded-sm border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
              >
                Try again
              </button>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-white/45">
              {directory.length <= 1
                ? "You're the only staff member on the team — add colleagues in Team settings first."
                : 'Every staff member already has access to this magazine.'}
            </p>
          ) : (
            <>
              <select
                value={selectedEmail}
                onChange={(e) => setSelectedEmail(e.target.value)}
                className="mb-2 w-full rounded-sm border border-white/15 bg-white/5 px-2 py-2 text-xs text-white outline-none focus:border-white/30"
              >
                <option value="" className="bg-[#0d1626]">Choose a staff member…</option>
                {candidates.map((o) => (
                  <option key={o.userId} value={o.email} className="bg-[#0d1626]">
                    {o.name || o.email} ({o.email})
                  </option>
                ))}
              </select>

              {/* Page scope */}
              <div className="mb-2 flex items-center gap-3 text-xs text-white/70">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" checked={pageMode === 'all'} onChange={() => setPageMode('all')} className="accent-sky-400" /> All pages
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" checked={pageMode === 'pick'} onChange={() => setPageMode('pick')} className="accent-sky-400" /> Specific pages
                </label>
              </div>
              {pageMode === 'pick' && (
                <PagePicker
                  pages={pages}
                  picked={picked}
                  onToggle={toggleIn(setPicked)}
                  onAll={() => setPicked(new Set(pages.map((p) => p.id)))}
                  onNone={() => setPicked(new Set())}
                />
              )}
              <button
                onClick={() => void share()}
                disabled={busy || !selectedEmail}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                <Users size={13} /> {busy ? <ShimmerText>Sharing…</ShimmerText> : <>Share &amp; email link</>}
              </button>
              <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
                Only pages someone is assigned to need approving before you publish.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
