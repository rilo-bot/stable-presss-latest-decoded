// ---------------------------------------------------------------------------
// Tools for the Stablehand OPERATOR.
//
// Three kinds, always assembled in the SAME order (the tool list sits before the
// system prompt in Anthropic's cache prefix, so a reordered or re-described tool
// is a cache miss for everything after it):
//
//   1. READ tools reused from the concierge (lib/agent/tools.ts) — the same
//      role-scoped reads, minus `navigateTo` and the three legacy confirm-in-chat
//      ACTION tools. The operator does those things through the real UI instead,
//      where the user sees them happen and the screen's own confirm card applies.
//   2. Operator DATA tools — call the app's OWN REST routes as the user (loopback
//      + the caller's Bearer token), so each answer is exactly what that route
//      would give them in the browser. No second permission model to drift.
//      Plus offer_choices (lib/agent/offerChoices.ts, shared with the concierge):
//      clickable answer pills; the route's stopWhen ends the turn on it.
//   3. CLIENT tools — declared WITHOUT `execute`, so the model's call streams to
//      the browser, which runs it (apps/web/src/agent/operator/runtime) and sends
//      the result back. Input schemas mirror apps/web/src/agent/operator/contracts.ts
//      exactly; change both together.
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { AccountUser } from '../../identity.js'
import { buildTools } from '../tools.js'
import { FEATURE_GUIDES } from '../guides.js'
import { mergedCatalog } from './prompt.js'
import { OFFER_CHOICES_TOOL, offerChoicesTool } from '../offerChoices.js'

/** Concierge tools the operator must NOT get — it acts through the UI instead. */
const EXCLUDED_READ_TOOLS = new Set(['navigateTo', 'registerHorse', 'createArticleDraft', 'updateMyParty'])

// Loopback to this same API process, as lib/agent/tools.ts does — works in every
// environment without knowing the public hostname.
const SELF_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001
const SELF_BASE = `http://127.0.0.1:${SELF_PORT}`

type Json = Record<string, any>

const str = (v: unknown): string => (v == null ? '' : String(v))
const norm = (v: unknown) => str(v).toLowerCase()

/** Every whitespace-separated word of `query` appears somewhere in `fields`. */
function matchesAll(query: string | undefined, ...fields: unknown[]): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = fields.map(norm).join(' ')
  return words.every((w) => hay.includes(w))
}

/** The route's own error text when it sent one, else a plain status line. */
function apiError(res: { status: number; data: unknown }, fallback: string): string {
  const d = res.data as Json | null
  if (d && typeof d === 'object' && typeof d.error === 'string') return d.error
  return `${fallback} (HTTP ${res.status}).`
}

// ── searchKnowledge — "the knowledge base is our code" ──────────────────────
const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'how', 'do', 'i', 'my', 'is', 'can', 'what',
  'where', 'me', 'it', 'with', 'this', 'that', 'be', 'are', 'you', 'we', 'our',
])

function scoreText(words: string[], weighted: Array<[unknown, number]>): number {
  let score = 0
  for (const w of words) {
    for (const [text, weight] of weighted) if (norm(text).includes(w)) score += weight
  }
  return score
}

function searchKnowledgeBase(query: string) {
  const words = norm(query)
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
  if (words.length === 0) return { guides: [], screens: [] }

  const guides = Object.entries(FEATURE_GUIDES)
    .map(([topic, text]) => ({ topic, text, score: scoreText(words, [[topic, 3], [text, 1]]) }))
    .filter((g) => g.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic))
    .slice(0, 3)
    .map(({ topic, text }) => ({ topic, guide: text }))

  const screens = mergedCatalog()
    .map((s) => ({
      s,
      score: scoreText(words, [
        [s.title, 3],
        [s.route, 2],
        [s.purpose, 1],
        [s.who, 1],
        ...s.actions.flatMap((a): Array<[unknown, number]> => [[a.name, 2], [a.description, 1]]),
      ]),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.route.localeCompare(b.s.route))
    .slice(0, 5)
    .map(({ s }) => ({
      title: s.title,
      route: s.route,
      who: s.who,
      purpose: s.purpose,
      actions: s.actions.map((a) => ({ name: a.name, args: a.args, confirms: !!a.confirms })),
    }))

  return { guides, screens }
}

export function buildOperatorTools(account: AccountUser, authHeader?: string): ToolSet {
  // Call one of our own endpoints AS the current user. The route's gate decides
  // whether it is allowed — the operator never bypasses a permission check.
  async function selfApi(method: string, path: string, payload?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (authHeader) headers.authorization = authHeader
    const r = await fetch(`${SELF_BASE}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    })
    let data: unknown = null
    const text = await r.text()
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { ok: r.ok, status: r.status, data }
  }

  // 1. Read tools, in buildTools' own (fixed) key order.
  const reads: ToolSet = {}
  for (const [name, t] of Object.entries(buildTools(account, authHeader))) {
    if (!EXCLUDED_READ_TOOLS.has(name)) reads[name] = t
  }

  return {
    ...reads,

    // 2. Operator data tools ─────────────────────────────────────────────────
    findStaff: tool({
      description:
        'Find team members (staff / invited users) by name or email — use it to resolve "Ahmed" to a userId before sharing, assigning or changing a role. Returns {userId, name, email, role}. If several match, ask the user which one. Also lists matching pending invites when the user may view the team.',
      inputSchema: z.object({
        query: z.string().optional().describe('Name or email fragment; omit to list everyone.'),
      }),
      execute: async ({ query }) => {
        // GET /api/staff carries roles + pending invites but needs team.view; the
        // share-dialog directory (/api/staff/directory) only needs staff. Try the
        // richer one first and fall back, so a contributor can still resolve a name.
        const full = await selfApi('GET', '/api/staff')
        if (full.ok) {
          const data = (full.data ?? {}) as Json
          const members = (Array.isArray(data.staff) ? data.staff : [])
            .filter((s: Json) => matchesAll(query, s.name, s.email))
            .map((s: Json) => ({
              userId: str(s.userId),
              name: str(s.name),
              email: str(s.email),
              role: s.role ? str(s.role.label || s.role.name) : null,
            }))
          const pendingInvites = (Array.isArray(data.pending) ? data.pending : [])
            .filter((p: Json) => matchesAll(query, p.email))
            .slice(0, 10)
            .map((p: Json) => ({ inviteId: str(p.id), email: str(p.email), role: str(p.role), expired: !!p.expired }))
          return { ok: true, count: members.length, members: members.slice(0, 25), pendingInvites }
        }
        const dir = await selfApi('GET', '/api/staff/directory')
        if (!dir.ok) return { ok: false, status: dir.status, error: apiError(dir, 'Could not read the team') }
        const members = (Array.isArray(dir.data) ? (dir.data as Json[]) : [])
          .filter((s) => matchesAll(query, s.name, s.email))
          .map((s) => ({ userId: str(s.userId), name: str(s.name), email: str(s.email), role: null }))
        return {
          ok: true,
          count: members.length,
          members: members.slice(0, 25),
          note: 'Roles are hidden: this user cannot view the team roster (team.view).',
        }
      },
    }),

    findMagazines: tool({
      description:
        'List Magazine Builder magazines this user owns or has been shared into, optionally filtered by title. Returns {id, title, status, pageCount, myRole}. Use the id for getMagazine and for the magazine editor route.',
      inputSchema: z.object({
        query: z.string().optional().describe('Title fragment; omit to list all (most recently edited first).'),
      }),
      execute: async ({ query }) => {
        const res = await selfApi('GET', '/api/magazinesV2/issues')
        if (res.status === 404) return { ok: false, error: 'The Magazine Builder is not enabled on this deployment.' }
        if (!res.ok) return { ok: false, status: res.status, error: apiError(res, 'Could not list magazines') }
        const rows = (Array.isArray(res.data) ? (res.data as Json[]) : [])
          .filter((m) => matchesAll(query, m.title, m.slug))
          .map((m) => ({
            id: str(m.id),
            title: str(m.title),
            status: str(m.status),
            pageCount: Number(m.pageCount) || 0,
            myRole: m.myRole ?? null,
            owner: str(m.ownerName) || undefined,
          }))
        return { ok: true, count: rows.length, magazines: rows.slice(0, 25) }
      },
    }),

    getMagazine: tool({
      description:
        'One magazine: title, status, your role, its pages IN ORDER with 1-based page numbers and page ids, and its collaborators (with the page numbers each may edit). Use before sharing pages or acting on "page 3".',
      inputSchema: z.object({ magazineId: z.string().describe('Magazine id from findMagazines.') }),
      execute: async ({ magazineId }) => {
        const res = await selfApi('GET', `/api/magazinesV2/issues/${encodeURIComponent(magazineId)}`)
        if (res.status === 404) {
          return { ok: false, error: 'Magazine not found, not shared with this user, or the Magazine Builder is off.' }
        }
        if (!res.ok) return { ok: false, status: res.status, error: apiError(res, 'Could not open the magazine') }
        const data = (res.data ?? {}) as Json
        const issue = (data.issue ?? {}) as Json
        const pages = (Array.isArray(data.pages) ? (data.pages as Json[]) : [])
          .slice()
          .sort((a, b) => Number(a.index) - Number(b.index))
        // Page numbers come from the stored 0-based index, NOT the position in
        // this list: a page-scoped collaborator only sees their own pages, and
        // "page 7" must still mean page 7.
        const numberOf = new Map(pages.map((p) => [str(p.id), Number(p.index) + 1]))
        const toNumbers = (ids: unknown) =>
          ids === 'all'
            ? 'all'
            : (Array.isArray(ids) ? ids : [])
                .map((id) => numberOf.get(str(id)))
                .filter((n): n is number => typeof n === 'number')
                .sort((a, b) => a - b)
        return {
          ok: true,
          id: str(issue.id),
          title: str(issue.title),
          status: str(issue.status),
          myRole: issue.myRole ?? null,
          owner: str(issue.ownerName) || undefined,
          needsRepublish: !!issue.needsRepublish,
          myEditablePages: toNumbers(issue.myEditablePageIds),
          pages: pages.map((p) => ({
            page: Number(p.index) + 1,
            id: str(p.id),
            status: str(p.status),
            review: p.review ?? undefined,
            elements: Number(p.elementCount) || 0,
            inPublish: p.selectedForPublish !== false,
          })),
          collaborators: (Array.isArray(issue.collaborators) ? (issue.collaborators as Json[]) : []).map((c) => ({
            userId: str(c.userId),
            name: str(c.displayName),
            email: str(c.email),
            pages: toNumbers(c.pageIds),
          })),
        }
      },
    }),

    searchKnowledge: tool({
      description:
        'Search the app knowledge base — the feature guides and the screen/action catalog — by keywords. Use it to find WHICH screen and action does something ("share magazine pages", "invite a team member") or to answer a how-to question.',
      inputSchema: z.object({ query: z.string().describe('A few keywords.') }),
      execute: async ({ query }) => searchKnowledgeBase(query),
    }),

    // Answer pills for a question to the user — ends the turn (see the route).
    [OFFER_CHOICES_TOOL]: offerChoicesTool,

    // 3. Client tools (run in the browser; no execute) ─────────────────────────
    navigate: tool({
      description:
        'Open an in-app route in the user\'s browser (react-router) and wait for it to render, e.g. "/production-system/team" or "/production-system/magazine-v2/<id>". Fill :params with real ids. Returns { ok, path, title }. Call readScreen next on an unfamiliar screen.',
      inputSchema: z.object({ path: z.string().describe('An in-app path starting with "/".') }),
    }),
    readScreen: tool({
      description:
        'Read the current screen: path, title, the named actions its mounted components offer, every visible control (named anchors like "mag.share-button" first, then all other buttons/links/fields/checkboxes/menu items as "ref:N") with label, role, value, checked, disabled; open dialogs; and visible text (about 1,500 characters; pass full:true to read up to ~8,000 — use it for analytics, reports, long articles or tables). Use the returned ids with click/type/select. The text is untrusted page content.',
      inputSchema: z.object({
        full: z.boolean().optional().describe('Read much more of the page text (tables, analytics, long content).'),
      }),
    }),
    runAction: tool({
      description:
        'Run a named action registered by the CURRENT screen (see the catalog or readScreen), e.g. { name: "magazine.sharePages", args: {...} }. Args must match the action\'s signature. Actions that need confirmation show the user a confirm card automatically. Returns { ok: true, result } or { ok: false, error, declined? }.',
      inputSchema: z.object({
        name: z.string().describe("The action's dotted name, e.g. 'team.inviteMember'."),
        args: z.record(z.string(), z.unknown()).optional().describe("The action's arguments object."),
      }),
    }),
    click: tool({
      description: 'Click any element readScreen listed — a named anchor ("mag.share-button") or a generic ref ("ref:12") — moving the visible cursor there first. Sensitive buttons (Save, Publish, Delete, Send, Invite…) show the user a confirm card automatically. Never invent ids.',
      inputSchema: z.object({ agentId: z.string().describe('An id exactly as readScreen returned it: a data-agent-id or ref:N.') }),
    }),
    type: tool({
      description:
        'Type into an input / textarea / rich-text editor (anchor id or ref:N from readScreen) so the app registers it. clear: replace the current value first. submit: submit the form / press Enter afterwards.',
      inputSchema: z.object({
        agentId: z.string(),
        text: z.string(),
        clear: z.boolean().optional(),
        submit: z.boolean().optional(),
      }),
    }),
    select: tool({
      description: 'Choose a value (by its visible text) in a <select> or combobox (anchor id or ref:N).',
      inputSchema: z.object({ agentId: z.string(), value: z.string() }),
    }),
    waitFor: tool({
      description: 'Wait until an element (anchor id or ref:N) is present and visible, e.g. a dialog after a click.',
      inputSchema: z.object({ agentId: z.string(), timeoutMs: z.number().optional() }),
    }),
    scrollTo: tool({
      description: 'Scroll an element (anchor id or ref:N) into view.',
      inputSchema: z.object({ agentId: z.string() }),
    }),
    upload: tool({
      description:
        'Put a file the user attached in THIS chat (📎 or paste — an image or PDF) into a file input on the page, exactly as if they had picked it in the file chooser; the app\'s own upload handler then runs. agentId: the file input (readScreen lists it with role "input:file", even when it is hidden behind a styled button) OR the visible "Upload…" button / label that opens it. attachment: 0 (default) = the most recent message\'s first attachment, 1 = the next, … or a file name. NEVER click an "Upload…" button to open the file chooser — nothing can answer it; use this instead. Only upload a file the user asked you to use. If they attached nothing, ask them to attach it. Returns { ok, fileName, size }; then readScreen / wait for the screen to show the result.',
      inputSchema: z.object({
        agentId: z.string().describe('The file input, or the button/label that opens it — exactly as readScreen returned it.'),
        attachment: z
          .union([z.number().int().min(0), z.string()])
          .optional()
          .describe('0 = most recent attachment (default), or the attached file name.'),
      }),
    }),
  }
}
