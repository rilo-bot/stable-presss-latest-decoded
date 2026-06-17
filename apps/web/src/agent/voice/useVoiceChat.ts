// Push-to-talk voice for ANY useChat-backed chat surface (the global concierge,
// the profile/onboarding Stablehand, the studio drawer). Records mic audio,
// transcribes it server-side (OpenAI STT), sends the text through the caller's
// `send`, and reads assistant replies aloud with streaming TTS — speaking the
// first sentence while the rest is still being written. The OpenAI key lives only
// on the server; this hook just drives /api/agent/voice/* via voiceClient.
//
// Extracted from AgentWidget so every chat surface shares one implementation.

import { useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import {
  isRecordingSupported, isVoiceEnabled, startRecording, transcribe,
  startLiveCaption, SpeechStream, type Recorder, type LiveCaption,
} from '@/agent/voice/voiceClient';

function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export interface VoiceChat {
  /** Mic is supported AND the server has a voice key — gate the UI on this. */
  voiceReady: boolean;
  /** Read replies aloud (user-toggled). */
  voiceMode: boolean;
  setVoiceMode: React.Dispatch<React.SetStateAction<boolean>>;
  recording: boolean;
  transcribing: boolean;
  /** Live interim transcript (display-only) while recording. */
  caption: string;
  /** Toggle push-to-talk: start recording, or stop → transcribe → send. */
  toggleMic: () => Promise<void>;
}

export function useVoiceChat({ messages, send, busy, active }: {
  /** Live message list from useChat. */
  messages: UIMessage[];
  /** Send a user message (the caller's own send/clear-input fn). */
  send: (text: string) => void;
  /** True while a reply is streaming (feed vs flush the TTS). */
  busy: boolean;
  /** Whether the chat surface is open/visible — speech stops when it isn't. */
  active: boolean;
}): VoiceChat {
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [caption, setCaption] = useState('');
  const recorderRef = useRef<Recorder | null>(null);
  const liveRef = useRef<LiveCaption | null>(null);
  const speechRef = useRef<SpeechStream | null>(null);   // streaming TTS for the current reply
  const speechMsgIdRef = useRef<string | null>(null);    // assistant msg id we're speaking
  const speakNextRef = useRef(false);                    // speak the next reply (user just spoke)

  useEffect(() => {
    if (!isRecordingSupported()) return;
    void isVoiceEnabled().then(setVoiceReady);
  }, []);

  const toggleMic = async () => {
    if (recording) {
      // Stop → transcribe → send through the normal chat flow.
      const rec = recorderRef.current;
      recorderRef.current = null;
      liveRef.current?.stop();
      liveRef.current = null;
      setRecording(false);
      if (!rec) return;
      setTranscribing(true);
      try {
        const clip = await rec.stop();
        const text = await transcribe(clip);
        if (text) {
          speakNextRef.current = true; // they spoke → speak the reply back, even if voice mode is off
          send(text);
        }
      } catch {
        /* transcription failed — user can try again or type */
      } finally {
        setTranscribing(false);
        setCaption('');
      }
      return;
    }
    try {
      speechRef.current?.stop(); // don't record over our own playback
      recorderRef.current = await startRecording();
      setCaption('');
      liveRef.current = startLiveCaption(setCaption); // live words (display-only); null if unsupported
      setRecording(true);
    } catch {
      setVoiceReady(false); // mic denied/unavailable — hide the control
    }
  };

  // Stream the latest assistant reply to speech: start speaking the first sentence
  // WHILE the rest is still being written (voice mode on, or the user just spoke).
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (speechMsgIdRef.current !== last.id) {
      speechMsgIdRef.current = last.id;
      speechRef.current?.stop();
      const shouldSpeak = voiceMode || speakNextRef.current;
      speakNextRef.current = false;
      speechRef.current = shouldSpeak ? new SpeechStream() : null;
    }
    const stream = speechRef.current;
    if (stream) {
      const text = messageText(last);
      if (busy) stream.update(text); else stream.finish(text);
    }
  }, [messages, busy, voiceMode]);

  // Stop playback when voice mode is turned off or the surface closes/unmounts.
  useEffect(() => { if (!voiceMode || !active) speechRef.current?.stop(); }, [voiceMode, active]);
  useEffect(() => () => { speechRef.current?.stop(); recorderRef.current?.cancel(); liveRef.current?.stop(); }, []);

  return { voiceReady, voiceMode, setVoiceMode, recording, transcribing, caption, toggleMic };
}
