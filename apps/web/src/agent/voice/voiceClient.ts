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

/** Strip light Markdown so TTS reads clean prose, not asterisks and bullets. */
function forSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let currentAudio: HTMLAudioElement | null = null;

/** Stop any in-progress playback. */
export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

/** Speak a reply aloud. Cancels any prior playback first. Resolves when it ends. */
export async function speak(text: string): Promise<void> {
  const clean = forSpeech(text);
  if (!clean) return;
  const res = await fetch(apiUrl('/api/agent/voice/speak'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ text: clean }),
  });
  if (!res.ok) throw new Error(`speak ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  stopSpeaking();
  const audio = new Audio(url);
  currentAudio = audio;
  await new Promise<void>((resolve) => {
    audio.onended = audio.onerror = () => { URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; resolve(); };
    void audio.play().catch(() => resolve());
  });
}

/** Synthesise ONE chunk into a ready-to-play audio element (null on failure). */
async function synthesizeClip(text: string): Promise<HTMLAudioElement | null> {
  const clean = forSpeech(text);
  if (!clean) return null;
  try {
    const res = await fetch(apiUrl('/api/agent/voice/speak'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ text: clean }),
    });
    if (!res.ok) return null;
    return new Audio(URL.createObjectURL(await res.blob()));
  } catch {
    return null;
  }
}

/**
 * Streaming TTS: feed the assistant reply as it streams and we start speaking the
 * FIRST sentence while the rest is still being written. Sentences are synthesised
 * concurrently (as each completes) and played strictly in order, so time-to-first-
 * audio is "first sentence + its synth", not "whole reply + whole synth".
 */
export class SpeechStream {
  private consumed = 0;                                   // chars already chunked
  private clips: Promise<HTMLAudioElement | null>[] = []; // synth jobs, in order
  private playIdx = 0;
  private looping = false;
  private stopped = false;
  private current: HTMLAudioElement | null = null;

  /** Feed the latest full assistant text (mid-stream). */
  update(fullText: string): void { this.ingest(fullText, false); }
  /** Feed the final full text and flush the trailing partial sentence. */
  finish(fullText: string): void { this.ingest(fullText, true); }

  private ingest(fullText: string, flush: boolean): void {
    if (this.stopped) return;
    const pending = fullText.slice(this.consumed);
    // Terminator + trailing whitespace = a complete sentence (mid-stream safe:
    // won't cut "3.5" because there's no space after the dot).
    const re = /[.!?]+(?:["')\]]+)?\s/g;
    let m: RegExpExecArray | null;
    let start = 0;
    let consumedHere = 0;
    while ((m = re.exec(pending))) {
      const end = m.index + m[0].length;
      const sentence = pending.slice(start, end).trim();
      if (sentence) this.enqueue(sentence);
      start = end;
      consumedHere = end;
    }
    this.consumed += consumedHere;
    if (flush) {
      const tail = fullText.slice(this.consumed).trim();
      if (tail) this.enqueue(tail);
      this.consumed = fullText.length;
    }
  }

  private enqueue(text: string): void {
    this.clips.push(synthesizeClip(text));
    void this.loop();
  }

  private async loop(): Promise<void> {
    if (this.looping) return;
    this.looping = true;
    while (this.playIdx < this.clips.length && !this.stopped) {
      const audio = await this.clips[this.playIdx++];
      if (!audio || this.stopped) continue;
      this.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });
      try { URL.revokeObjectURL(audio.src); } catch { /* noop */ }
      this.current = null;
    }
    this.looping = false;
  }

  /** Stop playback and abandon the rest of the queue. */
  stop(): void {
    this.stopped = true;
    if (this.current) { this.current.pause(); this.current = null; }
  }
}
