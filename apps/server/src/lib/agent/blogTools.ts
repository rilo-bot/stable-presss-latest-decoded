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
import { BodyItemSchema } from './instantPrompt.js'

const TIERS = ['free', 'standard', 'premium'] as const

/** The body, as the model sees it both ways. Imported, not restated, so the two
 *  agents that speak this shape cannot drift apart. */
const BodySchema = z
  .array(BodyItemSchema)
  .describe(
    'The post body in reading order: paragraphs, plus headings and lists where they genuinely help. Plain text only — no markdown.',
  )

export function buildBlogTools(): ToolSet {
  return {
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

    suggestBlogImages: tool({
      description:
        'Get a few on-brand stock photo candidates (name + url) matching a keyword, for a post\'s cover. Describe them to the user and let them choose, then call setBlogCover with one of the returned URLs. Never invent image URLs.',
      inputSchema: z.object({
        query: z.string().optional().describe('A keyword like "race finish", "paddock" or "yearling".'),
      }),
    }),

    setBlogCover: tool({
      description:
        'Set a post\'s cover photo to a known/approved image URL — one returned by suggestBlogImages. The cover shows beside the writing on the post page and fronts the card in the index. Never invent URLs. Returns { ok }.',
      inputSchema: z.object({
        id: z.string().describe('The post id.'),
        src: z.string().describe('The image URL, from suggestBlogImages.'),
        alt: z.string().optional().describe('Alt text describing the photo, for readers who cannot see it.'),
      }),
    }),
  }
}
