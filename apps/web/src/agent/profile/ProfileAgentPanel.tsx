// The in-profile "Stable Studio" assistant — a right-side drawer that streams
// from /api/agent/profile/chat, executes the model's client tools in the browser
// (onToolCall → executeProfileTool → addToolResult), renders the conversation,
// and shows staged proposal cards (Apply / Discard) plus Undo. Modeled on the
// magazine EditorAgentPanel. Opens/closes via useProfileAgentUi; while open it
// suppresses the global Stablehand launcher (shared editor suppress flag).

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Square, Undo2, Check, X, UserPlus, PenLine } from 'lucide-react';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useProfileAgentUi, type Proposal } from '@/stores/profileAgentUiStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { PARTY_ROLE_LABELS } from '@/types/party';
import { useProfileChatSession, messageText } from './useProfileChatSession';
import { applyProposal, discardProposal, applyAllProposals, discardAllProposals, undoLastProposal } from './applyProposals';

/** Breadcrumb launcher that opens the Stable Studio drawer (edit views only). */
export function StudioLauncher() {
  const setOpen = useProfileAgentUi((s) => s.setOpen);
  return (
    <button
      onClick={() => setOpen(true)}
      title="Open the Stable Studio assistant"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', color: 'var(--forest-deep)', fontWeight: 700, fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <Sparkles size={11} /> AI Studio
    </button>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200">
          {p.kind === 'field' ? <PenLine size={12} /> : <UserPlus size={12} />}
          {p.kind === 'field' ? p.field : `${PARTY_ROLE_LABELS[p.role] ?? p.role} connection`}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => void applyProposal(p)} className="flex items-center gap-1 rounded-sm bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-600">
            <Check size={11} /> Apply
          </button>
          <button onClick={() => discardProposal(p.id)} className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10">
            <X size={11} /> Discard
          </button>
        </div>
      </div>
      <div className="text-[11px] leading-snug text-white/80">
        {p.kind === 'field' ? (
          <>
            <span className="text-white/45">set to </span>“{p.value || '(empty)'}”
            {p.note && <span className="mt-0.5 block text-[10px] italic text-white/40">{p.note}</span>}
          </>
        ) : (
          <>
            <span className="text-white/90">{p.partyName}</span>
            <span className="text-white/45">
              {' · '}{p.startYear || '—'}{p.present ? '–present' : p.endYear ? `–${p.endYear}` : ''}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function ProfileAgentPanel() {
  const open = useProfileAgentUi((s) => s.open);
  const setOpen = useProfileAgentUi((s) => s.setOpen);
  const ctx = useProfileAgentUi((s) => s.context);
  const staged = useProfileAgentUi((s) => s.staged);
  const undoCount = useProfileAgentUi((s) => s.undo.length);
  const pendingPrompt = useProfileAgentUi((s) => s.pendingPrompt);

  const { messages, sendMessage, status, error, stop } = useProfileChatSession();

  const [input, setInput] = useState('');
  const busy = status === 'submitted' || status === 'streaming';
  const scrollRef = useRef<HTMLDivElement>(null);

  // While open, hide the global Stablehand launcher (shared editor suppress flag).
  useEffect(() => {
    useEditorAgentUi.getState().setSuppressGlobal(open);
    return () => useEditorAgentUi.getState().setSuppressGlobal(false);
  }, [open]);

  useEffect(() => {
    if (pendingPrompt && open && !busy) {
      void sendMessage({ text: pendingPrompt });
      useProfileAgentUi.getState().consumePrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, staged]);

  if (!open) return null;

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput('');
  };

  const isHorse = ctx?.entityKind === 'horse';
  const chips = isHorse
    ? ['What should I fill in next?', 'Suggest a short pull-quote', 'Draft the basics from what you know', 'Help me add the trainer']
    : ['What should I complete next?', 'Suggest a profession line', 'Help me add my first horse'];

  return (
    <div className="fixed right-0 top-0 z-[80] flex h-screen w-[360px] max-w-[92vw] flex-col bg-[#0d1626] text-white shadow-[-8px_0_30px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5" style={{ background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)' }}>
        <Sparkles size={16} style={{ color: 'var(--gold-bright)' }} />
        <div className="leading-tight">
          <div className="text-[12px] font-bold" style={{ color: 'var(--parchment)' }}>Stable Studio</div>
          <div className="text-[10px]" style={{ color: 'var(--gold-mid)' }}>{ctx?.name ? `Helping with ${ctx.name}` : 'Helps you complete this profile'}</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {undoCount > 0 && (
            <button onClick={() => void undoLastProposal()} title="Undo last applied change" className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1 text-[10px] text-white/70 hover:bg-white/10">
              <Undo2 size={11} /> Undo
            </button>
          )}
          <button onClick={() => setOpen(false)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 text-white/70 hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-white/55">
              I’m your Stable Studio assistant. Tell me about this {ctx?.entityKind ?? 'profile'} and I’ll <strong className="text-white/80">draft field values</strong>{isHorse ? <> and <strong className="text-white/80">connections</strong></> : null} for you to review and Apply. I never save anything without your tap.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button key={c} onClick={() => send(c)} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/10">{c}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const text = messageText(m);
          const mine = m.role === 'user';
          if (!text && !mine) return null;
          return (
            <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div className={mine ? 'max-w-[88%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-emerald-600/90 px-2.5 py-1.5 text-[12px]' : 'max-w-[92%] rounded-lg rounded-bl-sm bg-white/5 px-2.5 py-1.5 text-[12px]'}>
                {mine ? text : <MarkdownMessage text={text} />}
              </div>
            </div>
          );
        })}
        {busy && <div className="text-[12px] text-white/40">…thinking</div>}
        {error && <p className="text-[11px] text-red-300">{error.message?.includes('resting') ? 'The studio assistant isn’t switched on yet — set OPENROUTER_API_KEY on the server.' : 'Something went wrong — please try again.'}</p>}
      </div>

      {/* Staged proposals */}
      {staged.length > 0 && (
        <div className="max-h-[46%] space-y-2 overflow-y-auto border-t-2 border-amber-400/50 bg-amber-400/[0.07] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-[#0b1220]">{staged.length}</span>
              Review &amp; apply
            </span>
            {staged.length > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => void applyAllProposals()} className="rounded-sm bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-600">Apply all</button>
                <button onClick={() => discardAllProposals()} className="rounded-sm border border-white/15 px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/10">Discard all</button>
              </div>
            )}
          </div>
          {staged.map((p) => <ProposalCard key={p.id} p={p} />)}
        </div>
      )}

      {/* Composer */}
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t border-white/10 px-2.5 py-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the studio assistant…"
          className="flex-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-white/30"
        />
        {busy ? (
          <button type="button" onClick={() => stop()} aria-label="Stop" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70">
            <Square size={13} />
          </button>
        ) : (
          <button type="submit" aria-label="Send" disabled={!input.trim()} className="flex h-8 w-8 items-center justify-center rounded-full text-[#0b1220] disabled:opacity-40" style={{ background: 'var(--gold-bright)' }}>
            <Send size={13} />
          </button>
        )}
      </form>
    </div>
  );
}
