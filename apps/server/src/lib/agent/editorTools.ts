// ---------------------------------------------------------------------------
// Tools for the in-editor "Studio Assistant".
//
// The magazine DRAFT lives CLIENT-SIDE (Zustand + IndexedDB) until publish, so
// the editor's read/write tools are declared here WITHOUT an `execute`: the AI
// SDK streams the model's tool calls to the browser, which runs them against
// magazineStore and returns results via addToolResult. The browser side lives in
// apps/web/src/editor/agent/editOpsExecutor.ts.
//
// Grounding tools (searchHorses/searchArticles/getHorseDossier) DO run on the
// server — reused verbatim from the public assistant's tools.ts, with the same
// RBAC scoping — so generated copy can cite real horses/stories.
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { AccountUser } from '../identity.js'
import { buildTools } from './tools.js'

const pageRef = {
  pageId: z
    .string()
    .optional()
    .describe('Target page id. Omit to use the page the editor is currently viewing.'),
}

// A region can be addressed by its machine id ("cover.hero") OR its friendly
// display name ("Hero photo") — whichever the user used. getPage/pageCatalog
// return both so you can pass either.
const regionRef = z
  .string()
  .describe('The region\'s id (e.g. "cover.hero") OR its friendly name (e.g. "Hero photo"). Use the name the user said.')

// Force a write to be STAGED for review (Apply/Discard) instead of auto-applying
// into an empty region. REQUIRED for any content drawn from an uploaded document.
const reviewFlag = {
  review: z
    .boolean()
    .optional()
    .describe('Stage this for the user to review instead of auto-applying. Set true for content from an uploaded document.'),
}

const styleShape = z.object({
  fontSize: z.number().optional(),
  fontWeight: z.number().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: z.string().optional().describe('hex, e.g. #0a2342'),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
})

export function buildEditorTools(account?: AccountUser): ToolSet {
  // Reuse the public assistant's server-executed read tools for grounding.
  const base = buildTools(account)
  const grounding: ToolSet = {}
  for (const k of ['searchHorses', 'searchArticles', 'getHorseDossier'] as const) {
    const t = base[k]
    if (t) grounding[k] = t
  }

  // Client-executed (no `execute`): resolved in the browser via onToolCall.
  const client: ToolSet = {
    // ── reads ──
    getMagazine: tool({
      description:
        'Get the open magazine: title, edition, status, your role, and a per-page index (each page id, type, label, number, filled-region count, and whether you can edit it).',
      inputSchema: z.object({}),
    }),
    getPage: tool({
      description:
        'Get the full region map of a page (defaults to the current page): every region with its friendly NAME, id, kind (text/image/qr/icon), whether it is filled, and a short content preview. Use the names to match what the user says.',
      inputSchema: z.object({ ...pageRef }),
    }),
    getRegion: tool({
      description: 'Get one region (by id or friendly name): its name, kind, current content, and whether it is filled.',
      inputSchema: z.object({ ...pageRef, regionId: regionRef }),
    }),
    listTemplates: tool({
      description: 'List every magazine page TYPE with its human label, so you know which pages exist.',
      inputSchema: z.object({}),
    }),
    pageCatalog: tool({
      description:
        'Get the region catalog for a page TYPE: every region id, friendly name and kind it supports. Use this to learn exactly what can go on a page before proposing edits — never invent region ids or names.',
      inputSchema: z.object({ pageType: z.string() }),
    }),
    suggestImageOptions: tool({
      description:
        'Get a few on-brand stock photo candidates (name + url) matching a keyword, to fill an image region. Present them to the user and let them choose before you call setRegionImage. Never invent image URLs.',
      inputSchema: z.object({ query: z.string().optional() }),
    }),

    // ── writes (empty regions auto-apply; overwrites/style/clear/batches are staged for the user to Apply) ──
    setRegionText: tool({
      description:
        'Set a text region. Provide light inline HTML (<b><i><u><s><br><span>); it is sanitized. Filling an EMPTY region applies instantly; overwriting filled text is staged for the user to approve. Pass review:true (always, for content from an uploaded document) to stage it for review even when the region is empty.',
      inputSchema: z.object({ ...pageRef, regionId: regionRef, html: z.string(), ...reviewFlag }),
    }),
    setRegionImage: tool({
      description:
        'Set an image region (addressed by its friendly photo NAME or id) to a known/approved image URL (e.g. one returned by suggestImageOptions). Never invent URLs.',
      inputSchema: z.object({
        ...pageRef,
        regionId: regionRef,
        src: z.string(),
        fit: z.enum(['cover', 'contain']).optional(),
        alt: z.string().optional(),
        ...reviewFlag,
      }),
    }),
    setRegionQr: tool({
      description: 'Set a QR region\'s target. Only https: or mailto: URLs are allowed.',
      inputSchema: z.object({ ...pageRef, regionId: regionRef, targetUrl: z.string(), fg: z.string().optional(), ...reviewFlag }),
    }),
    setRegionIcon: tool({
      description:
        'Set an icon region to a best-guess Lucide glyph by NAME (PascalCase, e.g. Trophy, Star, Mail, Award, Users, Globe, Crown, Medal, Heart, Calendar). Use this when an uploaded PDF/image clearly shows an icon/symbol at that spot — place the closest matching glyph; the placed icon is a PLACEHOLDER the user can click to upload their own. Pass review:true for content drawn from an uploaded document.',
      inputSchema: z.object({
        ...pageRef,
        regionId: regionRef,
        name: z.string().describe('A Lucide icon name in PascalCase, e.g. "Trophy".'),
        color: z.string().optional().describe('hex tint, e.g. #0a2342'),
        ...reviewFlag,
      }),
    }),
    patchRegionStyle: tool({
      description:
        'Adjust a text region\'s style. Always staged for the user to approve before it changes the layout.',
      inputSchema: z.object({ ...pageRef, regionId: regionRef, style: styleShape }),
    }),
    applyPageFill: tool({
      description:
        'Fill several regions on one page at once. Provide an array of edits; the whole batch is staged as one card for the user to review and Apply.',
      inputSchema: z.object({
        ...pageRef,
        edits: z.array(
          z.object({
            regionId: regionRef,
            kind: z.enum(['text', 'image', 'qr', 'icon']),
            html: z.string().optional(),
            src: z.string().optional(),
            targetUrl: z.string().optional(),
            name: z.string().optional().describe('For kind=icon: a Lucide icon name (PascalCase), e.g. "Trophy".'),
          }),
        ),
      }),
    }),
    clearRegion: tool({
      description: 'Clear a region\'s content (by id or friendly name). Always staged for approval.',
      inputSchema: z.object({ ...pageRef, regionId: regionRef }),
    }),
    setPageSelected: tool({
      description: 'Include or exclude a page from the published edition.',
      inputSchema: z.object({ ...pageRef, selected: z.boolean() }),
    }),
    undoLastEdit: tool({
      description: 'Undo the most recent AI-applied edit.',
      inputSchema: z.object({}),
    }),
    fillMagazineFromDocument: tool({
      description:
        "Bulk-fill the bulletin from the user's uploaded document(s). Call this when the user wants their uploaded " +
        'document laid out / placed / used to fill the magazine (not for a single region). It reads the full document ' +
        'text and proposes content for as many pages and regions as the document faithfully supports, staged per page ' +
        'for the user to review and Apply. Pass the user\'s instruction so placement can be steered. Returns a summary ' +
        '(pages touched, regions staged, coverage note, anything that did not fit). After it runs, summarise the result ' +
        'warmly and point the user to the Review & apply cards.',
      inputSchema: z.object({ instruction: z.string().optional() }),
    }),
  }

  return { ...client, ...grounding }
}
