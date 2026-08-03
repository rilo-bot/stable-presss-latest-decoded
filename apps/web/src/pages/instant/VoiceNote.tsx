/**
 * Voice note capture.
 *
 * Records from the mic and sends the clip to the server for transcription — the
 * same pipeline the Stablehand's push-to-talk uses (`agent/voice/voiceClient`),
 * so the OpenAI key stays server-side and there is one recorder in the codebase,
 * not two.
 *
 * The transcript is shown and EDITABLE. It is the agent's only source of hard
 * facts — names, results, what the reporter actually saw — so a mis-heard horse
 * name has to be fixable before it reaches the draft.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { isRecordingSupported, startRecording, transcribe, type Recorder } from '@/agent/voice/voiceClient';

interface VoiceNoteProps {
  transcript: string;
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceNote({ transcript, onTranscript, disabled }: VoiceNoteProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef<Recorder | null>(null);

  // Tick while recording; also releases the mic if the component unmounts
  // mid-recording (navigating away with the recorder live would leave the tab's
  // mic indicator on).
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      recorderRef.current = null;
    },
    [],
  );

  const supported = isRecordingSupported();

  const toggle = async () => {
    setError('');
    if (recording) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      if (!rec) return;
      setTranscribing(true);
      try {
        const clip = await rec.stop();
        const text = await transcribe(clip);
        if (text.trim()) onTranscript(transcript ? `${transcript} ${text.trim()}` : text.trim());
        else setError("I couldn't make out that recording — try again, a little closer to the mic.");
      } catch {
        setError("That recording couldn't be transcribed. Please try again.");
      } finally {
        setTranscribing(false);
      }
      return;
    }
    try {
      recorderRef.current = await startRecording();
      setElapsed(0);
      setRecording(true);
    } catch {
      setError('I could not reach your microphone — check the browser permission.');
    }
  };

  if (!supported) {
    return (
      <p className="rounded-sm border border-border/60 bg-muted/30 px-3 py-2.5 text-[12px] text-muted-foreground">
        This browser can&apos;t record audio. Type the details into the topic line instead.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-sm border border-border/60 bg-card px-3 py-2.5">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={disabled || transcribing}
          className={cn(
            'flex items-center gap-2 rounded-sm border px-3 py-2 text-[13px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            recording
              ? 'animate-pulse border-destructive bg-destructive/10 text-destructive'
              : 'border-border bg-background text-foreground hover:bg-muted/60',
          )}
        >
          {transcribing ? <Loader2 size={14} className="animate-spin" /> : recording ? <Square size={14} /> : <Mic size={14} />}
          {transcribing ? 'Transcribing…' : recording ? 'Stop recording' : 'Record voice note'}
        </button>
        <span className="text-[13px] tabular-nums text-muted-foreground">{clock(elapsed)}</span>
      </div>

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      {transcript && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="instant-transcript" className="text-[12px] font-medium text-muted-foreground">
              What you said — edit anything misheard
            </label>
            <button
              type="button"
              onClick={() => onTranscript('')}
              className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 size={12} /> Clear
            </button>
          </div>
          <textarea
            id="instant-transcript"
            value={transcript}
            onChange={(e) => onTranscript(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-sm border border-input bg-background px-3 py-2 text-[13.5px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[11.5px] text-muted-foreground">
            These are the only facts the AI can treat as certain — a photo can never tell it who or which.
          </p>
        </div>
      )}
    </div>
  );
}
