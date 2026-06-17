// The in-editor Studio Assistant panel. Streams from /api/agent/editor/chat,
// executes the model's editor tool calls in the browser (onToolCall →
// executeEditorTool → addToolResult), renders the conversation, and shows the
// staged-edit preview cards (Apply / Discard) plus an Undo control.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { Sparkles, Send, Square, Undo2, Check, X, Paperclip, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { MarkdownMessage } from '@/components/MarkdownMessage';
import { useEditorAgentUi } from '@/stores/editorAgentUiStore';
import { createEditorTransport } from './editorTransport';
import { executeEditorTool, isEditorClientTool } from './editOpsExecutor';
import { previewOf } from './editorContext';
import { ingestFile, ATTACH_ACCEPT } from './documentUpload';
import { applyStagedEdit, applyBatch, applyAllStaged, discardStaged, discardBatch, discardAll, undoLast } from './applyEdits';
import type { StagedEdit } from './types';

function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
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
  const attachments = useEditorAgentUi((s) => s.attachments);
  const addAttachment = useEditorAgentUi((s) => s.addAttachment);
  const removeAttachment = useEditorAgentUi((s) => s.removeAttachment);
  const [ingesting, setIngesting] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setIngesting((prev) => [...prev, file.name]);
      try {
        addAttachment(await ingestFile(file));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not read that file.');
      } finally {
        setIngesting((prev) => prev.filter((n) => n !== file.name));
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  // A suggestion chip / inline trigger queued a prompt — send it once.
  useEffect(() => {
    if (pendingPrompt && !busy) {
      void sendMessage({ text: pendingPrompt });
      useEditorAgentUi.getState().consumePrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, staged]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput('');
  };

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
        {(attachments.length > 0 || ingesting.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-2.5 pt-2">
            {attachments.map((a) => (
              <span key={a.id} className="flex items-center gap-1 rounded-sm border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200" title={a.digest.title || a.name}>
                <FileText size={11} />
                <span className="max-w-[130px] truncate">{a.name}</span>
                <button onClick={() => removeAttachment(a.id)} aria-label={`Remove ${a.name}`} className="text-emerald-200/60 hover:text-emerald-100">
                  <X size={10} />
                </button>
              </span>
            ))}
            {ingesting.map((n) => (
              <span key={n} className="flex items-center gap-1 rounded-sm border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
                <Loader2 size={11} className="animate-spin" />
                <span className="max-w-[130px] truncate">Reading {n}…</span>
              </span>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 px-2.5 py-2"
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
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask, or upload a file and say where it goes…"
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
    </div>
  );
}
