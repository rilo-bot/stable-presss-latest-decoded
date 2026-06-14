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

export interface Party {
  id: string;
  createdAt: Date;
  /** A party is always an individual person. Organisations live in their own
   *  collection (see orgStore) and are not parties. */
  roles: PartyRole[];
  name: string;
  /** Required for all parties. Base64 data URL or remote URL. */
  photo?: string;
  /** Profession / job title */
  profession?: string;
  /** Set when an organisation manages this party (no separate login). */
  managedByOrgId?: string;
  /** ISO date string YYYY-MM-DD — person only */
  date_of_birth?: string;
  /** Country where born / incorporated */
  country_of_birth?: string;
  /** Primary base (city / track / suburb) */
  base_location?: string;
  /** Year they started in their primary racing role */
  started_year?: number;
  /** Specific personnel subtypes — only populated when 'personnel' is in roles */
  personnel_subtype?: PersonnelSubtype[];
  /**
   * Public visibility. Member self-registered parties start 'unverified' (hidden
   * from the public site, editable by their owner) and flip to 'verified' on staff
   * approval of the claim. Missing/legacy parties are treated as verified.
   */
  verificationStatus?: 'unverified' | 'verified';
  /** Account that self-registered this party (provisional ownership). */
  createdByUserId?: string;
}
