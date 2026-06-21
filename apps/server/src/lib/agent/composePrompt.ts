// Schema + system prompt for the bulk "compose" pass: map an uploaded document's
// content onto as many real bulletin regions as it faithfully supports. One call
// runs per page-group (see composeGroups.ts); the model may ONLY target region
// ids present in the group it's given, and must never invent content.

import { z } from 'zod'

export const ComposeSchema = z.object({
  plan: z
    .array(
      z.object({
        pageId: z.string().describe('A pageId from the provided list — never invent one.'),
        regionId: z.string().describe('A regionId from that page — never invent one.'),
        kind: z.enum(['text', 'qr', 'icon']).describe('text fills copy; qr sets a scan target; icon sets a best-guess glyph. (Photos are out of scope here.)'),
        html: z.string().optional().describe('For kind=text: light inline HTML (<b><i><u><br>). Faithful to the source.'),
        targetUrl: z.string().optional().describe('For kind=qr: an https: or mailto: URL that appears in the source.'),
        iconName: z.string().optional().describe('For kind=icon: a Lucide icon NAME in PascalCase, e.g. "Trophy", "Mail", "Award".'),
        reason: z.string().describe('The document fact/section this came from (keeps the fill honest).'),
      }),
    )
    .describe('Every region you can faithfully fill from the document, for the pages provided.'),
  coverageNote: z.string().describe('One sentence: how much of these pages the document could cover.'),
  unplacedFacts: z.array(z.string()).describe('Notable document facts that did not fit any provided region.'),
})

export type ComposePlan = z.infer<typeof ComposeSchema>

export const COMPOSE_SYSTEM =
  'You are laying out a magazine editor\'s uploaded document into a fixed-template bulletin. You are given the FULL ' +
  'document text and a list of pages, each with its editable regions (regionId, kind, semantic name, and the current ' +
  'placeholder content). Your job: place the document\'s real content into as MANY of the given regions as it ' +
  'faithfully supports — overwriting the placeholder copy where the document has better, real content.\n\n' +
  'RULES (strict):\n' +
  '- Write ALL placed content in ENGLISH. If the document is in another language, translate its meaning into natural ' +
  'English; keep proper names, numbers, dates, results and URLs exactly as written.\n' +
  '- Use ONLY the pageId + regionId values provided. NEVER invent ids; if unsure, skip.\n' +
  '- Match the region\'s semantic name/role (e.g. a headline region gets a headline, a body region gets body copy, a ' +
  'stat region gets a number/figure). Keep names, figures, dates and results faithful to the document (in English).\n' +
  '- NEVER invent, infer or pad content to fill a region. If the document has nothing suitable for a region, leave it ' +
  'out of the plan. It is correct to fill only some regions.\n' +
  '- kind=text → concise light inline HTML only. kind=qr → only an https: or mailto: URL that literally appears in the ' +
  'document; otherwise do not propose a QR. Do NOT propose photo/image fills.\n' +
  '- kind=icon → ONLY when the source clearly shows an icon/symbol at that spot: give a best-guess Lucide icon name ' +
  '(PascalCase, e.g. Trophy, Mail, Award, Users, Globe, Star) in iconName. The detected icons are listed in the ' +
  'document block; map each to the closest matching icon region. Never invent decorative icons.\n' +
  '- Prefer headlines, intros, body copy, stats, captions and list items. Spread coverage across all the pages given.\n' +
  '- Put anything important that does not fit into unplacedFacts.'
