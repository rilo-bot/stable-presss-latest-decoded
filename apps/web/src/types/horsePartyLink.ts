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

/**
 * Prefix marking a SYNTHESIZED link derived from a horse's legacy direct
 * id-array field (ownerIds, trainerIds, …) rather than a real horsePartyLinks
 * row. The staff Horse form writes those arrays, so the horse page folds them
 * into its connection boxes — but they have no store row, so they render
 * read-only (edit them via the Horse management form, not the inline rail).
 */
export const LEGACY_LINK_ID_PREFIX = 'legacy:';

export function isLegacyLink(link: HorsePartyLink): boolean {
  return link.id.startsWith(LEGACY_LINK_ID_PREFIX);
}
