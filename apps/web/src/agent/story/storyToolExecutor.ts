// Browser-side execution of the Story Studio assistant's client tools.
//
// The assistant is conversational — tier, category and horse choices are gathered
// in plain chat (typed or spoken). The byline is the signed-in member, the reading
// time is computed, the draft stage is fixed, and the lead photo is attached via
// the composer's 📎 button — so the model supplies none of those. Two tools run
// here: listHorses returns the register so the model can map spoken names to ids;
// createStoryDraft fills in the automatic fields, files the draft, and records the
// new id so the panel can open it.

import { useStoryStudioUi } from '@/stores/storyStudioUiStore';
import { useArticleStore } from '@/stores/articleStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useAuthStore } from '@/stores/authStore';
import { connectionResolver } from '@/lib/horseConnections';
import { buildRegister } from '@/lib/register';
import { usePeopleStore } from '@/stores/peopleStore';

const CLIENT_TOOLS = new Set(['listHorses', 'createStoryDraft']);

export function isStoryClientTool(name: string): boolean {
  return CLIENT_TOOLS.has(name);
}

async function listHorses(): Promise<unknown> {
  await Promise.all([
    useHorseStore.getState().fetchHorses(),
    usePartyStore.getState().fetchParties(),
  ]);
  const horses = useHorseStore.getState().horses;
  const conn = connectionResolver(buildRegister(usePeopleStore.getState().people, usePartyStore.getState().parties));
  const list = horses.slice(0, 200).map((h) => ({ id: h.id, name: h.name, trainer: conn(h).trainer || '' }));
  // Also surface the list to the user as an on-screen, read-only reference box.
  useStoryStudioUi.getState().setHorseOptions(list);
  return { horses: list };
}

async function createDraft(arg: Record<string, unknown>): Promise<unknown> {
  const title = String(arg.title ?? '').trim();
  const summary = String(arg.summary ?? '').trim();
  if (!title || !summary) return { ok: false, error: 'A headline and story are required.' };

  // Reading time, computed (never asked): ~200 words/minute, floored at 1.
  const words = summary.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.round(words / 200));

  // Byline = the signed-in member (never asked).
  const author = useAuthStore.getState().currentUser?.name?.trim() || 'Staff Correspondent';

  const category = arg.category ? String(arg.category) : undefined;

  const linkedHorseIds = Array.isArray(arg.linkedHorseIds) ? arg.linkedHorseIds.map(String) : [];

  // Lead photo = whatever the user attached via the composer (kept out of the model's context).
  const imageUrl = useStoryStudioUi.getState().attachedImageUrl?.trim() || undefined;

  const created = await useArticleStore.getState().addArticle({
    title,
    summary,
    author,
    status: 'draft',
    publishedAt: null,
    linkedHorseIds,

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
    case 'listHorses':
      return listHorses();
    case 'createStoryDraft':
      return createDraft(arg);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
