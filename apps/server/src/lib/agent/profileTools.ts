// ---------------------------------------------------------------------------
// Tools for the in-profile "Stable Studio" assistant.
//
// The profile being edited lives CLIENT-SIDE (Zustand stores) and writes are
// STAGED for the member to Apply, so these tools are declared WITHOUT `execute`:
// the AI SDK streams the tool calls to the browser, which runs them via
// onToolCall (apps/web/src/agent/profile/profileToolExecutor.ts) — getProfile
// returns the live context; proposeField / proposeConnection stage a review card.
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

const HORSE_ROLES = ['owner', 'breeder', 'trainer', 'jockey', 'bloodstock agent', 'personnel'] as const

export function buildProfileTools(): ToolSet {
  return {
    getProfile: tool({
      description:
        'Read the profile currently open in the editor: its kind (horse/party), name, every editable field with its current value, and which fields are still empty. Call this before proposing changes so you target real, empty fields.',
      inputSchema: z.object({}),
    }),
    proposeField: tool({
      description:
        'Draft a value for ONE editable field. It is NOT saved — it appears as a card the member taps "Apply". Use exact field keys from the profile context (e.g. sex, colour, sire, careerRecord, profession). Do not invent facts (registration/microchip numbers, race records) — ask the member instead.',
      inputSchema: z.object({
        field: z.string().describe('Exact field key, e.g. "colour", "sire", "careerRecord", "profession".'),
        value: z.string().describe('The proposed value as a string (dates as YYYY-MM-DD, numbers as digits).'),
        note: z.string().optional().describe('Optional one-line rationale shown to the member.'),
      }),
    }),
    proposeConnection: tool({
      description:
        'HORSE ONLY. Draft a new connection (owner/trainer/jockey/etc.) to a party. Staged for the member to Apply. If the named party does not exist yet it will be created as a provisional (unverified) party when applied.',
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
