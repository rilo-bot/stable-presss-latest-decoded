// ---------------------------------------------------------------------------
// The Stable Hand — HORSES on the public site: the register (/horses) and a
// horse's dossier (/horses/:id).
//
//   site.searchHorses  types into the register's real search box; the grid
//                      visibly filters and the result is read off the same list.
//   horse.read         the open dossier's summary (identity, pedigree, racing
//                      summary, connections, recent form).
//   horse.follow /     add / remove a horse from the viewer's personal stable —
//   horse.unfollow     the same followStore toggle the Follow button uses (a
//                      per-browser bookmark list; there is no follow backend),
//                      with the same toast. On /horses the "My Stable" strip
//                      visibly updates.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { toast } from 'sonner';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { UiDriver } from '@/agent/operator/contracts';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useFollowStore } from '@/stores/followStore';
import { useAuthStore } from '@/stores/authStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { canManageHorse } from '@/rbac/can';
import { connectionResolver } from '@/lib/horseConnections';
import type { Horse } from '@/types/horse';
import { anchor, day, resolveOne, sleep, typeSearch, useLive, waitUntil } from './siteUtils';

const MAX = 25;
const horseArgs = z.object({ horse: z.string().max(120).optional() });

function horseRow(h: Horse) {
  const c = connectionResolver(usePartyStore.getState().parties)(h);
  return {
    id: h.id,
    name: h.isUnnamed ? 'Un-Named' : h.name || 'Unnamed',
    sex: h.sex ?? null,
    colour: h.colour ?? null,
    foaled: h.dob ?? null,
    owner: c.owner || null,
    trainer: c.trainer || null,
    jockey: c.jockey || null,
    following: useFollowStore.getState().followedHorseIds.includes(h.id),
    path: `/horses/${h.id}`,
  };
}

function findHorse(q: string): Horse {
  const horses = useHorseStore.getState().horses ?? [];
  return resolveOne(q, horses, (h) => [h.id, h.name], 'horse', (h) => h.name || h.id);
}

/** Follow / unfollow through the same store + toast as the Follow button. */
async function setFollow(h: Horse, want: boolean, ui: UiDriver, cardId?: string) {
  const following = useFollowStore.getState().followedHorseIds.includes(h.id);
  const name = h.name || 'this horse';
  if (cardId && anchor(cardId)) await ui.point(cardId, want ? `Follow ${name}` : `Unfollow ${name}`);
  if (following === want) {
    return { ok: true, unchanged: true, horse: name, following: want };
  }
  ui.step(want ? `Adding ${name} to your stable` : `Removing ${name} from your stable`);
  useFollowStore.getState().toggleFollow(h.id);
  toast.success(want ? 'Added to your stable — you are now following' : 'Removed from your stable');
  if (cardId) {
    // The "My Stable" strip on /horses re-renders with the change.
    await waitUntil(() => !!anchor('site.my-stable'), { timeoutMs: 1200, signal: ui.signal });
    await sleep(150, ui.signal);
    if (anchor('site.my-stable')) ui.flash('site.my-stable');
  }
  return {
    ok: true,
    horse: name,
    following: useFollowStore.getState().followedHorseIds.includes(h.id),
    myStable: (useHorseStore.getState().horses ?? [])
      .filter((x) => useFollowStore.getState().followedHorseIds.includes(x.id))
      .map((x) => x.name),
    note: 'Following is a per-browser bookmark list (My Stable on /horses); nobody else sees it.',
  };
}

// ── /horses ──────────────────────────────────────────────────────────────────

export function useHorseRegisterOperatorActions(state: { query: string; filtered: Horse[]; total: number }): void {
  const live = useLive(state);

  useAgentAction<{ query: string }>({
    name: 'site.searchHorses',
    description: 'Type into the horse register search (name, trainer, jockey or owner) and return the matches.',
    args: z.object({ query: z.string().max(120) }),
    run: async (a, ui) => {
      await typeSearch(ui, 'site.horse-search', a.query, () => live.current.query === a.query);
      const rows = live.current.filtered;
      return { query: a.query, total: live.current.total, matches: rows.length, horses: rows.slice(0, MAX).map(horseRow) };
    },
  });

  const onList = (want: boolean) => async (a: { horse?: string }, ui: UiDriver) => {
    if (!a.horse) throw new Error('Say which horse (name or id).');
    const h = findHorse(a.horse);
    return setFollow(h, want, ui, `site.horse-${h.id}`);
  };
  useAgentAction<{ horse?: string }>({
    name: 'horse.follow',
    description: 'Follow a horse (adds it to My Stable).',
    args: horseArgs,
    run: onList(true),
  });
  useAgentAction<{ horse?: string }>({
    name: 'horse.unfollow',
    description: 'Unfollow a horse (removes it from My Stable).',
    args: horseArgs,
    run: onList(false),
  });
}

// ── /horses/:id ──────────────────────────────────────────────────────────────

export function useHorseDossierOperatorActions(horseId: string): void {
  const live = useLive(horseId);

  useAgentAction({
    name: 'horse.read',
    description: "Read the open horse dossier: identity, pedigree, racing summary, connections and recent form.",
    args: z.object({}),
    run: async () => {
      const id = live.current;
      const h = (useHorseStore.getState().horses ?? []).find((x) => x.id === id);
      if (!h) throw new Error('The horse has not loaded yet (or is not in the register).');
      const edges = usePartyStore.getState().parties.filter((p) => p.horseId === id);
      const connections: Record<string, string[]> = {};
      for (const e of edges) {
        const list = (connections[e.role] ??= []);
        if (e.name && !list.includes(e.name)) list.push(e.name);
      }
      const form = (useRacingEntryStore.getState().entries ?? [])
        .filter((r) => r.horse_id === id)
        .sort((a, b) => String(b.race_date).localeCompare(String(a.race_date)))
        .slice(0, 5)
        .map((r) => ({ race: r.race_name, date: r.race_date, venue: r.venue, grade: r.class_grade ?? null, finish: r.finish_position ?? null }));
      const user = useAuthStore.getState().currentUser;
      const editable = canManageHorse(user, id, { parties: usePartyStore.getState().parties, horses: useHorseStore.getState().horses });
      return {
        id: h.id,
        name: h.isUnnamed ? 'Un-Named' : h.name,
        identity: { sex: h.sex ?? null, colour: h.colour ?? null, foaled: h.dob ?? null, country: h.country ?? null },
        pedigree: { sire: h.sire ?? null, dam: h.dam ?? null, damSire: h.damSire ?? null },
        racing: {
          career: h.careerRecord ?? null,
          winnings: h.careerWinnings ?? null,
          last10: h.lastTenForm ?? null,
          rating: h.currentRating ?? null,
        },
        connections,
        recentForm: form,
        pullQuote: h.pullQuote ?? null,
        verified: h.verificationStatus !== 'unverified',
        following: useFollowStore.getState().followedHorseIds.includes(h.id),
        studioPath: editable ? `/studio/horse/${h.id}` : null,
        createdAt: day(h.createdAt as unknown as string),
      };
    },
  });

  const onDossier = (want: boolean) => async (a: { horse?: string }, ui: UiDriver) => {
    const h = a.horse ? findHorse(a.horse) : (useHorseStore.getState().horses ?? []).find((x) => x.id === live.current);
    if (!h) throw new Error('The horse has not loaded yet.');
    return setFollow(h, want, ui);
  };
  useAgentAction<{ horse?: string }>({
    name: 'horse.follow',
    description: 'Follow this horse (adds it to My Stable).',
    args: horseArgs,
    run: onDossier(true),
  });
  useAgentAction<{ horse?: string }>({
    name: 'horse.unfollow',
    description: 'Unfollow this horse.',
    args: horseArgs,
    run: onDossier(false),
  });
}
