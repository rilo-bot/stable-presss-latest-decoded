import type { PartyRole } from '@/types/party';
import type { HorsePartyRelationshipType } from '@/types/horsePartyLink';
import type { Horse } from '@/types/horse';

/**
 * Single source of truth tying a party ROLE to (a) the HorsePartyLink
 * relationship_type that expresses it, and (b) the legacy direct id-array
 * field on the Horse record. Used in BOTH directions:
 *   - horse-central: which parties fill each relationship tile
 *   - party-central: which horses a party is connected to
 *
 * `syndicate manager` has no dedicated relationship_type — it is matched by
 * the party carrying the 'syndicate manager' role (relType left undefined →
 * "any link to this party"), plus the horse's syndicateManagerIds field.
 */
export interface RoleBinding {
  role: PartyRole;
  /** relationship_type in HorsePartyLink, or undefined to match any link to the party */
  relType?: HorsePartyRelationshipType;
  /** legacy direct id-array field on Horse */
  horseField: keyof Horse;
  /** human label for the role */
  label: string;
}

export const ROLE_BINDINGS: Record<PartyRole, RoleBinding> = {
  owner:               { role: 'owner',               relType: 'ownership', horseField: 'ownerIds',             label: 'Owner' },
  trainer:             { role: 'trainer',             relType: 'training',  horseField: 'trainerIds',           label: 'Trainer' },
  jockey:              { role: 'jockey',              relType: 'riding',    horseField: 'jockeyIds',            label: 'Jockey' },
  breeder:             { role: 'breeder',             relType: 'bred-by',   horseField: 'breederIds',           label: 'Breeder' },
  'bloodstock agent':  { role: 'bloodstock agent',    relType: 'agent',     horseField: 'bloodstockAgentIds',   label: 'Bloodstock Agent' },
  'syndicate manager': { role: 'syndicate manager',   relType: undefined,   horseField: 'syndicateManagerIds',  label: 'Syndicate Manager' },
  personnel:           { role: 'personnel',           relType: 'personnel', horseField: 'personnelIds',         label: 'Personnel' },
};

/** Roles that get a full standalone profile page this round. */
export const PROFILE_ROLES: PartyRole[] = ['owner', 'trainer', 'jockey', 'breeder', 'syndicate manager'];

/** Pick the role to centralise a party on, given an optional URL hint. */
export function resolveActiveRole(roles: PartyRole[], hint?: string | null): PartyRole {
  if (hint && roles.includes(hint as PartyRole)) return hint as PartyRole;
  // Prefer a role we build full profiles for, else the party's first role.
  const preferred = roles.find((r) => PROFILE_ROLES.includes(r));
  return preferred ?? roles[0] ?? 'owner';
}
