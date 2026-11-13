// ---------------------------------------------------------------------------
// Operator pack — BLOG (/production-system/blogs, /blogs/new, /blogs/:id).
//
// Four registration points, one per place the controls actually live:
//
//   useBlogStudioAction      ProductionSystemLayout (on any blog route) — the
//                            Blog Studio drawer is mounted by the layout.
//   useBlogListActions       BlogsScreen — the post list and its row buttons.
//   useBlogCreateFormAction  BlogCreateForm — so blog.create also works when
//                            the form is already open.
//   useBlogEditorActions     BlogEditorScreen — the open post's header buttons.
//
// Every action clicks / types the real control, or — where the control would
// stop on a native window.confirm() the Operator's own confirm card already
// replaced (row delete), or is not on screen — calls the SAME blogStore method
// that control calls. The REST routes re-check RBAC as the signed-in user.
//
// Names and arg shapes MUST match apps/server/src/lib/agent/operator/catalog/
// blog.ts.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { z } from 'zod';

import type { UiDriver } from '@/agent/operator/contracts';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { applyInsert, applyReplaceBody, applySetField } from '@/agent/blog/blogEditorBridge';
import { markdownToBodyItems, paragraphsToBodyItems } from '@/agent/blog/markdownBodyItems';
import { useComposerStore } from '@/pages/blog-composer/composerStore';
import { authFetchRetry } from '@/lib/api';
import { can, canOn } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useBlogStore } from '@/stores/blogStore';
import { useBlogStudioUi } from '@/stores/blogStudioUiStore';
import type { BlogSummary } from '@/types/blog';

import { firstError, watchToasts } from '../operator-team/opUtils';
import { anchorEl, clip, hasAnchor, sleep, typeAndSend, waitForStudioTurn, waitUntil } from './studioTurn';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Every post title the list has shown this session. `items` is replaced on each
 * tab / search change, so a post filtered out of view (blog.list with a query,
 * then blog.publish on another id) would otherwise be named by its raw id on
 * the confirm card — "Publish “bl1” to the live site?".
 */
const knownTitles = new Map<string, string>();
function rememberTitles(items: BlogSummary[]): void {
  for (const i of items) if (i?.id) knownTitles.set(i.id, i.title || 'Untitled post');
}

/** Title of a post from what is loaded — list row, the open editor, titles seen
 *  this session — or null when nothing names it. */
function knownBlogTitle(id: string | undefined): string | null {
  const open = useComposerStore.getState().blog;
  if (!id) return open ? open.title || 'Untitled post' : null;
  const row = useBlogStore.getState().items.find((i) => i.id === id);
  if (row) return row.title || 'Untitled post';
  if (open?.id === id) return open.title || 'Untitled post';
  return knownTitles.get(id) ?? null;
}

/** Title of a post for results — never its raw id (unknown → "this post"). */
function blogTitle(id: string | undefined): string {
  return knownBlogTitle(id) ?? 'this post';
}

/** A post as a confirm card / step line names it: “Title”, or "this post". */
function blogRef(id: string | undefined): string {
  const t = knownBlogTitle(id);
  return t ? `“${t}”` : 'this post';
}

/** blogRef, looking the post up (the same GET the editor makes) when nothing
 *  loaded names it — a post filtered out of the list, or never listed.
 *  Reported shape: "Publish “6650f1a2…” to the live site?". Never throws. */
async function blogRefAsync(id: string | undefined): Promise<string> {
  if (knownBlogTitle(id) || !id) return blogRef(id);
  try {
    const res = await authFetchRetry(`/api/blogs/${encodeURIComponent(id)}`);
    if (res.ok) {
      const post = (await res.json()) as { title?: unknown };
      if (typeof post?.title === 'string') knownTitles.set(id, post.title || 'Untitled post');
    }
  } catch {
    /* fall back to "this post" */
  }
  return blogRef(id);
}

/**
 * Who created the post, when something loaded says so: the open editor has the
 * whole post, and list rows carry createdByUserId at runtime (the list
 * projection sends it; BlogSummary does not declare it). undefined = unknown.
 */
function blogCreator(id: string | undefined): string | undefined {
  const open = useComposerStore.getState().blog;
  if (open && (!id || open.id === id)) return open.createdByUserId;
  const row = useBlogStore.getState().items.find((i) => i.id === id) as (BlogSummary & { createdByUserId?: string }) | undefined;
  return row?.createdByUserId;
}

/**
 * The server's blogWriteGate: the verb, and — with 'own' scope — a post this
 * user created (ownership is createdByUserId, never the free-text byline).
 * Publishing goes through the same gate as an edit. When nothing loaded names
 * the creator, the verb alone decides here and the server has the last word.
 */
function mayOnPost(verb: 'blogs.edit' | 'blogs.delete', id: string | undefined): boolean {
  if (!can(verb)) return false;
  const creator = blogCreator(id);
  if (creator === undefined) return true;
  return canOn(verb, creator === useAuthStore.getState().currentUser?.id);
}

/** Refuse an edit run() cannot complete — before typing anything into the post. */
function assertMayEdit(id: string): void {
  if (!mayOnPost('blogs.edit', id)) {
    throw new Error(can('blogs.edit') ? 'You can only edit your own blog posts.' : 'Your role cannot edit blog posts (needs blogs.edit).');
  }
}

function summarise(p: BlogSummary) {
  return {
    id: p.id,
    title: p.title || 'Untitled post',
    status: p.status,
    category: p.category ?? null,
    author: p.author?.name ?? null,
    slug: p.slug,
    updatedAt: p.updatedAt,
  };
}

const POST_PATH = /^\/production-system\/blogs\/([^/]+)\/?$/;

/** The id in /production-system/blogs/:id, when the editor route is open. */
function editorRouteId(): string | null {
  const m = window.location.pathname.match(POST_PATH);
  return m && m[1] !== 'new' ? m[1] : null;
}

// ── Writing the body yourself (no Blog Studio) ──────────────────────────────

const bodyArgs = z
  .object({
    markdown: z.string().optional(),
    paragraphs: z.array(z.string()).optional(),
    mode: z.enum(['replace', 'append']).optional(),
  })
  .refine((a) => !!a.markdown?.trim() || !!a.paragraphs?.some((p) => p.trim()), {
    message: 'Pass the post body as markdown (or paragraphs).',
  });
type BodyArgs = z.infer<typeof bodyArgs>;

function bodyItemsFrom(a: { markdown?: string; paragraphs?: string[] }) {
  return a.markdown?.trim() ? markdownToBodyItems(a.markdown) : paragraphsToBodyItems(a.paragraphs ?? []);
}

/**
 * Let the composer's 1.5s autosave run, then report how it went. A change the
 * editor holds but the server refused (a save error, or a conflict with an
 * edit made elsewhere) is NOT done: throw, so the step fails and the model
 * does not report it as saved. The change stays in the editor (Ctrl+Z works).
 */
async function settleSave(ui: UiDriver): Promise<string> {
  await sleep(250, ui.signal);
  await waitUntil(
    () => {
      const st = useComposerStore.getState().saveState;
      return st !== 'dirty' && st !== 'saving';
    },
    { signal: ui.signal, timeoutMs: 15_000 },
  );
  const { saveState, saveError } = useComposerStore.getState();
  if (saveState === 'conflict') {
    throw new Error('The change is in the editor but NOT saved: this post was changed elsewhere. Resolve the conflict banner first.');
  }
  if (saveState === 'error') {
    throw new Error(`The change is in the editor but NOT saved: ${saveError ?? 'the save failed'}.`);
  }
  return saveState;
}

/**
 * Put body text into the post open in the editor, through the SAME undoable
 * composer mutation the Blog Studio uses (blogEditorBridge) — never a private
 * write. Autosave then sends it through PUT /api/blogs/:id as usual.
 */
async function writeBodyInEditor(a: BodyArgs, ui: UiDriver) {
  const open = useComposerStore.getState().blog;
  if (!open) throw new Error('No post is open in the editor. Open one with blog.open, or create one with blog.create.');
  assertMayEdit(open.id);
  const items = bodyItemsFrom(a);
  if (items.length === 0) throw new Error('The body had no text after formatting was removed. Send plain paragraphs.');

  const mode = a.mode ?? 'replace';
  ui.step(mode === 'append' ? 'Adding to the post body' : 'Writing the post body');
  if (hasAnchor('blog.body')) await ui.point('blog.body', mode === 'append' ? 'Adding to the body' : 'Writing the body');

  let moved = 0;
  let result;
  if (mode === 'append') {
    result = applyInsert(open.id, items, { at: 'end' });
  } else {
    const replaced = applyReplaceBody(open.id, items);
    moved = replaced.movedVisuals ?? 0;
    result = replaced;
  }
  if (!result.ok) throw new Error(result.error);
  await sleep(120, ui.signal);
  if (hasAnchor('blog.body')) ui.flash('blog.body');
  const saveState = await settleSave(ui);
  return {
    written: true,
    blogId: open.id,
    mode,
    blocks: items.length,
    changed: result.changed,
    saveState,
    undo: 'The user can press Ctrl+Z (or Undo) to take it back.',
    ...(moved > 0 ? { photoNote: `${moved} photo/gallery block(s) moved to the end because the new body is shorter.` } : {}),
  };
}

/** Words that may turn a studio prompt into a publish / delete the user must OK. */
const RISKY_PROMPT = /\b(publish|unpublish|un-publish|delete|remove|scrap|bin|take (it )?down|go live|make (it )?live|trash)\w*/i;

// ── blog.askStudio (layout) ─────────────────────────────────────────────────

export function useBlogStudioAction(enabled: boolean): void {
  useAgentAction(
    {
      name: 'blog.askStudio',
      description:
        'Opens a SEPARATE AI drawer (Blog Studio). Only when the user explicitly asks for Blog Studio — otherwise write the post yourself with blog.create + blog.writeBody.',
      args: z.object({ prompt: z.string().min(2), newChat: z.boolean().optional() }),
      // The studio has its own publish / delete tools; a request that could
      // reach them gets the Operator's confirm card first.
      confirm: (a) =>
        RISKY_PROMPT.test(a.prompt)
          ? `Let Blog Studio act on “${clip(a.prompt, 160)}”? It may publish, unpublish or delete posts.`
          : null,
      run: async (a, ui) => {
        const st = useBlogStudioUi.getState;

        if (!st().open) {
          ui.step('Opening Blog Studio');
          if (hasAnchor('blog.studio-open')) await ui.click('blog.studio-open', 'Blog Studio AI');
          else st().openDesk();
        }
        await ui.waitFor('blog.studio-input', 6_000);

        if (st().pendingConfirm) {
          throw new Error('Blog Studio is waiting on a confirmation card in its drawer. Ask the user to answer it first.');
        }
        if (st().chat.busy) {
          ui.step('Waiting for Blog Studio to finish');
          await waitUntil(() => !st().chat.busy, { signal: ui.signal, timeoutMs: 120_000 });
        }
        if (a.newChat && st().chat.messageCount > 0) await ui.click('blog.studio-new-chat', 'New chat');

        // The panel clears createdDraftId (and navigates) in the same render, so
        // subscribe rather than poll.
        const filed: { id: string | null } = { id: null };
        const unsub = useBlogStudioUi.subscribe((state) => {
          if (state.createdDraftId) filed.id = state.createdDraftId;
        });
        try {
          const before = st().chat.messageCount;
          ui.step('Asking Blog Studio');
          await typeAndSend(ui, 'blog.studio-input', 'blog.studio-send', clip(a.prompt, 4000));
          ui.step('Blog Studio is working…');
          const out = await waitForStudioTurn(() => st().chat, before, {
            signal: ui.signal,
            interrupt: () => (filed.id ? 'filed' : st().pendingConfirm ? 'confirm' : null),
          });

          const filedId = filed.id;
          if (filedId) {
            await ui.waitForRoute(`/production-system/blogs/${filedId}`, 10_000).catch(() => undefined);
            return {
              filed: true,
              blogId: filedId,
              status: 'draft',
              openedAt: `/production-system/blogs/${filedId}`,
              note: 'Blog Studio filed the post as a draft and opened it in the editor.',
            };
          }
          const pending = st().pendingConfirm;
          if (pending) {
            return {
              filed: false,
              studioReply: out.reply,
              awaitingUserConfirm: { kind: pending.kind, title: pending.title, detail: pending.detail },
              note: 'Blog Studio is waiting for the USER to answer the card in its drawer. Tell them; do not click it yourself.',
            };
          }
          if (out.status === 'error') throw new Error(`Blog Studio failed: ${out.error}`);
          if (out.status === 'not-started') throw new Error('The message did not send — Blog Studio may be busy or switched off.');
          return {
            filed: false,
            studioReply: out.reply,
            finished: out.status === 'done',
            note:
              out.status === 'timeout'
                ? 'Blog Studio is still working. Check back with blog.askStudio or readScreen.'
                : 'Reply with blog.askStudio({ prompt }) to continue the same conversation; ask the user anything you cannot answer from context.',
          };
        } catch (err) {
          // Stop must also stop the studio turn THIS action started (as the
          // profile pack does) — otherwise Blog Studio keeps going and may still
          // publish / edit after the user pressed Stop. Its own Stop button.
          if (ui.signal.aborted || (err as Error)?.name === 'AbortError') {
            anchorEl<HTMLButtonElement>('blog.studio-stop')?.click();
          }
          throw err;
        } finally {
          unsub();
        }
      },
    },
    enabled,
  );
}

// ── blog.create (list screen + create form) ─────────────────────────────────

const createArgs = z.object({
  title: z.string().min(1).max(300),
  standfirst: z.string().optional(),
  byline: z.string().optional(),
  category: z.string().optional(),
  summary: z.string().optional(),
  /** Optional post body (markdown) — written in the editor right after creating. */
  markdown: z.string().optional(),
});
type CreateArgs = z.infer<typeof createArgs>;

async function runBlogCreate(a: CreateArgs, ui: UiDriver) {
  if (!can('blogs.create')) throw new Error('Your role cannot create blog posts (needs blogs.create).');

  if (!hasAnchor('blog.new-title-input')) {
    ui.step('Opening the new-post form');
    if (hasAnchor('blog.new-button')) {
      await ui.click('blog.new-button', 'New post');
      await ui.waitFor('blog.new-manual', 4_000);
      await ui.click('blog.new-manual', 'Write it yourself');
    } else {
      await ui.navigate('/production-system/blogs/new');
    }
    await ui.waitFor('blog.new-title-input', 8_000);
  }

  await ui.type('blog.new-title-input', a.title, { clear: true });
  if (a.standfirst) await ui.type('blog.new-standfirst-input', a.standfirst, { clear: true });
  if (a.byline) await ui.type('blog.new-byline-input', a.byline, { clear: true });
  if (a.category) await ui.type('blog.new-category-input', a.category, { clear: true });
  if (a.summary) await ui.type('blog.new-summary-input', a.summary, { clear: true });

  const toasts = watchToasts();
  await ui.click('blog.create-submit', 'Create and start writing');
  // Created (the editor route opens), or refused (an error toast; the form
  // stays open with what was typed).
  await waitUntil(() => editorRouteId() || firstError(toasts.collect()), { signal: ui.signal, timeoutMs: 20_000 });
  const id = editorRouteId();
  if (!id) {
    const why = firstError(toasts.collect());
    throw new Error(`The post was not created${why ? `: ${why}` : ''}. The form is still open.`);
  }
  await ui.waitFor('blog.title-input', 10_000).catch(() => undefined);
  const out = { created: true, blogId: id, title: a.title, status: 'draft', path: `/production-system/blogs/${id}` };
  if (!a.markdown?.trim()) return out;

  // The body goes in through the editor, exactly as blog.writeBody would.
  const loaded = await waitUntil(() => useComposerStore.getState().blog?.id === id, { signal: ui.signal, timeoutMs: 10_000 });
  if (!loaded) {
    return { ...out, bodyWritten: false, note: 'The post was created but the editor did not finish loading — call blog.writeBody now.' };
  }
  try {
    const body = await writeBodyInEditor({ markdown: a.markdown, mode: 'replace' }, ui);
    return { ...out, bodyWritten: true, blocks: body.blocks, saveState: body.saveState };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    return { ...out, bodyWritten: false, bodyError: (err as Error)?.message ?? String(err), note: 'Retry with blog.writeBody.' };
  }
}

export function useBlogCreateFormAction(): void {
  useAgentAction({
    name: 'blog.create',
    description: 'Create a draft blog post through the New post form (title, standfirst, byline, category, summary) and optionally write its body (markdown).',
    args: createArgs,
    run: runBlogCreate,
  });
}

// ── Publish / unpublish ─────────────────────────────────────────────────────

const publishArgs = z.object({ blogId: z.string().optional() });

/** The list's current filter, as the user sees it. */
function listFilter(): { status: string; search: string } {
  const tab = (['all', 'draft', 'published'] as const).find(
    (t) => anchorEl(`blog.tab-${t}`)?.getAttribute('aria-selected') === 'true',
  );
  return { status: tab ?? 'all', search: anchorEl<HTMLInputElement>('blog.search-input')?.value ?? '' };
}

/**
 * The post's row is hidden by the list's own tab / search — clear them (the
 * same clicks a person makes) so the row, and its real button, come back.
 */
async function revealRow(id: string, ui: UiDriver): Promise<void> {
  const rowShown = () => hasAnchor(`blog.row-${id}.publish`) || hasAnchor(`blog.row-${id}.unpublish`);
  if (rowShown()) return;
  const f = listFilter();
  if (f.status === 'all' && !f.search.trim()) return;
  ui.step('Clearing the list filter to find the post');
  if (f.search.trim()) await ui.type('blog.search-input', '', { clear: true, submit: true });
  if (f.status !== 'all' && hasAnchor('blog.tab-all')) await ui.click('blog.tab-all', 'All');
  await sleep(300, ui.signal);
  await waitUntil(() => !useBlogStore.getState().listLoading && rowShown(), { signal: ui.signal, timeoutMs: 8_000 });
}

async function publishFromList(id: string, published: boolean, ui: UiDriver) {
  const verb = published ? 'publish' : 'unpublish';
  const want = published ? 'published' : 'draft';
  const row = () => useBlogStore.getState().items.find((i) => i.id === id);
  const title = blogTitle(id);
  if (row()?.status === want) return { ok: true, unchanged: true, blogId: id, title, status: want };

  await revealRow(id, ui);
  if (row()?.status === want) return { ok: true, unchanged: true, blogId: id, title, status: want };
  ui.step(`${published ? 'Publishing' : 'Unpublishing'} ${blogRef(id)}`);
  const btn = `blog.row-${id}.${verb}`;
  if (hasAnchor(btn)) {
    const toasts = watchToasts();
    await ui.click(btn, published ? 'Publish' : 'Unpublish');
    await waitUntil(() => row()?.status === want || firstError(toasts.collect()), { signal: ui.signal, timeoutMs: 15_000 });
    if (row()?.status !== want) {
      const why = firstError(toasts.collect());
      throw new Error(why ? `Could not ${verb} the post: ${why}` : `Could not ${verb} the post — it is still ${row()?.status ?? 'unchanged'}.`);
    }
  } else {
    // Not in the visible list (filtered or paged out) — the same store call
    // the row button makes.
    const updated = await useBlogStore.getState().setPublished(id, published);
    if (!updated) throw new Error(`Could not ${verb} the post (the server refused it — see the toast).`);
  }
  if (hasAnchor(`blog.row-${id}.edit`)) ui.flash(`blog.row-${id}.edit`);
  return { ok: true, blogId: id, title, status: want };
}

function publishDef(published: boolean, where: 'list' | 'editor') {
  const verb = published ? 'publish' : 'unpublish';
  return {
    name: `blog.${verb}`,
    description: published
      ? 'Publish a blog post to the live site.'
      : 'Unpublish a live blog post (back to draft).',
    args: publishArgs,
    confirm: async (a: z.infer<typeof publishArgs>) => {
      // Already there — run() reports "unchanged"; nothing for the user to OK.
      // No blogId on the list — run() refuses and says why.
      // No blogs.publish, or no post loaded in the editor — run() refuses too,
      // so no card for something that cannot happen.
      if (!can('blogs.publish')) return null;
      const open = useComposerStore.getState().blog;
      const inEditor = where === 'editor' && (!a.blogId || a.blogId === open?.id);
      if (inEditor && !open) return null;
      if (!inEditor && !a.blogId) return null;
      if (!mayOnPost('blogs.edit', inEditor ? open?.id : a.blogId)) return null;
      const status = inEditor
        ? open?.status
        : useBlogStore.getState().items.find((i) => i.id === a.blogId)?.status;
      if (status === (published ? 'published' : 'draft')) return null;
      const post = await blogRefAsync(inEditor ? open?.id : a.blogId);
      return published ? `Publish ${post} to the live site?` : `Unpublish ${post}? Readers will no longer see it.`;
    },
    run: async (a: z.infer<typeof publishArgs>, ui: UiDriver) => {
      if (!can('blogs.publish')) throw new Error(`Your role cannot ${verb} blog posts (needs blogs.publish).`);
      const open = useComposerStore.getState().blog;
      const target = where === 'list' || (a.blogId && a.blogId !== open?.id) ? a.blogId : open?.id;
      if (target && !mayOnPost('blogs.edit', target)) {
        throw new Error(can('blogs.edit') ? `You can only ${verb} your own blog posts.` : `Your role cannot ${verb} blog posts (needs blogs.edit).`);
      }

      if (where === 'list' || (a.blogId && a.blogId !== open?.id)) {
        if (!a.blogId) throw new Error('Pass blogId (use blog.list to find it).');
        return publishFromList(a.blogId, published, ui);
      }

      // The editor: its header button saves first, then flips the status.
      if (!open) throw new Error('No post is open in the editor.');
      const want = published ? 'published' : 'draft';
      if (open.status === want) return { ok: true, unchanged: true, blogId: open.id, title: open.title, status: want };
      ui.step(`${published ? 'Publishing' : 'Unpublishing'} “${open.title || 'Untitled post'}”`);
      const toasts = watchToasts();
      await ui.click('blog.publish-button', published ? 'Publish' : 'Unpublish');
      await waitUntil(() => useComposerStore.getState().blog?.status === want || firstError(toasts.collect()), {
        signal: ui.signal,
        timeoutMs: 20_000,
      });
      if (useComposerStore.getState().blog?.status !== want) {
        const why = firstError(toasts.collect());
        throw new Error(why ? `Could not ${verb} the post: ${why}` : `Could not ${verb} the post (a save conflict or the server refused it).`);
      }
      ui.flash('blog.publish-button');
      return { ok: true, blogId: open.id, title: open.title, status: want };
    },
  };
}

// ── The list screen ─────────────────────────────────────────────────────────

export function useBlogListActions(): void {
  // Keep a title for every post the list has shown, for confirm cards on posts
  // that a later tab / search has filtered out of `items`.
  useEffect(() => {
    rememberTitles(useBlogStore.getState().items);
    return useBlogStore.subscribe((st) => rememberTitles(st.items));
  }, []);

  useAgentAction({
    name: 'blog.list',
    description: 'List blog posts on the Blogs screen (id, title, status), optionally filtered by status or title search.',
    args: z.object({
      status: z.enum(['all', 'draft', 'published']).optional(),
      query: z.string().optional(),
    }),
    run: async (a, ui) => {
      let changed = false;
      if (a.status) {
        const tab = anchorEl(`blog.tab-${a.status}`);
        if (tab && tab.getAttribute('aria-selected') !== 'true') {
          await ui.click(`blog.tab-${a.status}`, a.status === 'all' ? 'All' : a.status === 'draft' ? 'Drafts' : 'Published');
          changed = true;
        }
      }
      if (a.query !== undefined) {
        const input = anchorEl<HTMLInputElement>('blog.search-input');
        if (input && input.value !== a.query) {
          await ui.type('blog.search-input', a.query, { clear: true, submit: true });
          changed = true;
        }
      }
      if (changed) await sleep(300, ui.signal);
      await waitUntil(() => !useBlogStore.getState().listLoading, { signal: ui.signal, timeoutMs: 10_000 });

      const { items, total, hasMore } = useBlogStore.getState();
      rememberTitles(items);
      const q = a.query?.trim().toLowerCase();
      const list = items
        .filter((p) => !a.status || a.status === 'all' || p.status === a.status)
        .filter((p) => !q || (p.title || '').toLowerCase().includes(q));
      // The screen's tab / search stay as left (the user sees the same list) —
      // say so, or a later call without a query reads a filtered list as all.
      const filter = listFilter();
      return {
        total,
        hasMore,
        filter,
        ...(filter.search.trim() && a.query === undefined
          ? { note: `The list is still filtered by the search “${filter.search}”. Pass query: '' to clear it.` }
          : {}),
        posts: list.map(summarise),
      };
    },
  });

  useAgentAction({
    name: 'blog.open',
    description: 'Open a blog post in the editor (/production-system/blogs/:id).',
    args: z.object({ blogId: z.string().min(1) }),
    run: async (a, ui) => {
      const path = `/production-system/blogs/${a.blogId}`;
      const link = `blog.row-${a.blogId}.edit`;
      if (hasAnchor(link)) await ui.click(link, `Edit ${blogRef(a.blogId)}`);
      else await ui.navigate(path);
      await ui.waitForRoute(path, 10_000);
      await ui.waitFor('blog.title-input', 10_000);
      const open = useComposerStore.getState().blog;
      return { opened: true, blogId: a.blogId, title: open?.title ?? null, status: open?.status ?? null, path };
    },
  });

  useAgentAction({
    name: 'blog.create',
    description: 'Create a draft blog post through the New post form (title, standfirst, byline, category, summary) and optionally write its body (markdown).',
    args: createArgs,
    run: runBlogCreate,
  });

  useAgentAction(publishDef(true, 'list'));
  useAgentAction(publishDef(false, 'list'));

  useAgentAction({
    name: 'blog.delete',
    description: 'Delete a blog post permanently.',
    args: z.object({ blogId: z.string().min(1) }),
    // No blogs.delete: run() refuses — no card for something that cannot happen.
    confirm: async (a) =>
      mayOnPost('blogs.delete', a.blogId) ? `Delete the blog post ${await blogRefAsync(a.blogId)}? This cannot be undone.` : null,
    run: async (a, ui) => {
      if (!mayOnPost('blogs.delete', a.blogId)) {
        throw new Error(can('blogs.delete') ? 'You can only delete your own blog posts.' : 'Your role cannot delete blog posts (needs blogs.delete).');
      }
      const title = blogTitle(a.blogId);
      ui.step(`Deleting ${blogRef(a.blogId)}`);
      // The row's bin button stops on a native window.confirm(), which would
      // freeze the page. The user has already OK'd the Operator's card, so point
      // at the button and make the same store call it makes.
      const btn = `blog.row-${a.blogId}.delete`;
      if (hasAnchor(btn)) await ui.point(btn, 'Delete');
      const ok = await useBlogStore.getState().removeBlog(a.blogId);
      if (!ok) throw new Error('The post was not deleted (the server refused it — see the toast).');
      return { deleted: true, blogId: a.blogId, title };
    },
  });
}

// ── The editor ──────────────────────────────────────────────────────────────

export function useBlogEditorActions(): void {
  useAgentAction(publishDef(true, 'editor'));
  useAgentAction(publishDef(false, 'editor'));

  useAgentAction({
    name: 'blog.setTitle',
    description: 'Retype the open post’s title in the editor (autosaves).',
    args: z.object({ title: z.string().min(1).max(300) }),
    confirm: (a) => {
      const open = useComposerStore.getState().blog;
      return open?.status === 'published' && mayOnPost('blogs.edit', open.id)
        ? `Retitle the LIVE post “${open.title}” to “${a.title}”? Readers see it once it saves.`
        : null;
    },
    run: async (a, ui) => {
      const open = useComposerStore.getState().blog;
      if (!open) throw new Error('No post is open in the editor.');
      assertMayEdit(open.id);
      await ui.type('blog.title-input', a.title, { clear: true });
      ui.flash('blog.title-input');
      const saveState = await settleSave(ui);
      return { blogId: open.id, title: useComposerStore.getState().blog?.title ?? a.title, saveState };
    },
  });

  const liveConfirm = (what: string) => {
    const open = useComposerStore.getState().blog;
    return open?.status === 'published' && mayOnPost('blogs.edit', open.id)
      ? `${what} of the LIVE post “${open.title || 'Untitled post'}”? Readers see it once it saves.`
      : null;
  };

  useAgentAction({
    name: 'blog.writeBody',
    description: 'Write the open post’s body yourself (markdown or paragraphs) — replaces the writing, or appends. Undoable.',
    args: bodyArgs,
    confirm: (a) => liveConfirm(a.mode === 'append' ? 'Add to the body' : 'Replace the body'),
    run: writeBodyInEditor,
  });

  useAgentAction({
    name: 'blog.setStandfirst',
    description: 'Set the open post’s standfirst (the line under the title).',
    args: z.object({ standfirst: z.string().max(300) }),
    confirm: () => liveConfirm('Change the standfirst'),
    run: async (a, ui) => {
      const open = useComposerStore.getState().blog;
      if (!open) throw new Error('No post is open in the editor.');
      assertMayEdit(open.id);
      if (hasAnchor('blog.standfirst-input')) await ui.point('blog.standfirst-input', 'Standfirst');
      const r = applySetField(open.id, 'subtitle', a.standfirst);
      if (!r.ok) throw new Error(r.error);
      if (hasAnchor('blog.standfirst-input')) ui.flash('blog.standfirst-input');
      return { blogId: open.id, standfirst: useComposerStore.getState().blog?.subtitle ?? a.standfirst, saveState: await settleSave(ui) };
    },
  });

  useAgentAction({
    name: 'blog.setDetails',
    description: 'Set the open post’s card summary, category, tags and/or byline (settings rail fields).',
    args: z
      .object({
        summary: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        byline: z.string().optional(),
      })
      .refine((a) => a.summary !== undefined || a.category !== undefined || a.tags !== undefined || a.byline !== undefined, {
        message: 'Pass at least one of summary, category, tags or byline.',
      }),
    confirm: () => liveConfirm('Change the details'),
    run: async (a, ui) => {
      const open = useComposerStore.getState().blog;
      if (!open) throw new Error('No post is open in the editor.');
      assertMayEdit(open.id);
      ui.step('Updating the post details');
      const writes: Array<[string, string]> = [];
      if (a.summary !== undefined) writes.push(['excerpt', a.summary]);
      if (a.category !== undefined) writes.push(['category', a.category]);
      if (a.tags !== undefined) writes.push(['tags', a.tags.join(', ')]);
      if (a.byline !== undefined) writes.push(['byline', a.byline]);
      const changed: string[] = [];
      for (const [field, value] of writes) {
        const r = applySetField(open.id, field, value);
        if (!r.ok) {
          throw new Error(changed.length ? `${r.error} (Already changed: ${changed.join(', ')}.)` : r.error);
        }
        changed.push(r.changed);
      }
      return { blogId: open.id, changed, saveState: await settleSave(ui) };
    },
  });

  useAgentAction({
    name: 'blog.save',
    description: 'Press Save in the editor and report the result.',
    args: z.object({}),
    run: async (_a, ui) => {
      const open = useComposerStore.getState().blog;
      if (!open) throw new Error('No post is open in the editor.');
      await ui.click('blog.save-button', 'Save');
      await sleep(200, ui.signal);
      await waitUntil(() => useComposerStore.getState().saveState !== 'saving', { signal: ui.signal, timeoutMs: 20_000 });
      const { saveState, saveError } = useComposerStore.getState();
      if (saveState === 'error' || saveState === 'conflict') throw new Error(saveError ?? `Save failed (${saveState}).`);
      return { saved: true, blogId: open.id, saveState };
    },
  });
}
