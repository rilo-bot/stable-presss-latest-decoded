// The in-editor Studio Assistant panel. Streams from /api/agent/editor/chat,
// executes the model's editor tool calls in the browser (onToolCall →
// executeEditorTool → addToolResult), renders the conversation, and shows the
// staged-edit preview cards (Apply / Discard) plus an Undo control.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { Sparkles, Send, Square, Undo2, Check, X, Paperclip, FileText, Loader2, Mic, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useVoiceChat } from '@/agent/voice/useVoiceChat';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { createEditorTransport } from './editorTransport';
import { executeEditorTool, isEditorClientTool } from './editOpsExecutor';
import { previewOf } from './editorContext';
import { ingestFile, ATTACH_ACCEPT } from './documentUpload';
import { applyStagedEdit, applyBatch, applyAllStaged, discardStaged, discardBatch, discardAll, undoLast } from './applyEdits';
import type { StagedEdit, DocAttachment } from './types';

/** Files shown attached to a sent user message (stored in its metadata). */
type MsgDoc = { name: string; kind: string };

function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}
function messageDocs(m: UIMessage): MsgDoc[] {
  return (m.metadata as { docs?: MsgDoc[] } | undefined)?.docs ?? [];
}

type AddToolResult = (a: { tool: string; toolCallId: string; output: unknown }) => void;

function StagedCard({ group }: { group: StagedEdit[] }) {
  const first = group[0];
  const isBatch = group.length > 1 || !!first.batchId;
  const title = isBatch ? `Fill ${group.length} regions · ${first.pageLabel}` : first.summary;

  const apply = () => (isBatch && first.batchId ? applyBatch(first.batchId) : applyStagedEdit(first));
  const discard = () => (isBatch && first.batchId ? discardBatch(first.batchId) : discardStaged(first.id));

  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-amber-200">{title}</span>
        <div className="flex items-center gap-1">
          <button onClick={apply} className="flex items-center gap-1 rounded-sm bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-600">
            <Check size={11} /> Apply
          </button>
          <button onClick={discard} className="flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10">
            <X size={11} /> Discard
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        {group.map((e) => (
          <div key={e.id} className="text-[11px] leading-snug">
            <span className="text-white/40">{e.regionId.split('.').pop()}: </span>
            {e.payload.kind === 'image' || e.afterPreview.kind === 'image' ? (
              <span className="inline-flex items-center gap-1.5 align-middle">
                {e.afterPreview.kind === 'image' && e.afterPreview.src ? (
                  <img src={e.afterPreview.src} alt="" className="h-7 w-10 rounded-sm object-cover" />
                ) : null}
                <span className="text-white/70">new photo</span>
              </span>
            ) : (
              <>
                {e.before && previewOf(e.before, 48) !== '(empty)' && (
                  <span className="text-white/35 line-through">{previewOf(e.before, 48)} </span>
                )}
                <span className="text-white/80">{previewOf(e.afterPreview, 64)}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EditorAgentPanel() {
  const transport = useMemo(() => createEditorTransport(), []);
  const addToolResultRef = useRef<AddToolResult | null>(null);

  const { messages, sendMessage, status, error, stop, addToolResult } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      // Server-executed grounding tools resolve on the server — don't touch them.
      if (!isEditorClientTool(toolCall.toolName)) return;
      let output: unknown;
      try {
        output = await executeEditorTool(toolCall.toolName, toolCall.input);
      } catch (e) {
        output = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      addToolResultRef.current?.({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
    },
  });
  addToolResultRef.current = addToolResult as unknown as AddToolResult;

  const [input, setInput] = useState('');
  const busy = status === 'submitted' || status === 'streaming';
  const staged = useEditorAgentUi((s) => s.staged);
  const undoCount = useEditorAgentUi((s) => s.undo.length);
  const pendingPrompt = useEditorAgentUi((s) => s.pendingPrompt);
  const addAttachment = useEditorAgentUi((s) => s.addAttachment);

  // Files attached to the composer but NOT yet analysed. Picking a file only shows
  // a chip — the analysis (ingest) is deferred until the user writes a prompt and
  // presses Enter, so the document and the instruction reach the AI together.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const pendingFilesRef = useRef<File[]>([]);
  useEffect(() => { pendingFilesRef.current = pendingFiles; }, [pendingFiles]);
  // True while the just-attached files are being read, after the user hits send.
  const [ingesting, setIngesting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer (and shrink back when it's cleared after sending):
  // wraps, grows up to 5 lines, then scrolls.
  useAutoGrowTextarea(textareaRef, input);

  // Dispatch a message: first analyse any attached files (so the digest is in the
  // editor context and the fullText is ready for a fill), THEN send the message,
  // tagging it with the analysed docs so they show in the thread.
  const dispatch = useCallback(
    async (t: string) => {
      if (!t || busy || ingesting) return;
      let docs: MsgDoc[] = [];
      const files = pendingFilesRef.current;
      if (files.length > 0) {
        setIngesting(true);
        const ok: DocAttachment[] = [];
        const failed: File[] = [];
        for (const file of files) {
          try {
            const att = await ingestFile(file);
            addAttachment(att); // session context: digest rides along, fullText feeds the fill
            ok.push(att);
          } catch (e) {
            failed.push(file);
            toast.error(e instanceof Error ? e.message : `Couldn't read ${file.name}.`);
          }
        }
        setIngesting(false);
        setPendingFiles(failed); // keep only the ones that failed, for retry
        if (ok.length === 0) return; // nothing analysed — leave the prompt in the box
        docs = ok.map((a) => ({ name: a.name, kind: a.kind }));
      }
      void sendMessage(docs.length ? { text: t, metadata: { docs } } : { text: t });
      setInput('');
    },
    [busy, ingesting, sendMessage, addAttachment],
  );

  const onPickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    // Just stage the raw files as chips — no upload, no analysis yet. The fill
    // starts when the user types a prompt and presses Enter.
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const send = (text: string) => {
    void dispatch(text.trim());
  };

  // Push-to-talk + spoken replies, shared with the concierge/onboarding/drawer.
  // The panel only mounts while open, so active is always true here — unmount
  // cleanup stops mic/playback when the editor closes the panel.
  const { voiceReady, voiceMode, setVoiceMode, recording, transcribing, caption, toggleMic } =
    useVoiceChat({ messages, send, busy, active: true });

  // A suggestion chip / inline trigger queued a prompt — send it once (analysing
  // any attached files first, via dispatch).
  useEffect(() => {
    if (pendingPrompt && !busy && !ingesting) {
      void dispatch(pendingPrompt);
      useEditorAgentUi.getState().consumePrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, busy, ingesting]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, staged]);

  // Group staged edits into cards (batch shares batchId).
  const groups = useMemo(() => {
    const map = new Map<string, StagedEdit[]>();
    for (const e of staged) {
      const key = e.batchId ?? e.id;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.values()];
  }, [staged]);

  return (
    <div className="flex h-full flex-col bg-[#0d1626] text-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5" style={{ background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)' }}>
        <Sparkles size={16} style={{ color: 'var(--gold-bright)' }} />
        <div className="leading-tight">
          <div className="text-[12px] font-bold" style={{ color: 'var(--parchment)' }}>Studio Assistant</div>
          <div className="text-[10px]" style={{ color: 'var(--gold-mid)' }}>Writes, fills & suggests on this draft</div>
        </div>
        {undoCount > 0 && (
          <button onClick={() => undoLast()} title="Undo last AI change" className="ml-auto flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1 text-[10px] text-white/70 hover:bg-white/10">
            <Undo2 size={11} /> Undo
          </button>
        )}
        {voiceReady && (
          <button
            onClick={() => setVoiceMode((v) => !v)}
            aria-label={voiceMode ? 'Turn off spoken replies' : 'Read replies aloud'}
            title={voiceMode ? 'Spoken replies on' : 'Read replies aloud'}
            className={(undoCount > 0 ? '' : 'ml-auto ') + 'flex h-7 w-7 items-center justify-center rounded-sm border border-white/15 hover:bg-white/10'}
            style={{ color: voiceMode ? 'var(--gold-bright)' : 'var(--gold-mid)' }}
          >
            {voiceMode ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="text-[12px] leading-relaxed text-white/55">
            I’m your studio assistant. Ask me to <strong className="text-white/80">write a headline</strong>, <strong className="text-white/80">fill this page</strong>, <strong className="text-white/80">suggest a photo</strong>, or explain what a page is for. You can also <strong className="text-white/80">upload a PDF, doc or image</strong> (📎) and tell me where to place it. I’ll preview anything that overwrites existing content before it’s applied.
          </p>
        )}
        {messages.map((m) => {
          const text = messageText(m);
          const mine = m.role === 'user';
          const docs = mine ? messageDocs(m) : [];
          if (!text && !mine) return null;
          return (
            <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div className={mine ? 'max-w-[88%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-emerald-600/90 px-2.5 py-1.5 text-[12px]' : 'max-w-[92%] rounded-lg rounded-bl-sm bg-white/5 px-2.5 py-1.5 text-[12px]'}>
                {docs.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {docs.map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-sm bg-black/25 px-1.5 py-0.5 text-[10px] text-white/90">
                        <FileText size={10} /> <span className="max-w-[150px] truncate">{d.name}</span>
                      </span>
                    ))}
                  </div>
                )}
                {mine ? text : <MarkdownMessage text={text} />}
              </div>
            </div>
          );
        })}
        {busy && <div className="text-[12px] text-white/40">…thinking</div>}
        {error && <p className="text-[11px] text-red-300">{error.message?.includes('resting') ? 'The studio assistant isn’t switched on yet — set OPENROUTER_API_KEY on the server.' : 'Something went wrong — please try again.'}</p>}
      </div>

      {/* Staged edits awaiting approval */}
      {groups.length > 0 && (
        <div className="max-h-[46%] space-y-2 overflow-y-auto border-t-2 border-amber-400/50 bg-amber-400/[0.07] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-[#0b1220]">{staged.length}</span>
              Review &amp; apply
            </span>
            {groups.length > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => applyAllStaged()} className="rounded-sm bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-600">Apply all</button>
                <button onClick={() => discardAll()} className="rounded-sm border border-white/15 px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/10">Discard all</button>
              </div>
            )}
          </div>
          {groups.map((g) => (
            <StagedCard key={g[0].batchId ?? g[0].id} group={g} />
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-white/10">
        {(recording || transcribing) && (
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60">
            <span className={'inline-block h-2 w-2 rounded-full ' + (recording ? 'animate-pulse bg-red-500' : 'bg-white/30')} />
            <span className="line-clamp-2 italic">{caption || (transcribing ? 'Transcribing…' : 'Listening… speak now')}</span>
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2.5 pt-2">
            {pendingFiles.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex items-center gap-1 rounded-sm border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200"
                title={f.name}
              >
                {ingesting ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
                <span className="max-w-[130px] truncate">{ingesting ? `Reading ${f.name}…` : f.name}</span>
                {!ingesting && (
                  <button onClick={() => removePendingFile(i)} aria-label={`Remove ${f.name}`} className="text-emerald-200/60 hover:text-emerald-100">
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 px-2.5 py-2"
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ATTACH_ACCEPT}
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a document"
            title="Attach a PDF, document or image to analyse"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 hover:bg-white/10 hover:text-white/90"
          >
            <Paperclip size={14} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Standard chat composer: Enter sends, Shift+Enter inserts a newline.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={recording || transcribing}
            placeholder={recording ? 'Listening…' : transcribing ? 'Transcribing…' : pendingFiles.length > 0 ? 'Describe the document, then Enter to fill the bulletin…' : 'Ask the studio assistant…  (Shift+Enter for a new line)'}
            className="flex-1 resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] leading-snug text-white outline-none placeholder:text-white/30 focus:border-white/30 disabled:opacity-60"
          />
          {voiceReady && !busy && (
            <button
              type="button"
              onClick={() => void toggleMic()}
              disabled={transcribing}
              aria-label={recording ? 'Stop recording' : 'Speak to the studio assistant'}
              title={recording ? 'Stop & send' : 'Speak'}
              className={'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ' + (recording ? 'animate-pulse border-red-500 bg-red-500/15 text-red-400' : 'border-white/15 text-white/60 hover:bg-white/10')}
            >
              {transcribing ? <Loader2 size={13} className="animate-spin" /> : recording ? <Square size={13} /> : <Mic size={13} />}
            </button>
          )}
          {busy ? (
            <button type="button" onClick={() => stop()} aria-label="Stop" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70">
              <Square size={13} />
            </button>
          ) : (
            <button type="submit" aria-label="Send" disabled={!input.trim() || ingesting} className="flex h-8 w-8 items-center justify-center rounded-full text-[#0b1220] disabled:opacity-40" style={{ background: 'var(--gold-bright)' }}>
              {ingesting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
