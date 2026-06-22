// The "Story Studio" assistant — a right-side drawer that streams from
// /api/agent/story/chat and writes a story draft WITH the user as a natural
// conversation: the user answers every question by typing or speaking (no option
// buttons — each question lists its choices in the text). The byline is the
// signed-in member, the reading time and draft stage are automatic, and the lead
// photo is attached with the composer's 📎 button. Voice (push-to-talk + spoken
// replies) is shared via useVoiceChat — with the speak toggle on, every reply is
// read aloud. The conversation is preserved while the drawer is closed; the
// "New chat" button starts a fresh one.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Square, X, Paperclip, SquarePen, Mic, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useStoryStudioUi } from '@/stores/storyStudioUiStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { uploadImage } from '@/lib/upload';
import { useStoryChatSession, messageText } from './useStoryChatSession';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';

const STARTERS = [
  'A feature on a rising sprinter at Flemington',
  'Weekend race report from Randwick',
  'A trainer profile for a country stable',
];

export function StoryStudioPanel() {
  const open = useStoryStudioUi((s) => s.open);
  const setOpen = useStoryStudioUi((s) => s.setOpen);
  const pendingPrompt = useStoryStudioUi((s) => s.pendingPrompt);
  const attachedImageUrl = useStoryStudioUi((s) => s.attachedImageUrl);
  const horseOptions = useStoryStudioUi((s) => s.horseOptions);
  const createdDraftId = useStoryStudioUi((s) => s.createdDraftId);

  const navigate = useNavigate();
  const { messages, sendMessage, setMessages, status, error, stop } = useStoryChatSession();

  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
  }, [messages, status]);

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
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput('');
  };

  // Push-to-talk + spoken replies. With the speak toggle on, every assistant
  // reply is read aloud (voiceMode); when the user speaks, the next reply is too.
  const { voiceReady, voiceMode, setVoiceMode, recording, transcribing, caption, toggleMic } =
    useVoiceChat({ messages, send, busy, active: open });

  // Closing the drawer PRESERVES the conversation (just hides it). "New chat" clears it.
  const close = () => setOpen(false);
  const newChat = () => {
    setMessages([]);
    setInput('');
    useStoryStudioUi.getState().reset();
  };

  const onAttach = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadImage(file, { kind: 'media', maxDim: 1280, quality: 0.72 });
      useStoryStudioUi.getState().setAttachedImage(url);
      toast.success('Photo attached — it will be the story’s lead image.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
          <button onClick={newChat} aria-label="New chat" title="Start a new story" className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 hover:bg-white/10" style={{ color: 'var(--gold-mid)' }}>
            <SquarePen size={14} />
          </button>
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
              Tell me your story idea or a headline — type or <strong className="text-white/80">speak it</strong> — and I’ll write the full story, then ask you about the photo, tier, category and linked horses, and file it as a <strong className="text-white/80">draft</strong>. Just reply in your own words.
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
        {busy && <div className="text-[12px] text-white/40">…working</div>}
        {error && <p className="text-[11px] text-red-300">{error.message?.includes('resting') ? 'Story Studio isn’t switched on yet — set OPENROUTER_API_KEY on the server.' : 'Something went wrong — please try again.'}</p>}
      </div>

      {/* Live caption while recording */}
      {(recording || transcribing) && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60">
          <span className={'inline-block h-2 w-2 rounded-full ' + (recording ? 'animate-pulse bg-red-500' : 'bg-white/30')} />
          <span className="line-clamp-2 italic">{caption || (transcribing ? 'Transcribing…' : 'Listening… speak now')}</span>
        </div>
      )}

      {/* Horses on file — read-only reference list (not selectable); name the ones to link */}
      {horseOptions && horseOptions.length > 0 && (
        <div className="border-t border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
            Horses on file — say which to link
          </div>
          {/* ~4 rows visible; scroll inside the box for the rest */}
          <ul className="max-h-[7rem] divide-y divide-white/5 overflow-y-auto rounded-sm border border-white/10 bg-white/[0.02]">
            {horseOptions.map((h) => (
              <li key={h.id} className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
                <span className="truncate text-[12px] font-semibold text-white/85">{h.name}</span>
                <span className="flex-shrink-0 truncate text-[10px] text-white/40">{h.trainer || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attached lead-photo chip */}
      {attachedImageUrl && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-1.5">
          <img src={attachedImageUrl} alt="Attached lead" crossOrigin="anonymous" className="h-7 w-10 flex-shrink-0 rounded-sm object-cover" />
          <span className="flex-1 truncate text-[11px] text-white/60">Lead photo attached</span>
          <button onClick={() => useStoryStudioUi.getState().setAttachedImage(null)} aria-label="Remove attached photo" className="text-white/50 hover:text-white/80">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Composer — the user answers everything here by typing or speaking */}
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t border-white/10 px-2.5 py-2">
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void onAttach(e.target.files?.[0])} aria-label="Attach a lead photo" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Attach a lead photo"
          title="Attach a lead photo"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
        </button>
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
          disabled={recording || transcribing}
          placeholder={recording ? 'Listening…' : transcribing ? 'Transcribing…' : 'Type or speak your answer…'}
          className="flex-1 resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] leading-snug text-white outline-none placeholder:text-white/30 focus:border-white/30 disabled:opacity-60"
        />
        {voiceReady && !busy && (
          <button type="button" onClick={() => void toggleMic()} disabled={transcribing} aria-label={recording ? 'Stop recording' : 'Speak your answer'} title={recording ? 'Stop & send' : 'Speak'} className={'flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ' + (recording ? 'animate-pulse border-red-500 bg-red-500/15 text-red-400' : 'border-white/15 text-white/60 hover:bg-white/10')}>
            {transcribing ? <Loader2 size={13} className="animate-spin" /> : recording ? <Square size={13} /> : <Mic size={13} />}
          </button>
        )}
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
