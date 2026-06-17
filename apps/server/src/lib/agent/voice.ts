// ---------------------------------------------------------------------------
// Voice I/O for the Stablehand — OpenAI speech-to-text + text-to-speech.
//
// The brain stays Claude (via OpenRouter); OpenAI is only ears + mouth here, so
// the RBAC-scoped agent and its tools are reused untouched. The key never reaches
// the browser — the client uploads audio to our server, we call OpenAI, and stream
// audio/text back. Swap models with VOICE_STT_MODEL / VOICE_TTS_MODEL / VOICE_TTS_VOICE.
// ---------------------------------------------------------------------------

const API_KEY = (process.env.OPENAI_API_KEY ?? '').trim()
const OPENAI = 'https://api.openai.com/v1'

export const STT_MODEL = (process.env.VOICE_STT_MODEL ?? '').trim() || 'gpt-4o-mini-transcribe'
export const TTS_MODEL = (process.env.VOICE_TTS_MODEL ?? '').trim() || 'gpt-4o-mini-tts'
export const TTS_VOICE = (process.env.VOICE_TTS_VOICE ?? '').trim() || 'alloy'
// Pin the spoken language so short/accented clips aren't mis-detected as another
// language (e.g. English heard as Urdu). Set VOICE_STT_LANGUAGE='' for auto-detect.
export const STT_LANGUAGE = process.env.VOICE_STT_LANGUAGE === undefined ? 'en' : process.env.VOICE_STT_LANGUAGE.trim()

/** True when voice features can run (an OpenAI key is present). */
export function isVoiceConfigured(): boolean {
  return !!API_KEY
}

const extFor = (mimetype: string): string =>
  mimetype.includes('mp4') || mimetype.includes('m4a')
    ? 'mp4'
    : mimetype.includes('ogg')
      ? 'ogg'
      : mimetype.includes('wav')
        ? 'wav'
        : mimetype.includes('mpeg') || mimetype.includes('mp3')
          ? 'mp3'
          : 'webm'

/** Transcribe a recorded audio clip to text. */
export async function transcribeAudio(audio: Buffer, mimetype: string): Promise<string> {
  const type = mimetype || 'audio/webm'
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type }), `clip.${extFor(type)}`)
  form.append('model', STT_MODEL)
  if (STT_LANGUAGE) form.append('language', STT_LANGUAGE)
  const r = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  })
  if (!r.ok) throw new Error(`transcription ${r.status}: ${await r.text()}`)
  const data = (await r.json()) as { text?: string }
  return (data.text ?? '').trim()
}

/** Synthesise speech for a short reply. Returns MP3 bytes. */
export async function synthesizeSpeech(text: string): Promise<{ audio: Buffer; mediaType: string }> {
  const r = await fetch(`${OPENAI}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, input: text, voice: TTS_VOICE, response_format: 'mp3' }),
  })
  if (!r.ok) throw new Error(`speech ${r.status}: ${await r.text()}`)
  const audio = Buffer.from(await r.arrayBuffer())
  return { audio, mediaType: 'audio/mpeg' }
}
