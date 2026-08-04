// ---------------------------------------------------------------------------
// Tools for the "Blog Studio" assistant.
//
// EVERY tool here is CLIENT-EXECUTED — declared without `execute`. That is not a
// style choice, it is the security model: the browser runs each one through
// `useBlogStore` (apps/web/src/agent/blog/blogToolExecutor.ts), which calls the
// REST endpoints behind `blogsWriteGate`. So `blog.create`, `blog.edit_own`,
// `blog.edit_any`, `blog.publish` and `blog.delete` are still enforced by the
// server that owns them, and a model that decides to delete a post it was not
// allowed to touch simply gets a 403 back as a tool result. Same rationale as
// articleTools.ts.
//
// THE BODY IS NEVER A `Block[]`. The model reads and writes a flat `BodyItem[]`
// (paragraph / heading / list / quote) and the browser assembles real blocks from
// it with the composer's own factories — the seam Instant Capture established in
// apps/web/src/pages/instant/buildBlocks.ts. Handing a model the block model
// means asking it to mint UUIDs and `placement` objects correctly every call, and
// `normaliseBlocks` DROPS what it cannot validate, so the failure mode is an
// author's writing disappearing on save. See docs/BLOG-AI-STUDIO-PLAN.md §2.
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { AccountUser } from '../identity.js'
import { BodyItemSchema } from './instantPrompt.js'
import { isStockConfigured, searchStockPhotos } from '../stock.js'
import { buildTools } from './tools.js'

const TIERS = ['free', 'standard', 'premium'] as const

/**
 * The record-lookup tools the Blog Studio borrows from the general agent.
 *
 * These are the whole reason a post can be about THIS website rather than about
 * thoroughbred racing in general. They are server-executed against the real
 * collections and already scoped per reader — `visibleHorses(account)`,
 * `visibleParties(account)`, drafts only for staff — so borrowing them means the
 * assistant writes from the actual register and cannot see records the signed-in
 * user could not see themselves.
 *
 * Composed, not reimplemented: a second copy of "which horses may this account
 * see" is a second copy that can be wrong, and this one is already right.
 */
const LOOKUP_TOOLS = [
  'searchHorses',
  'getHorseDossier',
  'searchParties',
  'getParty',
  'searchArticles',
  'getArticle',
  'listRaces',
] as const

function groundingTools(account?: AccountUser, authHeader?: string): ToolSet {
  const all = buildTools(account, authHeader)
  const picked: ToolSet = {}
  for (const name of LOOKUP_TOOLS) {
    const found = all[name]
    if (found) picked[name] = found
  }
  return picked
}

/** The body, as the model sees it both ways. Imported, not restated, so the two
 *  agents that speak this shape cannot drift apart. */
const BodySchema = z
  .array(BodyItemSchema)
  .describe(
    'The post body in reading order: paragraphs, plus headings and lists where they genuinely help. Plain text only — no markdown.',
  )

export function buildBlogTools(account?: AccountUser, authHeader?: string): ToolSet {
  return {
    // Read the register first, write second — see LOOKUP_TOOLS above.
    ...groundingTools(account, authHeader),

    listBlogPosts: tool({
      description:
        'List the blog posts on file, newest-edited first. Also shows the user a scrollable reference list on screen, so you can then talk about posts by name. Returns { posts: [{ id, title, slug, status, category, updatedAt }], total }.',
      inputSchema: z.object({
        status: z
          .enum(['draft', 'published'])
          .optional()
          .describe('Narrow to just drafts or just published posts. Omit for everything.'),
        q: z.string().optional().describe('Optional search text, matched against title, standfirst and excerpt.'),
      }),
    }),

    openBlogPost: tool({
      description:
        'Read one post in full so you can talk about or revise what is actually there. Call this BEFORE any edit — never guess at existing copy. Returns the post fields plus `body` as body items, and `visuals` describing any images/galleries/embeds/cards it holds (which you cannot author, but which are preserved through an edit).',
      inputSchema: z.object({
        id: z.string().describe('The post id, from listBlogPosts.'),
      }),
    }),

    createBlogDraft: tool({
      description:
        'File a new post as a DRAFT and open it for the user. The byline (signed-in member), reading time, slug and excerpt fallback are all applied automatically, and any photo the user attached with the image button becomes the cover. Never publishes. Returns { ok, id }.',
      inputSchema: z.object({
        title: z.string().describe('The approved title.'),
        subtitle: z.string().optional().describe('An optional one-sentence standfirst.'),
        excerpt: z.string().optional().describe('One or two sentences for cards. Derived from the opening if omitted.'),
        body: BodySchema,
        category: z.string().optional().describe('A short section label, e.g. "Bloodstock", "Racing", "Opinion".'),
        tags: z.array(z.string()).optional().describe('Two to six lowercase topic tags.'),
        minTier: z.enum(TIERS).describe('Who can read it: the tier the user chose.'),
        metaTitle: z
          .string()
          .optional()
          .describe(
            'Search/browser-tab title, ≤60 chars. Set this when the headline is long, allusive or only makes sense in context — a tab reading "A Reckoning At Widden" tells a reader nothing. Omit to use the title.',
          ),
        metaDescription: z
          .string()
          .optional()
          .describe(
            'Search-result and link-preview summary, 120–160 chars, written to make someone click. Not a copy of the excerpt unless the excerpt already does that job.',
          ),
      }),
    }),

    updateBlogPost: tool({
      description:
        'Change a post\'s DETAILS — not its body. Only pass the fields you are changing; anything omitted is left exactly as it is. Use replaceBlogBody for the writing itself. Returns { ok }.',
      inputSchema: z.object({
        id: z.string().describe('The post id.'),
        title: z.string().optional(),
        subtitle: z.string().optional(),
        excerpt: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional().describe('The COMPLETE new tag list — it replaces the old one.'),
        minTier: z.enum(TIERS).optional(),
        metaTitle: z.string().optional().describe('Search/browser-tab title, ≤60 chars. Pass an empty string to clear it.'),
        metaDescription: z
          .string()
          .optional()
          .describe('Search-result and link-preview summary, 120–160 chars. Pass an empty string to clear it.'),
      }),
    }),

    replaceBlogBody: tool({
      description:
        'Replace a post\'s entire body with new body items. This overwrites the writing, so call openBlogPost first and only do it once the user has approved the new text. Images, galleries and cards already in the post are KEPT and re-anchored to roughly where they were — tell the user to check the photo positions afterwards. On a PUBLISHED post the user is asked to confirm before it applies. Returns { ok, movedVisuals }.',
      inputSchema: z.object({
        id: z.string().describe('The post id.'),
        body: BodySchema,
      }),
    }),

    // ── Editor commands ─────────────────────────────────────────────────────
    //
    // These act on the post OPEN IN THE EDITOR, through the composer's own state
    // rather than a whole-post save: the edit appears instantly, Ctrl+Z takes it
    // back like any other editing step, and unsaved typing is not overwritten.
    // The autosave still carries everything through PUT /api/blogs/:id, so the
    // RBAC gate and the block validator are exactly as they were.
    //
    // Each one takes the post `id` even though the editor already knows it: the
    // author can switch posts mid-conversation, and a command that silently
    // retargeted would edit the wrong piece of writing.
    setBlogField: tool({
      description:
        'Set ONE input on the post open in the editor. `field` must be an id from the editor field list you were given (`title`, `subtitle`, `excerpt`, `category`, `tags`, `byline`, `tier`, `seo.metaTitle`, `seo.metaDescription`, `cover`, `thumbnail`, `part:<id>.title`, `media:<id>.alt`). Values are plain text: tags comma-separated, `tier` one of free/standard/premium, `cover`/`thumbnail` the id of a photo ALREADY attached to the post. Body writing is NOT settable here — use insertBlogContent / replaceBlogSelection so it goes in as real blocks. Returns { ok, changed } or { ok: false, error }.',
      inputSchema: z.object({
        id: z.string().describe('The post id — must be the one open in the editor.'),
        field: z.string().describe('A field id from the editor field list.'),
        value: z.string().describe('The new value as plain text. An empty string clears an optional field.'),
      }),
    }),

    insertBlogContent: tool({
      description:
        'Add body items to the post open in the editor WITHOUT touching what is already there. This is how "add this here" works. `where`: "selection" puts it straight after whatever the author has clicked (a paragraph, or the end of a selected part) — that is the default and the one to use when they say "here"; "end"/"start" are the ends of the main body; "part" appends to the part named by `partId`. Show the user the text and get approval first. Returns { ok, changed }.',
      inputSchema: z.object({
        id: z.string().describe('The post id — must be the one open in the editor.'),
        where: z
          .enum(['selection', 'end', 'start', 'part'])
          .describe('Where it goes. Use "selection" when the user says "here".'),
        partId: z.string().optional().describe('Required only when `where` is "part".'),
        body: BodySchema,
      }),
    }),

    replaceBlogSelection: tool({
      description:
        'Rewrite exactly what the author has selected in the editor — the clicked paragraph, or the body of the selected part. Nothing else in the post changes, which makes this the right tool for "tighten this bit" and the wrong one for a whole-post rewrite (use replaceBlogBody for that). If nothing is selected it comes back refused: ask the user to click the passage they mean rather than guessing. Returns { ok, changed }.',
      inputSchema: z.object({
        id: z.string().describe('The post id — must be the one open in the editor.'),
        body: BodySchema,
      }),
    }),

    // ── Parts ("sub-blogs") ─────────────────────────────────────────────────
    //
    // A part is a titled sub-section shown after the body, with its OWN reader
    // reaction scale — so the choice to make something a part rather than a
    // heading is editorial: it is a section readers are asked to respond to
    // separately. See docs/BLOG-SYSTEM-PLAN.md §10.
    addBlogPart: tool({
      description:
        'Add a titled part ("sub-blog") to the post open in the editor: a section shown after the main body WITH ITS OWN reader reaction scale, so readers can respond to it separately. Because of that scale, only make something a part when the user asks for one or agrees to it — do not convert ordinary sections into parts on your own initiative. Maximum 20 per post. Returns { ok, changed }.',
      inputSchema: z.object({
        id: z.string().describe('The post id — must be the one open in the editor.'),
        title: z.string().describe('The part\'s heading. Short, and specific to the section.'),
        body: BodySchema.optional().describe('The part\'s writing. Omit to add an empty part for the user to fill in.'),
      }),
    }),

    updateBlogPart: tool({
      description:
        'Retitle a part, rewrite its body, or both. Pass only what changes. A part cannot be given an empty body — remove it instead if it is not wanted. Returns { ok, changed }.',
      inputSchema: z.object({
        id: z.string().describe('The post id — must be the one open in the editor.'),
        partId: z.string().describe('The part id, from the editor parts outline.'),
        title: z.string().optional(),
        body: BodySchema.optional(),
      }),
    }),

    moveBlogPart: tool({
      description: 'Move a part one place up or down in the running order. Returns { ok, changed }.',
      inputSchema: z.object({
        id: z.string().describe('The post id — must be the one open in the editor.'),
        partId: z.string().describe('The part id, from the editor parts outline.'),
        direction: z.enum(['up', 'down']),
      }),
    }),

    removeBlogPart: tool({
      description:
        'Delete a part and its writing. The user is shown a confirmation they must click, so do not ask in chat as well — call it and report what came back, including { cancelled: true } if they declined. Any reader reactions recorded against that part go with it. Returns { ok, changed }.',
      inputSchema: z.object({
        id: z.string().describe('The post id — must be the one open in the editor.'),
        partId: z.string().describe('The part id, from the editor parts outline.'),
      }),
    }),

    setBlogPublished: tool({
      description:
        'Put a post live, or take it back down. Publishing requires a title and some content, and the original publish date is never rewritten by a republish. Only ever call this when the user has explicitly asked for it — never as a follow-up to writing or editing. Returns { ok, status }.',
      inputSchema: z.object({
        id: z.string().describe('The post id.'),
        published: z.boolean().describe('true to publish, false to return it to draft.'),
      }),
    }),

    deleteBlogPost: tool({
      description:
        'Delete a post. The user is always shown a confirmation they must click, so do not ask for confirmation yourself in chat — just call it and report what came back. Returns { ok } or { ok: false, cancelled: true } if they declined.',
      inputSchema: z.object({
        id: z.string().describe('The post id.'),
      }),
    }),

    // ── Cover photos ────────────────────────────────────────────────────────
    //
    // `searchStockPhotos` is the one SERVER-executed tool in this set, because the
    // provider key must not reach the browser. It is read-only, so it does not
    // weaken the "every write is client-executed" rule the rest of the file rests
    // on. Applying a photo still goes through the gated REST endpoint.
    searchStockPhotos: tool({
      description:
        'Search the stock photo library for cover candidates. Write a DESCRIPTIVE query of the photograph you want — "grey horse galloping on turf", "auctioneer at a yearling sale", "empty grandstand at dawn" — not a topic. Returns { configured, candidates: [{ id, alt, thumbUrl, photographer }] }. Describe two or three to the user in words and ask which they prefer, then call setBlogCover with that candidate\'s id. If `configured` is false, say stock search is not set up on this server and ask them to attach a photo with the image button instead — do NOT pretend to have searched.',
      inputSchema: z.object({
        query: z.string().describe('A description of the photograph wanted, not the post\'s subject.'),
        orientation: z
          .enum(['landscape', 'portrait', 'square'])
          .optional()
          .describe('Shape hint. A blog cover sits beside the writing, so landscape usually reads best.'),
      }),
      execute: async ({ query, orientation }) => {
        if (!isStockConfigured()) {
          return {
            configured: false,
            candidates: [],
            note: 'Stock photo search is not configured on this server.',
          }
        }
        const candidates = await searchStockPhotos(query, { orientation, count: 6 })
        return {
          configured: true,
          count: candidates.length,
          // The thumb URL travels so the browser can SHOW the options; the model is
          // told to talk about them, not to hand a URL back.
          candidates: candidates.map((c) => ({
            id: c.id,
            alt: c.alt,
            thumbUrl: c.thumbUrl,
            photographer: c.attribution.author,
          })),
        }
      },
    }),

    setBlogCover: tool({
      description:
        'Set a post\'s cover to one of the candidates from searchStockPhotos, BY ITS ID. The photo is downloaded into our own library with its photographer credit — nothing is hotlinked. THE USER IS SHOWN THE PHOTO AND MUST APPROVE IT before it is applied, and they may ask for a different one, so report honestly what comes back: { ok } if they kept it, { retry: true } if they want another (search again with a different description), or { cancelled: true } if they would rather attach their own. Never pass a URL and never invent an id.',
      inputSchema: z.object({
        id: z.string().describe('The post id.'),
        photoId: z.string().describe('The candidate\'s `id` from searchStockPhotos.'),
        alt: z
          .string()
          .optional()
          .describe('Alt text, if you can improve on the library\'s own description of the photo.'),
      }),
    }),
  }
}
