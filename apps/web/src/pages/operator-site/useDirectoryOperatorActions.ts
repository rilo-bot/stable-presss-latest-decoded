// ---------------------------------------------------------------------------
// The Stable Hand — the public INDUSTRY DIRECTORY: /parties (search + role
// filter) and a person's public profile (/parties/:id).
//
//   site.searchDirectory  types into the directory's real search box and, if a
//                         role is given, clicks that role chip — the grid
//                         visibly filters; rows come from the same list.
//   site.readParty        the open profile: roles, details, horses.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { PARTY_ROLES, PARTY_ROLE_LABELS, type PartyRole } from '@/types/party';
import type { RegisterPerson } from '@/lib/register';
import { buildRegister } from '@/lib/register';
import { usePeopleStore } from '@/stores/peopleStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorseStore } from '@/stores/horseStore';
import { useAuthStore } from '@/stores/authStore';
import { canManagePerson } from '@/rbac/can';
import { anchor, normKey, sleep, typeSearch, useLive, waitUntil } from './siteUtils';

const MAX = 25;

/** 'Trainers', 'trainer', 'bloodstock' → a PartyRole (or throws). */
export function partyRole(raw: string): PartyRole {
  const k = normKey(raw).replace(/s$/, '');
  const hit = PARTY_ROLES.find((r) => normKey(r) === k || normKey(PARTY_ROLE_LABELS[r]) === k || normKey(r).startsWith(k));
  if (!hit) throw new Error(`"${raw}" is not a role. Roles: ${PARTY_ROLES.map((r) => PARTY_ROLE_LABELS[r]).join(', ')}.`);
  return hit;
}

export const roleChipId = (r: string) => `site.directory-role-${r.replace(/ /g, '-')}`;

const personRow = (p: RegisterPerson) => ({
  id: p.id,
  name: p.name,
  roles: p.roles.map((r) => PARTY_ROLE_LABELS[r] ?? r),
  profession: p.profession ?? null,
  base: p.baseLocation ?? null,
  horses: p.horseIds.length,
  path: `/parties/${p.id}`,
});

export function useDirectoryOperatorActions(state: {
  query: string;
  role: PartyRole | 'all';
  filtered: RegisterPerson[];
  total: number;
}): void {
  const live = useLive(state);

  useAgentAction<{ query: string; role?: string }>({
    name: 'site.searchDirectory',
    description: 'Search the directory by name (typed into the search box), optionally filtered by role chip.',
    args: z.object({ query: z.string().max(120), role: z.string().max(40).optional() }),
    run: async (a, ui) => {
      const want: PartyRole | 'all' = a.role && !/^all$/i.test(a.role.trim()) ? partyRole(a.role) : 'all';
      if (live.current.role !== want) {
        const chip = roleChipId(want);
        await ui.click(chip, want === 'all' ? 'All' : PARTY_ROLE_LABELS[want]);
        await waitUntil(() => live.current.role === want, { timeoutMs: 1500, signal: ui.signal });
      }
      if (live.current.query !== a.query || !a.query) {
        await typeSearch(ui, 'site.directory-search', a.query, () => live.current.query === a.query);
      }
      await sleep(100, ui.signal);
      const rows = live.current.filtered;
      if (rows[0] && anchor(`site.party-${rows[0].id}`)) ui.flash(`site.party-${rows[0].id}`);
      return {
        query: a.query,
        role: want,
        total: live.current.total,
        matches: rows.length,
        people: rows.slice(0, MAX).map(personRow),
      };
    },
  });
}

export function usePartyProfileOperatorActions(partyId: string): void {
  const live = useLive(partyId);
  useAgentAction({
    name: 'site.readParty',
    description: "Read the open directory profile: roles, profession, base, career start and connected horses.",
    args: z.object({}),
    run: async () => {
      const id = live.current;
      const reg = buildRegister(usePeopleStore.getState().people ?? [], usePartyStore.getState().parties ?? []);
      const p = reg.find((x) => x.id === id);
      if (!p) throw new Error('This profile has not loaded yet (or is not in the directory).');
      const horses = useHorseStore.getState().horses ?? [];
      const byHorse = p.edges
        .filter((e) => e.horseId)
        .map((e) => ({ horse: horses.find((h) => h.id === e.horseId)?.name ?? e.horseId, role: PARTY_ROLE_LABELS[e.role] ?? e.role, path: `/horses/${e.horseId}` }));
      const user = useAuthStore.getState().currentUser;
      return {
        id: p.id,
        name: p.name,
        roles: p.roles.map((r) => PARTY_ROLE_LABELS[r] ?? r),
        profession: p.profession ?? null,
        base: p.baseLocation ?? null,
        countryOfBirth: p.countryOfBirth ?? null,
        startedYear: p.startedYear ?? null,
        horses: byHorse.slice(0, MAX),
        claimed: !!p.claimedByUserId,
        studioPath: canManagePerson(user, p.id) ? `/studio/${p.id}` : null,
      };
    },
  });
}
