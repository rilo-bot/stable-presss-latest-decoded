// ---------------------------------------------------------------------------
// Tools for the "Story Studio" assistant.
//
// Every tool is CLIENT-EXECUTED (declared WITHOUT `execute`): the AI SDK streams
// the calls to the browser, which renders the matching card / runs the side
// effect via onToolCall (apps/web/src/agent/story/storyToolExecutor.ts) and sends
// the result back. The model writes the story; the browser collects the metadata
// and files the draft.
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
    proposeStory: tool({
      description:
        'Stage the written story for the user to review. Pass the headline as `title` and the FULL multi-paragraph story (blank-line separated) as `summary`. It is NOT saved — the user can Accept, request a Regenerate, or edit it. Returns { accepted, title, summary }. If not accepted, revise and call this again.',
      inputSchema: z.object({
        title: z.string().describe('The headline.'),
        summary: z.string().describe('The full story text — several paragraphs separated by blank lines. The first paragraph is the lead.'),
      }),
    }),
    requestPhoto: tool({
      description:
        'Ask the user whether to add a lead photo. Opens an optional image upload card. Returns { imageUrl: string | null } — null means no photo.',
      inputSchema: z.object({}),
    }),
    requestByline: tool({
      description:
        'Ask the user for the byline / author. Returns { author }. For a contributor, pass their name as `suggested` so the card pre-fills and locks it.',
      inputSchema: z.object({
        suggested: z.string().optional().describe('A suggested author name to pre-fill.'),
      }),
    }),
    requestAccessTier: tool({
      description:
        'Ask the user which subscription tier may read the story. Returns { minTier } — one of "free", "standard", "premium".',
      inputSchema: z.object({}),
    }),
    requestCategory: tool({
      description:
        'Ask the user to pick the editorial category. Returns { category } — one of the valid category values.',
      inputSchema: z.object({}),
    }),
    requestHorseLinks: tool({
      description:
        'Ask the user to link horse profiles to the story via a searchable multi-select. Returns { linkedHorseIds: string[] } (may be empty).',
      inputSchema: z.object({}),
    }),
    createStoryDraft: tool({
      description:
        'File the finished story as a DRAFT and open it for the user. Reading time and the draft stage are set automatically. Returns { ok, id }.',
      inputSchema: z.object({
        title: z.string().describe('The accepted headline.'),
        summary: z.string().describe('The accepted full story text.'),
        author: z.string().describe('The byline returned by requestByline.'),
        category: z.enum(CATEGORY_VALUES).optional().describe('The category returned by requestCategory.'),
        minTier: z.enum(['free', 'standard', 'premium']).describe('The tier returned by requestAccessTier.'),
        imageUrl: z.string().optional().describe('The image URL returned by requestPhoto, if any.'),
        linkedHorseIds: z.array(z.string()).describe('Horse ids returned by requestHorseLinks (may be empty).'),
      }),
    }),
  }
}
