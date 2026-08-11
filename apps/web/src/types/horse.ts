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

  /* ── Section 3: Connections & Personnel ──
   *
   * NOT STORED ON THE HORSE. A connection is a party EDGE
   * (`{ personId, role, horseId }`) and lives in the register.
   *
   * `ownerIds` / `trainerIds` / `jockeyIds` / `breederIds` /
   * `bloodstockAgentIds` / `syndicateManagerIds` / `personnelIds` used to sit
   * here as well, and the server accepted writes to both representations — so
   * the same fact had two homes and neither won. Read them with
   * `connectionsForHorse`, write them with `reconcileHorseConnections`, both in
   * lib/horseConnections.ts.
   */

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
