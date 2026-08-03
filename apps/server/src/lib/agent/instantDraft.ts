// ---------------------------------------------------------------------------
// The Instant agent — two model calls, both bounded.
//
//   describePhoto()  — one vision call per photo → a plain-text picture-desk note
//   generateDraft()  — one structured call → a story or blog draft
//
// Why a dedicated vision call rather than reusing ingestDocument(): that function
// asks for a strict magazine DIGEST (title/summary/sections/facts/tables/icons),
// a shape a news photograph does not have. Its own comments record that charts
// "regularly defeat" the schema'd call and it falls back to a plain description —
// so for photographs we go straight to the plain description, with a prompt
// written for a picture desk. One call, no schema to defeat, no wasted retry.
//
// Every call is timeout-bounded: an unbounded provider stall would otherwise hang
// the request until the platform killed it, with the user watching a spinner.
// ---------------------------------------------------------------------------

import { generateObject, generateText } from 'ai'
import { getAgentModel } from './provider.js'
import {
  BLOG_SYSTEM,
  BlogDraftSchema,
  STORY_SYSTEM,
  StoryDraftSchema,
  VISION_SYSTEM,
  draftPrompt,
  visionPrompt,
  type BlogDraft,
  type DraftInputs,
  type StoryDraft,
} from './instantPrompt.js'

export type InstantMode = 'story' | 'blog'

/** Caps. Mirrored client-side so the UI can refuse before uploading anything. */
export const MAX_PHOTOS = 6
export const MAX_TOPIC_CHARS = 300
export const MAX_TRANSCRIPT_CHARS = 8_000
export const MAX_NOTE_CHARS = 4_000

const VISION_ABORT_MS = 60_000
const DRAFT_ABORT_MS = 90_000

/** Tag an error as "the provider misbehaved, try again" rather than "your input
 *  is wrong", so the route can answer 502 instead of 422. */
export function transientError(message: string): Error {
  return Object.assign(new Error(message), { transient: true })
}

export function isTransient(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { transient?: boolean }).transient === true
}

function isTimeoutish(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  return e.name === 'TimeoutError' || e.name === 'AbortError' || /timed?\s*out/i.test(e.message)
}

/**
 * Describe ONE photograph. Returns the note, capped.
 *
 * Throws on failure rather than returning an empty string: an empty note would
 * flow into the draft as "this photo showed nothing", which is a fabrication of
 * a different kind. The route reports which photo failed and the browser keeps
 * the others.
 */
export async function describePhoto(opts: {
  bytes: Buffer
  contentType: string
  name: string
  index?: number
  total?: number
}): Promise<string> {
  const { bytes, contentType, name, index = 0, total = 1 } = opts
  try {
    const { text } = await generateText({
      model: getAgentModel(),
      system: VISION_SYSTEM,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(VISION_ABORT_MS),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: visionPrompt(name, index, total) },
            { type: 'file', data: bytes, mediaType: contentType, filename: name },
          ],
        },
      ],
    })
    const note = (text ?? '').trim()
    if (!note) {
      // The call succeeded and returned nothing. Rare, and not the user's fault.
      throw transientError("I couldn't make anything of that photo just now — please try again.")
    }
    return note.slice(0, MAX_NOTE_CHARS)
  } catch (e) {
    if (isTransient(e)) throw e
    if (isTimeoutish(e)) {
      throw transientError('Reading that photo took too long — try again, or use a smaller photo.')
    }
    console.warn('[instant] vision failed:', e instanceof Error ? e.message : e)
    throw transientError("I couldn't read that photo just now — please try again in a moment.")
  }
}

/** Trim + clamp the free-text inputs. */
export function normaliseInputs(raw: {
  topic?: unknown
  transcript?: unknown
  imageNotes?: unknown
}): DraftInputs {
  const topic = typeof raw.topic === 'string' ? raw.topic.trim().slice(0, MAX_TOPIC_CHARS) : ''
  const transcript =
    typeof raw.transcript === 'string' ? raw.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS) : ''
  const imageNotes = Array.isArray(raw.imageNotes)
    ? raw.imageNotes
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
        .slice(0, MAX_PHOTOS)
        .map((n) => n.trim().slice(0, MAX_NOTE_CHARS))
    : []
  return { topic, transcript, imageNotes }
}

/** True when there is enough to write from at all. */
export function hasSomethingToWorkWith(inputs: DraftInputs): boolean {
  return !!inputs.topic || !!inputs.transcript || inputs.imageNotes.length > 0
}

/**
 * Pad or trim the model's captions to exactly one per photo. The schema asks for
 * one each and the prompt says so, but a short array would otherwise leave a
 * photo with `undefined` where the UI expects a string.
 */
function fitCaptions(captions: string[] | undefined, photoCount: number): string[] {
  const out = (captions ?? []).map((c) => (typeof c === 'string' ? c.trim() : '')).slice(0, photoCount)
  while (out.length < photoCount) out.push('')
  return out
}

function cleanTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>()
  for (const raw of tags ?? []) {
    const tag = String(raw).toLowerCase().replace(/^#/, '').replace(/[^a-z0-9 -]/g, '').trim()
    if (tag) seen.add(tag.slice(0, 40))
    if (seen.size >= 6) break
  }
  return [...seen]
}

function cleanTitle(title: string): string {
  return title.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\.$/, '').slice(0, 200)
}

/**
 * Ceilings on the model's lists. These are here rather than in the zod schema
 * because the provider rejects `maxItems`/`minItems` in a structured-output
 * schema (see the note in instantPrompt.ts) — so this function is the only place
 * a bound can actually be enforced.
 */
const MAX_BODY_ITEMS = 24
const MAX_LIST_POINTS = 8

/** One normalised body item. Only the fields its `kind` actually uses survive. */
export type BodyItem =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; items: { lead?: string; text: string }[] }
  | { kind: 'quote'; text: string; attribution?: string }

type RawBodyItem = {
  // The reference kinds belong to the Blog Studio, which has the search tools to
  // obtain a real id. They are in the SHARED schema, so this agent could emit one;
  // `cleanBody` drops them (see below).
  kind: 'paragraph' | 'heading' | 'list' | 'quote' | 'horseRef' | 'partyRef' | 'storyRef'
  text?: string
  level?: 2 | 3
  ordered?: boolean
  items?: { lead?: string; text: string }[]
  attribution?: string
  refId?: string
}

/**
 * Normalise the model's body.
 *
 * The schema is one flat object with optional fields (see instantPrompt.ts), so
 * this is where an item becomes its actual kind: fields that don't belong to the
 * kind are dropped, and an item with nothing usable in it is removed entirely
 * rather than reaching the browser as an empty paragraph or a bullet-less list.
 *
 * A list of ONE point is demoted to a paragraph. The prompt says not to do it,
 * and a single bullet reads as a mistake on the page.
 */
function cleanBody(raw: RawBodyItem[] | undefined): BodyItem[] {
  const out: BodyItem[] = []

  for (const item of (raw ?? []).slice(0, MAX_BODY_ITEMS)) {
    const text = typeof item?.text === 'string' ? item.text.trim() : ''

    // Reference cards are dropped OUTRIGHT here, not validated. They exist in the
    // shared BodyItemSchema for the Blog Studio, which has search tools to look a
    // record up; Instant Capture has none, so any id it produced would be guessed
    // — and a guessed id renders on the page as "this record is no longer
    // available". Silently discarding a card is much better than publishing a dead
    // one, and this agent is never asked for them in the first place.
    if (item?.kind === 'horseRef' || item?.kind === 'partyRef' || item?.kind === 'storyRef') continue

    if (item?.kind === 'heading') {
      if (!text) continue
      out.push({ kind: 'heading', level: item.level === 3 ? 3 : 2, text: text.slice(0, 200) })
      continue
    }

    if (item?.kind === 'list') {
      const points = (item.items ?? [])
        .slice(0, MAX_LIST_POINTS)
        .map((p) => ({
          lead: typeof p?.lead === 'string' && p.lead.trim() ? p.lead.trim().slice(0, 80) : undefined,
          text: typeof p?.text === 'string' ? p.text.trim() : '',
        }))
        .filter((p) => p.text.length > 0)
      if (points.length === 0) continue
      if (points.length === 1) {
        // One bullet is a paragraph. Keep the lead as a sentence opener.
        const only = points[0]!
        out.push({ kind: 'paragraph', text: only.lead ? `${only.lead}: ${only.text}` : only.text })
        continue
      }
      out.push({ kind: 'list', ordered: item.ordered === true, items: points })
      continue
    }

    if (item?.kind === 'quote') {
      if (!text) continue
      const attribution =
        typeof item.attribution === 'string' && item.attribution.trim()
          ? item.attribution.trim().slice(0, 120)
          : undefined
      out.push({ kind: 'quote', text, ...(attribution ? { attribution } : {}) })
      continue
    }

    if (!text) continue
    out.push({ kind: 'paragraph', text })
  }

  // A body that opens with a heading reads as a fragment of a longer piece. The
  // prompt forbids it; if it happens anyway, drop the stray heading rather than
  // publishing something that starts mid-document.
  while (out.length > 0 && out[0]!.kind === 'heading') out.shift()

  return out
}

export type InstantDraft =
  | ({ mode: 'story' } & StoryDraft)
  | ({ mode: 'blog' } & BlogDraft)

/** One structured model call. Throws (transient) on provider failure. */
export async function generateDraft(mode: InstantMode, inputs: DraftInputs): Promise<InstantDraft> {
  const photoCount = inputs.imageNotes.length
  const shared = {
    model: getAgentModel(),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(DRAFT_ABORT_MS),
    prompt: draftPrompt(inputs),
  } as const

  try {
    if (mode === 'story') {
      const { object } = await generateObject({ ...shared, system: STORY_SYSTEM, schema: StoryDraftSchema })
      return {
        mode: 'story',
        ...object,
        title: cleanTitle(object.title),
        body: object.body.trim(),
        tags: cleanTags(object.tags),
        captions: fitCaptions(object.captions, photoCount),
      }
    }

    const { object } = await generateObject({ ...shared, system: BLOG_SYSTEM, schema: BlogDraftSchema })
    return {
      mode: 'blog',
      ...object,
      title: cleanTitle(object.title),
      subtitle: object.subtitle?.trim() || undefined,
      excerpt: object.excerpt.trim(),
      body: cleanBody(object.body),
      tags: cleanTags(object.tags),
      captions: fitCaptions(object.captions, photoCount),
    }
  } catch (e) {
    if (isTimeoutish(e)) {
      throw transientError('Writing the draft took too long — please try again.')
    }
    console.warn('[instant] draft failed:', e instanceof Error ? e.message : e)
    throw transientError("I couldn't write that draft just now — please try again in a moment.")
  }
}
