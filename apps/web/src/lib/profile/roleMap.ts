import type { PartyRole } from '@/types/party';

/**
 * Presentation for a racing role, used in both directions:
 *   - horse-central: which people fill each role tile
 *   - person-central: which horses a person is connected to
 *
 * `horseField` used to live here, naming the id-array on the Horse record that
 * ALSO expressed the connection (`ownerIds`, `trainerIds`, …). Both it and the
 * older `relType` binding are gone: a party edge IS the relationship, carrying
 * `personId`, `role` and `horseId` directly. There is one representation now,
 * and lib/horseConnections.ts is the only module that reads or writes it.
 */
export interface RoleBinding {
  role: PartyRole;
  label: string;
}

export const ROLE_BINDINGS: Record<PartyRole, RoleBinding> = {
  owner:               { role: 'owner',              label: 'Owner' },
  trainer:             { role: 'trainer',            label: 'Trainer' },
  jockey:              { role: 'jockey',             label: 'Jockey' },
  breeder:             { role: 'breeder',            label: 'Breeder' },
  'bloodstock agent':  { role: 'bloodstock agent',   label: 'Bloodstock Agent' },
  'syndicate manager': { role: 'syndicate manager',  label: 'Syndicate Manager' },
  personnel:           { role: 'personnel',          label: 'Personnel' },
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
