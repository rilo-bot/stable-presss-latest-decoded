// ---------------------------------------------------------------------------
// AI model provider — every model the app uses comes from here.
//
// All model calls run server-side through OpenRouter via the Vercel AI SDK, so
// the OpenRouter key never reaches the browser. Every model is wrapped with the
// usage meter (aiUsage.ts), which feeds the Campaign Engine "AI Activity" page
// and strips sampling parameters the current Claude models reject.
//
// Slugs are exact openrouter.ai/models ids. Re-verify on openrouter.ai before
// changing a default — an unverified slug broke prod generation once already.
// Defaults verified 2026-11-12.
// ---------------------------------------------------------------------------

import { wrapLanguageModel, type LanguageModel } from 'ai'
import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider'
import { aiUsageMiddleware, type AiSurface } from './aiUsage.js'

const API_KEY = (process.env.OPENROUTER_API_KEY ?? '').trim()

// The shared chat model (concierge, story/article/blog/profile studios, compose,
// newsroom, document reading). Swappable with the AGENT_MODEL env var.
export const AGENT_MODEL = (process.env.AGENT_MODEL ?? '').trim() || 'anthropic/claude-sonnet-4.6'

/** True when the assistant can run (an OpenRouter key is present). */
export function isAgentConfigured(): boolean {
  return !!API_KEY
}

let provider: OpenRouterProvider | null = null
function openrouter(): OpenRouterProvider {
  if (!provider) provider = createOpenRouter({ apiKey: API_KEY })
  return provider
}

type Effort = 'low' | 'medium' | 'high'
type OpenRouterSettings = Parameters<OpenRouterProvider>[1]

/** One wrapped model per (slug, settings, label): wrapping is cheap but caching keeps identity stable. */
const models = new Map<string, LanguageModel>()
function metered(
  slug: string,
  label: { surface?: AiSurface; feature?: string },
  settings: OpenRouterSettings = {},
): LanguageModel {
  const key = JSON.stringify([slug, label, settings])
  let model = models.get(key)
  if (!model) {
    model = wrapLanguageModel({
      // usage.include: OpenRouter returns the billed cost, so AI Activity shows real dollars.
      model: openrouter()(slug, { usage: { include: true }, ...settings }),
      middleware: aiUsageMiddleware({ modelId: slug, ...label }),
    })
    models.set(key, model)
  }
  return model
}

/** The configured chat model. Call only when isAgentConfigured() is true.
 *  Its surface (Story AI, Blog AI, …) comes from the caller's withAiUsage context. */
export function getAgentModel(): LanguageModel {
  return metered(AGENT_MODEL, {})
}

// ── Magazine Builder: one model per role ─────────────────────────────────────
//
// Confirmed with the user 2026-11-12. Each role is overridable on Render without a
// code change: MAGAZINE_<ROLE>_MODEL (slug) and MAGAZINE_<ROLE>_EFFORT
// (low | medium | high). Claude Opus 5.5 / Sonnet 5.5 always think; effort is the
// only depth control, and thinking tokens count against maxOutputTokens.

export type MagazineRole =
  | 'planner' // Creative Director: concept, palette, fonts, page list
  | 'copy' // Copywriter: headlines, body, captions
  | 'layout' // Art Director: page layout spec
  | 'critic' // Visual Critic: judges a rendered page
  | 'photo' // Photo Director: picks/briefs photos
  | 'editor' // Editor-in-Chief: whole-issue pass
  | 'studio' // Magazine AI Studio chat in the editor
  | 'format' // Fill / Adjust buttons
  | 'reader' // reads a reference layout from an image
  | 'refill' // puts content into a read reference layout
  | 'import' // labels text blocks on imported PDF/Word pages

const OPUS = 'anthropic/claude-opus-5.5'
const SONNET = 'anthropic/claude-sonnet-5.5'

export const MAGAZINE_ROLE_DEFAULTS: Record<MagazineRole, { model: string; effort: Effort }> = {
  planner: { model: OPUS, effort: 'medium' },
  copy: { model: SONNET, effort: 'low' },
  layout: { model: OPUS, effort: 'medium' },
  critic: { model: SONNET, effort: 'low' },
  photo: { model: SONNET, effort: 'low' },
  editor: { model: OPUS, effort: 'medium' },
  studio: { model: SONNET, effort: 'medium' },
  format: { model: SONNET, effort: 'low' },
  reader: { model: SONNET, effort: 'medium' },
  refill: { model: SONNET, effort: 'low' },
  import: { model: SONNET, effort: 'low' },
}

const EFFORTS = new Set<Effort>(['low', 'medium', 'high'])

/** The slug + effort a magazine role runs on right now (env overrides applied). */
export function magazineRoleConfig(role: MagazineRole): { model: string; effort: Effort } {
  const env = role.toUpperCase()
  const model = (process.env[`MAGAZINE_${env}_MODEL`] ?? '').trim() || MAGAZINE_ROLE_DEFAULTS[role].model
  const raw = (process.env[`MAGAZINE_${env}_EFFORT`] ?? '').trim().toLowerCase() as Effort
  const effort = EFFORTS.has(raw) ? raw : MAGAZINE_ROLE_DEFAULTS[role].effort
  return { model, effort }
}

/** The Magazine Builder's model for one role. Call only when isAgentConfigured(). */
export function getMagazineModel(role: MagazineRole): LanguageModel {
  const { model, effort } = magazineRoleConfig(role)
  return metered(model, { surface: 'magazine-builder', feature: role }, { reasoning: { effort } })
}

// ── The Stable Hand (operator) ───────────────────────────────────────────────
//
// Its own pair, separate from AGENT_MODEL, because it runs long tool loops where
// instruction-following matters more than for chat; the heavy model is only
// reached for attachments or long multi-part briefs.
export const OPERATOR_MODEL = (process.env.OPERATOR_MODEL ?? '').trim() || SONNET
export const OPERATOR_HEAVY_MODEL = (process.env.OPERATOR_HEAVY_MODEL ?? '').trim() || OPUS

// Top-level `cache_control` is the provider's documented switch for Anthropic
// AUTOMATIC prompt caching: it caches the growing conversation, which an operator
// loop re-sends on every step. The explicit breakpoint on the static system prompt
// (lib/agent/operator/prompt.ts) is separate and always on.
// OPERATOR_AUTO_CACHE=0 is the kill switch if a routed provider ever rejects it.
const OPERATOR_AUTO_CACHE = (process.env.OPERATOR_AUTO_CACHE ?? '').trim() !== '0'

/** The operator's model: Sonnet by default, Opus when `heavy`. Call only when
 *  isAgentConfigured() is true. */
export function getOperatorModel(heavy = false): LanguageModel {
  const slug = heavy ? OPERATOR_HEAVY_MODEL : OPERATOR_MODEL
  return metered(slug, { surface: 'stable-hand' }, OPERATOR_AUTO_CACHE ? { cache_control: { type: 'ephemeral' } } : {})
}

/**
 * Model variant for reading PDFs (document ingest OCR). It enables OpenRouter's
 * `file-parser` plugin with the `mistral-ocr` engine so IMAGE-BASED / scanned PDFs
 * are genuinely OCR'd. The plain model falls back to text-layer extraction, which
 * returns nothing for a phone scan (no text layer). Scoped to the ingest path so
 * ordinary chat/tool calls are unaffected (and never pay the OCR-engine cost).
 *
 * The plugin is passed via `extraBody` (forwarded verbatim into the request body)
 * because the provider's typed `plugins` union doesn't include `file-parser`.
 */
export function getOcrModel(): LanguageModel {
  return metered(AGENT_MODEL, { feature: 'pdf-ocr' }, {
    extraBody: { plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }] },
  })
}
