// ---------------------------------------------------------------------------
// The Stable Hand Operator — INSTANT CAPTURE pack (/production-system/instant).
//
// Registered by InstantWorkspace while it is mounted. The flow is the screen's
// own: capture (mode, topic, photos, voice note) → Generate draft → review the
// AI draft → "Confirm & save draft" / "Save & open in composer".
//
//   • Photos: the model puts a file the user attached in the chat into the
//     library input with the `upload` client tool (agentId 'instant.photo-input'
//     or the 'instant.add-photos' button) BEFORE instant.capture — the same
//     change event a person's pick fires, so instantStore.addPhotos runs.
//   • The voice-note box only appears once there is a transcript (normally from
//     recording), so instant.capture seeds its first character through the
//     store setter the box itself calls, then types the rest into the box.
//   • instant.file saves through instantStore.save → POST /api/articles or
//     /api/blogs as a DRAFT (nothing is published), and asks first.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/content.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';

import type { UiDriver } from '@/agent/operator/contracts';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { CATEGORY_OPTIONS } from '@/pages/instant/categories';
import { blogPlainText } from '@/pages/instant/buildBlocks';
import { useInstantStore } from '@/pages/instant/instantStore';
import type { InstantMode } from '@/pages/instant/types';

import { clip, firstError, has, normKey, sleep, waitUntil, watchToasts } from './contentUtils';

const S = () => useInstantStore.getState();

function readState(allowedModes: InstantMode[]) {
  const s = S();
  const draft =
    s.step === 'review' || s.step === 'saved'
      ? s.mode === 'story'
        ? { title: s.story.title, category: s.story.category, tags: s.story.tags, body: s.story.body }
        : {
            title: s.blog.title,
            subtitle: s.blog.subtitle,
            excerpt: s.blog.excerpt,
            tags: s.blog.tags,
            body: clip(blogPlainText(s.blog), 3500),
          }
      : null;
  return {
    step: s.step,
    mode: s.mode,
    allowedModes,
    topic: s.topic,
    voiceNote: s.transcript,
    photos: s.photos.map((p, i) => ({
      index: i,
      name: p.file.name,
      state: p.state,
      caption: p.caption,
      cover: p.id === s.coverPhotoId,
      ...(p.error ? { error: p.error } : {}),
    })),
    error: s.error,
    needsFacts: s.needsFacts,
    draft,
    saved: s.saved,
    categories: s.mode === 'story' ? CATEGORY_OPTIONS.map((c) => c.key) : undefined,
  };
}

function categoryKey(raw: string): string {
  if (!raw.trim()) return '';
  const k = normKey(raw);
  const hit = CATEGORY_OPTIONS.find((c) => normKey(c.key) === k || normKey(c.label) === k);
  if (!hit) throw new Error(`No category “${raw}”. Categories: ${CATEGORY_OPTIONS.map((c) => c.label).join(', ')}.`);
  return hit.key;
}

/** Type into a field whose React state echoes the value back. */
async function setField(ui: UiDriver, agentId: string, text: string) {
  await ui.type(agentId, text, { clear: true });
  await sleep(60, ui.signal);
}

export function useInstantOperatorActions(allowedModes: InstantMode[]): void {
  const enabled = allowedModes.length > 0;

  /** Back to the capture step from review (keeps photos) or saved (fresh). */
  async function toCapture(ui: UiDriver) {
    const step = S().step;
    if (step === 'review') await ui.click('instant.back', 'Back to capture');
    else if (step === 'saved') {
      if (!has('instant.capture-another')) throw new Error('The saved draft has already opened elsewhere — reopen Instant.');
      await ui.click('instant.capture-another', 'Capture another');
    } else if (step === 'working') {
      const ok = await waitUntil(() => S().step !== 'working', { timeoutMs: 180_000, signal: ui.signal });
      if (!ok) throw new Error('The previous draft is still being written.');
      return toCapture(ui);
    }
    await ui.waitFor('instant.generate', 4000);
  }

  useAgentAction(
    {
      name: 'instant.read',
      description: 'Read the Instant screen: step, mode, topic, voice note, photos and the AI draft under review.',
      args: z.object({}),
      run: async () => readState(allowedModes),
    },
    enabled,
  );

  const captureArgs = z
    .object({
      topic: z.string().max(300).optional(),
      voiceNote: z.string().max(6000).optional(),
      mode: z.enum(['story', 'blog']).optional(),
      generate: z.boolean().default(true),
    })
    .strict();
  useAgentAction<z.infer<typeof captureArgs>>(
    {
      name: 'instant.capture',
      description: 'Fill the capture (mode, topic, voice-note facts) and press Generate draft; waits for the AI draft.',
      args: captureArgs,
      run: async (a, ui) => {
        if (a.mode && !allowedModes.includes(a.mode)) {
          throw new Error(`Your role cannot save a ${a.mode === 'blog' ? 'blog post' : 'story'} here — allowed: ${allowedModes.join(', ')}.`);
        }
        await toCapture(ui);
        if (a.mode && S().mode !== a.mode) {
          await ui.click(`instant.mode-${a.mode}`, a.mode === 'blog' ? 'Blog post' : 'Story');
          await waitUntil(() => S().mode === a.mode, { timeoutMs: 1500, signal: ui.signal });
        }
        if (a.topic !== undefined) await setField(ui, 'instant.topic', a.topic);
        if (a.voiceNote !== undefined) {
          const text = a.voiceNote.trim();
          if (!text) {
            S().setTranscript('');
          } else {
            // The box renders only while a transcript exists, so open it with
            // the first character (the box's own setter), then type the rest.
            S().setTranscript(text.slice(0, 1));
            const shown = await waitUntil(() => has('instant.voice-note'), { timeoutMs: 1500, signal: ui.signal });
            if (shown) await ui.type('instant.voice-note', text.slice(1));
            else S().setTranscript(text); // recording unsupported in this browser: no box to type into
          }
        }
        if (!a.generate) return { ok: true, generated: false, ...readState(allowedModes) };

        if (!S().canGenerate()) {
          throw new Error('Nothing to draft from — give a topic or voiceNote, or upload a photo to instant.photo-input first.');
        }
        ui.step('Writing the draft');
        await ui.click('instant.generate', 'Generate draft');
        await waitUntil(() => S().step === 'working', { timeoutMs: 2000, signal: ui.signal });
        let tick = 0;
        const done = await waitUntil(
          () => {
            if (++tick % 8 === 0 && S().progress) ui.step(S().progress);
            return S().step !== 'working';
          },
          { timeoutMs: 240_000, intervalMs: 250, signal: ui.signal },
        );
        if (!done) throw new Error('The draft is taking too long — check the Instant screen.');
        if (S().step !== 'review') throw new Error(S().error || 'The draft could not be written.');
        return { ok: true, generated: true, ...readState(allowedModes) };
      },
    },
    enabled,
  );

  const editArgs = z
    .object({
      title: z.string().max(300).optional(),
      body: z.string().max(40_000).optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).max(6).optional(),
      subtitle: z.string().max(300).optional(),
      excerpt: z.string().max(1000).optional(),
    })
    .strict();
  useAgentAction<z.infer<typeof editArgs>>(
    {
      name: 'instant.editDraft',
      description: 'Edit the AI draft on the review step (typed into its fields).',
      args: editArgs,
      run: async (a, ui) => {
        if (S().step !== 'review') throw new Error(`There is no draft under review (step: ${S().step}). Run instant.capture first.`);
        const story = S().mode === 'story';
        if (!story && a.body !== undefined) {
          throw new Error("A blog post's body is a preview here — file it (instant.file) and edit the body in the composer.");
        }
        if (!story && a.category !== undefined) throw new Error('Blog posts have no category.');
        if (story && (a.subtitle !== undefined || a.excerpt !== undefined)) throw new Error('Stories have no standfirst or excerpt here.');
        const cat = a.category !== undefined ? categoryKey(a.category) : undefined;

        if (a.title !== undefined) await setField(ui, 'instant.title', a.title);
        if (a.subtitle !== undefined) await setField(ui, 'instant.subtitle', a.subtitle);
        if (a.body !== undefined) await setField(ui, 'instant.body', a.body);
        if (cat !== undefined) await ui.select('instant.category', cat);
        if (a.excerpt !== undefined) await setField(ui, 'instant.excerpt', a.excerpt);
        if (a.tags !== undefined) await setField(ui, 'instant.tags', a.tags.join(', '));
        return { ok: true, ...readState(allowedModes) };
      },
    },
    enabled,
  );

  useAgentAction(
    {
      name: 'instant.file',
      description: 'File the reviewed draft (Confirm & save draft / Save & open in composer). Saved as a DRAFT.',
      args: z.object({}),
      confirm: () => {
        const s = S();
        if (s.step !== 'review') return null;
        const title = (s.mode === 'story' ? s.story.title : s.blog.title).trim() || 'Untitled';
        return s.mode === 'story'
          ? `File “${clip(title)}” as a draft story? It is not published — it enters the normal review workflow.`
          : `Save “${clip(title)}” as a draft blog post and open it in the composer? It is not published.`;
      },
      run: async (_a, ui) => {
        const s = S();
        if (s.step === 'saved' && s.saved) return { ok: true, alreadySaved: s.saved };
        if (s.step !== 'review') throw new Error(`There is no draft to file (step: ${s.step}). Run instant.capture first.`);
        const toasts = watchToasts();
        // A saved POST hands off to the composer at once, and leaving Instant
        // resets its store — so catch `saved` the moment it appears.
        let saved = S().saved;
        const seen = () => {
          saved ??= S().saved;
          return saved;
        };
        await ui.click('instant.save', s.mode === 'story' ? 'Confirm & save draft' : 'Save & open in composer');
        await waitUntil(() => S().saving || !!seen() || !!firstError(toasts.collect()), { timeoutMs: 3000, signal: ui.signal });
        const ok = await waitUntil(() => !!seen() || (!S().saving && !!firstError(toasts.collect())), { timeoutMs: 30_000, signal: ui.signal });
        if (!saved) {
          if (!ok && S().saving) throw new Error('Saving is taking too long — check the screen.');
          throw new Error(firstError(toasts.collect()) ?? 'The draft was not saved — check the screen for what is missing.');
        }
        return {
          ok: true,
          saved,
          openAt: saved.kind === 'blog' ? `/production-system/blogs/${saved.id}` : `/articles/${saved.id}`,
          status: 'draft',
        };
      },
    },
    enabled,
  );
}
