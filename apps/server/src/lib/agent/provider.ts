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

/** The configured chat model. Call only when isAgentConfigured() is true. */
export function getAgentModel(): LanguageModel {
  if (!provider) provider = createOpenRouter({ apiKey: API_KEY })
  return provider(AGENT_MODEL)
}
