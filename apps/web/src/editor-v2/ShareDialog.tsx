// Magazine Builder v2 — Share dialog.
//
// ONE decision: which staff member. Adding them grants access to the WHOLE
// magazine and emails them a link — nothing else to configure. (The per-page
// scoping picker was removed; the API still accepts page ids, and legacy
// page-scoped collaborators keep their scope, but nothing new is created scoped.)
// Their editor/contributor capability is derived server-side from their STAFF
// role. Owner-only.

import { useEffect, useMemo, useState } from 'react';
import { X, Users, Loader2, ShieldCheck, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEditorStore } from './store';
import * as api from './api';
import type { StaffEntry } from './api';

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const issue = useEditorStore((s) => s.issue);
  const issueId = useEditorStore((s) => s.issueId);
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
  const [busy, setBusy] = useState(false);

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

  const add = async () => {
    if (!issueId || !selectedEmail) return;
    setBusy(true);
    try {
      const { emailed, emailError } = await api.addCollaborator(issueId, { email: selectedEmail, pageIds: 'all' });
      await refreshIssue();
      const shared = selectedEmail;
      setSelectedEmail('');
      // The share is done either way — be explicit when no link was sent, and show
      // WHY (provider rejection / not configured) so it's fixable, not a mystery.
      if (emailed === false) {
        toast.warning(`${shared} now has access, but the email didn't send${emailError ? `: ${emailError}` : '.'}`, { duration: 8000 });
      } else {
        toast.success(`${shared} now has access and was emailed a link to this magazine.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not share this magazine.');
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
            <p className="truncate text-[11px] text-white/40">Staff you add get full access and an email link</p>
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
                    <span className="text-white/40"> · {c.role === 'editor' ? 'Editor' : 'Contributor'}</span>
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

          {/* Add a staff member */}
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Add a staff member</p>
          {loadState === 'loading' ? (
            <p className="flex items-center gap-1.5 text-xs text-white/45">
              <Loader2 size={12} className="animate-spin" /> Loading staff…
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
              <button
                onClick={() => void add()}
                disabled={busy || !selectedEmail}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />} Share &amp; email link
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
