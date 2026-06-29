// ---------------------------------------------------------------------------
// Tools for the in-profile "Stable Studio" assistant.
//
// The profile being edited lives CLIENT-SIDE (Zustand stores), so these tools are
// declared WITHOUT `execute`: the AI SDK streams the tool calls to the browser,
// which runs them via onToolCall (apps/web/src/agent/profile/profileToolExecutor.ts).
// Edits apply DIRECTLY (the member can Undo) — mirroring the Article Studio — and
// every write goes through the RBAC-gated API, so the model can never edit a
// profile the member couldn't.
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

const HORSE_ROLES = ['owner', 'breeder', 'trainer', 'jockey', 'bloodstock agent', 'personnel'] as const

export function buildProfileTools(): ToolSet {
  return {
    getProfile: tool({
      description:
        'Read the profile currently open in the editor: its kind (horse/party), name, every editable field with its current value, and which fields are still empty. Call this before editing so you target real fields.',
      inputSchema: z.object({}),
    }),
    setField: tool({
      description:
        'Set ONE editable field on the open profile, applied immediately (the member can Undo). Use exact field keys from the profile context (e.g. sex, colour, sire, careerRecord, profession). Do not invent facts (registration/microchip numbers, race records) — ask the member instead.',
      inputSchema: z.object({
        field: z.string().describe('Exact field key, e.g. "colour", "sire", "careerRecord", "profession".'),
        value: z.string().describe('The new value as a string (dates as YYYY-MM-DD, numbers as digits).'),
      }),
    }),
    clearField: tool({
      description: 'Empty ONE editable field on the open profile, applied immediately (undoable).',
      inputSchema: z.object({ field: z.string().describe('Exact field key to clear.') }),
    }),
    suggestImageOptions: tool({
      description:
        'HORSE ONLY. Get a few on-brand stock photo candidates (name + url) matching a keyword, for the horse portrait. Describe them, then call setPhoto with one of the returned URLs. Never invent image URLs.',
      inputSchema: z.object({ query: z.string().optional().describe('A keyword like "thoroughbred gallop" or "paddock".') }),
    }),
    setPhoto: tool({
      description:
        "HORSE ONLY. Set the horse's portrait photo to a known/approved image URL (e.g. one from suggestImageOptions). Applied immediately (undoable). Never invent URLs.",
      inputSchema: z.object({ src: z.string().describe('The image URL, from suggestImageOptions.') }),
    }),
    setConnection: tool({
      description:
        'HORSE ONLY. Add a connection (owner/trainer/jockey/etc.) to a party, applied immediately (undoable). If the named party does not exist it is created as a provisional (unverified) party.',
      inputSchema: z.object({
        role: z.enum(HORSE_ROLES),
        partyName: z.string().describe("The party's full name."),
        startYear: z.string().optional().describe('Year the connection began, e.g. "2021".'),
        endYear: z.string().optional().describe('Year it ended; omit if ongoing.'),
        present: z.boolean().optional().describe('True if the connection is current/ongoing (no end year).'),
      }),
    }),
  }
}
