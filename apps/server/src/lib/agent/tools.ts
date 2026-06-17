// ---------------------------------------------------------------------------
// Read-only tools for the Stablehand assistant.
//
// THE KEY INVARIANT: every tool returns ONLY what the calling account is allowed
// to see, by reusing the exact same scope/visibility rules the REST routes use
// (lib/rbac.ts, lib/scope.ts, and each route's GET filter). The assistant can
// therefore never surface data a user couldn't already see by browsing — "full
// read access as per the role" falls out for free, and there is no separate
// permission model to drift. All tools are read-only (Phase 1); no writes.
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { db } from '../db.js'
import { isStaff } from '../rbac.js'
import { authorisedHorseIds, manageablePartyIds, horsesLinkedToParty } from '../scope.js'
import type { AccountUser } from '../identity.js'
import { FEATURE_GUIDES, GUIDE_TOPICS } from './guides.js'
import { getCapabilities } from './capabilities.js'

type Doc = Record<string, any> & { _id?: string; id?: string }

const idOf = (d: Doc): string => String(d._id ?? d.id)
const clamp = (n: number | undefined, def: number, max: number) =>
  Math.min(Math.max(1, Math.floor(n ?? def)), max)
const matches = (hay: unknown, needle: string) =>
  String(hay ?? '').toLowerCase().includes(needle.toLowerCase())

/** Compact horse projection — keeps token use sane. */
function horseCard(h: Doc) {
  return {
    id: idOf(h),
    name: h.isUnnamed ? '(unnamed)' : h.name,
    sex: h.sex,
    colour: h.colour,
    dob: h.dob,
    country: h.country,
    sire: h.sire,
    dam: h.dam,
    careerRecord: h.careerRecord,
    careerWinnings: h.careerWinnings,
    rating: h.rating,
    status: h.verificationStatus,
  }
}

/**
 * Horses this account may see, mirroring routes/horses.ts GET exactly:
 * staff see all; everyone else sees verified horses plus their own
 * created/authorised ones.
 */
async function visibleHorses(account?: AccountUser): Promise<Doc[]> {
  const horses = await db.collection('horses').find()
  if (isStaff(account)) return horses
  let allowed = new Set<string>()
  if (account) {
    const links = await db.collection('horsePartyLinks').find()
    allowed = new Set(authorisedHorseIds(account, { horses, links }))
  }
  return horses.filter(
    (h) =>
      h.verificationStatus !== 'unverified' ||
      (account ? h.createdByUserId === account.id : false) ||
      allowed.has(idOf(h)),
  )
}

/** Parties this account may see, mirroring routes/parties.ts GET exactly. */
async function visibleParties(account?: AccountUser): Promise<Doc[]> {
  const parties = await db.collection('parties').find()
  if (isStaff(account)) return parties
  const own = new Set<string>(account ? manageablePartyIds(account) : [])
  return parties.filter(
    (p) =>
      p.verificationStatus !== 'unverified' ||
      (account ? p.createdByUserId === account.id : false) ||
      own.has(idOf(p)),
  )
}

const LIVE_ARTICLE_STATUSES = ['published', 'newsletter', 'bulletin']
const isLiveArticle = (a: Doc) =>
  LIVE_ARTICLE_STATUSES.includes(String(a.status)) || !!a.publishedAt

// Self-origin for Phase-3 ACTION tools. They proxy to the app's own gated REST
// endpoints (forwarding the caller's Bearer token), so the real route enforces
// RBAC + validation and runs every side effect (horse auto-linking, server-side
// tip crediting). Internal loopback is used so it works in every environment.
const SELF_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001
const SELF_BASE = `http://127.0.0.1:${SELF_PORT}`

export function buildTools(account?: AccountUser, authHeader?: string): ToolSet {
  const staff = isStaff(account)

  // Call one of our own endpoints AS the current user. The route's gate decides
  // if it is allowed — the agent never bypasses a permission check.
  async function selfApi(method: string, path: string, payload?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (authHeader) headers.authorization = authHeader
    const r = await fetch(`${SELF_BASE}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
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

  const canAct = !!account && !!authHeader

  return {
    myAccount: tool({
      description:
        "The signed-in reader's own profile: roles, subscription tier, their racing-role claims (and verification status), organisations, and the horses they can manage (their stable). Use this to personalise guidance. Returns signedIn:false for guests.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!account) {
          return {
            signedIn: false,
            note: 'This reader is a guest. Most personal features unlock with a free account.',
          }
        }
        const parties = await db.collection('parties').find()
        const partyName = (pid: string) =>
          parties.find((p) => idOf(p) === pid)?.name ?? 'a party'
        const links = await db.collection('horsePartyLinks').find()
        const horses = await db.collection('horses').find()
        const stableIds = new Set(authorisedHorseIds(account, { horses, links }))
        return {
          signedIn: true,
          name: account.displayName || account.email,
          roles: account.roles,
          isStaff: staff,
          subscriptionTier: account.subscriptionTier,
          racingClaims: account.partyClaims.map((c) => ({
            party: partyName(c.partyId),
            role: c.role,
            status: c.status,
          })),
          organisations: account.orgMemberships.map((m) => ({
            organisation: partyName(m.orgId),
            role: m.orgRole,
          })),
          stable: horses
            .filter((h) => stableIds.has(idOf(h)))
            .map((h) => ({ id: idOf(h), name: h.isUnnamed ? '(unnamed)' : h.name })),
        }
      },
    }),

    whatCanIDo: tool({
      description:
        "Exactly what the signed-in reader can and cannot do right now, given their roles, claims, subscription and stable. Each capability says whether it is allowed, why not if blocked, and WHERE to do it — plus their stable/party counts. Call this to give precise, role-aware guidance and concrete next steps (it powers the same quick actions as the dashboard). Returns signedIn:false for guests.",
      inputSchema: z.object({}),
      execute: async () => getCapabilities(account),
    }),

    searchHorses: tool({
      description:
        'Search the horse register for horses this reader may view. Optional text query matches name/sire/dam/country. Returns compact horse cards.',
      inputSchema: z.object({
        query: z.string().optional().describe('Free-text search; omit to list recent horses.'),
        limit: z.number().optional().describe('Max results (default 10, max 25).'),
      }),
      execute: async ({ query, limit }) => {
        let horses = await visibleHorses(account)
        if (query) {
          horses = horses.filter(
            (h) =>
              matches(h.name, query) ||
              matches(h.sire, query) ||
              matches(h.dam, query) ||
              matches(h.country, query),
          )
        }
        return {
          count: horses.length,
          horses: horses.slice(0, clamp(limit, 10, 25)).map(horseCard),
        }
      },
    }),

    getHorseDossier: tool({
      description:
        "A horse's full dossier the reader is allowed to see: profile, connections (owners/trainers/etc.), race entries, sales, media, and any reports visible to this reader (private reports only show for staff). Returns notFound if the horse is not visible to them.",
      inputSchema: z.object({ horseId: z.string() }),
      execute: async ({ horseId }) => {
        const horse = (await visibleHorses(account)).find((h) => idOf(h) === horseId)
        if (!horse) {
          return {
            notFound: true,
            note: 'That horse is not in this reader\'s view (it may be unverified or private). Suggest searching the public register, or — if it is their own horse — claiming the matching racing role from the Dashboard.',
          }
        }
        const parties = await visibleParties(account)
        const partyName = (pid: string) => parties.find((p) => idOf(p) === pid)?.name
        const links = (await db.collection('horsePartyLinks').find()).filter(
          (l) => String(l.horse_id) === horseId,
        )
        const reports = (await db.collection('reports').find()).filter(
          (r) => String(r.horse_id) === horseId && (staff || (r.visibility ?? 'public') === 'public'),
        )
        const byHorse = (coll: string) =>
          db.collection(coll).find().then((rows) => rows.filter((r) => String(r.horse_id) === horseId))
        return {
          horse: horseCard(horse),
          connections: links.map((l) => ({
            party: partyName(String(l.party_id)) ?? 'a party',
            relationship: l.relationship_type,
            current: !l.end_date,
          })),
          racingEntries: (await byHorse('racingEntries')).slice(0, 25),
          sales: (await byHorse('sales')).slice(0, 25),
          media: (await byHorse('mediaItems')).slice(0, 25).map((m) => ({ title: m.title, type: m.type, url: m.url })),
          reports: reports.slice(0, 25).map((r) => ({ title: r.title, type: r.doc_type, visibility: r.visibility ?? 'public' })),
        }
      },
    }),

    searchParties: tool({
      description:
        'Search the industry directory of parties (owners, trainers, jockeys, breeders, syndicates, agencies, organisations) the reader may view. Optional text query and role filter.',
      inputSchema: z.object({
        query: z.string().optional(),
        role: z.string().optional().describe('Filter by a racing role, e.g. "trainer".'),
        limit: z.number().optional(),
      }),
      execute: async ({ query, role, limit }) => {
        let parties = await visibleParties(account)
        if (query) parties = parties.filter((p) => matches(p.name, query) || matches(p.base_location, query))
        if (role) parties = parties.filter((p) => Array.isArray(p.roles) && p.roles.some((r: string) => matches(r, role)))
        return {
          count: parties.length,
          parties: parties.slice(0, clamp(limit, 10, 25)).map((p) => ({
            id: idOf(p),
            name: p.name,
            type: p.party_type,
            roles: p.roles,
            location: p.base_location,
            country: p.country,
            since: p.started_year,
          })),
        }
      },
    }),

    getParty: tool({
      description:
        "A party's profile plus the horses they are connected to that this reader can see. Returns notFound if the party is not visible to them.",
      inputSchema: z.object({ partyId: z.string() }),
      execute: async ({ partyId }) => {
        const party = (await visibleParties(account)).find((p) => idOf(p) === partyId)
        if (!party) return { notFound: true }
        const horses = await visibleHorses(account)
        const links = await db.collection('horsePartyLinks').find()
        const connectedIds = new Set(horsesLinkedToParty(partyId, { horses, links }))
        return {
          party: {
            id: idOf(party),
            name: party.name,
            type: party.party_type,
            roles: party.roles,
            profession: party.profession,
            location: party.base_location,
            country: party.country,
            since: party.started_year,
          },
          connectedHorses: horses
            .filter((h) => connectedIds.has(idOf(h)))
            .slice(0, 30)
            .map((h) => ({ id: idOf(h), name: h.isUnnamed ? '(unnamed)' : h.name })),
        }
      },
    }),

    searchArticles: tool({
      description:
        'Search published editorial — news, analysis and interviews. (Staff also see drafts.) Optional text query and category.',
      inputSchema: z.object({
        query: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ query, category, limit }) => {
        let articles = await db.collection('articles').find()
        if (!staff) articles = articles.filter(isLiveArticle)
        if (query) articles = articles.filter((a) => matches(a.title, query) || matches(a.summary, query) || (Array.isArray(a.tags) && a.tags.some((t: string) => matches(t, query))))
        if (category) articles = articles.filter((a) => matches(a.category, category))
        return {
          count: articles.length,
          articles: articles.slice(0, clamp(limit, 10, 25)).map((a) => ({
            id: idOf(a),
            title: a.title,
            summary: a.summary,
            author: a.author,
            category: a.category,
            status: a.status,
            publishedAt: a.publishedAt,
            tags: a.tags,
          })),
        }
      },
    }),

    getArticle: tool({
      description: 'A single article by id (summary + metadata). Returns notFound if it is not published and the reader is not staff.',
      inputSchema: z.object({ articleId: z.string() }),
      execute: async ({ articleId }) => {
        const a = await db.collection('articles').findById(articleId)
        if (!a || (!staff && !isLiveArticle(a))) return { notFound: true }
        return {
          id: idOf(a),
          title: a.title,
          summary: a.summary,
          author: a.author,
          category: a.category,
          status: a.status,
          publishedAt: a.publishedAt,
          readingTime: a.readingTime,
          tags: a.tags,
          linkedHorseIds: a.linkedHorseIds,
        }
      },
    }),

    listRaces: tool({
      description: 'Upcoming and recent races (public race card). Optional status filter (e.g. "upcoming", "open", "results").',
      inputSchema: z.object({ status: z.string().optional(), limit: z.number().optional() }),
      execute: async ({ status, limit }) => {
        let races = await db.collection('races').find()
        if (status) races = races.filter((r) => matches(r.status, status))
        return {
          count: races.length,
          races: races.slice(0, clamp(limit, 12, 30)).map((r) => ({
            id: idOf(r),
            name: r.name,
            venue: r.venue,
            distance: r.distance,
            scheduledAt: r.scheduledAt,
            status: r.status,
            winnerHorseId: r.winnerHorseId,
          })),
        }
      },
    }),

    tippingLeaderboard: tool({
      description: 'The Tipping Ring leaderboard — top tipsters by virtual-coin balance.',
      inputSchema: z.object({ limit: z.number().optional() }),
      execute: async ({ limit }) => {
        const profiles = await db.collection('tipperProfiles').find()
        profiles.sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0))
        return {
          leaderboard: profiles.slice(0, clamp(limit, 10, 25)).map((p, i) => ({
            rank: i + 1,
            tipster: p.displayName,
            balance: p.balance,
            wins: p.wins,
            tips: p.totalTips,
          })),
        }
      },
    }),

    listBulletins: tool({
      description: 'The print Bulletins — published magazine issues (newest first). Staff also see unpublished ones.',
      inputSchema: z.object({ limit: z.number().optional() }),
      execute: async ({ limit }) => {
        let issues = await db.collection('issues').find()
        if (!staff) issues = issues.filter((d) => !d.unpublishedAt)
        issues.sort((a, b) => (String(a.publishedAt) < String(b.publishedAt) ? 1 : -1))
        return {
          count: issues.length,
          bulletins: issues.slice(0, clamp(limit, 10, 25)).map((d) => ({
            id: idOf(d),
            title: d.title,
            edition: d.edition,
            publishedAt: d.publishedAt,
            pageCount: typeof d.pageCount === 'number' ? d.pageCount : Array.isArray(d.pages) ? d.pages.length : 0,
            unpublished: !!d.unpublishedAt,
          })),
        }
      },
    }),

    listPodcasts: tool({
      description: 'Published episodes of The Gallop Podcast. (Staff also see in-production episodes.)',
      inputSchema: z.object({ limit: z.number().optional() }),
      execute: async ({ limit }) => {
        let eps = await db.collection('podcastEpisodes').find()
        if (!staff) eps = eps.filter((e) => e.status === 'published')
        eps.sort((a, b) => (String(a.publishedAt) < String(b.publishedAt) ? 1 : -1))
        return {
          count: eps.length,
          episodes: eps.slice(0, clamp(limit, 10, 25)).map((e) => ({
            id: idOf(e),
            title: e.title,
            host: e.host,
            season: e.season,
            episode: e.episode,
            durationSeconds: e.durationSeconds,
            publishedAt: e.publishedAt,
            status: e.status,
          })),
        }
      },
    }),

    featureGuide: tool({
      description:
        'Accurate step-by-step help on how to use a Stable Press feature. Use this for any "how do I…" question. Pass the closest topic; if unsure pass "overview".',
      inputSchema: z.object({
        topic: z.enum(GUIDE_TOPICS as [string, ...string[]]).describe('The help topic.'),
      }),
      execute: async ({ topic }) => {
        return { topic, guide: FEATURE_GUIDES[topic] ?? FEATURE_GUIDES.overview }
      },
    }),

    // ── ACTION tools (Phase 3) — only for signed-in users. Each PROXIES to the
    // app's own gated endpoint as the user, so the real route enforces RBAC and
    // runs all side effects. Each requires `confirmed:true`, which the assistant
    // must only set after the user explicitly agrees (see the system prompt).
    ...(canAct
      ? {
          registerHorse: tool({
            description:
              'Register a NEW horse for the signed-in member (it becomes theirs and stays hidden from the public until staff verify it). ALWAYS describe what you will do and have the user confirm first; only then call again with confirmed:true.',
            inputSchema: z.object({
              name: z.string().describe("The horse's name."),
              sex: z.string().optional().describe('e.g. colt, filly, mare, gelding, stallion.'),
              confirmed: z.boolean().optional().describe('Set true ONLY after the user has explicitly confirmed.'),
            }),
            execute: async ({ name, sex, confirmed }) => {
              if (!confirmed) {
                return {
                  needsConfirmation: true,
                  willDo: `Register a new horse "${name}"${sex ? ` (${sex})` : ''} under your stable. It stays hidden from the public until staff verify it.`,
                  note: 'Confirm with the user, then call again with confirmed:true.',
                }
              }
              const res = await selfApi('POST', '/api/horses', { name, ...(sex ? { sex } : {}) })
              if (!res.ok) {
                return {
                  ok: false,
                  status: res.status,
                  message:
                    res.status === 401
                      ? 'You may need to sign in again for me to do that.'
                      : "I wasn't able to register that horse just now — but you can always register one from your Dashboard → My Stable, and I can walk you through it.",
                }
              }
              return { ok: true, horse: res.data }
            },
          }),

          createArticleDraft: tool({
            description:
              'Create a new editorial article DRAFT (editorial staff only). ALWAYS confirm the title and summary with the user first; only then call again with confirmed:true.',
            inputSchema: z.object({
              title: z.string(),
              summary: z.string().optional(),
              confirmed: z.boolean().optional(),
            }),
            execute: async ({ title, summary, confirmed }) => {
              if (!confirmed) {
                return {
                  needsConfirmation: true,
                  willDo: `Create a draft story titled "${title}".`,
                  note: 'Confirm with the user, then call again with confirmed:true.',
                }
              }
              const res = await selfApi('POST', '/api/articles', {
                title,
                summary: summary ?? '',
                author: account!.displayName,
                status: 'draft',
              })
              if (!res.ok) {
                return {
                  ok: false,
                  status: res.status,
                  message:
                    res.status === 403
                      ? "Drafting stories is an editorial-staff action, so I can't publish one on this account — but I'd be glad to help you write the piece so it's ready to hand to an editor."
                      : "I couldn't create that draft just now — happy to help you prepare the text instead.",
                }
              }
              return { ok: true, article: res.data }
            },
          }),

          updateMyParty: tool({
            description:
              "Update the signed-in member's OWN party profile (profession, base location, country, started year). ALWAYS confirm the change first; only then call again with confirmed:true.",
            inputSchema: z.object({
              partyId: z.string().optional().describe("Defaults to the user's own party."),
              profession: z.string().optional(),
              base_location: z.string().optional(),
              country_of_birth: z.string().optional(),
              started_year: z.number().optional(),
              confirmed: z.boolean().optional(),
            }),
            execute: async ({ partyId, profession, base_location, country_of_birth, started_year, confirmed }) => {
              const pid = partyId ?? manageablePartyIds(account!)[0]
              if (!pid) {
                return {
                  ok: false,
                  message:
                    "You don't have a party profile yet — claiming a racing role from your Dashboard creates one, and then I can help you fill it in.",
                }
              }
              const updates: Record<string, unknown> = {}
              if (profession !== undefined) updates.profession = profession
              if (base_location !== undefined) updates.base_location = base_location
              if (country_of_birth !== undefined) updates.country_of_birth = country_of_birth
              if (started_year !== undefined) updates.started_year = started_year
              if (Object.keys(updates).length === 0) {
                return { ok: false, message: 'Just let me know which detail to change and I will take care of it.' }
              }
              if (!confirmed) {
                return {
                  needsConfirmation: true,
                  willDo: `Update your party profile — ${Object.entries(updates).map(([k, v]) => `${k.replace(/_/g, ' ')} → ${v}`).join(', ')}.`,
                  note: 'Confirm with the user, then call again with confirmed:true.',
                }
              }
              const res = await selfApi('PUT', `/api/parties/${pid}`, updates)
              if (!res.ok) {
                return {
                  ok: false,
                  status: res.status,
                  message: "I couldn't update that profile — it may not be one you manage. Your own profile is editable from your Dashboard or Profile Studio.",
                }
              }
              return { ok: true, party: res.data }
            },
          }),
        }
      : {}),
  }
}
