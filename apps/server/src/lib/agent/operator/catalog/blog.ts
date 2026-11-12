import type { CatalogAction, CatalogSurface } from './types.js'

// ---------------------------------------------------------------------------
// Operator catalog — 'blog' pack. See ./types.ts for the contract.
//
// The web side registers these from
// apps/web/src/pages/production-system/operator/useBlogOperatorActions.ts:
// blog.askStudio in ProductionSystemLayout (every blog route — the Blog Studio
// drawer lives in the layout), the rest on the screen that shows the controls.
// Arg signatures mirror the zod schemas there; keep both in step.
//
// A post is 'draft' or 'published'. Publishing needs blogs.publish, deleting
// blogs.delete, creating blogs.create.
// ---------------------------------------------------------------------------

const ASK_STUDIO: CatalogAction = {
  name: 'blog.askStudio',
  description:
    "Opens a SEPARATE AI drawer (Blog Studio) on top of the screen, which then asks its own questions. Only use when the user explicitly asks for the Blog Studio. Otherwise write the content yourself with blog.create + blog.writeBody. Types the prompt into the drawer and waits; returns { filed: true, blogId }, { awaitingUserConfirm } (a card for the USER — tell them; never click it) or { studioReply } — continue with another blog.askStudio call. newChat: true starts fresh. Prompts that mention publish / delete ask the user to confirm first.",
  args: '{ prompt: string; newChat?: boolean }',
  confirms: true,
}

const CREATE: CatalogAction = {
  name: 'blog.create',
  description:
    "THE way to write a new blog post. Creates a DRAFT through the New post form (title + optional standfirst, byline, category, summary = card summary), then the editor opens on it. You (The Stable Hand) write the text yourself: pass the whole body as markdown here (## headings, - lists, > quotes, blank-line paragraphs; open with a paragraph, not a heading — a leading heading is dropped, the title is already the headline) and it is written into the editor straight after creating — or call blog.writeBody once the editor is open. Returns { created, blogId, path, bodyWritten? }.",
  args: '{ title: string /* 1-300 chars */; standfirst?: string; byline?: string; category?: string; summary?: string; markdown?: string }',
}

export const SURFACES: CatalogSurface[] = [
  {
    id: 'blog-list',
    title: 'Blogs',
    route: '/production-system/blogs',
    who: 'staff with the Blogs module (blogs.view)',
    purpose:
      'The list of long-form blog posts with status (Live / Draft), category and last edit, plus per-row Publish/Unpublish, Edit and Delete. Blog Studio AI and New post buttons sit in the header.',
    actions: [
      ASK_STUDIO,
      {
        name: 'blog.list',
        description:
          "List posts on screen (id, title, status, category, author, slug, updatedAt). status switches the screen's tab; query types into its title search.",
        args: "{ status?: 'all' | 'draft' | 'published'; query?: string }",
      },
      {
        name: 'blog.open',
        description: 'Open a post in the editor (/production-system/blogs/:id).',
        args: '{ blogId: string }',
      },
      CREATE,
      {
        name: 'blog.publish',
        description: "Publish a post to the live site (clicks the row's Publish). blogId is required here.",
        args: '{ blogId?: string }',
        confirms: true,
      },
      {
        name: 'blog.unpublish',
        description: "Take a live post back to draft (clicks the row's Unpublish). blogId is required here.",
        args: '{ blogId?: string }',
        confirms: true,
      },
      {
        name: 'blog.delete',
        description: 'Delete a post permanently.',
        args: '{ blogId: string }',
        confirms: true,
      },
    ],
    anchors: [
      'blog.studio-open',
      'blog.new-button',
      'blog.new-with-ai',
      'blog.new-manual',
      'blog.tab-all',
      'blog.tab-draft',
      'blog.tab-published',
      'blog.search-input',
      'blog.row-<id>.publish',
      'blog.row-<id>.unpublish',
      'blog.row-<id>.edit',
      'blog.row-<id>.delete',
      'blog.studio-panel',
      'blog.studio-input',
      'blog.studio-send',
      'blog.studio-stop',
      'blog.studio-new-chat',
      'blog.studio-close',
      'blog.studio-confirm-card',
    ],
  },
  {
    id: 'blog-new',
    title: 'New blog post',
    route: '/production-system/blogs/new',
    who: 'staff with blogs.create',
    purpose: 'The short form before the editor: title (required), standfirst, cover, byline, category, summary.',
    actions: [CREATE, ASK_STUDIO],
    anchors: [
      'blog.new-title-input',
      'blog.new-standfirst-input',
      'blog.new-byline-input',
      'blog.new-category-input',
      'blog.new-summary-input',
      'blog.create-submit',
    ],
  },
  {
    id: 'blog-editor',
    title: 'Blog post editor',
    route: '/production-system/blogs/:id',
    who: 'staff with the Blogs module who may edit the post',
    purpose:
      "Edit one post: title, cover, standfirst, block body, parts and settings rail; autosaves. Header has Studio AI (opens Blog Studio scoped to THIS post — so blog.askStudio here means 'this post'), View, Save and Publish/Unpublish.",
    actions: [
      ASK_STUDIO,
      {
        name: 'blog.publish',
        description: 'Publish the open post (saves first). Pass blogId only to publish a different post.',
        args: '{ blogId?: string }',
        confirms: true,
      },
      {
        name: 'blog.unpublish',
        description: 'Take the open post back to draft. Pass blogId only for a different post.',
        args: '{ blogId?: string }',
        confirms: true,
      },
      {
        name: 'blog.setTitle',
        description: "Retype the open post's title (autosaves). Asks to confirm when the post is live.",
        args: '{ title: string /* 1-300 chars */ }',
        confirms: true,
      },
      {
        name: 'blog.writeBody',
        description:
          "Write the open post's body. You (The Stable Hand) write the text yourself — pass it as markdown (## / ### headings, - or 1. lists, **Lead:** list points, > quotes with a final '— Name' line, blank-line paragraphs; a leading heading is dropped; inline bold/links are flattened to plain text) or as paragraphs[]. mode 'replace' (default) rewrites the main body's writing but keeps photos/galleries/embeds; 'append' adds after the last block. Applied through the editor's own undoable path (Ctrl+Z works) and autosaved. Asks to confirm when the post is live.",
        args: "{ markdown?: string; paragraphs?: string[]; mode?: 'replace' | 'append' }",
        confirms: true,
      },
      {
        name: 'blog.setStandfirst',
        description: "Set the open post's standfirst (the line under the title, max 300 chars). Autosaves. Asks to confirm when the post is live.",
        args: '{ standfirst: string }',
        confirms: true,
      },
      {
        name: 'blog.setDetails',
        description:
          "Set the open post's card summary (max 500), category, tags and/or byline. Autosaves. Asks to confirm when the post is live.",
        args: '{ summary?: string; category?: string; tags?: string[]; byline?: string }',
        confirms: true,
      },
      {
        name: 'blog.save',
        description: 'Press Save and report the result (normally autosave handles it).',
        args: '{}',
      },
    ],
    anchors: [
      'blog.title-input',
      'blog.standfirst-input',
      'blog.body',
      'blog.studio-open',
      'blog.view-link',
      'blog.save-button',
      'blog.publish-button',
      'blog.studio-input',
      'blog.studio-send',
      'blog.studio-confirm-card',
    ],
  },
]
