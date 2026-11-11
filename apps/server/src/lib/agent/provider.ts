// ---------------------------------------------------------------------------
// AI assistant ("the Stablehand") — model provider.
//
// All model calls run server-side through OpenRouter via the Vercel AI SDK, so
// the OpenRouter key never reaches the browser. The model is swappable at any
// time with the AGENT_MODEL env var (use the exact slug from openrouter.ai/models).
// ---------------------------------------------------------------------------

import type { LanguageModel } from 'ai'
import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider'

const API_KEY = (process.env.OPENROUTER_API_KEY ?? '').trim()

// Default to Claude Sonnet 4.6. If OpenRouter lists a different slug for the
// version you want, set AGENT_MODEL — no code change needed.
export const AGENT_MODEL = (process.env.AGENT_MODEL ?? '').trim() || 'anthropic/claude-sonnet-4.6'

/** True when the assistant can run (an OpenRouter key is present). */
export function isAgentConfigured(): boolean {
  return !!API_KEY
}

let provider: OpenRouterProvider | null = null
let ocrModel: LanguageModel | null = null

/** The configured chat model. Call only when isAgentConfigured() is true. */
export function getAgentModel(): LanguageModel {
  if (!provider) provider = createOpenRouter({ apiKey: API_KEY })
  return provider(AGENT_MODEL)
}

// The MAGAZINE builder's own brain — deliberately HARDCODED, not env (user
// direction 2026-08-17): the magazine runs on the GPT flagship while every other
// studio keeps AGENT_MODEL. Slug verified against openrouter.ai/models on
// 2026-08-17 — never change it without re-verifying (an unverified slug broke
// prod generation once already).
export const MAGAZINE_MODEL = 'openai/gpt-5.6-sol'

/** The magazine builder's model (planner, copywriter, art director, page agent,
 *  reference fill). The reference-image VISION read stays on getAgentModel until
 *  a GPT reference-read is verified — see docs/MAGAZINE-V2-BUILDER-STRONG.md. */
export function getMagazineModel(): LanguageModel {
  if (!provider) provider = createOpenRouter({ apiKey: API_KEY })
  return provider(MAGAZINE_MODEL)
}

// The OPERATOR's brain (POST /api/agent/operator) — the Stablehand that acts in
// the app for staff. Its own pair, separate from AGENT_MODEL, because it runs
// long tool loops where instruction-following matters more than for chat; the
// heavy model is only reached for attachments or long multi-part briefs.
// Slugs verified on openrouter.ai/anthropic on 2026-11-11 — re-verify before
// changing a default (an unverified slug broke prod generation once already).
export const OPERATOR_MODEL = (process.env.OPERATOR_MODEL ?? '').trim() || 'anthropic/claude-sonnet-5.5'
export const OPERATOR_HEAVY_MODEL = (process.env.OPERATOR_HEAVY_MODEL ?? '').trim() || 'anthropic/claude-opus-5.5'

// Top-level `cache_control` is the provider's documented switch for Anthropic
// AUTOMATIC prompt caching (OpenRouterChatSettings.cache_control in
// @openrouter/ai-sdk-provider ≥2.9): it caches the growing conversation, which an
// operator loop re-sends on every step. The explicit breakpoint on the static
// system prompt (lib/agent/operator/prompt.ts) is separate and always on.
// OPERATOR_AUTO_CACHE=0 is the kill switch if a routed provider ever rejects it.
const OPERATOR_AUTO_CACHE = (process.env.OPERATOR_AUTO_CACHE ?? '').trim() !== '0'
const operatorModels = new Map<string, LanguageModel>()

/** The operator's model: Sonnet by default, Opus when `heavy`. Call only when
 *  isAgentConfigured() is true. */
export function getOperatorModel(heavy = false): LanguageModel {
  if (!provider) provider = createOpenRouter({ apiKey: API_KEY })
  const slug = heavy ? OPERATOR_HEAVY_MODEL : OPERATOR_MODEL
  let model = operatorModels.get(slug)
  if (!model) {
    model = provider(slug, OPERATOR_AUTO_CACHE ? { cache_control: { type: 'ephemeral' } } : {})
    operatorModels.set(slug, model)
  }
  return model
}

/**
 * Model variant for reading PDFs (document ingest OCR). It enables OpenRouter's
 * `file-parser` plugin with the `mistral-ocr` engine so IMAGE-BASED / scanned PDFs
 * are genuinely OCR'd. The plain model falls back to text-layer extraction, which
 * returns nothing for a phone scan (no text layer) — the cause of the "couldn't
 * read any text" 422. Scoped to the ingest path so ordinary chat/tool calls are
 * unaffected (and never pay the OCR-engine cost).
 *
 * The plugin is passed via `extraBody` (forwarded verbatim into the request body)
 * because the provider's typed `plugins` union doesn't include `file-parser`.
 */
export function getOcrModel(): LanguageModel {
  if (!provider) provider = createOpenRouter({ apiKey: API_KEY })
  if (!ocrModel) {
    ocrModel = provider(AGENT_MODEL, {
      extraBody: { plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }] },
    })
  }
  return ocrModel
}
