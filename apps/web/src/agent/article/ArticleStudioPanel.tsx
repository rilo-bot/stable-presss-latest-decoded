// The "Article Studio" assistant — a right-side drawer that edits ONE open
// article in place. The reader clicks a field on the page (it highlights with a
// purple ring); that field is the assistant's focus. The assistant edits the
// article directly via client-executed tools, and every change can be reverted
// with the one-step Undo. The reader can also TYPE or SPEAK their request
// (push-to-talk + spoken replies via useVoiceChat) and upload their own hero
// photo with the 📎 button. Mirrors StoryStudioPanel, minus the draft-filing /
// horse-linking flow.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, Square, X, SquarePen, Undo2, MousePointerClick, Paperclip, Mic, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';
import { uploadImage } from '@/lib/upload';
import { useArticleStore } from '@/stores/articleStore';
import { useArticleStudioUi } from '@/stores/articleStudioUiStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { fieldDef } from './articleFields';
import { suggestForArticle, type ArticleSuggestion } from './articleSuggestions';
import { applyImage, undoLastArticleEdit } from './articleToolExecutor';
import { useArticleChatSession, messageText } from './useArticleChatSession';

export function ArticleStudioPanel() {
  const open = useArticleStudioUi((s) => s.open);
  const articleId = useArticleStudioUi((s) => s.articleId);
  const pendingPrompt = useArticleStudioUi((s) => s.pendingPrompt);
  const selectedFieldId = useArticleStudioUi((s) => s.selectedFieldId);
  const undoPatch = useArticleStudioUi((s) => s.undoPatch);
  const imageOptions = useArticleStudioUi((s) => s.imageOptions);

  // The open article (re-selected on every edit, so suggestions stay current).
  const article = useArticleStore((s) => s.articles.find((a) => a.id === articleId));
  const suggestions = useMemo(() => (article ? suggestForArticle(article) : []), [article]);

  const { messages, sendMessage, setMessages, status, error, stop } = useArticleChatSession();

  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(inputRef, input);

  const selectedName = selectedFieldId ? fieldDef(selectedFieldId)?.name : undefined;

  // While open, hide the global Stablehand launcher (shared editor suppress flag).
  useEffect(() => {
    useEditorAgentUi.getState().setSuppressGlobal(open);
    return () => useEditorAgentUi.getState().setSuppressGlobal(false);
  }, [open]);

  // A starter chip queued a prompt — send it once.
  useEffect(() => {
    if (pendingPrompt && open && !busy) {
      void sendMessage({ text: pendingPrompt });
      useArticleStudioUi.getState().consumePrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput('');
  };

  // A suggestion chip: focus the field it targets, then send its prompt.
  const runSuggestion = (s: ArticleSuggestion) => {
    if (s.fieldId) useArticleStudioUi.getState().select(s.fieldId);
    send(s.prompt);
  };

  // Push-to-talk + spoken replies. With the speak toggle on, every assistant
  // reply is read aloud; when the user speaks, the next reply is too.
  const { voiceReady, voiceMode, setVoiceMode, recording, transcribing, caption, toggleMic } =
    useVoiceChat({ messages, send, busy, active: open });

  const close = () => useArticleStudioUi.getState().close();
  const newChat = () => {
    setMessages([]);
    setInput('');
    useArticleStudioUi.getState().setImageOptions(null);
  };

  const onUndo = async () => {
    const ok = await undoLastArticleEdit();
    if (ok) toast.success('Reverted the last AI change.');
  };

  const onPickPhoto = async (url: string, name: string) => {
    const res = await applyImage(url);
    if (res.ok) {
      toast.success(`Hero photo set — “${name}”.`);
      useArticleStudioUi.getState().setImageOptions(null);
    } else {
      toast.error(res.error);
    }
  };

  // Upload the user's own photo and set it straight onto the hero (undoable).
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
      const res = await applyImage(url);
      if (res.ok) toast.success('Hero photo updated — your upload is now the lead image.');
      else toast.error(res.error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-[80] flex h-screen w-[380px] max-w-[94vw] flex-col bg-[#160d26] text-white shadow-[-8px_0_30px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5 bg-gradient-to-b from-purple-900 to-[#160d26]">
        <Sparkles size={16} className="text-purple-300" />
        <div className="leading-tight">
          <div className="text-[12px] font-bold text-purple-100">Article Studio AI</div>
          <div className="text-[10px] text-purple-300/80">Edit this article in place</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {undoPatch && (
            <button onClick={onUndo} aria-label="Undo last AI edit" title="Undo last AI edit" className="flex h-7 items-center gap-1 rounded-sm border border-white/15 px-2 text-[11px] text-purple-200 hover:bg-white/10">
              <Undo2 size={13} /> Undo
            </button>
          )}
          {voiceReady && (
            <button onClick={() => setVoiceMode((v) => !v)} aria-label={voiceMode ? 'Turn off spoken replies' : 'Read replies aloud'} title={voiceMode ? 'Spoken replies on' : 'Read replies aloud'} className={'flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 hover:bg-white/10 ' + (voiceMode ? 'text-purple-200' : 'text-purple-300/70')}>
              {voiceMode ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          )}
          <button onClick={newChat} aria-label="New chat" title="Start a new chat" className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 text-purple-200 hover:bg-white/10">
            <SquarePen size={14} />
          </button>
          <button onClick={close} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 text-white/70 hover:bg-white/10">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Selection indicator */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px]">
        <MousePointerClick size={13} className="flex-shrink-0 text-purple-300" />
        {selectedName ? (
          <span className="text-white/70">
            Focused on <strong className="text-purple-200">{selectedName}</strong> — ask me to change it.
          </span>
        ) : (
          <span className="text-white/45">Click any field on the article to focus it (it turns purple).</span>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-white/55">
              Click a field on the article — the <strong className="text-white/80">headline</strong>, body, byline, category, hero photo or tags — then tell me how to change it (type or <strong className="text-white/80">speak it</strong>). I’ll edit it right here, and you can <strong className="text-white/80">Undo</strong> any change.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s.label} onClick={() => runSuggestion(s)} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/10">{s.label}</button>
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
              <div className={mine ? 'max-w-[88%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-purple-600/90 px-2.5 py-1.5 text-[12px]' : 'max-w-[92%] rounded-lg rounded-bl-sm bg-white/5 px-2.5 py-1.5 text-[12px]'}>
                {mine ? text : <MarkdownMessage text={text} />}
              </div>
            </div>
          );
        })}
        {busy && <div className="text-[12px] text-white/40">…working</div>}
        {error && <p className="text-[11px] text-red-300">{error.message?.includes('resting') ? 'Article Studio isn’t switched on yet — set OPENROUTER_API_KEY on the server.' : 'Something went wrong — please try again.'}</p>}
      </div>

      {/* Live caption while recording */}
      {(recording || transcribing) && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60">
          <span className={'inline-block h-2 w-2 rounded-full ' + (recording ? 'animate-pulse bg-red-500' : 'bg-white/30')} />
          <span className="line-clamp-2 italic">{caption || (transcribing ? 'Transcribing…' : 'Listening… speak now')}</span>
        </div>
      )}

      {/* Photo candidates — click one to set it as the hero */}
      {imageOptions && imageOptions.length > 0 && (
        <div className="border-t border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-purple-300/80">
            Photo options — click to set as hero
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {imageOptions.map((opt) => (
              <button
                key={opt.url}
                onClick={() => void onPickPhoto(opt.url, opt.name)}
                title={opt.name}
                className="group relative h-12 w-16 flex-shrink-0 overflow-hidden rounded-sm border border-white/15 hover:border-purple-400"
              >
                <img src={opt.url} alt={opt.name} crossOrigin="anonymous" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Next-step suggestions — refresh as the article changes */}
      {messages.length > 0 && !busy && suggestions.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/10 bg-white/[0.02] px-3 py-1.5">
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-purple-300/70">Next</span>
          {suggestions.map((s) => (
            <button key={s.label} onClick={() => runSuggestion(s)} className="flex-shrink-0 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/10">
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t border-white/10 px-2.5 py-2">
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void onAttach(e.target.files?.[0])} aria-label="Upload a hero photo" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Upload a hero photo"
          title="Upload a hero photo"
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
          placeholder={recording ? 'Listening…' : transcribing ? 'Transcribing…' : selectedName ? `Change the ${selectedName.toLowerCase()}…` : 'Type or speak what to change…'}
          className="flex-1 resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] leading-snug text-white outline-none placeholder:text-white/30 focus:border-white/30 disabled:opacity-60"
        />
        {voiceReady && !busy && (
          <button type="button" onClick={() => void toggleMic()} disabled={transcribing} aria-label={recording ? 'Stop recording' : 'Speak your request'} title={recording ? 'Stop & send' : 'Speak'} className={'flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ' + (recording ? 'animate-pulse border-red-500 bg-red-500/15 text-red-400' : 'border-white/15 text-white/60 hover:bg-white/10')}>
            {transcribing ? <Loader2 size={13} className="animate-spin" /> : recording ? <Square size={13} /> : <Mic size={13} />}
          </button>
        )}
        {busy ? (
          <button type="button" onClick={() => stop()} aria-label="Stop" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70">
            <Square size={13} />
          </button>
        ) : (
          <button type="submit" aria-label="Send" disabled={!input.trim()} className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 text-white disabled:opacity-40">
            <Send size={13} />
          </button>
        )}
      </form>
    </div>
  );
}
