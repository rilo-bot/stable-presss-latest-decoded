// The "Story Studio" assistant — a right-side drawer that streams from
// /api/agent/story/chat, writes a story draft with the user, collects the
// metadata through inline cards (the model's client tools park a PendingInteraction
// that each card resolves), files the draft, and opens it. Voice (push-to-talk +
// spoken replies) is shared via useVoiceChat. Modeled on ProfileAgentPanel.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Square, X, Check, Mic, Volume2, VolumeX, Loader2, ImageIcon, Search } from 'lucide-react';
import { toast } from 'sonner';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { ImageUploader } from '@/components/horse-form/ImageUploader';
import { useStoryStudioUi, type PendingInteraction } from '@/stores/storyStudioUiStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { useAuthStore } from '@/stores/authStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { connectionResolver } from '@/lib/horseConnections';
import { TIER_ORDER, TIER_LABELS } from '@/rbac/entitlement';
import { useStoryChatSession, messageText } from './useStoryChatSession';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';

/* ── Category taxonomy (mirrors ArticleForm's CATEGORY_DEFS) ── */
const CATEGORY_DEFS: { value: string; label: string; section: 'News' | 'Analysis' | 'Interviews' }[] = [
  { value: 'race-reports', label: 'Race Reports', section: 'News' },
  { value: 'industry-news', label: 'Industry News', section: 'News' },
  { value: 'morning-edition', label: 'Morning Edition', section: 'News' },
  { value: 'form-guide', label: 'Form Guide', section: 'Analysis' },
  { value: 'track-notes', label: 'Track Notes', section: 'Analysis' },
  { value: 'bloodstock', label: 'Bloodstock', section: 'Analysis' },
  { value: 'trainer-profiles', label: 'Trainer Profiles', section: 'Interviews' },
  { value: 'jockey-desk', label: 'Jockey Desk', section: 'Interviews' },
  { value: 'owner-stories', label: 'Owner Stories', section: 'Interviews' },
];
const CATEGORY_SECTIONS = ['News', 'Analysis', 'Interviews'] as const;

const STARTERS = [
  'A feature on a rising sprinter at Flemington',
  'Weekend race report from Randwick',
  'A trainer profile for a country stable',
];

const resolve = (output: unknown) => useStoryStudioUi.getState().resolvePending(output);

/* ── Inline interaction cards ─────────────────────────────── */

function StoryCard({ data }: { data?: Record<string, unknown> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(String(data?.title ?? ''));
  const [summary, setSummary] = useState(String(data?.summary ?? ''));
  const paragraphs = summary.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-300">Story draft</div>
      {editing ? (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-[13px] font-semibold text-white outline-none focus:border-white/30"
            placeholder="Headline"
          />
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-[12px] leading-relaxed text-white/90 outline-none focus:border-white/30"
            placeholder="The full story…"
          />
        </div>
      ) : (
        <>
          <h3 className="mb-1.5 text-[14px] font-bold leading-snug text-white">{title || '(no headline)'}</h3>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 text-[12px] leading-relaxed text-white/75">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </>
      )}
      <div className="mt-3 flex items-center gap-1.5">
        <button
          onClick={() => resolve({ accepted: true, title: title.trim(), summary: summary.trim() })}
          disabled={!title.trim() || !summary.trim()}
          className="flex items-center gap-1 rounded-sm bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          <Check size={12} /> Accept
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-sm border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10"
        >
          {editing ? 'Preview' : 'Edit'}
        </button>
        <button
          onClick={() => resolve({ accepted: false })}
          className="rounded-sm border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}

function PhotoCard() {
  const [mode, setMode] = useState<'ask' | 'upload'>('ask');
  const [url, setUrl] = useState('');
  if (mode === 'ask') {
    return (
      <CardShell title="Add a lead photo?">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMode('upload')} className="rounded-sm bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600">Yes, add a photo</button>
          <button onClick={() => resolve({ imageUrl: null })} className="rounded-sm border border-white/15 px-3 py-1 text-[11px] text-white/70 hover:bg-white/10">No photo</button>
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell title="Lead photo">
      <div className="rounded-sm bg-white/95 p-2 text-foreground">
        <ImageUploader value={url} onChange={setUrl} kind="media" label="story image" id="story-studio-image" />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          onClick={() => resolve({ imageUrl: url.trim() || null })}
          disabled={!url.trim()}
          className="flex items-center gap-1 rounded-sm bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          <ImageIcon size={12} /> Use this photo
        </button>
        <button onClick={() => resolve({ imageUrl: null })} className="rounded-sm border border-white/15 px-3 py-1 text-[11px] text-white/70 hover:bg-white/10">Skip</button>
      </div>
    </CardShell>
  );
}

function BylineCard({ data }: { data?: Record<string, unknown> }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const isContributor = currentUser?.role === 'contributor';
  const locked = isContributor;
  const initial = String(data?.suggested ?? '') || (isContributor ? (currentUser?.displayName ?? '') : '');
  const [author, setAuthor] = useState(initial);
  return (
    <CardShell title="Byline / author">
      <input
        value={author}
        onChange={(e) => !locked && setAuthor(e.target.value)}
        readOnly={locked}
        placeholder="Correspondent name"
        className="w-full rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-[12px] text-white outline-none focus:border-white/30 read-only:opacity-70"
        onKeyDown={(e) => { if (e.key === 'Enter' && author.trim()) resolve({ author: author.trim() }); }}
      />
      {locked && <p className="mt-1 text-[10px] text-white/40">Automatically set to your account name.</p>}
      <button
        onClick={() => author.trim() && resolve({ author: author.trim() })}
        disabled={!author.trim()}
        className="mt-2 flex items-center gap-1 rounded-sm bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
      >
        <Check size={12} /> Confirm byline
      </button>
    </CardShell>
  );
}

function TierCard() {
  return (
    <CardShell title="Who can read this story?">
      <div className="flex flex-col gap-1.5">
        {TIER_ORDER.map((t) => (
          <button
            key={t}
            onClick={() => resolve({ minTier: t })}
            className="flex items-center justify-between rounded-sm border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] text-white/85 hover:border-white/30 hover:bg-white/10"
          >
            <span>{t === 'free' ? 'Free — everyone' : `${TIER_LABELS[t]} members & up`}</span>
          </button>
        ))}
      </div>
    </CardShell>
  );
}

function CategoryCard() {
  return (
    <CardShell title="Pick a category">
      <div className="space-y-2">
        {CATEGORY_SECTIONS.map((section) => (
          <div key={section}>
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300/80">{section}</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_DEFS.filter((c) => c.section === section).map((c) => (
                <button
                  key={c.value}
                  onClick={() => resolve({ category: c.value })}
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/80 hover:border-white/30 hover:bg-white/10"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function HorseLinkCard() {
  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const parties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const horseConn = useMemo(() => connectionResolver(parties), [parties]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => { void fetchHorses(); void fetchParties(); }, [fetchHorses, fetchParties]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? horses.filter((h) => h.name.toLowerCase().includes(q)) : horses;
    return list.slice(0, 40);
  }, [horses, search]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <CardShell title="Link horse profiles (optional)">
      {horses.length === 0 ? (
        <p className="text-[11px] italic text-white/50">No horses in the register yet.</p>
      ) : (
        <>
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search horses…"
              className="w-full rounded-sm border border-white/15 bg-white/5 py-1.5 pl-7 pr-2 text-[12px] text-white outline-none focus:border-white/30"
            />
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {filtered.map((h) => {
              const on = selected.includes(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() => toggle(h.id)}
                  className={'flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-[12px] ' + (on ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 hover:bg-white/5')}
                >
                  <span className={'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border ' + (on ? 'border-emerald-400 bg-emerald-400' : 'border-white/25')}>
                    {on && <Check size={10} className="text-[#0b1220]" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white/90">{h.name}</span>
                    <span className="block truncate text-[10px] text-white/40">{horseConn(h).trainer || '—'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <button
        onClick={() => resolve({ linkedHorseIds: selected })}
        className="mt-2 flex items-center gap-1 rounded-sm bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
      >
        <Check size={12} /> {selected.length > 0 ? `Link ${selected.length} & continue` : 'Continue without linking'}
      </button>
    </CardShell>
  );
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-300">{title}</div>
      {children}
    </div>
  );
}

function InteractionCard({ pending }: { pending: PendingInteraction }) {
  switch (pending.kind) {
    case 'story': return <StoryCard data={pending.data} />;
    case 'photo': return <PhotoCard />;
    case 'byline': return <BylineCard data={pending.data} />;
    case 'tier': return <TierCard />;
    case 'category': return <CategoryCard />;
    case 'horses': return <HorseLinkCard />;
    default: return null;
  }
}

/* ── Panel ────────────────────────────────────────────────── */

export function StoryStudioPanel() {
  const open = useStoryStudioUi((s) => s.open);
  const setOpen = useStoryStudioUi((s) => s.setOpen);
  const pending = useStoryStudioUi((s) => s.pending);
  const pendingPrompt = useStoryStudioUi((s) => s.pendingPrompt);
  const createdDraftId = useStoryStudioUi((s) => s.createdDraftId);

  const navigate = useNavigate();
  const { messages, sendMessage, setMessages, status, error, stop } = useStoryChatSession();

  const [input, setInput] = useState('');
  const busy = status === 'submitted' || status === 'streaming';
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(inputRef, input);

  // While open, hide the global Stablehand launcher (shared editor suppress flag).
  useEffect(() => {
    useEditorAgentUi.getState().setSuppressGlobal(open);
    return () => useEditorAgentUi.getState().setSuppressGlobal(false);
  }, [open]);

  // A suggestion chip / seeded idea queued a prompt — send it once.
  useEffect(() => {
    if (pendingPrompt && open && !busy) {
      void sendMessage({ text: pendingPrompt });
      useStoryStudioUi.getState().consumePrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, pending]);

  // Draft filed → open it for the user and reset the studio for next time.
  useEffect(() => {
    if (!createdDraftId) return;
    const id = createdDraftId;
    toast.success('Story drafted — opening it for you to review.');
    setMessages([]);
    setOpen(false);
    useStoryStudioUi.getState().reset();
    navigate(`/articles/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdDraftId]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || pending) return;
    void sendMessage({ text: t });
    setInput('');
  };

  const { voiceReady, voiceMode, setVoiceMode, recording, transcribing, caption, toggleMic } =
    useVoiceChat({ messages, send, busy, active: open });

  const close = () => {
    setOpen(false);
    setMessages([]);
    useStoryStudioUi.getState().reset();
  };

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-[80] flex h-screen w-[380px] max-w-[94vw] flex-col bg-[#0d1626] text-white shadow-[-8px_0_30px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5" style={{ background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)' }}>
        <Sparkles size={16} style={{ color: 'var(--gold-bright)' }} />
        <div className="leading-tight">
          <div className="text-[12px] font-bold" style={{ color: 'var(--parchment)' }}>Story Studio AI</div>
          <div className="text-[10px]" style={{ color: 'var(--gold-mid)' }}>Write a story draft with AI</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {voiceReady && (
            <button onClick={() => setVoiceMode((v) => !v)} aria-label={voiceMode ? 'Turn off spoken replies' : 'Read replies aloud'} title={voiceMode ? 'Spoken replies on' : 'Read replies aloud'} className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 hover:bg-white/10" style={{ color: voiceMode ? 'var(--gold-bright)' : 'var(--gold-mid)' }}>
              {voiceMode ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          )}
          <button onClick={close} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 text-white/70 hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-white/55">
              Tell me your story idea or a headline — type or <strong className="text-white/80">speak it</strong> — and I’ll write the full story, then walk you through the photo, byline, tier, category and linked horses, and file it as a <strong className="text-white/80">draft</strong>.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((c) => (
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
        {busy && !pending && <div className="text-[12px] text-white/40">…working</div>}
        {error && <p className="text-[11px] text-red-300">{error.message?.includes('resting') ? 'Story Studio isn’t switched on yet — set OPENROUTER_API_KEY on the server.' : 'Something went wrong — please try again.'}</p>}

        {/* The card the model is currently waiting on */}
        {pending && <InteractionCard pending={pending} />}
      </div>

      {/* Live caption while recording */}
      {(recording || transcribing) && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60">
          <span className={'inline-block h-2 w-2 rounded-full ' + (recording ? 'animate-pulse bg-red-500' : 'bg-white/30')} />
          <span className="line-clamp-2 italic">{caption || (transcribing ? 'Transcribing…' : 'Listening… speak now')}</span>
        </div>
      )}

      {/* Composer */}
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t border-white/10 px-2.5 py-2">
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={recording || transcribing || !!pending}
          placeholder={pending ? 'Use the card above…' : recording ? 'Listening…' : transcribing ? 'Transcribing…' : 'Describe your story idea…'}
          className="flex-1 resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] leading-snug text-white outline-none placeholder:text-white/30 focus:border-white/30 disabled:opacity-60"
        />
        {voiceReady && !busy && !pending && (
          <button type="button" onClick={() => void toggleMic()} disabled={transcribing} aria-label={recording ? 'Stop recording' : 'Speak your idea'} title={recording ? 'Stop & send' : 'Speak'} className={'flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ' + (recording ? 'animate-pulse border-red-500 bg-red-500/15 text-red-400' : 'border-white/15 text-white/60 hover:bg-white/10')}>
            {transcribing ? <Loader2 size={13} className="animate-spin" /> : recording ? <Square size={13} /> : <Mic size={13} />}
          </button>
        )}
        {busy ? (
          <button type="button" onClick={() => stop()} aria-label="Stop" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70">
            <Square size={13} />
          </button>
        ) : (
          <button type="submit" aria-label="Send" disabled={!input.trim() || !!pending} className="flex h-8 w-8 items-center justify-center rounded-full text-[#0b1220] disabled:opacity-40" style={{ background: 'var(--gold-bright)' }}>
            <Send size={13} />
          </button>
        )}
      </form>
    </div>
  );
}
