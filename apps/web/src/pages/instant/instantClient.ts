/**
 * Browser client for the Instant agent (/api/agent/instant/*).
 *
 * Two calls, both server-side-keyed:
 *   describePhoto()  — one photo's bytes → a picture-desk note
 *   requestDraft()   — the notes + brief → a story or blog draft
 *
 * There is no save call here on purpose: a confirmed draft is saved through the
 * ordinary `POST /api/articles` / `POST /api/blogs` endpoints (see
 * instantStore.save), so the workflow gate and the block validator both run.
 */
import { authFetch } from '@/lib/api';
import { compressImageToBlob } from '@/lib/upload';

import type { BlogFields, BodyItem, InstantMode, StoryFields } from './types';

/** Mirrors MAX_PHOTOS in apps/server/src/lib/agent/instantDraft.ts. */
export const MAX_PHOTOS = 6;
export const MAX_TOPIC_CHARS = 300;

/**
 * Longest edge sent to the vision model. Larger than the app's usual 1280 upload
 * cap because the agent is asked to read saddlecloth numbers and signage, and
 * that detail is the first thing a downscale destroys.
 */
const VISION_MAX_DIM = 1600;
const VISION_QUALITY = 0.82;

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error || `${fallback} (HTTP ${res.status})`;
}

/** Analyse ONE photo. Throws with a user-facing message on failure. */
export async function describePhoto(file: File, index: number, total: number): Promise<string> {
  const blob = await compressImageToBlob(file, { maxDim: VISION_MAX_DIM, quality: VISION_QUALITY });
  const qs = new URLSearchParams({
    filename: file.name || `photo-${index + 1}.jpg`,
    index: String(index),
    total: String(total),
  }).toString();
  const res = await authFetch(`/api/agent/instant/vision?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw new Error(await errorFrom(res, "I couldn't read that photo"));
  const data = (await res.json()) as { note?: string };
  const note = typeof data.note === 'string' ? data.note.trim() : '';
  if (!note) throw new Error("I couldn't read that photo — please try again.");
  return note;
}

export interface DraftRequest {
  mode: InstantMode;
  topic: string;
  transcript: string;
  imageNotes: string[];
}

/** What the agent returns, before the user edits any of it. */
export type DraftResult =
  | { mode: 'story'; fields: StoryFields; captions: string[]; needsFacts: boolean }
  | { mode: 'blog'; fields: BlogFields; captions: string[]; needsFacts: boolean };

interface RawStoryDraft {
  mode: 'story';
  title: string;
  body: string;
  category: string;
  tags: string[];
  captions: string[];
  needsFacts: boolean;
}

interface RawBlogDraft {
  mode: 'blog';
  title: string;
  subtitle?: string;
  excerpt: string;
  body: BodyItem[];
  tags: string[];
  captions: string[];
  needsFacts: boolean;
}

export async function requestDraft(req: DraftRequest): Promise<DraftResult> {
  const res = await authFetch('/api/agent/instant/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await errorFrom(res, "I couldn't write that draft"));

  const data = (await res.json()) as { draft?: RawStoryDraft | RawBlogDraft };
  const draft = data.draft;
  if (!draft) throw new Error('The draft came back empty — please try again.');

  if (draft.mode === 'blog') {
    return {
      mode: 'blog',
      needsFacts: !!draft.needsFacts,
      captions: draft.captions ?? [],
      fields: {
        title: draft.title ?? '',
        subtitle: draft.subtitle ?? '',
        excerpt: draft.excerpt ?? '',
        // Already normalised server-side by cleanBody(); nothing to re-shape here.
        body: draft.body ?? [],
        tags: draft.tags ?? [],
      },
    };
  }

  return {
    mode: 'story',
    needsFacts: !!draft.needsFacts,
    captions: draft.captions ?? [],
    fields: {
      title: draft.title ?? '',
      body: draft.body ?? '',
      category: draft.category ?? '',
      tags: draft.tags ?? [],
    },
  };
}
