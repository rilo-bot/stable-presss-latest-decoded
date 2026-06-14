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
  /* Generation 3 — great-grandparents (all optional, back-compatible) */
  sireSireSire?: string;
  sireSireDam?: string;
  sireDamSire?: string;
  sireDamDam?: string;
  damSireSire?: string;
  damSireDam?: string;
  damDamSire?: string;
  damDamDam?: string;

  /* ── Stud Book registry (1:1 with the horse) ── */
  studBook?: string;
  registrationNumber?: string;
  microchip?: string;
  brandFreeze?: string;
  passportNumber?: string;

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

  /* ── Ownership & verification (member self-service) ── */
  /** Account id that created this horse via member self-registration. */
  createdByUserId?: string;
  /**
   * Member-created horses are 'unverified' and hidden from the public site until
   * staff / NZTR verification; staff-created horses are 'verified'.
   */
  verificationStatus?: 'unverified' | 'verified';
}
