// Browser-side execution of the Story Studio assistant's client tools.
//
// The interactive tools (proposeStory / requestPhoto / requestByline /
// requestAccessTier / requestCategory / requestHorseLinks) park a PendingInteraction
// in the store and return a Promise that resolves when the matching card is
// completed by the user. createStoryDraft computes the reading time, files the
// draft through the article store, and records the new id so the panel can open it.

import { useStoryStudioUi, type InteractionKind } from '@/stores/storyStudioUiStore';
import { useArticleStore } from '@/stores/articleStore';
import type { SubscriptionTier } from '@/rbac/entitlement';

const CLIENT_TOOLS = new Set([
  'proposeStory',
  'requestPhoto',
  'requestByline',
  'requestAccessTier',
  'requestCategory',
  'requestHorseLinks',
  'createStoryDraft',
]);

export function isStoryClientTool(name: string): boolean {
  return CLIENT_TOOLS.has(name);
}

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `s-${Date.now()}-${Math.round(Math.random() * 1e6)}`; }
}

/** Park a card in the store and wait for the user to finish it. */
function waitForInteraction(kind: InteractionKind, data?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    useStoryStudioUi.getState().setPending({ id: newId(), kind, data, resolve });
  });
}

const VALID_TIERS: SubscriptionTier[] = ['free', 'standard', 'premium'];

async function createDraft(arg: Record<string, unknown>): Promise<unknown> {
  const title = String(arg.title ?? '').trim();
  const summary = String(arg.summary ?? '').trim();
  if (!title || !summary) return { ok: false, error: 'A headline and story are required.' };

  // Reading time, computed (never asked): ~200 words/minute, floored at 1.
  const words = summary.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.round(words / 200));

  const author = String(arg.author ?? '').trim() || 'Staff Correspondent';
  const category = arg.category ? String(arg.category) : undefined;
  const rawTier = String(arg.minTier ?? 'free') as SubscriptionTier;
  const minTier: SubscriptionTier = VALID_TIERS.includes(rawTier) ? rawTier : 'free';
  const imageUrl = arg.imageUrl ? String(arg.imageUrl).trim() : undefined;
  const linkedHorseIds = Array.isArray(arg.linkedHorseIds) ? arg.linkedHorseIds.map(String) : [];

  const created = await useArticleStore.getState().addArticle({
    title,
    summary,
    author,
    status: 'draft',
    publishedAt: null,
    linkedHorseIds,
    minTier,
    readingTime,
    ...(category ? { category } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  });

  if (!created) return { ok: false, error: 'Could not file the draft. Please try again.' };
  useStoryStudioUi.getState().setCreatedDraft(created.id);
  return { ok: true, id: created.id };
}

export async function executeStoryTool(name: string, input: unknown): Promise<unknown> {
  const arg = (input ?? {}) as Record<string, unknown>;

  switch (name) {
    case 'proposeStory': {
      const title = String(arg.title ?? '').trim();
      const summary = String(arg.summary ?? '').trim();
      if (!title || !summary) return { accepted: false, error: 'title and summary are required' };
      return waitForInteraction('story', { title, summary });
    }
    case 'requestPhoto':
      return waitForInteraction('photo');
    case 'requestByline':
      return waitForInteraction('byline', { suggested: arg.suggested ? String(arg.suggested) : '' });
    case 'requestAccessTier':
      return waitForInteraction('tier');
    case 'requestCategory':
      return waitForInteraction('category');
    case 'requestHorseLinks':
      return waitForInteraction('horses');
    case 'createStoryDraft':
      return createDraft(arg);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
