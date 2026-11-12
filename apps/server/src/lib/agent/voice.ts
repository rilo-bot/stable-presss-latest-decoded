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
/** A stalled OpenAI call otherwise holds the request for undici's 5-minute
 *  default — the panel sat on "Transcribing…" with the mic disabled. */
const OPENAI_TIMEOUT_MS = 60_000

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

// Stable Press works in ENGLISH only. The `language` field is only a hint to
// the gpt-4o transcribe models — a short "hello hello" still came back in Urdu
// script, and the assistant then answered in Urdu. So: steer with a prompt too,
// and if the text still isn't Latin script, re-run on whisper-1, which honours
// language=en strictly.
const ENGLISH_PROMPT =
  'The speaker is talking to a horse-racing publication app in English. Transcribe in English, using the Latin alphabet only.'

/** True when the text is mostly non-Latin letters (Arabic, Devanagari, CJK…). */
function looksNonLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? []
  if (letters.length === 0) return false
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length
  return latin / letters.length < 0.6
}

async function transcribeWith(model: string, audio: Buffer, type: string): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type }), `clip.${extFor(type)}`)
  form.append('model', model)
  if (STT_LANGUAGE) form.append('language', STT_LANGUAGE)
  if (STT_LANGUAGE === 'en') form.append('prompt', ENGLISH_PROMPT)
  const r = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  })
  if (!r.ok) throw new Error(`transcription ${r.status}: ${await r.text()}`)
  const data = (await r.json()) as { text?: string }
  return (data.text ?? '').trim()
}

/** Transcribe a recorded audio clip to English text. */
export async function transcribeAudio(audio: Buffer, mimetype: string): Promise<string> {
  const type = mimetype || 'audio/webm'
  const text = await transcribeWith(STT_MODEL, audio, type)
  if (STT_LANGUAGE !== 'en' || !looksNonLatin(text)) return text
  try {
    const retry = await transcribeWith('whisper-1', audio, type)
    if (retry && !looksNonLatin(retry)) return retry
  } catch (err) {
    console.warn('[voice] English re-transcription failed:', err)
  }
  // Still not English — hand back nothing rather than a foreign-script prompt.
  return ''
}

/** Synthesise speech for a short reply. Returns MP3 bytes. */
export async function synthesizeSpeech(text: string): Promise<{ audio: Buffer; mediaType: string }> {
  const r = await fetch(`${OPENAI}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, input: text, voice: TTS_VOICE, response_format: 'mp3' }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  })
  if (!r.ok) throw new Error(`speech ${r.status}: ${await r.text()}`)
  const audio = Buffer.from(await r.arrayBuffer())
  return { audio, mediaType: 'audio/mpeg' }
}
