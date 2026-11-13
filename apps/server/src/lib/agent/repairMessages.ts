// ---------------------------------------------------------------------------
// Repair a conversation that carries a tool call with no result.
//
// ── The failure this fixes ──
//
// Every studio here uses CLIENT-EXECUTED tools: the model asks, the browser runs
// the tool, the browser sends the result back. If that result never arrives — the
// user answered a confirmation card by typing instead of clicking, closed the tab
// mid-tool, lost their connection, or the tool threw somewhere unguarded — the
// message history keeps an assistant tool call with nothing attached to it.
//
// `convertToModelMessages` then throws MissingToolResultsError, and because the
// broken history is re-sent with every subsequent message, EVERY later turn in that
// conversation throws too. The chat is dead: the user types, gets "I hit a snag",
// and the only way out is starting a new chat and losing the thread. Seen in
// production on /api/agent/blog/chat:
//
//     MissingToolResultsError: Tool result is missing for tool call z106jg4h
//
// ── The repair ──
//
// An unresolved call is marked `output-error` with a plain explanation, which is
// what actually happened: the tool did not complete. The model reads that as a
// failed step and can apologise, retry or ask — the conversation carries on.
//
// Deliberately NOT a fake success. Synthesising `{ ok: true }` would tell the model
// a post had been published or deleted when nothing ran, which is far worse than an
// error it can talk about.
//
// This is a SAFETY NET, not the fix for a specific client bug: the browser also has
// to stop dropping results (see useBlogChatSession.ts), but no client can promise to
// come back — a closed laptop can't send anything — so the server must cope.
// ---------------------------------------------------------------------------

import { NoSuchToolError, type ToolCallRepairFunction, type ToolSet, type UIMessage } from 'ai'

/** A tool part in either of the two shapes v6 uses (typed `tool-<name>`, or dynamic). */
interface ToolPartLike {
  type: string
  toolCallId?: string
  toolName?: string
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
}

function isToolPart(part: unknown): part is ToolPartLike {
  if (!part || typeof part !== 'object') return false
  const type = (part as { type?: unknown }).type
  return typeof type === 'string' && (type.startsWith('tool-') || type === 'dynamic-tool')
}

/**
 * Has this call been answered? `output-available` and `output-error` both count —
 * an error IS a result. So does a denied approval, which the SDK converts itself.
 */
function isSettled(part: ToolPartLike): boolean {
  return part.state === 'output-available' || part.state === 'output-error' || part.state === 'output-denied'
}

const REASON =
  'This tool call never completed — the browser did not send a result back (the user may have moved on, ' +
  'or the page was closed). Nothing was changed by it. Do not assume it succeeded: if the step still ' +
  'matters, say so and offer to do it again.'

export interface RepairResult {
  messages: UIMessage[]
  /** How many dangling calls were closed off, for logging. */
  repaired: number
  /** The tool names involved, so a recurring cause is visible in the logs. */
  tools: string[]
}

/**
 * Close off every unanswered tool call in the history.
 *
 * Copies only what it changes — an untouched conversation comes back as the same
 * array, so the normal path costs one shallow scan and no allocation.
 */
export function repairToolResults(messages: UIMessage[]): RepairResult {
  let repaired = 0
  const tools: string[] = []

  const next = messages.map((message) => {
    const parts = (message as { parts?: unknown[] }).parts
    if (!Array.isArray(parts) || !parts.some((p) => isToolPart(p) && !isSettled(p))) return message

    const fixedParts = parts.map((part) => {
      if (!isToolPart(part) || isSettled(part)) return part
      repaired++
      tools.push(part.toolName ?? part.type)
      return {
        ...part,
        state: 'output-error',
        errorText: REASON,
        // `output` must be absent on an output-error part, or the SDK sees two
        // sources of truth for the same call.
        output: undefined,
      }
    })

    return { ...message, parts: fixedParts } as UIMessage
  })

  return { messages: repaired > 0 ? next : messages, repaired, tools }
}


// ---------------------------------------------------------------------------
// Repair a tool call whose NAME is a near miss.
//
// "offerChoices" / "Offer-Choices" for offer_choices, "read_screen" for
// readScreen. An unknown name is an invalid call: the model is told it failed —
// and for offer_choices the turn did NOT end (hasToolCall matches the exact name
// only), so the web drew the buttons from the raw call while the model carried
// on talking ("pick your options above"). A name that matches exactly ONE tool
// once case and punctuation are ignored is renamed to it (its input is then
// validated as usual); anything else stays invalid, exactly as before.
// Pass it as streamText's repairToolCall option.
// ---------------------------------------------------------------------------

const toolKey = (name: string) => name.replace(/[^a-z0-9]/gi, '').toLowerCase()

export function repairToolNames(tools: ToolSet): ToolCallRepairFunction<ToolSet> {
  const byKey = new Map<string, string[]>()
  for (const name of Object.keys(tools)) byKey.set(toolKey(name), [...(byKey.get(toolKey(name)) ?? []), name])
  return async ({ toolCall, error }) => {
    if (!NoSuchToolError.isInstance(error)) return null
    const hits = byKey.get(toolKey(toolCall.toolName)) ?? []
    return hits.length === 1 && hits[0] !== toolCall.toolName ? { ...toolCall, toolName: hits[0]! } : null
  }
}
