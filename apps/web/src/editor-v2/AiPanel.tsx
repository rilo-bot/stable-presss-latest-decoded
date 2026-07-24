// Magazine Builder v2 — the Studio Assistant panel (proposal-based AI editing).
//
// Mirrors the v1 studio assistant's design (docked-left, dark surface, amber
// "Review & apply" tray) but in the Stable brand palette — forest green surfaces,
// gold accents, parchment text. The model stages proposals server-side; this
// panel shows the reply + a Review & Apply tray that commits them through the
// rev-guarded element CRUD (store.applyAllProposals).

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, Check, X, Plus, Pencil, Trash2, Paperclip, FileText, FilePlus2, ArrowLeftRight, Image as ImageIcon, Mic, Volume2, VolumeX } from 'lucide-react';
import type { UIMessage } from 'ai';
import { toast } from 'sonner';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { ingestFile, ATTACH_ACCEPT } from '@/editor/agent/documentUpload';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { useEditorStore } from './store';
import type { AgentProposal } from './model';

const kindIcon = (k: AgentProposal['kind']) =>
  k === 'add' ? <Plus size={11} />
  : k === 'delete' || k === 'remove-page' ? <Trash2 size={11} />
  : k === 'add-page' || k === 'generate-pages' ? <FilePlus2 size={11} />
  : k === 'reorder-page' ? <ArrowLeftRight size={11} />
  : <Pencil size={11} />;

function thumbOf(p: AgentProposal): string | undefined {
  const url = (p.element?.image?.url ?? p.patch?.image?.url) as string | undefined;
  return url && /^https?:\/\/|^\/api\//.test(url) ? url : undefined;
}

export function AiPanel() {
  const chat = useEditorStore((s) => s.chat);
  const chatBusy = useEditorStore((s) => s.chatBusy);
  const proposals = useEditorStore((s) => s.proposals);
  const proposalsPageId = useEditorStore((s) => s.proposalsPageId);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const selectedId = useEditorStore((s) => s.selectedId);
  const sendChat = useEditorStore((s) => s.sendChat);
  const applyAll = useEditorStore((s) => s.applyAllProposals);
  const discard = useEditorStore((s) => s.discardProposals);

  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null); // optional source doc to fill this page from
  const [docText, setDocText] = useState<string | null>(null); // cached ingest of `file`
  const [ingesting, setIngesting] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null); // object URL for an attached image (docked preview)
  const isImage = !!file && file.type.startsWith('image/');

  // Build/revoke an object URL so an attached image can be previewed inline.
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setImgUrl(null); return; }
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const showTray = proposals.length > 0 && proposalsPageId === currentPageId;

  // Push-to-talk voice + read-aloud, shared with the app's other AI chats.
  // Adapt the store's {role,content} thread to the UIMessage shape the hook reads.
  const voice = useVoiceChat({
    messages: chat.map((m, i) => ({ id: `m${i}`, role: m.role, parts: [{ type: 'text', text: m.content }] })) as unknown as UIMessage[],
    send: (t) => void sendChat(t),
    busy: chatBusy,
    active: true,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, chatBusy, proposals.length]);

  const send = async () => {
    const t = input.trim();
    if (!t || chatBusy || ingesting) return;
    // If a document is attached, read it once (cache) and pass its text with the turn.
    let src = docText ?? undefined;
    if (file && !docText) {
      setIngesting(true);
      try {
        const att = await ingestFile(file);
        src = att.fullText;
        setDocText(att.fullText);
      } catch (e) {
        setIngesting(false);
        toast.error(e instanceof Error ? e.message : 'Could not read that document.');
        return;
      }
      setIngesting(false);
    }
    setInput('');
    void sendChat(t, src);
  };

  return (
    <div className="flex h-full flex-col bg-[#0d1626] text-white">
      {/* Header */}
      <div
        className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5"
        style={{ background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)' }}
      >
        <Sparkles size={16} style={{ color: 'var(--gold-bright)' }} />
        <div className="leading-tight">
          <div className="text-[12px] font-bold" style={{ color: 'var(--parchment)' }}>Studio Assistant</div>
          <div className="text-[10px]" style={{ color: 'var(--gold-mid)' }}>Edits this page — staged for your approval</div>
        </div>
        {voice.voiceReady && (
          <button
            onClick={() => voice.setVoiceMode((v) => !v)}
            aria-pressed={voice.voiceMode}
            title={voice.voiceMode ? 'Reading replies aloud — click to mute' : 'Read replies aloud'}
            className={'ml-auto flex h-7 w-7 items-center justify-center rounded-full ' + (voice.voiceMode ? 'text-[#0b1220]' : 'text-white/60 hover:bg-white/10')}
            style={voice.voiceMode ? { background: 'var(--gold-bright)' } : undefined}
          >
            {voice.voiceMode ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {chat.length === 0 && (
          <p className="text-[12px] leading-relaxed text-white/55">
            I’m your studio assistant for this page. Ask me to <strong className="text-white/85">rewrite the headline</strong>,{' '}
            <strong className="text-white/85">recolour a block</strong>, <strong className="text-white/85">add a photo</strong>,{' '}
            or <strong className="text-white/85">move things around</strong>, or <strong className="text-white/85">attach a document (📎)</strong> and ask me to fill this page from it. Select an element first and say “this”. Everything I
            propose waits for your <strong className="text-white/85">Apply</strong>.
          </p>
        )}
        {chat.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[88%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-emerald-600/90 px-2.5 py-1.5 text-[12px] text-white'
                  : 'max-w-[92%] rounded-lg rounded-bl-sm bg-white/5 px-2.5 py-1.5 text-[12px]'
              }
            >
              {m.role === 'user' ? m.content : <MarkdownMessage text={m.content} />}
            </div>
          </div>
        ))}
        {chatBusy && (
          <div className="flex items-center gap-1.5 text-[12px] text-white/40">
            <Loader2 size={12} className="animate-spin" /> thinking…
          </div>
        )}
      </div>

      {/* Review & apply tray */}
      {showTray && (
        <div className="max-h-[46%] space-y-2 overflow-y-auto border-t-2 px-3 py-2.5" style={{ borderColor: 'var(--gold-mid)', background: 'rgba(212,168,67,0.08)' }}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold-light)' }}>
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-[#0b1220]" style={{ background: 'var(--gold-bright)' }}>{proposals.length}</span>
              Review &amp; apply
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => void applyAll()} className="flex items-center gap-1 rounded-sm bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-600">
                <Check size={11} /> Apply all
              </button>
              <button onClick={() => discard()} className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/10">
                <X size={11} /> Discard
              </button>
            </div>
          </div>
          {proposals.map((p) => {
            const thumb = thumbOf(p);
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-[11px]" style={{ borderColor: 'rgba(212,168,67,0.3)', background: 'rgba(212,168,67,0.05)' }}>
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center" style={{ color: 'var(--gold-light)' }}>{kindIcon(p.kind)}</span>
                {thumb && <img src={thumb} alt="" className="h-7 w-10 flex-shrink-0 rounded-sm object-cover" />}
                <span className="text-white/85">{p.summary}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-white/10 px-2.5 py-2">
        {selectedId && (
          <div className="mb-1.5 flex items-center gap-1 text-[10px] text-white/45">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold-bright)' }} /> focused on the selected element
          </div>
        )}
        {file && (
          <div className="mb-1.5 overflow-hidden rounded-sm border border-emerald-400/30 bg-emerald-400/10">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-emerald-200">
              {ingesting ? <Loader2 size={11} className="animate-spin" /> : isImage ? <ImageIcon size={11} /> : <FileText size={11} />}
              <span className="truncate">{ingesting ? `Reading ${file.name}…` : file.name}</span>
              {!ingesting && (
                <button onClick={() => { setFile(null); setDocText(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove document" className="ml-auto text-emerald-200/60 hover:text-emerald-100"><X size={11} /></button>
              )}
            </div>
            {/* Docked preview: the image itself, or a snippet of the ingested text. */}
            {isImage && imgUrl ? (
              <img src={imgUrl} alt={file.name} className="max-h-40 w-full bg-black/20 object-contain" />
            ) : docText ? (
              <div className="max-h-28 overflow-y-auto whitespace-pre-wrap border-t border-emerald-400/20 px-2 py-1.5 text-[10px] leading-snug text-white/60">
                {docText.slice(0, 1200)}{docText.length > 1200 ? '…' : ''}
              </div>
            ) : null}
          </div>
        )}
        <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setDocText(null); }} />
        {voice.recording && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] italic text-white/50">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> {voice.caption || 'Listening…'}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a document"
            title="Attach a document to fill this page from"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 hover:bg-white/10 hover:text-white/90"
          >
            <Paperclip size={14} />
          </button>
          {voice.voiceReady && (
            <button
              type="button"
              onClick={() => void voice.toggleMic()}
              disabled={voice.transcribing}
              aria-label={voice.recording ? 'Stop and send' : 'Speak your request'}
              title={voice.recording ? 'Stop & send' : 'Speak your request'}
              className={
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ' +
                (voice.recording ? 'animate-pulse bg-red-500 text-white' : 'border border-white/15 text-white/60 hover:bg-white/10 hover:text-white/90')
              }
            >
              {voice.transcribing ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
            </button>
          )}
          <textarea
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={file ? 'e.g. “fill this page from the document”' : 'Ask the studio assistant…  (Shift+Enter for a new line)'}
            className="flex-1 resize-none overflow-hidden rounded-2xl border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] leading-snug text-white outline-none placeholder:text-white/30 focus:border-white/30"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || chatBusy || ingesting}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#0b1220] disabled:opacity-40"
            style={{ background: 'var(--gold-bright)' }}
          >
            {chatBusy || ingesting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </form>
      </div>
    </div>
  );
}
