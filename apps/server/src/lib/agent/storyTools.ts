// ---------------------------------------------------------------------------
// Tools for the "Story Studio" assistant.
//
// The assistant is CONVERSATIONAL: it writes the story and collects the access
// tier, category and which horses by letting the user type or speak — never via
// buttons. The byline (the logged-in member), the reading time and the draft
// stage are all set automatically, and the lead photo is attached client-side via
// the composer's 📎 button — so the model needs none of those. Only two tools
// remain, both CLIENT-EXECUTED (declared WITHOUT `execute`):
//   - listHorses       — returns the register so the model can map spoken names to ids
//   - createStoryDraft — files the finished draft
// They run in the browser via onToolCall (apps/web/src/agent/story/storyToolExecutor.ts).
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

const CATEGORY_VALUES = [
  'race-reports', 'industry-news', 'morning-edition',
  'form-guide', 'track-notes', 'bloodstock',
  'trainer-profiles', 'jockey-desk', 'owner-stories',
] as const

export function buildStoryTools(): ToolSet {
  return {
    listHorses: tool({
      description:
        'Return the horse register so you can match the horse names the user typed/spoke to their ids. Call this before asking which horses to link. Returns { horses: [{ id, name, trainer }] }.',
      inputSchema: z.object({}),
    }),
    createStoryDraft: tool({
      description:
        'File the finished story as a DRAFT and open it for the user. The byline (logged-in member), reading time, draft stage and any attached lead photo are all applied automatically. Returns { ok, id }.',
      inputSchema: z.object({
        title: z.string().describe('The approved headline.'),
        summary: z.string().describe('The approved full story text — paragraphs separated by blank lines.'),
        category: z.enum(CATEGORY_VALUES).optional().describe('The category the user chose, mapped to one of the valid values.'),
        linkedHorseIds: z.array(z.string()).describe('Ids (from listHorses) of the horses the user named — may be empty.'),
      }),
    }),
  }
}
