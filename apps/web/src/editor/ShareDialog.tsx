/**
 * Share dialog — invite staff to collaborate on a magazine, scoped to pages.
 *
 * Owner/editors open this from the editor toolbar. Contributors can be limited
 * to specific pages; editors always get all pages + management rights. Backed by
 * the server collaborators API via the magazine store.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMagazineStore } from '@/stores/magazineStore';
import type { StaffOption } from '@/types/magazine';
import { X, UserPlus, Trash2, Loader2, Crown, ShieldCheck, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ShareDialog({ magazineId, onClose }: { magazineId: string; onClose: () => void }) {
  const magazine = useMagazineStore((s) => s.magazines.find((m) => m.id === magazineId));
  const fetchStaffDirectory = useMagazineStore((s) => s.fetchStaffDirectory);
  const addCollaborator = useMagazineStore((s) => s.addCollaborator);
  const removeCollaborator = useMagazineStore((s) => s.removeCollaborator);

  const [directory, setDirectory] = useState<StaffOption[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [pageMode, setPageMode] = useState<'all' | 'specific'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchStaffDirectory().then(setDirectory);
  }, [fetchStaffDirectory]);

  const pages = useMemo(
    () => (magazine?.pages ?? []).map((p) => ({ id: p.id, number: p.number, label: p.label })),
    [magazine]
  );
  const collaborators = magazine?.collaborators ?? [];

  // Staff who aren't already the owner or a collaborator.
  const available = useMemo(
    () =>
      directory.filter(
        (o) => o.userId !== magazine?.ownerId && !collaborators.some((c) => c.userId === o.userId)
      ),
    [directory, magazine?.ownerId, collaborators]
  );

  const selectedStaff = useMemo(
    () => directory.find((o) => o.email === selectedEmail),
    [directory, selectedEmail]
  );

  if (!magazine) return null;

  const togglePage = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = async () => {
    if (!selectedEmail) return;
    const pageIds: string[] | 'all' = pageMode === 'all' ? 'all' : Array.from(picked);
    if (pageMode === 'specific' && picked.size === 0) return;
    setBusy(true);
    const ok = await addCollaborator(magazineId, { email: selectedEmail, pageIds });
    setBusy(false);
    if (ok) {
      setSelectedEmail('');
      setPicked(new Set());
      setPageMode('all');
    }
  };

  // Always reflect the real assigned scope (page assignment applies to everyone).
  const scopeLabel = (c: (typeof collaborators)[number]) =>
    c.pageIds === 'all'
      ? 'All pages'
      : `${c.pageIds.length} page${c.pageIds.length !== 1 ? 's' : ''}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-md border border-white/10 bg-[#0d1626] text-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <UserPlus size={16} className="text-sky-300" />
          <div className="min-w-0">
            <p className="text-sm font-bold">Share magazine</p>
            <p className="truncate text-[11px] text-white/40">{magazine.title}</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-sm p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* People with access */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-white/40">People with access</p>
            <div className="flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-xs">
              <Crown size={13} className="text-amber-300 flex-shrink-0" />
              <span className="min-w-0 truncate">
                <span className="font-semibold">{magazine.ownerName ?? 'Owner'}</span>
                <span className="text-white/40"> · Owner</span>
              </span>
            </div>
            {collaborators.map((c) => (
              <div key={c.userId} className="flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-xs">
                {c.role === 'editor' ? (
                  <ShieldCheck size={13} className="text-sky-300 flex-shrink-0" />
                ) : (
                  <PencilLine size={13} className="text-emerald-300 flex-shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{c.displayName || c.email}</span>
                  <span className="text-white/40"> · {c.role === 'editor' ? 'Editor' : 'Contributor'} · {scopeLabel(c)}</span>
                </span>
                <button
                  onClick={() => removeCollaborator(magazineId, c.userId)}
                  className="rounded-sm p-1 text-white/40 hover:bg-white/10 hover:text-rose-300"
                  aria-label={`Remove ${c.displayName || c.email}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Invite */}
          <div className="space-y-2.5 rounded-sm border border-white/10 p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-white/40">Invite a staff member</p>

            {available.length === 0 ? (
              <p className="rounded-sm border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] text-white/50">
                All staff members already have access to this magazine.
              </p>
            ) : (
              <select
                value={selectedEmail}
                onChange={(e) => setSelectedEmail(e.target.value)}
                className="w-full rounded-sm border border-white/15 bg-white/5 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400/50"
              >
                <option value="" className="bg-[#0d1626]">Choose a staff member…</option>
                {available.map((o) => (
                  <option key={o.userId} value={o.email} className="bg-[#0d1626]">
                    {o.displayName || o.email}{o.displayName ? ` · ${o.email}` : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Capability — collaborators edit assigned pages; only you (owner) manage/publish. */}
            {selectedStaff && (
              <p className="text-[10px] leading-relaxed text-white/50">
                They'll be able to edit the pages you assign below. Publishing and managing collaborators stay with you,
                the owner.
              </p>
            )}

            {/* Page scope — assign pages to anyone you share with */}
            {selectedStaff && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {(['all', 'specific'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPageMode(m)}
                      className={cn(
                        'flex-1 rounded-sm border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                        pageMode === m ? 'border-sky-400/60 bg-sky-500/15 text-sky-200' : 'border-white/15 text-white/60 hover:bg-white/10'
                      )}
                    >
                      {m === 'all' ? 'All pages' : 'Specific pages'}
                    </button>
                  ))}
                </div>
                {pageMode === 'specific' && (
                  <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-sm border border-white/10 bg-black/20 p-1.5">
                    {pages.map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-[11px] text-white/70 hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={picked.has(p.id)}
                          onChange={() => togglePage(p.id)}
                          className="accent-sky-500"
                        />
                        <span className="tabular-nums text-white/40">{String(p.number).padStart(2, '0')}</span>
                        <span className="truncate">{p.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy || !selectedEmail || (pageMode === 'specific' && picked.size === 0)}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              {busy ? 'Adding…' : 'Add collaborator'}
            </button>
          </div>

          <p className="text-[10px] leading-relaxed text-white/35">
            Only staff members appear in the list. They'll see this magazine in their Newsroom studio and can edit the
            pages shared with them — changes save automatically. Reopen the magazine to see their latest edits.
          </p>
        </div>
      </div>
    </div>
  );
}
