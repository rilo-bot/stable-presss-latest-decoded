// ---------------------------------------------------------------------------
// Operator ACTION CATALOG — the site map the model reads (in its cached system
// prompt). One file per pack (core, magazine, stories, team, registers, blog,
// profile), each exporting `SURFACES: CatalogSurface[]`.
//
// Every `actions[].name` MUST equal a name the web app registers with
// useAgentAction() (apps/web/src/agent/operator/runtime) on the screen at
// `route`, and `args` must describe the SAME shape its zod schema accepts.
// The catalog never grants anything — the REST routes still enforce RBAC.
//
// Keep it deterministic (no dates, no env-dependent ordering) so the prompt
// prefix stays byte-identical and prompt caching works.
// ---------------------------------------------------------------------------

export interface CatalogAction {
  /** '<pack>.<verb>', e.g. 'magazine.sharePages'. */
  name: string
  /** What it does + when to use it, one or two sentences. */
  description: string
  /** TS-like arg signature, e.g. '{ userId: string; pages: number[] }'. '{}' if none. */
  args: string
  /** True when the browser will ask the user to confirm before running. */
  confirms?: boolean
}

export interface CatalogSurface {
  /** Stable id, e.g. 'magazine-editor'. */
  id: string
  title: string
  /** Route pattern, e.g. '/production-system/magazine-v2/:id'. */
  route: string
  /** Who can open it (plain words, e.g. 'staff with Magazine view'). */
  who: string
  /** What this screen is for, 1-3 sentences. */
  purpose: string
  /** Named actions available WHILE this screen is open (call via runAction). */
  actions: CatalogAction[]
  /** Useful data-agent-id anchors on this screen for click/type fallbacks. */
  anchors?: string[]
}
