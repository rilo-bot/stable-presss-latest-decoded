export interface Horse {
  id: string;
  createdAt: Date;

  /* ── Section 1: Basic Information ── */
  name: string;
  isUnnamed?: boolean;
  sex?: string;
  dob?: string;
  colour?: string;
  country?: string;
  handsSize?: number;
  metricSize?: number;

  /* ── Section 2: Pedigree (Bloodline) ── */
  sire?: string;
  sireSire?: string;
  sireDam?: string;
  dam?: string;
  damYob?: number;
  damSire?: string;
  damDam?: string;

  /* ── Section 3: Connections & Personnel — Party ID references ── */
  /**
   * Party IDs for owners (role: 'owner'). Replaces legacy `owner` string.
   * Multiple owners / syndicate members allowed.
   */
  ownerIds?: string[];
  /**
   * Party IDs for trainers (role: 'trainer').
   */
  trainerIds?: string[];
  /**
   * Party IDs for jockeys / riders (role: 'jockey').
   */
  jockeyIds?: string[];
  /**
   * Party IDs for breeders (role: 'breeder').
   */
  breederIds?: string[];
  /**
   * Party IDs for bloodstock agents (role: 'bloodstock agent').
   */
  bloodstockAgentIds?: string[];
  /**
   * Party IDs for syndicate managers (role: 'syndicate manager').
   */
  syndicateManagerIds?: string[];
  /**
   * Party IDs for any personnel (role: 'personnel') — vets, farriers, strappers, etc.
   */
  personnelIds?: string[];

  /* ── Legacy free-text fields (kept for backwards compat with existing horses) ── */
  /** @deprecated Use ownerIds */
  owner?: string;
  /** @deprecated Use ownerIds */
  ownerSince?: string;
  /** @deprecated Use breederIds */
  breeder?: string;
  /** @deprecated Use trainerIds */
  trainer?: string;
  /** @deprecated Use trainerIds */
  trainerSince?: string;
  /** @deprecated Use jockeyIds */
  jockey?: string;
  /** @deprecated Use syndicateManagerIds */
  syndicateManager?: string;
  /** @deprecated Use bloodstockAgentIds */
  bloodstockAgent?: string;
  /** @deprecated Use personnelIds */
  horseBreaker?: string;
  /** @deprecated Use personnelIds */
  associatedPersonnel?: string;

  /* ── Section 4: Racing Summary ── */
  careerRecord?: string;
  careerWinnings?: number;
  lastTenForm?: string;
  seasonRecord?: string;
  currentRating?: number;

  /* ── Editorial / Media ── */
  pedigreeNotes: string;
  pullQuote?: string;
  imageUrl?: string;

  /* ── Legacy ── */
  age?: number;
}
