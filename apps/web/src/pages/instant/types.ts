/**
 * Instant — capture session types.
 *
 * One session = one capture (photos + optional voice note + optional topic) and
 * the draft the agent wrote from it. Nothing here is persisted until the user
 * confirms; the session lives in `instantStore` and dies with it.
 */
import type { CategoryKey } from './categories';

export type InstantMode = 'story' | 'blog';

/** Where a photo is in the pipeline. `failed` keeps the photo and its reason. */
export type PhotoState = 'pending' | 'working' | 'ready' | 'failed';

export interface CapturedPhoto {
  /** Stable id. Doubles as the blog media-pool id, so blocks can reference it. */
  id: string;
  file: File;
  /** Object URL for the thumbnail. Revoked when the photo is removed. */
  previewUrl: string;
  /** Stored URL once uploaded (S3, or an inline data URL when S3 is unset). */
  url?: string;
  key?: string;
  width?: number;
  height?: number;
  /** The picture-desk note from /api/agent/instant/vision. */
  note?: string;
  /** Caption from the draft pass, then whatever the user edits it to. */
  caption: string;
  state: PhotoState;
  error?: string;
}

/** A photo that can actually be used — analysed and stored. */
export function isUsable(photo: CapturedPhoto): boolean {
  return photo.state === 'ready' && !!photo.url;
}

// ── Draft shapes (mirror the server schemas in lib/agent/instantPrompt.ts) ───

export interface StoryFields {
  title: string;
  /** The whole article as plain text, paragraphs separated by a blank line. */
  body: string;
  category: CategoryKey | '';
  tags: string[];
}

/**
 * One item of a blog post's body, in reading order. Mirrors `BodyItem` in
 * apps/server/src/lib/agent/instantDraft.ts.
 *
 * This is the intermediate form between the agent and the block model: the agent
 * emits it, `buildBlocks` turns it into real `Block[]`, and `normaliseBlocks` on
 * the server validates that. The agent never emits blocks itself.
 */
export type BodyItem =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; items: { lead?: string; text: string }[] }
  | { kind: 'quote'; text: string; attribution?: string };

export interface BlogFields {
  title: string;
  subtitle: string;
  excerpt: string;
  /** Paragraphs, headings, lists and quotes in reading order. */
  body: BodyItem[];
  tags: string[];
}

/** Where the screen is. `working` covers upload + vision + drafting. */
export type InstantStep = 'capture' | 'working' | 'review' | 'saved';
