import type { Horse } from '@/types/horse';
import type { Party } from '@/types/party';

// ─────────────────────────────────────────────
// Stable IDs — fixed so repeated re-hydration
// never creates duplicates.
// ─────────────────────────────────────────────
export const SAVILE_ROW_ID = 'seed-savile-row-001';

// Party IDs (stable, fixed)
const P_OWNER_MC      = 'seed-party-michael-christian-001';
const P_TRAINER_CM    = 'seed-party-ciaron-maher-001';
const P_JOCKEY_DH     = 'seed-party-damian-hogan-001';
const P_BREEDER_BT    = 'seed-party-brent-taylor-001';
const P_AGENT_PP      = 'seed-party-porter-pelchen-001';
const P_SYNDMGR_MC    = 'seed-party-syndmgr-michael-christian-001';
const P_PERSONNEL_SM  = 'seed-party-ms-s-miller-001';
const P_PERSONNEL_PC  = 'seed-party-mrs-p-christian-001';
const P_PERSONNEL_AI  = 'seed-party-a-ingersole-001';
const P_PERSONNEL_MJ  = 'seed-party-m-johnston-001';
const P_PERSONNEL_BC  = 'seed-party-b-christian-001';

// ─────────────────────────────────────────────
// Seed Parties — all connections for Savile Row
// ─────────────────────────────────────────────
export const SEED_PARTIES: Party[] = [
  {
    id: P_OWNER_MC,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['owner'],
    name: 'Michael Christian',
    profession: 'Owner',
    started_year: 2005,
    country_of_birth: 'Australia',
  },
  {
    id: P_TRAINER_CM,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['trainer'],
    name: 'Ciaron Maher',
    profession: 'Racehorse Trainer',
    started_year: 2005,
    base_location: 'Caulfield, VIC',
    country_of_birth: 'Australia',
  },
  {
    id: P_JOCKEY_DH,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['jockey'],
    name: 'Damian Hogan',
    profession: 'Jockey',
    country_of_birth: 'Australia',
  },
  {
    id: P_BREEDER_BT,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['breeder'],
    name: 'Brent and Cherie Taylor',
    profession: 'Thoroughbred Breeders',
    country_of_birth: 'Australia',
  },
  {
    id: P_AGENT_PP,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'organisation',
    roles: ['bloodstock agent'],
    name: 'Porter Pelchen Bloodstock',
    profession: 'Bloodstock Agency',
    base_location: 'Australia',
  },
  {
    id: P_SYNDMGR_MC,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['syndicate manager'],
    name: 'Michael Christian',
    profession: 'Syndicate Manager',
    started_year: 2005,
    country_of_birth: 'Australia',
  },
  {
    id: P_PERSONNEL_SM,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['personnel'],
    name: 'Ms S Miller',
    profession: 'Racing Personnel',
    personnel_subtype: ['strapper'],
  },
  {
    id: P_PERSONNEL_PC,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['personnel'],
    name: 'Mrs P Christian',
    profession: 'Racing Personnel',
    personnel_subtype: ['strapper'],
  },
  {
    id: P_PERSONNEL_AI,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['personnel'],
    name: 'A Ingersole',
    profession: 'Racing Personnel',
    personnel_subtype: ['trackwork rider'],
  },
  {
    id: P_PERSONNEL_MJ,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['personnel'],
    name: 'M Johnston',
    profession: 'Racing Personnel',
    personnel_subtype: ['trackwork rider'],
  },
  {
    id: P_PERSONNEL_BC,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    party_type: 'person',
    roles: ['personnel'],
    name: 'B Christian',
    profession: 'Racing Personnel',
    personnel_subtype: ['strapper'],
  },
];

export const SEED_PARTY_IDS = new Set(SEED_PARTIES.map((p) => p.id));

// ─────────────────────────────────────────────
// Savile Row — seed thoroughbred profile
// Uses new Party ID arrays (no legacy strings)
// ─────────────────────────────────────────────
export const SAVILE_ROW: Horse = {
  id: SAVILE_ROW_ID,
  createdAt: new Date('2024-01-01T00:00:00Z'),

  /* ── Section 1: Basic Information ── */
  name: 'Savile Row',
  sex: 'Colt',
  dob: '2013-09-10',
  colour: 'Dark Bay / Brown',
  country: 'Australia',

  handsSize: 16.2,
  metricSize: 1.65,

  /* ── Section 2: Pedigree (Bloodline) ── */
  sire: 'MAKFI (GB)',
  sireSire: 'DUBAWI (IRE)',
  sireDam: 'DHELAAL (GB)',
  dam: 'FLEECE (GB)',
  damYob: 2002,
  damSire: 'DAYLAMI (IRE)',
  damDam: 'GOLD DODGER (USA)',
  /* Generation 3 — great-grandparents (from the FR pedigree grid) */
  sireSireSire: 'Dubai Millennium',
  sireSireDam: 'Zomeradah',
  sireDamSire: 'Green Desert',
  sireDamDam: 'Irish Valley',
  damSireSire: 'Doyoun',
  damSireDam: 'Daltawa',
  damDamSire: "Slew o' Gold",
  damDamDam: "Brooklyn's Dance",

  /* ── Stud Book registry ── */
  studBook: 'Australian Stud Book',
  registrationNumber: '2013603145',
  microchip: '985112003456789',
  brandFreeze: 'Near shoulder: SR / 13',
  passportNumber: 'ASB-2013-60314',

  /* ── Section 3: Connections — Party ID arrays ── */
  ownerIds: [P_OWNER_MC],
  trainerIds: [P_TRAINER_CM],
  jockeyIds: [P_JOCKEY_DH],
  breederIds: [P_BREEDER_BT],
  bloodstockAgentIds: [P_AGENT_PP],
  syndicateManagerIds: [P_SYNDMGR_MC],
  personnelIds: [
    P_PERSONNEL_SM,
    P_PERSONNEL_PC,
    P_PERSONNEL_AI,
    P_PERSONNEL_MJ,
    P_PERSONNEL_BC,
  ],

  /* ── Section 4: Racing Summary ── */
  careerRecord: '8:2-3-1',
  careerWinnings: 493000,
  lastTenForm: '1-2-3-4-2-10-1-5',
  seasonRecord: '3:1-1-0',
  currentRating: 112,

  /* ── Editorial / Media ── */
  pedigreeNotes:
    'Savile Row is a son of the outstanding Makfi (GB), winner of the 2010 Sussex Stakes, whose sire line traces back to the legendary Dubawi. His dam Fleece (GB) by Daylami (IRE) hails from the storied Gold Dodger family. This combination of stamina from the Daylami line and brilliance from Dubawi makes Savile Row a formidable middle-distance prospect with genuine Group 1 potential.',
  pullQuote:
    'A horse of rare quality — the pedigree speaks volumes, and the record merely confirms what the eye already knew.',
  imageUrl:
    'https://res.cloudinary.com/deg6eftvf/image/upload/v1780550350/Screenshot_2026-06-04_104309_pcuep0.png',
};
