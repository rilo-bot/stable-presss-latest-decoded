// Bulk "compose" pass: map uploaded document(s) onto as many real bulletin
// regions as the content faithfully supports. Pages are split into groups
// (composeGroups.ts) and one generateObject call runs PER GROUP via
// Promise.allSettled — so each call's output stays bounded, the union covers
// every page, and one slow/oversized group can't sink the whole fill.

import { generateObject } from 'ai'
import { getAgentModel } from './provider.js'
import { ComposeSchema, COMPOSE_SYSTEM, type ComposePlan } from './composePrompt.js'
import { groupCatalog, type CatalogPage } from './composeGroups.js'

export interface ComposeSource { name: string; text: string }
export interface ComposeResult {
  plan: ComposePlan['plan']
  coverageNote: string
  unplacedFacts: string[]
  groupsOk: number
  groupsFailed: number
}

const SOURCE_CHARS = 60_000
const GROUP_ABORT_MS = 90_000

function sourcesBlock(sources: ComposeSource[]): string {
  return sources
    .map((s, i) => `### Document ${i + 1}: ${s.name || 'document'}\n${(s.text || '').slice(0, SOURCE_CHARS)}`)
    .join('\n\n')
}

function pagesBlock(pages: CatalogPage[]): string {
  return pages
    .map((p) => {
      const regions = p.regions
        .filter((r) => r.kind === 'text' || r.kind === 'qr')
        .map((r) => `    - ${r.regionId} [${r.kind}${r.name ? ` · ${r.name}` : ''}]${r.preview ? ` current: "${r.preview}"` : ''}`)
        .join('\n')
      return `Page ${p.pageId} — type ${p.pageType}${p.label ? ` (${p.label})` : ''}:\n${regions}`
    })
    .join('\n\n')
}

export async function composeFromDocuments(opts: {
  userPrompt: string
  sources: ComposeSource[]
  pages: CatalogPage[]
}): Promise<ComposeResult> {
  // Only editable pages that actually have text/qr regions.
  const usable = opts.pages.filter(
    (p) => p.editable !== false && p.regions.some((r) => r.kind === 'text' || r.kind === 'qr'),
  )
  const groups = groupCatalog(usable)
  const src = sourcesBlock(opts.sources)
  const instruction = opts.userPrompt?.trim() ? `Editor's instruction: ${opts.userPrompt.trim()}\n\n` : ''

  const settled = await Promise.allSettled(
    groups.map((g) =>
      generateObject({
        model: getAgentModel(),
        schema: ComposeSchema,
        system: COMPOSE_SYSTEM,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(GROUP_ABORT_MS),
        prompt:
          `${instruction}--- DOCUMENT(S) ---\n${src}\n\n--- PAGES TO FILL (group: ${g.label}) ---\n${pagesBlock(g.pages)}\n\n` +
          `Place the document's real content into as many of these regions as it faithfully supports. Use only the listed pageId/regionId values.`,
      }).then((r) => r.object),
    ),
  )

  // Build the legal-target lookup so we can drop any hallucinated id/kind.
  const allow = new Map<string, string>()
  for (const p of usable) for (const r of p.regions) allow.set(`${p.pageId}::${r.regionId}`, r.kind)

  const seen = new Set<string>()
  const plan: ComposePlan['plan'] = []
  const unplaced: string[] = []
  const notes: string[] = []
  let groupsOk = 0
  let groupsFailed = 0

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    if (s.status !== 'fulfilled') {
      groupsFailed++
      console.warn(`[compose] group "${groups[i].id}" failed:`, s.reason instanceof Error ? s.reason.message : s.reason)
      continue
    }
    groupsOk++
    if (s.value.coverageNote) notes.push(`${groups[i].label}: ${s.value.coverageNote}`)
    if (Array.isArray(s.value.unplacedFacts)) unplaced.push(...s.value.unplacedFacts)
    for (const e of s.value.plan ?? []) {
      const key = `${e.pageId}::${e.regionId}`
      const kind = allow.get(key)
      if (!kind || kind !== e.kind || seen.has(key)) continue
      if (e.kind === 'text' && !(e.html && e.html.trim())) continue
      if (e.kind === 'qr') {
        const u = (e.targetUrl || '').trim()
        if (!/^https:\/\//i.test(u) && !/^mailto:/i.test(u)) continue
      }
      seen.add(key)
      plan.push(e)
    }
  }

  return { plan, coverageNote: notes.join(' '), unplacedFacts: unplaced.slice(0, 25), groupsOk, groupsFailed }
}
