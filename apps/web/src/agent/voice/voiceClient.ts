// Browser-side voice helpers for the Stablehand (push-to-talk pipeline).
// Records mic audio (MediaRecorder), uploads it to our server for OpenAI STT,
// and plays back OpenAI TTS for replies. The OpenAI key lives only on the server
// — these helpers just talk to /api/agent/voice/*.

import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

function authHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Can this browser record from the mic at all? */
export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';
}

/** Whether the SERVER has voice enabled (an OpenAI key is set). Cached per session. */
let voiceEnabledCache: boolean | null = null;
export async function isVoiceEnabled(): Promise<boolean> {
  if (voiceEnabledCache !== null) return voiceEnabledCache;
  try {
    const res = await fetch(apiUrl('/api/agent/voice/status'));
    const data = await res.json();
    voiceEnabledCache = !!data.enabled;
  } catch {
    voiceEnabledCache = false;
  }
  return voiceEnabledCache;
}

export interface Recorder {
  /** Stop recording and resolve the captured clip. */
  stop: () => Promise<Blob>;
  /** Abandon the recording (releases the mic, no clip). */
  cancel: () => void;
}

/** Begin recording. Requests mic permission; throws if denied/unsupported. */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // Prefer formats OpenAI accepts; fall back to the browser default.
  const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(
    (t) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t),
  );
  const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  mr.start();

  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        mr.onstop = () => { release(); resolve(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); };
        mr.stop();
      }),
    cancel: () => { try { mr.stop(); } catch { /* already stopped */ } release(); },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LiveCaption { stop: () => void }

/**
 * Live interim caption via the browser SpeechRecognition API (Chrome/Edge/Safari).
 * Display-ONLY — the authoritative transcript still comes from OpenAI on stop.
 * Returns null when unsupported, so callers fall back to a plain "Listening…".
 */
export function startLiveCaption(onText: (text: string) => void): LiveCaption | null {
  const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  let rec: any;
  try { rec = new SR(); } catch { return null; }
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = '';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    onText(`${finalText} ${interim}`.replace(/\s+/g, ' ').trim());
  };
  try { rec.start(); } catch { return null; }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Send a recorded clip to the server and get the transcription text. */
export async function transcribe(clip: Blob): Promise<string> {
  const res = await fetch(apiUrl('/api/agent/voice/transcribe'), {
    method: 'POST',
    headers: { 'Content-Type': clip.type || 'audio/webm', ...authHeader() },
    body: clip,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}`);
  const data = await res.json();
  return typeof data.text === 'string' ? data.text : '';
}

/** Strip Markdown so TTS reads clean prose — no asterisks, pipes, rules, or code. */
function forSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')          // images: nothing to say
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // links: speak the label
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')   // table separator rows
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, ' ')        // horizontal rules
    .replace(/[|*_`#>~]/g, ' ')                     // remaining markdown symbols
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Synthesise ONE chunk into a ready-to-play audio element (null when there is
 * nothing speakable or synthesis keeps failing). Retries transient failures —
 * a dropped request here used to mean a silently skipped sentence. Chunks that
 * can never succeed (400 bad input, 413 too long) are not retried, and chunks
 * with no letters or digits are never sent: TTS models given symbol soup
 * produce humming/noise instead of silence.
 */
async function synthesizeClip(text: string): Promise<HTMLAudioElement | null> {
  const clean = forSpeech(text);
  if (!clean || !/[\p{L}\p{N}]/u.test(clean)) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(apiUrl('/api/agent/voice/speak'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ text: clean }),
      });
      if (res.ok) return new Audio(URL.createObjectURL(await res.blob()));
      if (res.status === 400 || res.status === 413) return null;
    } catch {
      /* network hiccup — retry */
    }
  }
  return null;
}

// Batch sentences into chunks of at least this many chars before synthesising
// (the FIRST chunk goes out immediately for fast time-to-first-audio). One
// request per sentence used to blow through the server's TTS rate limit on long
// replies — every 429 was a silently skipped sentence — and one-word chunks
// ("Sure.") make TTS models produce humming artifacts.
const MIN_CHUNK = 200;
// Hard cap per request, comfortably under the server's 4000-char limit. Anything
// larger is rejected with 413 and used to vanish from playback entirely.
const MAX_CHUNK = 3000;

/** Split an oversize chunk on word boundaries so no piece exceeds MAX_CHUNK. */
function splitToMax(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    const cut = rest.lastIndexOf(' ', MAX_CHUNK);
    out.push(rest.slice(0, cut > 0 ? cut : MAX_CHUNK).trim());
    rest = rest.slice(cut > 0 ? cut : MAX_CHUNK).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Streaming TTS: feed the assistant reply as it streams and we start speaking the
 * FIRST sentence while the rest is still being written. Complete sentences are
 * batched into chunks, synthesised concurrently (as each completes), and played
 * strictly in order, so time-to-first-audio is "first sentence + its synth", not
 * "whole reply + whole synth".
 */
export class SpeechStream {
  private consumed = 0;                                   // chars already chunked
  private buffer = '';                                    // complete sentences awaiting batching
  private clips: Promise<HTMLAudioElement | null>[] = []; // synth jobs, in order
  private playIdx = 0;
  private looping = false;
  private stopped = false;
  private current: HTMLAudioElement | null = null;
  private releaseCurrent: (() => void) | null = null;     // resolves the in-flight play await
  private started = false;                                // first chunk already sent?

  /** Feed the latest full assistant text (mid-stream). */
  update(fullText: string): void { this.ingest(fullText, false); }
  /** Feed the final full text and flush the trailing partial sentence. */
  finish(fullText: string): void { this.ingest(fullText, true); }

  private ingest(fullText: string, flush: boolean): void {
    if (this.stopped) return;
    const pending = fullText.slice(this.consumed);
    // A boundary is a sentence terminator + whitespace (mid-stream safe: won't
    // cut "3.5" because there's no space after the dot) OR a line break —
    // markdown bullets, headings, and table rows rarely end in ". ", and without
    // the newline rule whole lists used to pile up into one giant final chunk.
    const re = /(?:[.!?]+["')\]]*\s|\n+)/g;
    let m: RegExpExecArray | null;
    let start = 0;
    let consumedHere = 0;
    while ((m = re.exec(pending))) {
      const end = m.index + m[0].length;
      const sentence = pending.slice(start, end).trim();
      if (sentence) this.buffer += (this.buffer ? ' ' : '') + sentence;
      start = end;
      consumedHere = end;
      // Ship the very first sentence immediately; batch the rest.
      if (this.buffer && (!this.started || this.buffer.length >= MIN_CHUNK)) this.flushBuffer();
    }
    this.consumed += consumedHere;
    if (flush) {
      const tail = fullText.slice(this.consumed).trim();
      if (tail) this.buffer += (this.buffer ? ' ' : '') + tail;
      this.consumed = fullText.length;
      this.flushBuffer();
    }
  }

  private flushBuffer(): void {
    const text = this.buffer.trim();
    this.buffer = '';
    if (!text) return;
    this.started = true;
    for (const piece of splitToMax(text)) {
      this.clips.push(synthesizeClip(piece));
    }
    void this.loop();
  }

  private async loop(): Promise<void> {
    if (this.looping) return;
    this.looping = true;
    while (this.playIdx < this.clips.length && !this.stopped) {
      const audio = await this.clips[this.playIdx++];
      if (!audio) continue;
      if (this.stopped) { try { URL.revokeObjectURL(audio.src); } catch { /* noop */ } break; }
      this.current = audio;
      await new Promise<void>((resolve) => {
        this.releaseCurrent = resolve;
        audio.onended = audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });
      this.releaseCurrent = null;
      try { URL.revokeObjectURL(audio.src); } catch { /* noop */ }
      this.current = null;
    }
    this.looping = false;
  }

  /** Stop playback now and abandon the rest of the queue. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.current) { this.current.pause(); this.current = null; }
    // Pausing fires no 'ended' event — release the play await so loop() exits
    // instead of hanging forever.
    this.releaseCurrent?.();
    // Free blobs that were synthesised but will never play.
    for (const p of this.clips.slice(this.playIdx)) {
      void p.then((a) => { if (a) { try { URL.revokeObjectURL(a.src); } catch { /* noop */ } } });
    }
    this.playIdx = this.clips.length;
  }
}
