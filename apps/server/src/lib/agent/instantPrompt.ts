// ---------------------------------------------------------------------------
// The Instant agent's prompts and output schemas.
//
// Instant writes editorial copy from a PHOTOGRAPH plus whatever the reporter
// said into their phone. That makes it the most fabrication-prone surface in the
// product: a picture of a horse cannot tell a model which horse, at which track,
// in which race — and a model asked to write racing copy will happily supply all
// three. Every rule below exists to stop that.
//
// Three prompts live here:
//   VISION_SYSTEM  — describe one photo (no naming, no inference)
//   story draft    — title + plain-text body + a category from the closed enum
//   blog draft     — title + excerpt + sections (blocks are assembled in code)
//
// The blog draft deliberately does NOT emit Block[]. The model returns
// `sections`, and instantDraft.ts builds the blocks. Same split the magazine
// rebuild locked: agent brain, deterministic renderer — a generated post cannot
// hold a shape a hand-authored one couldn't.
// ---------------------------------------------------------------------------

import { z } from 'zod'
import { categoryGuidanceList, NEWS_CATEGORY_KEYS } from '../newsCategories.js'

// ── Vision: describe one photo ──────────────────────────────────────────────

export const VISION_SYSTEM = [
  'You are a picture-desk assistant at a thoroughbred racing publication. You are shown ONE photograph and you',
  'describe it for a journalist who cannot see it. Be concrete and complete.',
  '',
  'Report, when present:',
  '  • what is happening — the action, the setting, the moment',
  '  • horses: how many, colour/markings, tack, rugs, saddlecloth NUMBERS',
  '  • people: how many, their role if it is obvious from dress (jockey, strapper, trainer, official, crowd)',
  '  • silks and colours, described precisely (e.g. "royal blue with a white sash and red cap")',
  '  • ALL legible text EXACTLY as written — signage, sponsor boards, race titles, numbers, bib text, screens',
  '  • the venue type, surface, weather, light and time of day insofar as they are visible',
  '',
  'ABSOLUTE RULES:',
  '  • NEVER name a horse, person, trainer, jockey, owner, race, track or venue. You cannot know these from a',
  '    photograph. If a name is legibly PRINTED in the image, quote it as printed text and say where it appears.',
  '  • NEVER state a result, placing, margin, time, price, prize or date.',
  '  • NEVER guess. If something is unclear, say it is unclear.',
  '',
  'Output plain text only, a few sentences to a short paragraph. No preamble, no markdown, no bullet characters.',
].join('\n')

export function visionPrompt(name: string, index: number, total: number): string {
  const which = total > 1 ? ` (photo ${index + 1} of ${total})` : ''
  return `Describe this photograph${which}, filename "${name}", for the reporter.`
}

// ── Shared draft rules ──────────────────────────────────────────────────────

/**
 * The no-fabrication contract. Same posture as routes/agentCompose.ts, tightened
 * for this module: compose has a filled-in form to ground it, Instant has a
 * picture and possibly nothing else.
 */
const GROUNDING_RULES = [
  'SOURCES — you have three, and nothing else:',
  '  1. TOPIC — a short steer the reporter typed. May be empty.',
  '  2. VOICE NOTE — a transcript of what the reporter said at the scene. May be empty. Treat this as the',
  '     reporter\'s own eyewitness testimony: facts stated here ARE usable, including names and results.',
  '  3. PHOTO NOTES — a picture-desk description of each photograph. Visual evidence only.',
  '',
  'GROUNDING RULES — these are not style preferences:',
  '  • Use ONLY facts present in the three sources. Do NOT add, infer, extrapolate or embellish.',
  '  • NEVER invent a horse, person, trainer, jockey, owner, syndicate, race, track, venue or sponsor name.',
  '  • NEVER invent a result, placing, margin, sectional, time, weight, barrier, odds, price, prize or date.',
  '  • NEVER invent a quotation. Only quote words the voice note actually contains.',
  '  • A photo shows WHAT, never WHO or WHICH. If the sources do not name it, write around it',
  '    ("the winner", "the grey", "a strapper") rather than picking a name.',
  '  • If the sources are thin, write shorter. A short honest piece is correct; a padded one is a failure.',
  '  • NEVER expand a partial name into its fuller or official form. If a source says "the Newmarket", write "the',
  '    Newmarket" — not "the Newmarket Handicap". The extra words are a guess even when they are likely right.',
  '  • NEVER add a scene-setting or summing-up sentence to reach a length ("as the rest of the morning\'s work got',
  '    underway", "it was a promising sign for the stable"). If a paragraph has nothing sourced left to say, stop.',
  '  • A caption describes ONLY what its own photo note contains. Do not move a venue, name, time or fact from the',
  '    topic or voice note into a caption — the photo may not show it.',
  '  • Set needsFacts=true whenever the piece would need a fact you were not given to be publishable —',
  '    which is the normal case for photographs. Be honest here; an editor reads this flag.',
].join('\n')

const HOUSE_STYLE = [
  'HOUSE STYLE: clear, professional racing-desk prose. Active voice, concrete nouns, no hype, no clichés',
  '("stunning display", "the crowd went wild"), no rhetorical questions, no address to the reader. Australian',
  'English spelling. The headline states what happened — it is not a teaser and carries no colon-subtitle.',
].join('\n')

// ── Story mode (an `articles` draft) ────────────────────────────────────────

/**
 * Note there is no excerpt: an article's `summary` field IS its body (see
 * ArticleDetail, which splits that one field into paragraphs). A separate
 * excerpt would have nowhere to be stored.
 */
export const StoryDraftSchema = z.object({
  title: z.string().describe('The headline. One line, sentence-or-title case, no trailing full stop, ≤ 120 chars.'),
  body: z
    .string()
    .describe(
      'The whole article as PLAIN TEXT. Two to five paragraphs separated by a blank line (\\n\\n). ' +
        'No markdown, no headings, no HTML, no bullet lists.',
    ),
  category: z
    .enum(NEWS_CATEGORY_KEYS)
    .describe('The single best-fitting category key from the list given in the prompt.'),
  tags: z.array(z.string()).describe('Two to six lowercase topic tags. No hashes, no punctuation.'),
  captions: z
    .array(z.string())
    .describe('One caption per photo, in the order the photo notes were given. Describe only what is visible.'),
  needsFacts: z
    .boolean()
    .describe('True when the piece needs facts you were not given (names, results, dates) before it can be filed.'),
})

/**
 * A note on why no array in these schemas carries `.min()`/`.max()`:
 *
 * Anthropic's structured-output validator rejects both — `minItems` other than
 * 0 or 1 ("values other than 0 or 1 are not supported") and `maxItems` outright
 * ("property 'maxItems' is not supported"). Either one fails the whole call with
 * a 400, so a schema that looks stricter simply doesn't run. Counts are stated in
 * the field descriptions and ENFORCED in instantDraft.ts, which clamps every list
 * after the call — the only place a bound can actually hold.
 */
export type StoryDraft = z.infer<typeof StoryDraftSchema>

export const STORY_SYSTEM = [
  'You are a duty reporter at Stable Press, a thoroughbred racing publication. A reporter in the field has sent you',
  'photographs, and possibly a voice note and a topic line. Write the first draft of a news story from them.',
  '',
  GROUNDING_RULES,
  '',
  HOUSE_STYLE,
  '',
  'The body is PLAIN TEXT in two to five paragraphs separated by blank lines. Open with the news, not the scene.',
  'Then supply the detail the sources actually support. Do not write a kicker or a sign-off.',
  '',
  'CATEGORY — choose exactly one key from this closed list. Do not invent a category:',
  categoryGuidanceList(),
].join('\n')

// ── Blog mode (a `blogs` draft) ─────────────────────────────────────────────

/**
 * A blog post's body, as a FLAT list of typed items in reading order.
 *
 * Shape notes, both deliberate:
 *
 *  • Flat, not sections-with-paragraphs. A heading, a paragraph and a list are
 *    siblings in the block model, and nesting them under a "section" meant the
 *    model could only ever produce heading-then-prose — it had no way to emit a
 *    bulleted list at all, which is exactly what was missing from the output.
 *
 *  • ONE object shape with a `kind` discriminator and optional fields, rather
 *    than a discriminated union of four shapes. Provider structured-output
 *    support for `anyOf`/`oneOf` is uneven, and a union that fails to compile
 *    server-side fails the whole call; a flat optional-field object always
 *    validates and `cleanBody()` discards whatever doesn't belong to the kind.
 */
// Exported because the Blog Studio's tools speak the same shape (see
// lib/agent/blogTools.ts). Restating it there would let the two agents that write
// blog bodies drift apart, and `cleanBody()` below is the only normaliser either
// of them gets.
export const BodyItemSchema = z.object({
  kind: z
    .enum(['paragraph', 'heading', 'list', 'quote', 'horseRef', 'partyRef', 'storyRef'])
    .describe('What this item is. Most items are paragraphs.'),
  text: z
    .string()
    .optional()
    .describe('paragraph: the paragraph. heading: the heading. quote: the quoted words. Plain text, no markdown.'),
  level: z
    .union([z.literal(2), z.literal(3)])
    .optional()
    .describe('heading only: 2 for a main section heading, 3 for a sub-heading.'),
  ordered: z
    .boolean()
    .optional()
    .describe('list only: true for a numbered list (steps, a sequence), false for bullets.'),
  items: z
    .array(
      z.object({
        lead: z
          .string()
          .optional()
          .describe('An optional two-to-four-word label for this point, rendered bold before the text.'),
        text: z.string().describe('The point itself, as plain text.'),
      }),
    )
    .optional()
    .describe('list only: the points, each optionally with a short bold lead-in label.'),
  attribution: z.string().optional().describe('quote only: who said it — ONLY if the sources name them.'),
  refId: z
    .string()
    .optional()
    .describe(
      'horseRef / partyRef / storyRef ONLY: the id of the record to embed as a card, taken from a search tool result. NEVER invent one — an id that does not resolve renders as a dead card. Only the Blog Studio has the search tools to obtain these; leave it out otherwise.',
    ),
})

export const BlogDraftSchema = z.object({
  title: z.string().describe('The post title. One line, ≤ 120 chars, no trailing full stop.'),
  subtitle: z.string().optional().describe('An optional standfirst of one sentence. Omit rather than pad.'),
  excerpt: z
    .string()
    .describe('One or two sentences for cards and search results. Not a repeat of the title.'),
  body: z
    .array(BodyItemSchema)
    .describe('The post body in reading order: paragraphs, headings, and lists where they genuinely help.'),
  tags: z.array(z.string()).describe('Two to six lowercase topic tags.'),
  captions: z
    .array(z.string())
    .describe('One caption per photo, in the order the photo notes were given. Describe only what is visible.'),
  needsFacts: z.boolean().describe('True when the piece needs facts you were not given before it can be published.'),
})

export type BlogDraft = z.infer<typeof BlogDraftSchema>

export const BLOG_SYSTEM = [
  'You are a staff writer at Stable Press, a thoroughbred racing publication. A colleague in the field has sent you',
  'photographs, and possibly a voice note and a topic line. Write the first draft of a blog post from them.',
  '',
  GROUNDING_RULES,
  '',
  HOUSE_STYLE,
  '',
  'A blog post may be a little more reflective than a news story, but it is held to exactly the same factual',
  'standard: observation is allowed, invention is not.',
  '',
  'STRUCTURE — the body is a flat list of items in reading order.',
  '',
  'Read this first, because the two are easy to confuse: ORGANISING the facts you were given is not padding.',
  'Padding is adding facts nobody gave you. Turning six sourced facts into a heading and three bullets adds nothing',
  'and helps the reader; writing a fourth bullet you invented is the thing that is forbidden. Structure freely,',
  'invent nothing.',
  '',
  'So:',
  '  • Open with one or two PARAGRAPHS that carry the news. Never open with a heading.',
  '  • When the sources support THREE OR MORE discrete points of the same type — what is affected, what to do, what',
  '    changed, what was said — group them under a HEADING (level 2) and set them out as a LIST. This is the normal',
  '    shape for a piece with several facts in it, not a special case.',
  '  • Give each list point a two-to-four-word bold `lead` label when the points have natural names ("Submerged',
  '    roadway", "Transit delays"); leave `lead` off when they do not. `ordered: true` only for a real sequence.',
  '  • Headings are two to five words, not sentences. Three or four is the most any post here should have, and a',
  '    genuinely thin piece needs none — two paragraphs and nothing else is a perfectly good post.',
  '  • Use a QUOTE only for words the voice note actually contains. Attribute it only if the sources name the speaker.',
  '  • A list of one point is a paragraph. Two points is usually a sentence with an "and" in it. Do not split one',
  '    fact across several bullets to make a list look fuller.',
  '  • Never state the same fact twice. A fact that is already in a paragraph does not also belong in the list, and',
  '    two bullets must not be the same point reworded. Say each thing once, in the one place it belongs.',
].join('\n')

// ── The user turn (shared by both modes) ────────────────────────────────────

export interface DraftInputs {
  topic: string
  transcript: string
  imageNotes: string[]
}

export function draftPrompt({ topic, transcript, imageNotes }: DraftInputs): string {
  const photos = imageNotes.length
    ? imageNotes.map((note, i) => `PHOTO ${i + 1}:\n${note}`).join('\n\n')
    : '(no photographs)'
  return [
    `TOPIC:\n${topic || '(none given)'}`,
    '',
    `VOICE NOTE (the reporter's own words — usable as fact):\n${transcript || '(none recorded)'}`,
    '',
    `PHOTO NOTES (visual evidence only — never a source of names):\n${photos}`,
    '',
    `There ${imageNotes.length === 1 ? 'is 1 photograph' : `are ${imageNotes.length} photographs`}, so return exactly ${imageNotes.length} caption${imageNotes.length === 1 ? '' : 's'}.`,
    '',
    'Write the draft now.',
  ].join('\n')
}
