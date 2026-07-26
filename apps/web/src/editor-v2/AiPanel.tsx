// Magazine Builder v2 — the Studio Assistant panel (proposal-based AI editing).
//
// Mirrors the v1 studio assistant's design (docked-left, dark surface, amber
// "Review & apply" tray) but in the Stable brand palette — forest green surfaces,
// gold accents, parchment text. The model stages proposals server-side; this
// panel shows the reply + a Review & Apply tray that commits them through the
// rev-guarded element CRUD (store.applyAllProposals).

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Square, Loader2, Check, X, Plus, Pencil, Trash2, Paperclip, FileText, FilePlus2, ArrowLeftRight, Image as ImageIcon, Mic, Volume2, VolumeX } from 'lucide-react';
import type { UIMessage } from 'ai';
import { toast } from 'sonner';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { ingestFile, attachmentSourceText, ATTACH_ACCEPT } from '@/editor/agent/documentUpload';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { useEditorStore } from './store';
import { uploadMediaImage, type AttachedImage } from './api';
import type { AgentProposal } from './model';

/** One file staged in the composer. Images carry an object URL for preview, and
 *  once sent, the media-library URL the agent can place them by. */
interface PanelAttachment {
  id: string;
  file: File;
  isImage: boolean;
  imgUrl?: string; // object URL (images only) — revoked on remove/unmount
  text?: string; // cached ingest text (fullText for docs, vision digest for images)
  mediaUrl?: string; // cached media-library URL (images only, set on first send)
}

const MAX_PANEL_ATTACHMENTS = 5;
let attSeq = 0;
const attId = () => `att_${Date.now().toString(36)}_${(++attSeq).toString(36)}`;

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
  const setPreviewDoc = useEditorStore((s) => s.setPreviewDoc);

  const issueId = useEditorStore((s) => s.issueId);

  const [input, setInput] = useState('');
  const [atts, setAtts] = useState<PanelAttachment[]>([]); // source docs/images to work from
  const [ingesting, setIngesting] = useState(false);

  // Revoke every attachment's object URL on unmount (removal revokes eagerly).
  const attsRef = useRef<PanelAttachment[]>([]);
  attsRef.current = atts;
  useEffect(() => () => { for (const a of attsRef.current) if (a.imgUrl) URL.revokeObjectURL(a.imgUrl); }, []);
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
    // Spoken replies are strictly opt-in: silent by default, only when the
    // read-aloud (🔊) toggle is on — even after speaking via the mic.
    autoSpeakOnMic: false,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, chatBusy, proposals.length]);

  // Stage newly picked/dropped files (multi-attach: an article + its graphs can
  // ride the same turn). Images get an object URL for the inline preview.
  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const room = Math.max(0, MAX_PANEL_ATTACHMENTS - atts.length);
    if (list.length > room) toast.message(`Up to ${MAX_PANEL_ATTACHMENTS} attachments — the rest were skipped.`);
    const staged = Array.from(list).slice(0, room).map((f): PanelAttachment => {
      const isImage = f.type.startsWith('image/');
      return { id: attId(), file: f, isImage, imgUrl: isImage ? URL.createObjectURL(f) : undefined };
    });
    if (staged.length > 0) setAtts((prev) => [...prev, ...staged]);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Open one attachment in the right pane (docks over the Inspector). Images show
  // immediately; docs are ingested for their text first.
  const openPreview = async (att: PanelAttachment) => {
    if (ingesting) return;
    if (att.isImage) {
      setPreviewDoc({ name: att.file.name, isImage: true, imageUrl: att.imgUrl });
      return;
    }
    let text = att.text;
    if (!text) {
      setIngesting(true);
      try {
        text = (await ingestFile(att.file)).fullText;
        setAtts((prev) => prev.map((a) => (a.id === att.id ? { ...a, text } : a)));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not read that document.');
        setIngesting(false);
        return;
      }
      setIngesting(false);
    }
    setPreviewDoc({ name: att.file.name, isImage: false, text: text ?? '' });
  };

  const removeAtt = (id: string) => {
    const gone = atts.find((a) => a.id === id);
    if (gone?.imgUrl) URL.revokeObjectURL(gone.imgUrl);
    const next = atts.filter((a) => a.id !== id);
    setAtts(next);
    // Close the preview pane if it was showing the removed attachment (its
    // object URL is revoked above), or when nothing is left to preview.
    const pd = useEditorStore.getState().previewDoc;
    if (next.length === 0 || (gone && pd && pd.name === gone.file.name)) setPreviewDoc(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const send = async () => {
    const t = input.trim();
    if (!t || chatBusy || ingesting) return;
    let src: string | undefined;
    let images: AttachedImage[] | undefined;
    if (atts.length > 0) {
      setIngesting(true);
      const parts: string[] = [];
      const imgs: AttachedImage[] = [];
      const worked = atts.map((a) => ({ ...a })); // cache results without mutating state mid-flight
      // Persist the caches by id (never replace the list wholesale) so an
      // attachment removed or added while requests were in flight stays that way.
      const mergeWorked = () => setAtts((prev) => prev.map((p) => worked.find((w) => w.id === p.id) ?? p));
      for (const a of worked) {
        if (a.isImage) {
          // 1) Persist the image to the issue's media library so the agent can
          //    actually PLACE it on the page (set_element_image / add_media_image
          //    only accept library or on-page urls).
          if (!a.mediaUrl && issueId) {
            try {
              a.mediaUrl = (await uploadMediaImage(issueId, a.file, a.file.name)).url;
            } catch {
              toast.message(`Couldn't store “${a.file.name}” for placement — I'll describe it to the assistant instead.`);
            }
          }
          if (a.mediaUrl) imgs.push({ url: a.mediaUrl, name: a.file.name });
          // 2) Read what it shows (vision digest) so copy can reference it.
          //    Optional for images — a failed read must not sink the turn.
          if (!a.text) {
            try {
              a.text = attachmentSourceText(await ingestFile(a.file));
            } catch {
              /* the image is still placeable via its media url */
            }
          }
          if (a.text) parts.push(`[Attached image “${a.file.name}” — what it shows]\n${a.text}`);
        } else {
          // Documents ARE the content — an unreadable one still stops the turn.
          if (!a.text) {
            try {
              a.text = attachmentSourceText(await ingestFile(a.file));
            } catch (e) {
              setIngesting(false);
              mergeWorked();
              toast.error(e instanceof Error ? e.message : `Could not read “${a.file.name}”.`);
              return;
            }
          }
          parts.push(worked.length > 1 ? `[Attached document “${a.file.name}”]\n${a.text}` : a.text);
        }
      }
      mergeWorked();
      setIngesting(false);
      src = parts.filter(Boolean).join('\n\n') || undefined;
      images = imgs.length > 0 ? imgs : undefined;
    }
    setInput('');
    void sendChat(t, src, images);
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
        {atts.map((att) => (
          <div key={att.id} className="mb-1.5 flex items-center gap-1.5 rounded-sm border border-emerald-400/30 bg-emerald-400/10 px-2 py-1.5 text-[10px] text-emerald-200">
            <button
              type="button"
              onClick={() => void openPreview(att)}
              disabled={ingesting}
              title="Open preview in the side panel"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-emerald-100 disabled:opacity-70"
            >
              {ingesting ? (
                <Loader2 size={11} className="flex-shrink-0 animate-spin" />
              ) : att.isImage && att.imgUrl ? (
                <img src={att.imgUrl} alt="" className="h-6 w-6 flex-shrink-0 rounded object-cover" />
              ) : att.isImage ? (
                <ImageIcon size={11} className="flex-shrink-0" />
              ) : (
                <FileText size={11} className="flex-shrink-0" />
              )}
              <span className="truncate">{ingesting ? `Reading ${att.file.name}…` : att.file.name}</span>
              {!ingesting && <span className="ml-1 flex-shrink-0 text-emerald-200/60">Preview →</span>}
            </button>
            <button type="button" onClick={() => removeAtt(att.id)} disabled={ingesting} aria-label="Remove attachment" className="flex-shrink-0 text-emerald-200/60 hover:text-emerald-100 disabled:opacity-50"><X size={11} /></button>
          </div>
        ))}
        <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        {/* Speaking / transcribing status bar — matches v1: pulsing dot + live caption. */}
        {(voice.recording || voice.transcribing) && (
          <div className="mb-1.5 flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/60">
            <span className={'inline-block h-2 w-2 rounded-full ' + (voice.recording ? 'animate-pulse bg-red-500' : 'bg-white/30')} />
            <span className="line-clamp-2 italic">{voice.caption || (voice.transcribing ? 'Transcribing…' : 'Listening… speak now')}</span>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach documents or images"
            title="Attach documents/images — docs fill the page, images can be placed on it"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 hover:bg-white/10 hover:text-white/90"
          >
            <Paperclip size={14} />
          </button>
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
            disabled={voice.recording || voice.transcribing}
            placeholder={
              voice.recording ? 'Listening…'
              : voice.transcribing ? 'Transcribing…'
              : atts.length > 0 ? 'e.g. “fill this page from the document and place the graphs”'
              : 'Ask the studio assistant…  (Shift+Enter for a new line)'
            }
            className="flex-1 resize-none overflow-hidden rounded-2xl border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] leading-snug text-white outline-none placeholder:text-white/30 focus:border-white/30 disabled:opacity-60"
          />
          {/* Mic — v1 order (after the textarea), v1 icon logic: transcribing→spinner,
              recording→stop (■), idle→mic; hidden while a reply is generating. */}
          {voice.voiceReady && !chatBusy && (
            <button
              type="button"
              onClick={() => void voice.toggleMic()}
              disabled={voice.transcribing}
              aria-label={voice.recording ? 'Stop recording' : 'Speak to the studio assistant'}
              title={voice.recording ? 'Stop & send' : 'Speak'}
              className={
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ' +
                (voice.recording ? 'animate-pulse border-red-500 bg-red-500/15 text-red-400' : 'border-white/15 text-white/60 hover:bg-white/10')
              }
            >
              {voice.transcribing ? <Loader2 size={13} className="animate-spin" /> : voice.recording ? <Square size={13} /> : <Mic size={13} />}
            </button>
          )}
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
