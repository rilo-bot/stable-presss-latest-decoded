// ---------------------------------------------------------------------------
// Magazine Builder v2 — the chat list.
//
// The shape every AI chat has: a list of conversations, "New chat" at the top,
// click one to carry on. It slides over the transcript rather than taking a third
// tab, because a chat list is navigation FOR the Chat tab, not a peer of it — and
// the panel is ~340px wide, which is no place for two columns.
//
// The magazine owner sees everyone's threads, grouped by person, because a flat
// mixed list would be unreadable. A contributor sees only their own, and is told
// plainly that the owner can see them — a scratchpad someone believes is private
// but isn't would be worse than one that is openly shared.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { MessageSquarePlus, Pencil, Trash2, Check, X, History, Info, Eye } from 'lucide-react';
import { useEditorStore } from './store';
import { ShimmerText } from './BuildProgress';
import type { ChatThread } from './api';

/** "2m" · "3h" · "yesterday" · "12 Aug" — a chat list wants glanceable, not exact. */
function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  if (hrs < 48) return 'yesterday';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function ThreadRow({ t, active, onOpen }: { t: ChatThread; active: boolean; onOpen: () => void }) {
  const rename = useEditorStore((s) => s.renameThread);
  const remove = useEditorStore((s) => s.removeThread);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(t.title);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== t.title) void rename(t.id, next);
    else setDraft(t.title);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(t.title); setEditing(false); }
          }}
          className="min-w-0 flex-1 rounded-sm border border-white/20 bg-white/10 px-1.5 py-1 text-[12px] text-white outline-none focus:border-white/40"
        />
        <button onClick={commit} aria-label="Save name" className="rounded p-1 text-emerald-300 hover:bg-white/10"><Check size={12} /></button>
        <button onClick={() => { setDraft(t.title); setEditing(false); }} aria-label="Cancel" className="rounded p-1 text-white/40 hover:bg-white/10"><X size={12} /></button>
      </div>
    );
  }

  return (
    <div className={'group flex items-center gap-1 rounded-sm ' + (active ? 'bg-white/10' : 'hover:bg-white/5')}>
      <button onClick={onOpen} className="min-w-0 flex-1 px-2 py-1.5 text-left">
        <span className="flex items-center gap-1.5">
          {active && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: 'var(--gold-bright)' }} />}
          {t.legacy && <History size={11} className="flex-shrink-0 text-white/35" />}
          <span className={'truncate text-[12px] ' + (active ? 'font-semibold text-white' : 'text-white/75')}>{t.title}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/35">
          {t.startedOnPageIndex !== null && <span>p{t.startedOnPageIndex + 1}</span>}
          <span>{t.messageCount || 0} msg{t.messageCount === 1 ? '' : 's'}</span>
          <span>· {ago(t.lastMessageAt)}</span>
          {t.readOnly && !t.legacy && <span className="flex items-center gap-0.5 text-white/30"><Eye size={9} /> read-only</span>}
          {t.legacy && <span className="text-white/30">· read-only</span>}
        </span>
      </button>
      {/* Rename and delete belong to whoever started the chat. The owner reading a
          contributor's thread must not be able to retitle or bury it. */}
      {t.mine && !t.legacy && (
        <span className="flex flex-shrink-0 items-center pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {/* Seed the draft AT THE MOMENT of editing, not at mount. `draft` was
              initialised once from the title, so a chat that auto-titled itself from
              its first message (started life as "New chat") would open the rename box
              showing the STALE title — and saving would rename it back to "New chat". */}
          <button onClick={() => { setDraft(t.title); setEditing(true); }} aria-label={`Rename ${t.title}`} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"><Pencil size={11} /></button>
          <button
            onClick={() => {
              // One confirm, and it says what goes with it — a chat is cheap to make
              // and its history is not recoverable from the UI.
              if (window.confirm(`Delete “${t.title}”? Its ${t.messageCount || 0} message${t.messageCount === 1 ? '' : 's'} go with it.`)) void remove(t.id);
            }}
            aria-label={`Delete ${t.title}`}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-red-300"
          ><Trash2 size={11} /></button>
        </span>
      )}
    </div>
  );
}

export function ThreadList({ onClose }: { onClose: () => void }) {
  const threads = useEditorStore((s) => s.threads);
  const loading = useEditorStore((s) => s.threadsLoading);
  const activeThreadId = useEditorStore((s) => s.activeThreadId);
  const loadThreads = useEditorStore((s) => s.loadThreads);
  const openThread = useEditorStore((s) => s.openThread);
  const newThread = useEditorStore((s) => s.newThread);
  const isOwner = useEditorStore((s) => s.canManage());

  // Refresh on open: another tab (or the same user on another page) may have added
  // one since the list was last fetched.
  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // Mine first, then one group per other person, then the legacy log. An owner with
  // three contributors otherwise gets an undifferentiated soup sorted by time.
  const groups = useMemo(() => {
    const mine = threads.filter((t) => t.mine && !t.legacy);
    const legacy = threads.filter((t) => t.legacy);
    const others = new Map<string, ChatThread[]>();
    for (const t of threads) {
      if (t.mine || t.legacy) continue;
      const key = t.userName || 'Someone';
      others.set(key, [...(others.get(key) ?? []), t]);
    }
    return { mine, others: [...others.entries()], legacy };
  }, [threads]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#0d1626]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">Chats</p>
        <button onClick={onClose} className="ml-auto rounded-sm p-1 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close the chat list">
          <X size={14} />
        </button>
      </div>

      <button
        onClick={() => { newThread(); onClose(); }}
        className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5 text-left text-[12px] font-semibold text-white hover:bg-white/5"
      >
        <MessageSquarePlus size={14} style={{ color: 'var(--gold-bright)' }} /> New chat
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading && threads.length === 0 ? (
          <p className="px-1.5 py-2 text-[12px] text-white/40"><ShimmerText>Loading your chats</ShimmerText></p>
        ) : threads.length === 0 ? (
          <p className="px-1.5 py-2 text-[12px] leading-relaxed text-white/45">
            No chats yet. Ask the assistant something and this becomes your first one.
          </p>
        ) : (
          <>
            {groups.mine.length > 0 && (
              <>
                {/* The heading only earns its place when there is something to
                    contrast it with — a contributor sees one flat list. */}
                {(groups.others.length > 0 || groups.legacy.length > 0) && (
                  <p className="px-1.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">Mine</p>
                )}
                {groups.mine.map((t) => (
                  <ThreadRow key={t.id} t={t} active={t.id === activeThreadId} onOpen={() => { void openThread(t.id); onClose(); }} />
                ))}
              </>
            )}

            {groups.others.map(([name, rows]) => (
              <div key={name}>
                <p className="px-1.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{name}</p>
                {rows.map((t) => (
                  <ThreadRow key={t.id} t={t} active={t.id === activeThreadId} onOpen={() => { void openThread(t.id); onClose(); }} />
                ))}
              </div>
            ))}

            {groups.legacy.map((t) => (
              <div key={t.id}>
                <p className="px-1.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">Before chats were separate</p>
                <ThreadRow t={t} active={t.id === activeThreadId} onOpen={() => { void openThread(t.id); onClose(); }} />
              </div>
            ))}
          </>
        )}
      </div>

      {/* The cost of "the owner can read everything", paid openly. A contributor is
          told once, permanently, in the panel — not in a tooltip nobody opens. */}
      {!isOwner && (
        <p className="flex items-start gap-1.5 border-t border-white/10 px-3 py-2 text-[10px] leading-relaxed text-white/35">
          <Info size={11} className="mt-0.5 flex-shrink-0" />
          Your chats are yours — other contributors can’t see them. The magazine owner can.
        </p>
      )}
    </div>
  );
}
