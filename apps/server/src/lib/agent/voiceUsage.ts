// ---------------------------------------------------------------------------
// Voice cost ESTIMATES for the AI usage meter (lib/agent/voice.ts).
//
// Voice calls go to OpenAI directly, not through OpenRouter, so there is no
// billed cost in the response. These are list-price estimates, recorded with
// costSource 'estimate' so the AI Activity page never presents them as a bill.
// Pure — no I/O — so they are unit-tested.
//
// Prices are OpenAI's published list prices (USD):
//   gpt-4o-mini-transcribe  audio in $3 / M tokens, text out $5 / M  (≈ $0.003 / min)
//   gpt-4o-transcribe       audio in $6 / M tokens, text out $10 / M (≈ $0.006 / min)
//   whisper-1               $0.006 / minute (billed by duration)
//   gpt-4o-mini-tts         ≈ $0.015 / minute of speech; ~900 characters a minute
//   tts-1 / tts-1-hd        $15 / $30 per M characters
// ---------------------------------------------------------------------------

/** What OpenAI's /audio/transcriptions returns under `usage`. */
export interface TranscriptionUsage {
  type?: string
  input_tokens?: number
  output_tokens?: number
  seconds?: number
}

const TOKEN_PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /gpt-4o-mini-transcribe/i, input: 3, output: 5 },
  { match: /gpt-4o-transcribe/i, input: 6, output: 10 },
]

const PER_MINUTE: { match: RegExp; usd: number }[] = [
  { match: /whisper/i, usd: 0.006 },
  { match: /gpt-4o-mini-transcribe/i, usd: 0.003 },
  { match: /gpt-4o-transcribe/i, usd: 0.006 },
]

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** Tokens + estimated USD for one transcription, from the response's `usage`. */
export function transcriptionUsage(
  model: string,
  usage: TranscriptionUsage | undefined,
): { inputTokens: number; outputTokens: number; costUsd: number | undefined } {
  const inputTokens = num(usage?.input_tokens)
  const outputTokens = num(usage?.output_tokens)
  if (inputTokens > 0 || outputTokens > 0) {
    const p = TOKEN_PRICES.find((row) => row.match.test(model))
    const costUsd = p ? (inputTokens * p.input + outputTokens * p.output) / 1_000_000 : undefined
    return { inputTokens, outputTokens, costUsd }
  }
  const seconds = num(usage?.seconds)
  if (seconds > 0) {
    const p = PER_MINUTE.find((row) => row.match.test(model))
    return { inputTokens: 0, outputTokens: 0, costUsd: p ? (seconds / 60) * p.usd : undefined }
  }
  return { inputTokens: 0, outputTokens: 0, costUsd: undefined }
}

const PER_MILLION_CHARS: { match: RegExp; usd: number }[] = [
  { match: /gpt-4o-mini-tts/i, usd: 16.7 }, // ≈ $0.015 / min at ~900 chars / min
  { match: /tts-1-hd/i, usd: 30 },
  { match: /tts-1/i, usd: 15 },
]

/** Estimated USD for reading `chars` characters aloud. */
export function speechCostUsd(model: string, chars: number): number | undefined {
  const p = PER_MILLION_CHARS.find((row) => row.match.test(model))
  return p ? (Math.max(0, chars) * p.usd) / 1_000_000 : undefined
}
