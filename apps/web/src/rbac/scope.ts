/**
 * RBAC — relationship scope.
 *
 * Permissions are ROLE + SCOPE (RBAC.md §6): a party's reach over horses comes
 * from the dated party↔horse links, not from the role alone. These are pure
 * functions (no React) so both the profile UI and the permission engine share
 * one source of truth. Extracted from hooks/useProfileScope.ts.
 */
import type { Horse } from '@/types/horse';
import type { HorsePartyLink } from '@/types/horsePartyLink';
import { isCurrentLink } from '@/types/horsePartyLink';
import type { PartyRole } from '@/types/party';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';

export interface ScopeData {
  horses: Horse[];
  links: HorsePartyLink[];
}

export interface ScopeOpts {
  /** Only count links with no end_date (current relationships). Default false. */
  currentOnly?: boolean;
}

/**
 * Horse ids a party fills in a SPECIFIC role (e.g. the horses this party trains).
 * Combines relationship links (filtered by the role's relType) with the legacy
 * direct id-array field on the horse. Mirrors useProfileScope's horseIds.
 */
export function horsesInScopeForParty(
  partyId: string,
  role: PartyRole,
  data: ScopeData,
  opts: ScopeOpts = {},
): string[] {
  const binding = ROLE_BINDINGS[role];
  const ids = new Set<string>();

  data.links.forEach((l) => {
    if (l.party_id !== partyId) return;
    if (binding.relType && l.relationship_type !== binding.relType) return;
    if (opts.currentOnly && !isCurrentLink(l)) return;
    ids.add(l.horse_id);
  });

  data.horses.forEach((h) => {
    const arr = h[binding.horseField] as string[] | undefined;
    if (Array.isArray(arr) && arr.includes(partyId)) ids.add(h.id);
  });

  return Array.from(ids);
}

/**
 * Horse ids a party is linked to via ANY relationship. Used for authorised-record
 * visibility and organisation scope (where the role doesn't matter — only that a
 * link exists).
 */
export function horsesLinkedToParty(
  partyId: string,
  data: ScopeData,
  opts: ScopeOpts = {},
): string[] {
  const ids = new Set<string>();

  data.links.forEach((l) => {
    if (l.party_id !== partyId) return;
    if (opts.currentOnly && !isCurrentLink(l)) return;
    ids.add(l.horse_id);
  });

  // Fold in legacy direct id-array fields across every role binding.
  data.horses.forEach((h) => {
    for (const role of Object.keys(ROLE_BINDINGS) as PartyRole[]) {
      const arr = h[ROLE_BINDINGS[role].horseField] as string[] | undefined;
      if (Array.isArray(arr) && arr.includes(partyId)) {
        ids.add(h.id);
        break;
      }
    }
  });

  return Array.from(ids);
}
