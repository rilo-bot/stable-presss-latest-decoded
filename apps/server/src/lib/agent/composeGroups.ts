// Static partition of the 24 bulletin page types into cohesive groups. The
// /compose endpoint fans out one generateObject call PER GROUP so each model
// call emits a bounded slice of the fill plan while the union covers every page.
// Pages are matched to a group by their pageType; anything unknown lands in 'misc'.

export const PAGE_GROUPS: { id: string; label: string; pageTypes: string[] }[] = [
  { id: 'front', label: 'Front matter', pageTypes: ['cover', 'president-update', 'editor-letter', 'important-discussion'] },
  { id: 'features', label: 'Feature stories', pageTypes: ['headline-story', 'young-owners', 'women-in-racing', 'breeder-feature'] },
  { id: 'community', label: 'Regional & community', pageTypes: ['regional-north', 'regional-south', 'owners-lounge', 'celebration-wall'] },
  { id: 'industry', label: 'Sales, future & welfare', pageTypes: ['karaka-sales', 'future-together', 'horse-welfare', 'business-owners'] },
  { id: 'engagement', label: 'Leaderboards & games', pageTypes: ['leaderboards', 'gamification', 'predictions', 'predictions-followup'] },
  { id: 'closing', label: 'Education & closing', pageTypes: ['ownership-education', 'winning-moments', 'owners-voice', 'back-cover'] },
]

const GROUP_OF: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const g of PAGE_GROUPS) for (const t of g.pageTypes) m[t] = g.id
  return m
})()

export interface CatalogPage {
  pageId: string
  pageType: string
  label?: string
  editable?: boolean
  regions: { regionId: string; kind: string; filled?: boolean; name?: string; preview?: string }[]
}

/** Split an incoming page catalog into the static groups (+ a 'misc' bucket). */
export function groupCatalog(pages: CatalogPage[]): { id: string; label: string; pages: CatalogPage[] }[] {
  const byId = new Map<string, CatalogPage[]>()
  for (const p of pages) {
    const gid = GROUP_OF[p.pageType] ?? 'misc'
    const arr = byId.get(gid) ?? []
    arr.push(p)
    byId.set(gid, arr)
  }
  const out = PAGE_GROUPS.filter((g) => byId.has(g.id)).map((g) => ({ id: g.id, label: g.label, pages: byId.get(g.id)! }))
  if (byId.has('misc')) out.push({ id: 'misc', label: 'Other pages', pages: byId.get('misc')! })
  return out
}
