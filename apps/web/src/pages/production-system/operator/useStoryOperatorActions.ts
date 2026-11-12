// ---------------------------------------------------------------------------
// Operator pack — STORIES (the Production System's editorial desk).
//
// Registered by ProductionSystemLayout while one of the story screens is open
// (Overview, Workflow Board, Pipeline, All Stories — the screens that carry the
// "File a Story" button). Every action drives the real UI the user is looking
// at — the File-a-Story menu, the article form, the Story Studio drawer, the
// board's own move buttons — or, where the control is not on screen, calls the
// SAME handler that control calls (useProductionSystemState.handleMove /
// handleEdit / handleDelete / handleOpenStudio). The server re-checks every
// write as the signed-in user.
//
// Names and arg shapes MUST match apps/server/src/lib/agent/operator/catalog/
// stories.ts.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import type { UiDriver } from '@/agent/operator/contracts';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { quoteRef } from '@/agent/operator/runtime/humanRef';
import { can, canAnyones, canEditArticle } from '@/lib/permissions';
import { findMove, movesFrom } from '@/lib/workflow';
import { useArticleStore } from '@/stores/articleStore';
import { useAuthStore } from '@/stores/authStore';
import { useStoryStudioUi } from '@/stores/storyStudioUiStore';
import { ARTICLE_STATUSES } from '@/types/article';
import type { Article, ArticleStatus } from '@/types/article';

import type { ProductionSystemState } from '../useProductionSystemState';
import { anchorEl, clip, hasAnchor, sleep, typeAndSend, waitForStudioTurn, waitUntil } from './studioTurn';

const stageEnum = z.enum(ARTICLE_STATUSES);

// ── Helpers ─────────────────────────────────────────────────────────────────

function me(): string | undefined {
  return useAuthStore.getState().currentUser?.name ?? undefined;
}

/** The stories this user can see — contributors only see their own. */
function visibleStories(): Article[] {
  const all = useArticleStore.getState().articles ?? [];
  if (canAnyones('stories.edit')) return all;
  const name = me();
  return all.filter((a) => a.author === name);
}

/** Find a story by id, or by an exact (case-insensitive) unique headline. */
function resolveStory(ref: string): Article {
  const list = visibleStories();
  const byId = list.find((a) => a.id === ref);
  if (byId) return byId;
  const q = ref.trim().toLowerCase();
  const byTitle = list.filter((a) => a.title.trim().toLowerCase() === q);
  if (byTitle.length === 1) return byTitle[0];
  if (byTitle.length > 1) throw new Error(`More than one story is titled ${quoteRef(ref)}. Use stories.list and pass the id.`);
  throw new Error(`No story ${quoteRef(ref, 'with that id')} is visible to you. Use stories.list to find its id.`);
}

function summarise(a: Article) {
  return {
    id: a.id,
    title: a.title || 'Untitled story',
    stage: a.status,
    author: a.author,
    category: a.category ?? null,
    changesRequested: !!a.changesRequested,
    scheduledFor: a.scheduledFor ?? null,
  };
}

function currentStatus(id: string): ArticleStatus | undefined {
  return (useArticleStore.getState().articles ?? []).find((a) => a.id === id)?.status;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Open a card's overflow menu (if needed) and click one of its items. */
async function clickCardMenuItem(ui: UiDriver, storyId: string, itemId: string, label: string): Promise<boolean> {
  if (hasAnchor(itemId)) {
    await ui.click(itemId, label);
    return true;
  }
  const menu = `story.card-${storyId}.menu`;
  if (!hasAnchor(menu)) return false;
  await ui.click(menu, 'More actions');
  if (!(await waitUntil(() => hasAnchor(itemId), { signal: ui.signal, timeoutMs: 2_000 }))) return false;
  await ui.click(itemId, label);
  return true;
}

/**
 * The story form has ONE copy field ("Story") — the full text, paragraphs split
 * by a blank line, whose first paragraph is the teaser. `summary` (a teaser /
 * standfirst) and `body` (the full copy) both land there: the summary as the
 * opening paragraph unless the body already opens with it.
 */
function composeCopy(summary: string | undefined, body: string | undefined): string | undefined {
  const s = summary?.trim();
  const b = body?.replace(/\r\n/g, '\n').trim();
  if (!b) return s === undefined ? undefined : s;
  if (!s || b.startsWith(s)) return b;
  return `${s}\n\n${b}`;
}

const CATEGORY_PREFIX = 'story.category-';

/** 'Race Report', 'race-reports', 'News · Race Reports' → 'race-report'. */
function categoryKey(text: string): string {
  const last = text.split('·').pop() ?? text;
  return last
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/s$/, '');
}

/** Click the form's own category pill (no-op when it is already selected). */
async function chooseCategory(ui: UiDriver, category: string): Promise<string> {
  const pills = Array.from(document.querySelectorAll<HTMLElement>(`[data-agent-id^="${CATEGORY_PREFIX}"]`)).filter(
    (el) => el.getAttribute('data-agent-id') !== `${CATEGORY_PREFIX}clear`,
  );
  const want = categoryKey(category);
  const hit = pills.find((el) => {
    const value = (el.getAttribute('data-agent-id') ?? '').slice(CATEGORY_PREFIX.length);
    return categoryKey(value) === want || categoryKey(el.getAttribute('data-agent-label') ?? '') === want;
  });
  if (!hit) {
    const names = pills.map((el) => el.getAttribute('data-agent-label') ?? '').filter(Boolean);
    throw new Error(`There is no story category “${category}”. The form offers: ${names.join(', ') || 'none'}.`);
  }
  const agentId = hit.getAttribute('data-agent-id')!;
  if (hit.getAttribute('aria-pressed') !== 'true') {
    await ui.click(agentId, hit.getAttribute('data-agent-label') ?? category);
  } else {
    await ui.point(agentId, 'Already selected');
  }
  return agentId.slice(CATEGORY_PREFIX.length);
}

/** Wait until the article form has closed (saved) — or report it still open. */
async function waitForFormClosed(ui: UiDriver, timeoutMs = 20_000): Promise<boolean> {
  return !!(await waitUntil(() => !hasAnchor('story.title-input'), { signal: ui.signal, timeoutMs }));
}

// ── The hook ────────────────────────────────────────────────────────────────

export function useStoryOperatorActions(s: ProductionSystemState, enabled: boolean): void {
  // stories.list ─────────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'stories.list',
      description: 'List the stories visible to you (id, title, stage, author), optionally by stage or search text.',
      args: z.object({
        stage: stageEnum.optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      run: async (a, ui) => {
        if (!(useArticleStore.getState().articles ?? []).length) await useArticleStore.getState().fetchArticles();
        // On All Stories the search box is right there — use it, so the user
        // sees the same filter the answer is based on.
        if (a.query && hasAnchor('story.search-input')) {
          ui.step(`Searching stories for “${a.query}”`);
          await ui.type('story.search-input', a.query, { clear: true });
        }
        const q = a.query?.trim().toLowerCase();
        const list = visibleStories()
          .filter((x) => !a.stage || x.status === a.stage)
          .filter(
            (x) =>
              !q ||
              x.title.toLowerCase().includes(q) ||
              x.author.toLowerCase().includes(q) ||
              (x.category ?? '').toLowerCase().includes(q),
          );
        const limit = a.limit ?? 50;
        return { total: list.length, shown: Math.min(limit, list.length), stories: list.slice(0, limit).map(summarise) };
      },
    },
    enabled,
  );

  // stories.open ─────────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'stories.open',
      description: 'Open a story’s page (/articles/:id) — leaves the Production System.',
      args: z.object({ storyId: z.string().min(1) }),
      run: async (a, ui) => {
        const story = resolveStory(a.storyId);
        const path = `/articles/${story.id}`;
        const row = `story.row-${story.id}.open`;
        if (hasAnchor(row)) await ui.click(row, story.title);
        else {
          if (hasAnchor(`story.card-${story.id}`)) await ui.point(`story.card-${story.id}`, story.title);
          await ui.navigate(path);
        }
        await ui.waitForRoute(path, 10_000);
        return { opened: true, storyId: story.id, title: story.title, path };
      },
    },
    enabled,
  );

  // stories.fileWithStudio / stories.studioReply ─────────────────────────────
  const askStudio = async (message: string, ui: UiDriver, fresh: boolean) => {
    if (!can('stories.create')) throw new Error('Your role cannot file stories (needs stories.create).');
    const st = useStoryStudioUi.getState;

    if (!st().open) {
      ui.step('Opening Story Studio');
      if (hasAnchor('story.file-button')) {
        await ui.click('story.file-button', 'File a Story');
        await ui.waitFor('story.file-with-ai', 4_000);
        await ui.click('story.file-with-ai', 'Story Studio AI');
      } else {
        s.handleOpenStudio();
      }
    }
    await ui.waitFor('story.studio-input', 6_000);

    // Never type over a turn that is still running.
    if (st().chat.busy) {
      ui.step('Waiting for Story Studio to finish');
      await waitUntil(() => !st().chat.busy, { signal: ui.signal, timeoutMs: 120_000 });
    }
    if (fresh && st().chat.messageCount > 0) await ui.click('story.studio-new-chat', 'New chat');
    if (!fresh && st().chat.messageCount === 0) {
      throw new Error('Story Studio has no conversation to reply to. Start one with stories.fileWithStudio.');
    }

    // Catch the filed draft: the panel clears createdDraftId (and navigates to
    // the story) within the same render, so subscribe rather than poll.
    const filed: { id: string | null } = { id: null };
    const unsub = useStoryStudioUi.subscribe((state) => {
      if (state.createdDraftId) filed.id = state.createdDraftId;
    });
    try {
      const before = st().chat.messageCount;
      ui.step('Asking Story Studio');
      await typeAndSend(ui, 'story.studio-input', 'story.studio-send', message);
      ui.step('Story Studio is writing…');
      const out = await waitForStudioTurn(() => st().chat, before, {
        signal: ui.signal,
        interrupt: () => filed.id,
      });

      const filedId = filed.id;
      if (filedId) {
        const story = (useArticleStore.getState().articles ?? []).find((x) => x.id === filedId);
        return {
          filed: true,
          storyId: filedId,
          title: story?.title ?? null,
          stage: story?.status ?? 'draft',
          openedAt: `/articles/${filedId}`,
          note: 'Story Studio filed the draft and opened the story page.',
        };
      }
      if (out.status === 'error') throw new Error(`Story Studio failed: ${out.error}`);
      if (out.status === 'not-started') throw new Error('The message did not send — Story Studio may be busy or switched off.');
      return {
        filed: false,
        studioReply: out.reply,
        finished: out.status === 'done',
        note:
          out.status === 'timeout'
            ? 'Story Studio is still working. Call stories.studioReply later or check the drawer.'
            : 'Story Studio replied but has not filed yet — it usually asks about photo, tier, category and horses. Answer with stories.studioReply({ message }); ask the user anything you cannot answer from context.',
      };
    } catch (err) {
      // Stop must also stop the studio turn THIS action started (as the profile
      // pack does) — otherwise Story Studio keeps writing and may still file a
      // draft after the user pressed Stop. Its own Stop button.
      if (ui.signal.aborted || (err as Error)?.name === 'AbortError') {
        anchorEl<HTMLButtonElement>('story.studio-stop')?.click();
      }
      throw err;
    } finally {
      unsub();
    }
  };

  useAgentAction(
    {
      name: 'stories.fileWithStudio',
      description:
        'Opens a SEPARATE AI drawer (Story Studio). Only when the user explicitly asks for Story Studio — otherwise write the story yourself with stories.createDraft.',
      args: z.object({ brief: z.string().min(3), newChat: z.boolean().optional() }),
      run: async (a, ui) => askStudio(clip(a.brief, 4000), ui, a.newChat ?? true),
    },
    enabled,
  );

  useAgentAction(
    {
      name: 'stories.studioReply',
      description: 'Answer Story Studio’s latest question in the open conversation (typed into the drawer).',
      args: z.object({ message: z.string().min(1) }),
      run: async (a, ui) => askStudio(clip(a.message, 4000), ui, false),
    },
    enabled,
  );

  // stories.createDraft ──────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'stories.createDraft',
      description:
        'Write and file a draft story yourself through File a Story → Write it yourself (headline, copy, category, byline).',
      args: z.object({
        title: z.string().min(1).max(300),
        summary: z.string().optional(),
        body: z.string().optional(),
        category: z.string().optional(),
        author: z.string().optional(),
      }),
      run: async (a, ui) => {
        if (!can('stories.create')) throw new Error('Your role cannot file stories (needs stories.create).');
        if (hasAnchor('story.title-input')) {
          throw new Error('The story form is already open. Close it (story.form-cancel) first.');
        }
        ui.step('Opening the File a Story form');
        if (hasAnchor('story.file-button')) {
          await ui.click('story.file-button', 'File a Story');
          await ui.waitFor('story.file-manual', 4_000);
          await ui.click('story.file-manual', 'Write it yourself');
        } else {
          s.handleNewInColumn('draft');
        }
        await ui.waitFor('story.title-input', 6_000);
        // A half-typed story from an earlier session is restored into the form —
        // that is the USER's unsaved work (useFormDraft), and this action has no
        // confirm card: ask before discarding it, and on No leave it open.
        if (hasAnchor('story.form-discard-draft')) {
          const ok = await ui.confirm('The File a Story form has an unsaved draft from an earlier session. Discard that draft so I can write this story from scratch?');
          if (!ok) throw new Error('Stopped: the user chose to keep their unsaved story draft. The form is left open with it.');
          await ui.click('story.form-discard-draft', 'Discard old draft');
        }

        ui.step('Typing the headline');
        await ui.type('story.title-input', a.title, { clear: true });
        const copy = composeCopy(a.summary, a.body);
        if (copy) {
          ui.step('Writing the story copy');
          await ui.type('story.summary-input', copy, { clear: true });
        }
        let category: string | null = null;
        if (a.category?.trim()) {
          ui.step(`Choosing the category “${a.category.trim()}”`);
          category = await chooseCategory(ui, a.category);
        }
        const author = anchorEl<HTMLInputElement>('story.author-input');
        if (author && !author.readOnly) {
          const byline = a.author?.trim() || (!author.value.trim() ? me() : undefined);
          if (byline && byline !== author.value) await ui.type('story.author-input', byline, { clear: true });
        }

        const before = new Set((useArticleStore.getState().articles ?? []).map((x) => x.id));
        await ui.click('story.form-submit', 'Save Draft');
        const created = await waitUntil(
          () => (useArticleStore.getState().articles ?? []).find((x) => !before.has(x.id) && x.title === a.title.trim()),
          { signal: ui.signal, timeoutMs: 20_000 },
        );
        if (!created) {
          throw new Error(
            hasAnchor('story.title-input')
              ? 'The form did not save (the server refused it — see the toast). It is still open.'
              : 'The form closed but the new story was not found.',
          );
        }
        await waitForFormClosed(ui, 5_000);
        if (hasAnchor(`story.card-${created.id}`)) ui.flash(`story.card-${created.id}`);
        return {
          created: true,
          storyId: created.id,
          title: created.title,
          copyChars: (created.summary ?? '').length,
          ...(category ? { category } : {}),
          story: summarise(created),
        };
      },
    },
    enabled,
  );

  // stories.moveStage ────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'stories.moveStage',
      description: 'Move a story to another workflow stage (submit, approve, schedule, publish, send back).',
      args: z.object({
        storyId: z.string().min(1),
        stage: stageEnum,
        scheduledFor: z.string().optional(),
        note: z.string().optional(),
      }),
      confirm: (a) => {
        // Only ask about a move that can actually happen — an illegal or no-op
        // move must not cost the user a click before run() refuses it.
        let story: Article;
        try {
          story = resolveStory(a.storyId);
        } catch {
          return null;
        }
        const move = findMove(story.status, a.stage);
        if (story.status === a.stage || !move || !can(move.permission)) return null;
        const title = story.title || 'Untitled story';
        if (a.stage === 'published') return `Publish “${title}” to the live site now?`;
        if (a.stage === 'scheduled') {
          const t = a.scheduledFor ? Date.parse(a.scheduledFor) : NaN;
          if (!Number.isFinite(t) || t < Date.now()) return null; // run() explains what is missing
          return `Schedule “${title}” to publish automatically${a.scheduledFor ? ` at ${fmtWhen(a.scheduledFor)}` : ''}?`;
        }
        return null;
      },
      run: async (a, ui) => {
        const story = resolveStory(a.storyId);
        const from = story.status;
        if (from === a.stage) return { ok: true, unchanged: true, story: summarise(story) };

        const move = findMove(from, a.stage);
        if (!move) {
          const legal = movesFrom(from).map((m) => m.to).join(', ') || 'none';
          throw new Error(`A story cannot go from ${from} to ${a.stage}. From ${from} it can go to: ${legal}.`);
        }
        if (!can(move.permission)) throw new Error(`You cannot ${move.label.toLowerCase()} this story (needs ${move.permission}).`);

        let scheduledFor: string | undefined;
        if (a.stage === 'scheduled') {
          const t = a.scheduledFor ? Date.parse(a.scheduledFor) : NaN;
          if (!Number.isFinite(t)) throw new Error('Scheduling needs scheduledFor — an ISO date-time, e.g. 2026-11-12T09:00:00+11:00.');
          if (t < Date.now()) throw new Error('scheduledFor is in the past.');
          scheduledFor = new Date(t).toISOString();
        }

        const card = `story.card-${story.id}`;
        const itemId = `story.card-${story.id}.move-${a.stage}`;
        const sendBack = !!move.back && a.stage === 'draft';
        ui.step(`${move.label}: “${story.title || 'Untitled story'}”`);
        if (hasAnchor(card)) await ui.point(card, story.title);

        let drove = false;
        if (hasAnchor(card) && a.stage !== 'scheduled') {
          // The board's own buttons — the same click a person makes.
          drove = await clickCardMenuItem(ui, story.id, itemId, move.label);
          if (drove && sendBack) {
            await ui.waitFor('story.sendback-note', 4_000);
            if (a.note) await ui.type('story.sendback-note', a.note, { clear: true });
            await ui.click('story.sendback-confirm', 'Send back');
          }
        }
        // Scheduling needs a date-time picker typed precisely, and some screens
        // have no card — use the same handler the board calls.
        if (!drove) await s.handleMove(story, move, { note: a.note, scheduledFor });

        const landed = await waitUntil(() => currentStatus(story.id) === a.stage, { signal: ui.signal, timeoutMs: 15_000 });
        await sleep(150, ui.signal);
        if (hasAnchor(card)) ui.flash(card);
        const final = currentStatus(story.id) ?? from;
        if (!landed) {
          return { ok: false, storyId: story.id, title: story.title, from, stage: final, error: 'The move did not stick — the server refused it (see the toast).' };
        }
        return { ok: true, storyId: story.id, title: story.title, from, stage: final, ...(scheduledFor ? { scheduledFor } : {}) };
      },
    },
    enabled,
  );

  // stories.edit / stories.editBody ─────────────────────────────────────────
  type EditInput = { storyId: string; title?: string; summary?: string; body?: string; category?: string };

  const confirmLiveEdit = (a: { storyId: string }) => {
    try {
      const st = resolveStory(a.storyId);
      // Not editable by this user: run() refuses — no card first.
      if (!canEditArticle(st.author, me())) return null;
      return st.status === 'published' ? `Edit the LIVE story “${st.title || 'Untitled story'}”? Readers see the change as soon as it saves.` : null;
    } catch {
      return null;
    }
  };

  const runEdit = async (a: EditInput, ui: UiDriver) => {
    const story = resolveStory(a.storyId);
    if (!canEditArticle(story.author, me())) throw new Error('You cannot edit this story.');
    if (hasAnchor('story.title-input')) throw new Error('The story form is already open. Close it first.');

    ui.step(`Opening “${story.title || 'Untitled story'}” for revision`);
    let opened = false;
    if (hasAnchor(`story.card-${story.id}`)) {
      opened = await clickCardMenuItem(ui, story.id, `story.card-${story.id}.edit`, 'Edit story');
    } else if (hasAnchor(`story.row-${story.id}.edit`)) {
      await ui.click(`story.row-${story.id}.edit`, 'Edit');
      opened = true;
    }
    // Not on screen (Overview, Pipeline) — the same handler the Edit button calls.
    if (!opened) s.handleEdit(story);
    await ui.waitFor('story.title-input', 6_000);

    if (a.title !== undefined) await ui.type('story.title-input', a.title, { clear: true });
    const copy = composeCopy(a.summary, a.body);
    if (copy !== undefined) {
      ui.step('Rewriting the story copy');
      await ui.type('story.summary-input', copy, { clear: true });
    }
    let category: string | null = null;
    if (a.category?.trim()) {
      ui.step(`Choosing the category “${a.category.trim()}”`);
      category = await chooseCategory(ui, a.category);
    }
    await ui.click('story.form-submit', 'Save Revision');
    if (!(await waitForFormClosed(ui))) {
      throw new Error('The revision did not save (the server refused it — see the toast). The form is still open.');
    }
    const after = (useArticleStore.getState().articles ?? []).find((x) => x.id === story.id);
    if (hasAnchor(`story.card-${story.id}`)) ui.flash(`story.card-${story.id}`);
    return {
      saved: true,
      storyId: story.id,
      ...(copy !== undefined ? { copyChars: (after?.summary ?? copy).length } : {}),
      ...(category ? { category } : {}),
      story: after ? summarise(after) : null,
    };
  };

  useAgentAction(
    {
      name: 'stories.edit',
      description: 'Revise a story’s headline, copy and/or category through the Revise the Story form.',
      args: z
        .object({
          storyId: z.string().min(1),
          title: z.string().min(1).optional(),
          summary: z.string().optional(),
          body: z.string().optional(),
          category: z.string().optional(),
        })
        .refine((a) => a.title !== undefined || a.summary !== undefined || a.body !== undefined || a.category !== undefined, {
          message: 'Pass at least one of title, summary, body or category.',
        }),
      confirm: confirmLiveEdit,
      run: runEdit,
    },
    enabled,
  );

  useAgentAction(
    {
      name: 'stories.editBody',
      description: 'Replace a story’s full copy (typed into the Revise the Story form) and save.',
      args: z.object({ storyId: z.string().min(1), body: z.string().min(1) }),
      confirm: confirmLiveEdit,
      run: (a, ui) => runEdit({ storyId: a.storyId, body: a.body }, ui),
    },
    enabled,
  );

  // stories.delete ───────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'stories.delete',
      description: 'Delete a story from the board (an administrator can restore it).',
      args: z.object({ storyId: z.string().min(1) }),
      confirm: (a) => {
        // Unknown story or no right to delete it: run() refuses with the reason —
        // no point asking the user to OK something that cannot happen.
        let story: Article;
        try {
          story = resolveStory(a.storyId);
        } catch {
          return null;
        }
        if (!canEditArticle(story.author, me())) return null;
        return `Delete the story “${story.title || 'Untitled story'}”? It leaves the board (an administrator can restore it).`;
      },
      run: async (a, ui) => {
        const story = resolveStory(a.storyId);
        if (!canEditArticle(story.author, me())) throw new Error('You cannot delete this story.');
        ui.step(`Deleting “${story.title || 'Untitled story'}”`);
        if (hasAnchor(`story.card-${story.id}`)) await ui.point(`story.card-${story.id}`, story.title);
        const opened =
          hasAnchor(`story.card-${story.id}`) &&
          (await clickCardMenuItem(ui, story.id, `story.card-${story.id}.delete`, 'Delete'));
        if (!opened) s.handleDelete(story);
        await ui.waitFor('story.delete-confirm', 4_000);
        await ui.click('story.delete-confirm', 'Delete');
        const gone = await waitUntil(
          () => !(useArticleStore.getState().articles ?? []).some((x) => x.id === story.id) && !hasAnchor('story.delete-confirm'),
          { signal: ui.signal, timeoutMs: 15_000 },
        );
        if (!gone) throw new Error('The delete did not go through (the server refused it — see the toast).');
        return { deleted: true, storyId: story.id, title: story.title };
      },
    },
    enabled,
  );
}
