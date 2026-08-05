export type PartyRole =
  | 'owner'
  | 'trainer'
  | 'jockey'
  | 'breeder'
  | 'bloodstock agent'
  | 'syndicate manager'
  | 'personnel';

export type PersonnelSubtype =
  | 'trackwork rider'
  | 'strapper'
  | 'vet'
  | 'farrier'
  | 'horse breaker'
  | 'stud/yearling manager';

export const PARTY_ROLES: PartyRole[] = [
  'owner',
  'trainer',
  'jockey',
  'breeder',
  'bloodstock agent',
  'syndicate manager',
  'personnel',
];

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  owner: 'Owner',
  trainer: 'Trainer',
  jockey: 'Jockey',
  breeder: 'Breeder',
  'bloodstock agent': 'Bloodstock Agent',
  'syndicate manager': 'Syndicate Manager',
  personnel: 'Personnel',
};

export const PERSONNEL_SUBTYPES: PersonnelSubtype[] = [
  'trackwork rider',
  'strapper',
  'vet',
  'farrier',
  'horse breaker',
  'stud/yearling manager',
];

export const PERSONNEL_SUBTYPE_LABELS: Record<PersonnelSubtype, string> = {
  'trackwork rider': 'Trackwork Rider',
  'strapper': 'Strapper',
  'vet': 'Vet',
  'farrier': 'Farrier',
  'horse breaker': 'Horse Breaker',
  'stud/yearling manager': 'Stud / Yearling Manager',
};

/**
 * Returns a role-specific label for the "Started year" field.
 * Uses the first role in the array. Falls back to a generic label.
 */
export function getStartedYearLabel(roles: PartyRole[]): string {
  const primary = roles[0];
  if (!primary) return 'Started year';
  const map: Record<PartyRole, string> = {
    owner: 'Started owning',
    trainer: 'Started training',
    jockey: 'Started riding',
    breeder: 'Started breeding',
    'bloodstock agent': 'Started as agent',
    'syndicate manager': 'Started managing',
    personnel: 'Started in industry',
  };
  return map[primary] ?? 'Started year';
}

/**
 * A person in the racing world. Stored ONCE in `people` and referenced by every
 * party edge, so a trainer on thirty horses has one profile, not thirty copies.
 *
 * This is not an account. Most people here have never signed in; the link to an
 * account is `PartyRow.userId`, set when somebody claims the edge.
 *
 * Mirrors `Person` in apps/server/src/lib/people.ts.
 */
export interface Person {
  id: string;
  name: string;
  /** Base64 data URL or remote URL. */
  imageUrl?: string;
  /** Profession / job title. */
  profession?: string;
  /** ISO date string, YYYY-MM-DD. */
  dateOfBirth?: string;
  countryOfBirth?: string;
  /** Primary base (city / track / suburb). */
  baseLocation?: string;
  /** Year they started in racing. */
  startedYear?: number;
  /** Only meaningful for someone holding a 'personnel' edge. */
  personnelSubtype: PersonnelSubtype[];
}
