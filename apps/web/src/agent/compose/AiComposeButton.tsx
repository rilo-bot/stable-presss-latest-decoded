// The ✨ "draft with AI" affordance for a form field. Sits at the bottom-right of
// a field; on click opens a small popover where the user can TYPE or DICTATE a
// brief (or just hit Generate to compose from the form's facts), preview the
// draft, and Accept it into the field. Reuses the voice pipeline for dictation.

import { useRef, useState } from 'react';
import { Sparkles, Mic, Square, Loader2, Check, RotateCcw, X } from 'lucide-react';
import { composeField } from './composeClient';
import { isRecordingSupported, startRecording, transcribe, type Recorder } from '@/agent/voice/voiceClient';
import { useAutoGrowTextarea } from '@/lib/useAutoGrowTextarea';

export interface AiComposeButtonProps {
  /** Human label of the field, e.g. "Summary". */
  label: string;
  fieldKey?: string;
  /** "article" | "horse" | "party" | "media" … */
  entityKind: string;
  /** Read the form's current facts at click time (kept fresh). */
  getContext: () => Record<string, unknown>;
  /** Read the field's current value at click time. */
  getCurrentValue?: () => string;
  /** Commit the accepted draft into the field. */
  onAccept: (text: string) => void;
  /** Extra classes on the trigger button (positioning is set by the caller). */
  className?: string;
}

export function AiComposeButton({ label, fieldKey, entityKind, getContext, getCurrentValue, onAccept, className }: AiComposeButtonProps) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);     // generating
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef<Recorder | null>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);
  // Drive sizing off `brief` (not the textarea's value, which is swapped to a
  // status string while recording) so it grows to 5 lines then scrolls.
  useAutoGrowTextarea(briefRef, brief);

  const reset = () => { setBrief(''); setDraft(''); setError(''); };
  const close = () => { setOpen(false); recorderRef.current?.cancel(); recorderRef.current = null; setRecording(false); };

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const text = await composeField({
        label, key: fieldKey, entityKind,
        context: getContext(),
        instruction: brief.trim(),
        currentValue: getCurrentValue?.() ?? '',
      });
      if (text) setDraft(text);
      else setError('Nothing came back — try adding a hint.');
    } catch (e) {
      setError(e instanceof Error && /resting/i.test(e.message) ? 'The writing assistant isn’t switched on (set OPENROUTER_API_KEY).' : 'Couldn’t draft that — please try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = async () => {
    if (recording) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      if (!rec) return;
      setTranscribing(true);
      try {
        const text = await transcribe(await rec.stop());
        if (text) setBrief((b) => (b ? `${b} ${text}` : text));
      } catch { /* ignore */ } finally { setTranscribing(false); }
      return;
    }
    try {
      recorderRef.current = await startRecording();
      setRecording(true);
    } catch { /* mic denied */ }
  };

  const accept = () => { onAccept(draft); close(); reset(); };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title="Draft with AI"
        aria-label="Draft with AI"
        className={
          'flex h-6 w-6 items-center justify-center rounded-md border border-[hsl(var(--brand-accent)/0.4)] bg-[hsl(var(--brand-accent)/0.1)] text-[hsl(var(--brand-accent))] transition-colors hover:bg-[hsl(var(--brand-accent)/0.2)] ' +
          (className ?? '')
        }
      >
        <Sparkles size={13} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-md border border-border bg-card p-3 text-foreground shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'hsl(var(--brand-accent))' }}>
                <Sparkles size={12} /> Draft {label.toLowerCase()}
              </span>
              <button type="button" onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>

            {/* Brief: type or dictate (optional) */}
            <div className="relative">
              <textarea
                ref={briefRef}
                value={recording ? 'Listening…' : transcribing ? 'Transcribing…' : brief}
                onChange={(e) => setBrief(e.target.value)}
                readOnly={recording || transcribing}
                rows={2}
                placeholder="Optional — tell me what to write, or just Generate from the form."
                className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 pr-8 text-xs leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {isRecordingSupported() && (
                <button
                  type="button"
                  onClick={() => void toggleMic()}
                  disabled={transcribing}
                  title={recording ? 'Stop' : 'Dictate'}
                  className={'absolute bottom-2 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ' + (recording ? 'animate-pulse border-red-500 bg-red-500/15 text-red-500' : 'border-border text-muted-foreground hover:bg-muted')}
                >
                  {transcribing ? <Loader2 size={12} className="animate-spin" /> : recording ? <Square size={12} /> : <Mic size={12} />}
                </button>
              )}
            </div>

            {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}

            {/* Draft preview */}
            {draft && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-[hsl(var(--brand-accent)/0.3)] bg-[hsl(var(--brand-accent)/0.05)] px-2.5 py-2 text-xs leading-relaxed">
                {draft}
              </div>
            )}

            {/* Actions */}
            <div className="mt-2.5 flex items-center justify-end gap-1.5">
              {draft ? (
                <>
                  <button type="button" onClick={() => void generate()} disabled={busy} className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50">
                    <RotateCcw size={11} className={busy ? 'animate-spin' : ''} /> Redo
                  </button>
                  <button type="button" onClick={accept} className="flex items-center gap-1 rounded-sm bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600">
                    <Check size={12} /> Accept
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={busy || recording}
                  className="flex items-center gap-1.5 rounded-sm px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                  style={{ background: 'hsl(var(--brand-accent))' }}
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
