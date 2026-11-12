import type { CatalogSurface } from './types.js'

// ---------------------------------------------------------------------------
// Operator catalog — 'magazine' pack (Magazine Builder v2). See ./types.ts for
// the contract.
//
// Web twins (names + zod schemas MUST match):
//   magazine-home   → apps/web/src/editor-v2/operator/useMagazineHomeActions.ts
//   magazine-editor → apps/web/src/editor-v2/operator/useMagazineEditorActions.ts
//
// Page numbers are 1-based everywhere, the way the page rail shows them.
// An action the user's role can't do is simply not registered on screen, so
// readScreen().actions is the live truth; the server still enforces RBAC.
// ---------------------------------------------------------------------------

export const SURFACES: CatalogSurface[] = [
  {
    id: 'magazine-home',
    title: 'Magazine Builder — library',
    route: '/production-system/magazine-v2',
    who: 'staff with Magazine view; the AI composer needs Magazine create',
    purpose:
      'The library of AI-built magazines plus the composer that starts a new one from a brief. Generate creates the magazine and drops straight into its studio, where the pages keep building for a few minutes.',
    actions: [
      {
        name: 'magazine.list',
        description: 'List the magazines in the library: id, title, status, page count, your role, whether published, editor route.',
        args: '{}',
      },
      {
        name: 'magazine.open',
        description: 'Open a magazine in the studio by id or by (partial) title. Ambiguous titles return the candidates.',
        args: '{ magazine: string }',
      },
      {
        name: 'magazine.generate',
        description:
          'Start a NEW magazine with AI: types the brief into the composer, presses Generate, waits until the new studio opens. Returns AT ONCE with { magazineId, route, jobId, started:true } — the pages keep building in the background (minutes) and a [job-update] message arrives in this chat when they finish. Do not wait or poll: tell the user it is building and end your turn (or do other work). Use this for "create a (dummy) magazine about …"; there is no blank-magazine button on this screen.',
        args: '{ brief: string; pageCount?: number /* 3–16, written into the brief */ }',
        confirms: true,
      },
      {
        name: 'magazine.reuseTemplate',
        description: "Start a new magazine from an existing magazine's layout (its text and photos are cleared; the original is untouched), then open it.",
        args: '{ magazineId: string }',
      },
    ],
    anchors: [
      'mag.brief-input',
      'mag.generate-submit',
      'mag.attach-data',
      'mag.attach-images',
      'mag.card-<magazineId>',
      'mag.card-<magazineId>-edit',
      'mag.card-<magazineId>-reuse',
      'mag.card-<magazineId>-delete',
    ],
  },
  {
    id: 'magazine-editor',
    title: 'Magazine Builder — studio',
    route: '/production-system/magazine-v2/:id',
    who: "the magazine's owner (everything), collaborators it was shared with (their pages + the AI Studio), other staff view-only; publishing also needs Magazine publish",
    purpose:
      'Edit one magazine: page rail (thumbnails, add/duplicate/delete/reorder), the canvas (every page stacked; above EACH page a header with a "publish" tick and two AI wand buttons, Fill and Adjust), the Magazine AI Studio chat on the left that stages edits to the open page, the inspector on the right (owner: add text/photo/shape/QR/icon, style the selected element, Assets), Share (who may edit which pages), the review board, and Publish to the public Bulletins newsstand. Call magazine.status first to learn page numbers, collaborators and your role. When the user says "fill" or "adjust" a page, use magazine.fillPage / magazine.adjustPage directly — those ARE the Fill/Adjust buttons above the page; do not route it through the AI Studio chat.',
    actions: [
      {
        name: 'magazine.status',
        description:
          'Title, id, your role and rights, every page (1-based number, id, elements, review state, selectedForPublish), collaborators with their pages, publish state, build progress, and AI Studio state (replying / staged changes).',
        args: '{}',
      },
      {
        name: 'magazine.waitForGeneration',
        description:
          'OPTIONAL — builds report back by themselves with a [job-update] message, so you normally never call this. Use it only for a quick look at a build in progress: follows the real progress ("2 of 6 pages built") for at most 60 seconds, then returns { building, done, total, jobId } (or the final status + page count if it finished). Never call it in a loop.',
        args: '{}',
      },
      {
        name: 'magazine.goToPage',
        description: 'Open a page on the canvas by clicking its thumbnail in the page rail.',
        args: '{ page: number }',
      },
      {
        name: 'magazine.addPage',
        description: 'Owner only. Add a blank page at the end and open it.',
        args: '{}',
      },
      {
        name: 'magazine.addAiPages',
        description:
          'Owner only. Have the AI design and append on-theme pages (count must be 1, 2, 3, 4 or 6), optionally on a topic. Starts the build and returns AT ONCE with { jobId, started:true } — a [job-update] message arrives when the pages are done; do not wait or poll.',
        args: '{ count: 1 | 2 | 3 | 4 | 6; topic?: string }',
        confirms: true,
      },
      {
        name: 'magazine.duplicatePage',
        description: 'Owner only. Duplicate a page.',
        args: '{ page: number }',
      },
      {
        name: 'magazine.deletePage',
        description: 'Owner only. Delete a page permanently (page deletions cannot be undone).',
        args: '{ page: number }',
        confirms: true,
      },
      {
        name: 'magazine.movePage',
        description: 'Owner only. Move a page to another position.',
        args: '{ from: number; to: number }',
      },
      {
        name: 'magazine.rename',
        description: "Owner only. Rename the magazine via the toolbar's title field.",
        args: '{ title: string }',
      },
      {
        name: 'magazine.listStaff',
        description: 'Owner only. Staff who could be invited (userId, name, email, access: owner|collaborator|none), optionally filtered by text. Use it to resolve a name before sharing.',
        args: '{ query?: string }',
      },
      {
        name: 'magazine.sharePages',
        description:
          'Owner only. Share pages through the Share dialog: person is a userId, email or name (ambiguous names return the candidates). A new collaborator is emailed a link; for an existing one this changes which pages they may edit. Returns the updated collaborator list.',
        args: "{ person: string; pages: number[] | 'all' }",
        confirms: true,
      },
      {
        name: 'magazine.unshare',
        description: "Owner only. Remove a collaborator's access (person = userId, email or name).",
        args: '{ person: string }',
        confirms: true,
      },
      {
        name: 'magazine.askStudio',
        description:
          'Owner or collaborator. Type a request into the Magazine AI Studio chat (optionally opening a page first) and send it like a person; it then waits the WHOLE turn — attachment upload/reading (can take a minute), then the reply (up to 10 min). The studio only STAGES changes: when the user asked for the change to be made (e.g. "use this image as the background", "make the headline bigger") pass apply:true so it presses "Use these changes" and the change is really on the page. Attach a user image first with upload on mag.ai-attach.',
        args: '{ prompt: string; page?: number; apply?: boolean }',
      },
      {
        name: 'magazine.waitForStudio',
        description:
          'The studio is still working (reading an attachment or replying) or has finished with changes waiting: wait for it (up to 10 min), then with apply:true press "Use these changes". Use this instead of telling the user "the studio is still working".',
        args: '{ apply?: boolean }',
      },
      {
        name: 'magazine.applyStudioChanges',
        description: 'Press "Use these changes" on the changes the AI Studio has staged (undoable with Ctrl+Z, except page deletions — those ask first).',
        args: '{}',
      },
      {
        name: 'magazine.discardStudioChanges',
        description: 'Press "Don\'t use these" to dismiss the AI Studio\'s staged changes.',
        args: '{}',
      },
      {
        name: 'magazine.publish',
        description:
          'Owner with Magazine publish. Publish or republish to the public Bulletins newsstand: omit pages for the full edition, or give 1-based pages to publish only those ("publish pages 1–4" → pages:[1,2,3,4]). Refused with the reason if pages still need approval or a build is running. Returns publishedIssueId + public route.',
        args: '{ pages?: number[] }',
        confirms: true,
      },
      {
        name: 'magazine.unpublish',
        description: 'Owner with Magazine publish. Take the live edition off Bulletins (the draft stays).',
        args: '{}',
        confirms: true,
      },
      {
        name: 'magazine.fillPage',
        description:
          'Owner or collaborator. Press the Fill wand above that page on the canvas (the per-page AI button): it writes copy into EMPTY text boxes and tightens crowded text, then waits for the pass. Use it directly whenever the user says "fill page N" / "fill the empty boxes". Returns textBlocksChanged + before/after of each changed block, element counts, and the toast text. Undoable as one step (magazine.undo).',
        args: '{ page: number }',
      },
      {
        name: 'magazine.adjustPage',
        description:
          'Owner or collaborator. Press the Adjust wand above that page on the canvas: tightens crowded / overflowing text only (no new copy in empty boxes). Use it directly when the user says "adjust page N" / "fix the overflowing text". Returns what changed + the toast text. Undoable (magazine.undo).',
        args: '{ page: number }',
      },
      {
        name: 'magazine.setPageInPublish',
        description:
          'Owner only. Tick (include:true) or untick the "publish" box in the page\'s canvas header — whether the page goes out with "Publish selected pages". A full-edition publish ignores it. Returns the selected page list.',
        args: '{ page: number; include: boolean }',
      },
      {
        name: 'magazine.undo',
        description: 'Press Undo in the toolbar: takes back the last edit (a whole AI apply or Fill/Adjust pass is one step). Page deletions cannot be undone. Returns what was undone and what is next.',
        args: '{}',
      },
      {
        name: 'magazine.redo',
        description: 'Press Redo in the toolbar: re-applies the last undone edit.',
        args: '{}',
      },
      {
        name: 'magazine.zoom',
        description: "Zoom the canvas with the toolbar − / + buttons: action 'in' or 'out' for one step, or percent (≈22–110) to step to the nearest level. Returns zoomPercent.",
        args: "{ percent?: number; action?: 'in' | 'out' }",
      },
      {
        name: 'magazine.setCover',
        description:
          "Owner only. Set the newsstand cover via More ▸ Cover image…: page (use that page's picture), imageUrl (an image URL), or reset:true (automatic from page 1). Give exactly one.",
        args: '{ page?: number; imageUrl?: string; reset?: boolean }',
      },
      {
        name: 'magazine.openReviewBoard',
        description:
          'Open the review board and return the pages in each column (in_progress, needs_changes, submitted, approved), stale approvals, and which pages you can tick. The board only exists when the magazine is shared with someone.',
        args: '{}',
      },
      {
        name: 'magazine.reviewPages',
        description:
          "On the review board: the owner uses action 'approve' or 'sendBack' (note required) on submitted / stale pages; a collaborator uses 'submit' for their finished pages. Ticks exactly those pages, writes the note, presses the button; the people involved are emailed. Returns moved / notMoved pages.",
        args: "{ action: 'approve' | 'sendBack' | 'submit'; pages: number[]; note?: string }",
        confirms: true,
      },
      {
        name: 'magazine.addMorePages',
        description:
          'Owner only. Press "Add more pages" (the gold banner after a first build, else the rail\'s AI button) to open the add-AI-pages popover; with count (1, 2, 3, 4 or 6) and optional topic it also starts the build like magazine.addAiPages and returns AT ONCE with { jobId, started:true } — a [job-update] message arrives when the pages are done.',
        args: '{ count?: 1 | 2 | 3 | 4 | 6; topic?: string }',
        confirms: true,
      },
      // Danger actions — web twin: apps/web/src/editor-v2/operator/useMagazineDangerActions.ts.
      // Each drives the real button; the app's own window.confirm() is answered by
      // the user's OK on the Operator's confirm card (runtime/nativeDialogs.ts).
      {
        name: 'magazine.deleteMagazine',
        description:
          'Owner with Magazine delete. Delete this whole magazine (draft + every page) via More ▸ Delete magazine…; a live one also comes off Bulletins. Cannot be undone. Ends in the library.',
        args: '{}',
        confirms: true,
      },
      {
        name: 'magazine.startOver',
        description:
          'Owner only. More ▸ Start over…: reset this magazine to ONE blank page — every page and its content is deleted and undo history cleared. Cannot be undone.',
        args: '{}',
        confirms: true,
      },
      {
        name: 'magazine.copyPdfPage',
        description:
          'Owner only. "Copy a page exactly": reproduce page docPage of a PDF already attached to this magazine (its own words, pictures, colours) onto `page` (default: the open page), replacing everything there; the page takes the PDF page\'s shape. Cannot be undone. doc = part of the PDF file name when several are attached. To use a PDF the user sent in this chat, first attach it to the magazine: upload { agentId: "mag.ai-attach" }. For a layout only (fresh copy), use magazine.applyLayout.',
        args: '{ page?: number; docPage: number; doc?: string }',
        confirms: true,
      },
      {
        name: 'magazine.applyLayout',
        description:
          'Owner only. "Match a layout": rebuild `page` (default: the open page) in the ARRANGEMENT of a reference picture the user sent — fresh copy is written, nothing is copied from it. fit "exact" = every box where the reference had it; "adapt" = re-composed around this page\'s content. Replaces everything on the page; cannot be undone. Flow: call it once (opens the page + panel), then upload { agentId: "mag.layout-upload", attachment } with the user\'s image, then call it again (waits for the reading, asks the user, rebuilds, returns the measured verdict).',
        args: "{ page?: number; fit: 'exact' | 'adapt' }",
        confirms: true,
      },
    ],
    anchors: [
      'mag.back',
      'mag.title-input',
      'mag.undo',
      'mag.redo',
      'mag.review-board',
      'mag.publish-button',
      'mag.publish-full',
      'mag.publish-selected',
      'mag.unpublish',
      'mag.view-live',
      'mag.more-button',
      'mag.share-button',
      'mag.cover-button',
      'mag.ai-toggle',
      'mag.add-more-pages',
      'mag.pages-show',
      'mag.pages-rail',
      'mag.page-<n>',
      'mag.page-<n>-up',
      'mag.page-<n>-down',
      'mag.page-<n>-duplicate',
      'mag.add-page',
      'mag.add-ai-pages',
      'mag.ai-pages-count',
      'mag.ai-pages-topic',
      'mag.ai-pages-generate',
      'mag.ai-tab-chat',
      'mag.ai-tab-uploads',
      'mag.ai-new-chat',
      'mag.ai-input',
      'mag.ai-send',
      'mag.ai-apply',
      'mag.ai-discard',
      'mag.share-dialog',
      'mag.share-person',
      'mag.share-scope-all',
      'mag.share-scope-pick',
      'mag.share-page-<n>',
      'mag.share-submit',
      'mag.share-collab-<userId>',
      'mag.share-close',
      'mag.publish-dialog',
      'mag.publish-page-<n>',
      'mag.publish-confirm',
      // Canvas: the header above EVERY page (n = 1-based page number)
      'mag.page-<n>-fill',
      'mag.page-<n>-adjust',
      'mag.page-<n>-publish-toggle',
      // Toolbar / More menu / banners
      'mag.zoom-out',
      'mag.zoom-in',
      'mag.zoom-level',
      'mag.start-over',
      'mag.delete-magazine',
      'mag.add-more-pages-dismiss',
      'mag.locked-see-board',
      'mag.page-<n>-delete',
      'mag.pages-hide',
      'mag.ai-pages-cancel',
      // Cover dialog
      'mag.cover-dialog',
      'mag.cover-tab-pages',
      'mag.cover-tab-library',
      'mag.cover-tab-upload',
      'mag.cover-page-<n>',
      'mag.cover-asset-<assetId>',
      'mag.cover-upload',
      'mag.cover-url',
      'mag.cover-url-set',
      'mag.cover-reset',
      'mag.cover-close',
      // Review board
      'mag.review-dialog',
      'mag.review-page-<n>-select',
      'mag.review-page-<n>-open',
      'mag.review-note',
      'mag.review-approve',
      'mag.review-send-back',
      'mag.review-submit',
      'mag.review-close',
      // Inspector (owner; right pane)
      'mag.inspector-show',
      'mag.inspector-hide',
      'mag.insert-text',
      'mag.insert-image',
      'mag.insert-shape',
      'mag.insert-qr',
      'mag.insert-icon',
      'mag.inspector-tab-element',
      'mag.inspector-tab-assets',
      'mag.inspector-publish-toggle',
      'mag.el-content',
      'mag.el-image-upload',
      'mag.el-image-url',
      'mag.el-qr-url',
      'mag.el-to-front',
      'mag.el-to-back',
      'mag.el-duplicate',
      'mag.el-delete',
      'mag.assets-mode-library',
      'mag.assets-mode-find',
      'mag.assets-mode-make',
      'mag.asset-<assetId>',
      'mag.stock-query',
      'mag.stock-search',
      'mag.stock-result-<photoId>',
      'mag.imagegen-prompt',
      'mag.imagegen-submit',
      'mag.layout-pdf-doc',
      'mag.layout-pdf-page',
      'mag.layout-pdf-go',
      'mag.layout-upload',
      'mag.layout-fit-exact',
      'mag.layout-fit-adapt',
      'mag.layout-apply',
      'mag.copy-pdf-doc',
      'mag.copy-pdf-page',
      'mag.copy-pdf-go',
      'mag.preview-close',
      // AI Studio extras
      'mag.ai-threads',
      'mag.ai-threads-new',
      'mag.ai-threads-close',
      'mag.ai-thread-<threadId>',
      'mag.ai-attach',
      'mag.ai-mic',
      'mag.ai-voice',
      'mag.ai-load-older',
      'mag.ai-uploads-add',
      'mag.ai-upload-<uploadId>',
      'mag.ai-upload-<uploadId>-fill',
    ],
  },
]
