// ---------------------------------------------------------------------------
// offer_choices — clickable answer "pills" for The Stable Hand (both chats).
//
// When the assistant asks the user something with a small set of likely
// answers ("Go ahead" / "Change something", a title from three suggestions,
// yes / no), it calls this tool as the LAST thing in its turn. The browser
// renders the call's INPUT as a choice card under the message
// (apps/web/src/agent/choices); a click sends the answer as the user's next
// message, exactly as if they had typed it. Typing stays available.
//
// The execute does not wait for the user — it returns at once, and each route
// adds hasToolCall(OFFER_CHOICES_TOOL) to its stopWhen so the turn ends right
// there (no extra model call after the pills are shown).
//
// The schema is deliberately LENIENT (no min/max): an over-long option or a
// seventh answer must not turn into a failed tool call the user never sees.
// The limits are in the descriptions for the model; the web card clamps.
// ---------------------------------------------------------------------------

import { tool } from 'ai'
import { z } from 'zod'

export const OFFER_CHOICES_TOOL = 'offer_choices'

// DELIBERATELY FORGIVING. A call the schema rejects never reaches the screen: the
// user saw a bare "Offer choices" step and no buttons while the model, told its call
// failed, carried on with "pick your options above" (live demo, 2026-11-13). So the
// shape the model is ASKED for is described exactly, but near-misses (an option
// written as {label}, a `label` instead of `question`, extra keys) are accepted and
// the web card (apps/web/src/agent/choices/choices.ts) normalises them.
// Numbers too ("How many pages?" → [4, 6, 8]): the web card shows them, and a
// rejected call here would show the model an error for buttons the user can see.
const optionInput = z.union([z.string(), z.number(), z.object({}).passthrough()])

export const offerChoicesInputSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            id: z.string().optional().describe('Optional short key, e.g. "title".'),
            question: z
              .string()
              .optional()
              .describe('Short label shown above the answers, e.g. "Title", "Audience" or "Next step" (not the full question).'),
            options: z
              .array(optionInput)
              .describe('2–6 short likely answers as plain strings, each at most 60 characters, e.g. ["Go ahead", "Change something"].'),
            multiple: z.boolean().optional().describe('true = the user may pick several answers.'),
          })
          .passthrough(),
      )
      .describe('1–4 questions. One question with single choice sends the tapped answer at once.'),
  })
  .passthrough()

export type OfferChoicesInput = z.infer<typeof offerChoicesInputSchema>

const optionLabel = (o: unknown): string => {
  if (typeof o === 'string') return o.trim()
  if (typeof o === 'number' && Number.isFinite(o)) return String(o)
  if (o && typeof o === 'object') {
    const r = o as Record<string, unknown>
    for (const k of ['label', 'text', 'value', 'title', 'option', 'name', 'answer']) if (typeof r[k] === 'string' && (r[k] as string).trim()) return (r[k] as string).trim()
  }
  return ''
}

/** How many questions carry at least one usable answer (mirrors the web card's clamp). */
export function countUsableQuestions(input: OfferChoicesInput): number {
  const qs = Array.isArray(input?.questions) ? input.questions.slice(0, 4) : []
  return qs.filter((q) => Array.isArray(q?.options) && q.options.some((o) => !!optionLabel(o))).length
}

export const offerChoicesTool = tool({
  description:
    'Show the user clickable answer buttons ("pills") for what you just asked, so they can tap instead of typing. ' +
    'Use it whenever you ask something with a few likely answers: confirming a plan ("Go ahead" / "Change something"), ' +
    'choosing between options, yes/no, picking a title from your suggestions. Write the explanation and the question ' +
    'in your message text FIRST, then call this as the LAST thing in your turn — the turn ends right after it and the ' +
    "user's pick arrives as their next message. 1–4 questions, each a short label plus 2–6 short options (60 characters " +
    'max). Do not also list the same options as bullets in your text. The user can always type their own answer instead.',
  inputSchema: offerChoicesInputSchema,
  execute: async (input) => {
    const shown = countUsableQuestions(input)
    return shown > 0
      ? { shown: true, note: "The user sees these as buttons; their answer arrives as their next message." }
      : { shown: false, note: 'Nothing usable to show — the user will answer in text.' }
  },
})
