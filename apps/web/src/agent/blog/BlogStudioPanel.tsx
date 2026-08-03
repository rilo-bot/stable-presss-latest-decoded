// The "Blog Studio" assistant — a right-side drawer that streams from
// /api/agent/blog/chat and writes, revises, publishes and deletes blog posts as a
// natural conversation: the user answers every question by typing or speaking (no
// option buttons — each question lists its choices in the text). Voice
// (push-to-talk + spoken replies) and attachments are the shared hooks the Story
// Studio uses. The conversation survives the drawer being closed; "New chat"
// starts a fresh one.
//
// Two things here that the Story Studio does not have, both because this is a DESK
// rather than a one-shot writer:
//
//   • the POSTS ON FILE box — the model lists, the user reads and names one.
//   • the CONFIRM CARD — delete, and overwriting a LIVE post's body, park the tool
//     call until a human clicks. That bends the no-buttons rule for exactly two
//     actions, and deliberately: the rule is about gathering preferences, and the
//     Story Studio never deletes anything, so it was never tested against this.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Send, Square, X, Paperclip, SquarePen, Mic, Volume2, VolumeX, Loader2,
  Image as ImageIcon, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useBlogStudioUi } from '@/stores/blogStudioUiStore';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { uploadImage } from '@/lib/upload';
import { useBlogChatSession, messageText } from './useBlogChatSession';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';
import { useChatAttachments } from '@/agent/attachments/useChatAttachments';
import { attachmentsToFileParts, CHAT_ATTACH_ACCEPT } from '@/agent/attachments/attachments';
import { AttachmentBar, MessageAttachments } from '@/agent/attachments/AttachmentViews';

const DESK_STARTERS = [
  'Write a longform piece on the yearling market',
  'What blog posts do we have on file?',
  'Draft an opinion piece on track ratings',
];

const POST_STARTERS = [
  'Tighten this post',
  'Suggest a better standfirst',
  'Give it a stronger opening',
];

/**
 * A destructive action waiting on a human.
 *
 * The tool call that raised this is parked on a promise until one of these buttons
 * is pressed, so the model cannot report success and be wrong.
 */
function ConfirmCard() {
  const pending = useBlogStudioUi((s) => s.pendingConfirm);
  const answer = useBlogStudioUi((s) => s.answerConfirm);
  if (!pending) return null;

  const destructive = pending.kind === 'delete';
  return (
    <div className="border-t border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5">
      <div className="mb-1.5 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-white/90">
            {destructive ? 'Delete this post?' : 'Overwrite what readers see?'}
          </p>
          <p className="truncate text-[11px] text-white/60">{pending.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/50">{pending.detail}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => answer(false)}
          className="rounded-sm border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          onClick={() => answer(true)}
          className={
            'rounded-sm px-2.5 py-1 text-[11px] font-bold ' +
            (destructive ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-amber-500 text-black hover:bg-amber-400')
          }
        >
          {destructive ? 'Delete it' : 'Replace it'}
        </button>
      </div>
    </div>
  );
}

export function BlogStudioPanel() {
  const open = useBlogStudioUi((s) => s.open);
  const setOpen = useBlogStudioUi((s) => s.setOpen);
  const mode = useBlogStudioUi((s) => s.mode);
  const postTitle = useBlogStudioUi((s) => s.postTitle);
  const pendingPrompt = useBlogStudioUi((s) => s.pendingPrompt);
  const attachedImageUrl = useBlogStudioUi((s) => s.attachedImageUrl);
  const postList = useBlogStudioUi((s) => s.postList);
  const createdDraftId = useBlogStudioUi((s) => s.createdDraftId);

  const navigate = useNavigate();
  const { messages, sendMessage, setMessages, status, error, stop } = useBlogChatSession();

  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(inputRef, input);
  // Generic attach: images/PDFs (📎 or paste) the assistant reads — separate from
  // the cover photo, which becomes the post's own image.
  const attach = useChatAttachments();

  // While open, hide the global Stablehand launcher (shared editor suppress flag).
  useEffect(() => {
    useEditorAgentUi.getState().setSuppressGlobal(open);
    return () => useEditorAgentUi.getState().setSuppressGlobal(false);
  }, [open]);

  // A suggestion chip / seeded idea queued a prompt — send it once.
  useEffect(() => {
    if (pendingPrompt && open && !busy) {
      void sendMessage({ text: pendingPrompt });
      useBlogStudioUi.getState().consumePrompt();
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
    toast.success('Post drafted — opening it for you to review.');
    setMessages([]);
    setOpen(false);
    useBlogStudioUi.getState().reset();
    navigate(`/production-system/blogs/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdDraftId]);

  const send = (text: string) => {
    const t = text.trim();
    if ((!t && !attach.hasAttachments) || busy || attach.busy) return;
    void sendMessage(
      attach.hasAttachments ? { text: t, files: attachmentsToFileParts(attach.attachments) } : { text: t },
    );
    attach.clear();
    setInput('');
  };

  // Push-to-talk + spoken replies, shared with the other studios.
  const { voiceReady, voiceMode, setVoiceMode, recording, transcribing, caption, toggleMic } =
    useVoiceChat({ messages, send, busy, active: open });

  // Closing the drawer PRESERVES the conversation (just hides it). "New chat" clears it.
  const close = () => setOpen(false);
  const newChat = () => {
    setMessages([]);
    setInput('');
    useBlogStudioUi.getState().reset();
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
      const { url } = await uploadImage(file, { kind: 'blog', maxDim: 2000, quality: 0.82 });
      useBlogStudioUi.getState().setAttachedImage(url);
      toast.success('Photo attached — it will be the post’s cover.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!open) return null;

  const starters = mode === 'post' ? POST_STARTERS : DESK_STARTERS;

  return (
    <div className="fixed right-0 top-0 z-[80] flex h-screen w-[380px] max-w-[94vw] flex-col bg-[#0d1626] text-white shadow-[-8px_0_30px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div
        className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5"
        style={{ background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)' }}
      >
        <Sparkles size={16} style={{ color: 'var(--gold-bright)' }} />
        <div className="min-w-0 leading-tight">
          <div className="text-[12px] font-bold" style={{ color: 'var(--parchment)' }}>Blog Studio AI</div>
          {/* Says which post it is scoped to, so "it" is never ambiguous on screen
              either — the same thing the prompt is told. */}
          <div className="truncate text-[10px]" style={{ color: 'var(--gold-mid)' }}>
            {mode === 'post' && postTitle ? postTitle : 'Write & manage blog posts with AI'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={newChat} aria-label="New chat" title="Start a new chat" className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 hover:bg-white/10" style={{ color: 'var(--gold-mid)' }}>
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
              {mode === 'post' ? (
                <>
                  This post is open beside the chat. Ask me to rewrite it, retitle it, change who can read
                  it, or publish it — type or <strong className="text-white/80">speak it</strong>. I’ll show
                  you any new writing before it replaces what’s there.
                </>
              ) : (
                <>
                  Tell me a post idea — type or <strong className="text-white/80">speak it</strong> — and
                  I’ll write the whole thing, then ask about the cover, tier, category and tags and file it
                  as a <strong className="text-white/80">draft</strong>. I can also list what’s on file,
                  revise a post, publish it or delete it.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {starters.map((c) => (
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
                {mine && <MessageAttachments message={m} tone="dark" />}
                {mine ? text : <MarkdownMessage text={text} />}
              </div>
            </div>
          );
        })}
        {busy && <div className="text-[12px] text-white/40">…working</div>}
        {error && <p className="text-[11px] text-red-300">{error.message?.includes('resting') ? 'Blog Studio isn’t switched on yet — set OPENROUTER_API_KEY on the server.' : 'Something went wrong — please try again.'}</p>}
      </div>

      {/* Live caption while recording */}
      {(recording || transcribing) && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60">
          <span className={'inline-block h-2 w-2 rounded-full ' + (recording ? 'animate-pulse bg-red-500' : 'bg-white/30')} />
          <span className="line-clamp-2 italic">{caption || (transcribing ? 'Transcribing…' : 'Listening… speak now')}</span>
        </div>
      )}

      {/* Posts on file — read-only reference list; name the one you mean */}
      {postList && postList.length > 0 && (
        <div className="border-t border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
              Posts on file — say which one
            </span>
            <button
              onClick={() => useBlogStudioUi.getState().setPostList(null)}
              aria-label="Hide the post list"
              className="text-white/40 hover:text-white/70"
            >
              <X size={12} />
            </button>
          </div>
          {/* ~4 rows visible; scroll inside the box for the rest */}
          <ul className="max-h-[7rem] divide-y divide-white/5 overflow-y-auto rounded-sm border border-white/10 bg-white/[0.02]">
            {postList.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
                <span className="truncate text-[12px] font-semibold text-white/85">{p.title}</span>
                <span
                  className={
                    'flex-shrink-0 text-[9px] font-bold uppercase tracking-wider ' +
                    (p.status === 'published' ? 'text-emerald-400/80' : 'text-white/35')
                  }
                >
                  {p.status === 'published' ? 'Live' : 'Draft'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attached cover chip */}
      {attachedImageUrl && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-1.5">
          <img src={attachedImageUrl} alt="Attached cover" crossOrigin="anonymous" className="h-7 w-10 flex-shrink-0 rounded-sm object-cover" />
          <span className="flex-1 truncate text-[11px] text-white/60">Cover photo attached</span>
          <button onClick={() => useBlogStudioUi.getState().setAttachedImage(null)} aria-label="Remove attached photo" className="text-white/50 hover:text-white/80">
            <X size={13} />
          </button>
        </div>
      )}

      <ConfirmCard />

      {/* Composer — the user answers everything here by typing or speaking */}
      <div className="border-t border-white/10">
        <AttachmentBar attachments={attach.attachments} onRemove={attach.remove} busy={attach.busy} tone="dark" />
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 px-2.5 py-2">
          {/* Cover photo — becomes the post's cover image */}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void onAttach(e.target.files?.[0])} aria-label="Attach the post's cover photo" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Attach the post's cover photo"
            title="Attach the post's cover photo"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
          </button>
          {/* Generic attach — images/PDFs for the assistant to read */}
          <input
            ref={attachFileRef}
            type="file"
            multiple
            accept={CHAT_ATTACH_ACCEPT}
            className="hidden"
            onChange={(e) => { void attach.addFiles(e.target.files); if (attachFileRef.current) attachFileRef.current.value = ''; }}
          />
          <button
            type="button"
            onClick={() => attachFileRef.current?.click()}
            disabled={recording || transcribing}
            aria-label="Attach an image or PDF for the assistant to read"
            title="Attach an image or PDF for the assistant to read (or paste one)"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <Paperclip size={14} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onPaste={attach.onPaste}
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
            <button type="submit" aria-label="Send" disabled={!input.trim() && !attach.hasAttachments} className="flex h-8 w-8 items-center justify-center rounded-full text-[#0b1220] disabled:opacity-40" style={{ background: 'var(--gold-bright)' }}>
              <Send size={13} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
