// Magazine Builder v2 — Share dialog (ported from the v1 studio's ShareDialog).
// Invite staff to collaborate on this magazine, scoped to pages: 'all' or a
// picked subset. Their editor/contributor capability is derived server-side from
// their STAFF role; the owner only chooses WHICH pages they may edit. Owner-only.

import { useEffect, useMemo, useState } from 'react';
import { X, Users, Loader2, ShieldCheck, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEditorStore } from './store';
import * as api from './api';
import type { StaffEntry } from './api';

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const issue = useEditorStore((s) => s.issue);
  const issueId = useEditorStore((s) => s.issueId);
  const pages = useEditorStore((s) => s.pages);
  const refreshIssue = useEditorStore((s) => s.refreshIssue);

  const [directory, setDirectory] = useState<StaffEntry[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [pageMode, setPageMode] = useState<'all' | 'pick'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.staffDirectory().then(setDirectory).catch(() => {});
  }, []);

  const collaborators = issue?.collaborators ?? [];

  // Staff who aren't already the owner or a collaborator.
  const candidates = useMemo(
    () => directory.filter((o) => o.userId !== issue?.ownerId && !collaborators.some((c) => c.userId === o.userId)),
    [directory, issue?.ownerId, collaborators],
  );

  const invite = async () => {
    if (!issueId || !selectedEmail) return;
    const pageIds: string[] | 'all' = pageMode === 'all' ? 'all' : Array.from(picked);
    if (pageMode === 'pick' && picked.size === 0) {
      toast.error('Pick at least one page to share.');
      return;
    }
    setBusy(true);
    try {
      await api.addCollaborator(issueId, { email: selectedEmail, pageIds });
      await refreshIssue();
      setSelectedEmail('');
      setPicked(new Set());
      setPageMode('all');
      toast.success('Added to this magazine.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add collaborator.');
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
      toast.error(e instanceof Error ? e.message : 'Could not remove collaborator.');
    }
  };

  const scopeLabel = (c: (typeof collaborators)[number]) =>
    c.pageIds === 'all' ? 'all pages' : `${c.pageIds.length} page${c.pageIds.length !== 1 ? 's' : ''}`;

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
            <p className="truncate text-[11px] text-white/40">Invite staff to edit — scoped to the pages you choose</p>
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
              {collaborators.map((c) => (
                <div key={c.userId} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-white/5">
                  {c.role === 'editor' ? <ShieldCheck size={13} className="flex-shrink-0 text-emerald-300" /> : <Pencil size={13} className="flex-shrink-0 text-sky-300" />}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{c.displayName || c.email}</span>
                    <span className="text-white/40"> · {c.role === 'editor' ? 'Editor' : 'Contributor'} · {scopeLabel(c)}</span>
                  </span>
                  <button
                    onClick={() => void remove(c.userId, c.displayName || c.email)}
                    aria-label={`Remove ${c.displayName || c.email}`}
                    className="flex-shrink-0 rounded p-1 text-white/40 hover:bg-white/10 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Invite */}
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Invite a staff member</p>
          {candidates.length === 0 ? (
            <p className="text-xs text-white/45">All staff members already have access to this magazine.</p>
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
                    {o.displayName || o.email} ({o.email})
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
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pages.map((p) => {
                    const on = picked.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (on) next.delete(p.id); else next.add(p.id);
                            return next;
                          })
                        }
                        className={
                          'rounded-sm border px-2 py-1 text-[11px] ' +
                          (on ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/15 text-white/55 hover:bg-white/10')
                        }
                      >
                        {p.index + 1}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                onClick={() => void invite()}
                disabled={busy || !selectedEmail}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />} Add collaborator
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
