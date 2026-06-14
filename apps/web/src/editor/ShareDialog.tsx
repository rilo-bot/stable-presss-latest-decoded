/**
 * Share dialog — invite staff to collaborate on a magazine, scoped to pages.
 *
 * Owner/editors open this from the editor toolbar. Contributors can be limited
 * to specific pages; editors always get all pages + management rights. Backed by
 * the server collaborators API via the magazine store.
 */

import { useMemo, useState } from 'react';
import { useMagazineStore } from '@/stores/magazineStore';
import { X, UserPlus, Trash2, Loader2, Crown, ShieldCheck, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ShareDialog({ magazineId, onClose }: { magazineId: string; onClose: () => void }) {
  const magazine = useMagazineStore((s) => s.magazines.find((m) => m.id === magazineId));
  const addCollaborator = useMagazineStore((s) => s.addCollaborator);
  const removeCollaborator = useMagazineStore((s) => s.removeCollaborator);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'contributor' | 'editor'>('contributor');
  const [pageMode, setPageMode] = useState<'all' | 'specific'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const pages = useMemo(
    () => (magazine?.pages ?? []).map((p) => ({ id: p.id, number: p.number, label: p.label })),
    [magazine]
  );
  const collaborators = magazine?.collaborators ?? [];

  if (!magazine) return null;

  const togglePage = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = async () => {
    if (!email.trim()) return;
    const pageIds: string[] | 'all' =
      role === 'editor' || pageMode === 'all' ? 'all' : Array.from(picked);
    if (role === 'contributor' && pageMode === 'specific' && picked.size === 0) return;
    setBusy(true);
    const ok = await addCollaborator(magazineId, { email: email.trim(), role, pageIds });
    setBusy(false);
    if (ok) {
      setEmail('');
      setPicked(new Set());
      setPageMode('all');
      setRole('contributor');
    }
  };

  const scopeLabel = (c: (typeof collaborators)[number]) =>
    c.role === 'editor'
      ? 'All pages · can manage'
      : c.pageIds === 'all'
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

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@stablepress.co.nz"
              className="w-full rounded-sm border border-white/15 bg-white/5 px-2.5 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-sky-400/50"
              spellCheck={false}
            />

            {/* Role */}
            <div className="flex gap-1.5">
              {(['contributor', 'editor'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex-1 rounded-sm border px-2 py-1.5 text-[11px] font-semibold capitalize transition-colors',
                    role === r ? 'border-sky-400/60 bg-sky-500/15 text-sky-200' : 'border-white/15 text-white/60 hover:bg-white/10'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-white/40">
              {role === 'editor'
                ? 'Editors can edit every page, publish, and manage collaborators.'
                : 'Contributors can edit only the pages you assign below.'}
            </p>

            {/* Page scope (contributors only) */}
            {role === 'contributor' && (
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
              disabled={busy || !email.trim() || (role === 'contributor' && pageMode === 'specific' && picked.size === 0)}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              {busy ? 'Adding…' : 'Add collaborator'}
            </button>
          </div>

          <p className="text-[10px] leading-relaxed text-white/35">
            Collaborators must already have a staff account. They'll see this magazine in their Newsroom studio and can
            edit the pages shared with them — changes save automatically. Reopen the magazine to see their latest edits.
          </p>
        </div>
      </div>
    </div>
  );
}
