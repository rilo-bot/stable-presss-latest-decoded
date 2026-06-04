export type HorsePartyRelationshipType =
  | 'ownership'
  | 'training'
  | 'riding'
  | 'bred-by'
  | 'agent'
  | 'personnel';

export const HORSE_PARTY_RELATIONSHIP_TYPES: HorsePartyRelationshipType[] = [
  'ownership',
  'training',
  'riding',
  'bred-by',
  'agent',
  'personnel',
];

export const HORSE_PARTY_RELATIONSHIP_LABELS: Record<HorsePartyRelationshipType, string> = {
  ownership: 'Owner',
  training: 'Trainer',
  riding: 'Jockey / Rider',
  'bred-by': 'Bred By',
  agent: 'Bloodstock Agent',
  personnel: 'Personnel',
};

export interface HorsePartyLink {
  id: string;
  createdAt: Date;
  horse_id: string;
  party_id: string;
  relationship_type: HorsePartyRelationshipType;
  /** ISO date string YYYY-MM-DD */
  start_date: string;
  /** ISO date string YYYY-MM-DD or null/undefined when ongoing */
  end_date?: string | null;
  /** True when end_date is empty/null — derived, not stored */
  context?: string;
}

/** Derives is_current from the link — end_date empty means current */
export function isCurrentLink(link: HorsePartyLink): boolean {
  return !link.end_date;
}
