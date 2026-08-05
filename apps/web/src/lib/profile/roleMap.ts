import type { PartyRole } from '@/types/party';
import type { Horse } from '@/types/horse';

/**
 * Ties a racing ROLE to the direct id-array field on the Horse record that also
 * expresses it. Used in BOTH directions:
 *   - horse-central: which people fill each role tile
 *   - person-central: which horses a person is connected to
 *
 * The `relType` binding is gone along with the horsePartyLinks table — a party
 * row IS the relationship now, and carries `role` and `horseId` directly. The
 * `horseField` arrays remain because the server still stores them; they hold
 * PERSON ids. See rbac/scope.ts, which reads both representations.
 */
export interface RoleBinding {
  role: PartyRole;
  /** Direct id-array field on Horse, holding person ids. */
  horseField: keyof Horse;
  label: string;
}

export const ROLE_BINDINGS: Record<PartyRole, RoleBinding> = {
  owner:               { role: 'owner',              horseField: 'ownerIds',            label: 'Owner' },
  trainer:             { role: 'trainer',            horseField: 'trainerIds',          label: 'Trainer' },
  jockey:              { role: 'jockey',             horseField: 'jockeyIds',           label: 'Jockey' },
  breeder:             { role: 'breeder',            horseField: 'breederIds',          label: 'Breeder' },
  'bloodstock agent':  { role: 'bloodstock agent',   horseField: 'bloodstockAgentIds',  label: 'Bloodstock Agent' },
  'syndicate manager': { role: 'syndicate manager',  horseField: 'syndicateManagerIds', label: 'Syndicate Manager' },
  personnel:           { role: 'personnel',          horseField: 'personnelIds',        label: 'Personnel' },
};

/** Roles that get a full standalone profile page. */
export const PROFILE_ROLES: PartyRole[] = ['owner', 'trainer', 'jockey', 'breeder', 'syndicate manager'];

/** Pick the role to centralise a person on, given an optional URL hint. */
export function resolveActiveRole(roles: PartyRole[], hint?: string | null): PartyRole {
  if (hint && roles.includes(hint as PartyRole)) return hint as PartyRole;
  // Prefer a role we build full profiles for, else the person's first role.
  const preferred = roles.find((r) => PROFILE_ROLES.includes(r));
  return preferred ?? roles[0] ?? 'owner';
}
