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

export const offerChoicesInputSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().optional().describe('Optional short key, e.g. "title".'),
        question: z
          .string()
          .describe('Short label shown above the answers, e.g. "Title", "Audience" or "Next step" (not the full question).'),
        options: z
          .array(z.string())
          .describe('2–6 short likely answers, each at most 60 characters, e.g. ["Go ahead", "Change something"].'),
        multiple: z.boolean().optional().describe('true = the user may pick several answers.'),
      }),
    )
    .describe('1–4 questions. One question with single choice sends the tapped answer at once.'),
})

export type OfferChoicesInput = z.infer<typeof offerChoicesInputSchema>

/** How many questions carry at least one usable answer (mirrors the web card's clamp). */
export function countUsableQuestions(input: OfferChoicesInput): number {
  const qs = Array.isArray(input?.questions) ? input.questions.slice(0, 4) : []
  return qs.filter((q) => Array.isArray(q?.options) && q.options.some((o) => typeof o === 'string' && o.trim())).length
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
